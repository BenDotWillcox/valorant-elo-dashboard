"""Contextual forecast challengers and time-safe probability calibration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler


def _logit(probability: np.ndarray | Sequence[float]) -> np.ndarray:
    p = np.clip(np.asarray(probability, dtype=float), 1e-8, 1.0 - 1e-8)
    return np.log(p / (1.0 - p))


def _sigmoid(value: np.ndarray | Sequence[float]) -> np.ndarray:
    x = np.asarray(value, dtype=float)
    out = np.empty_like(x)
    positive = x >= 0
    out[positive] = 1.0 / (1.0 + np.exp(-x[positive]))
    exp_x = np.exp(x[~positive])
    out[~positive] = exp_x / (1.0 + exp_x)
    return out


def _binary_log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-8, 1 - 1e-8)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


DEFAULT_CONTEXT_NUMERIC = (
    "backbone_probability",
    "rating_mean_diff",
    "rating_uncertainty_sum",
    "roster_prior_diff",
    "continuity_diff",
    "recent_residual_diff",
    "volatility_sum",
    "inactivity_diff",
    "composition_diff",
)

DEFAULT_CONTEXT_CATEGORICAL = (
    "map_name",
    "region_pair",
    "event_tier",
    "patch_id",
    "veto_state",
    "map_picker",
)


class PlattCalibrator:
    """One-dimensional logistic recalibration fitted on a later time slice."""

    def __init__(self) -> None:
        self.model = LogisticRegression(C=1e3, solver="lbfgs")
        self._fitted = False

    def fit(self, probabilities: Sequence[float], outcomes: Sequence[int]) -> "PlattCalibrator":
        x = _logit(probabilities).reshape(-1, 1)
        y = np.asarray(outcomes, dtype=int)
        if len(np.unique(y)) < 2:
            raise ValueError("calibration requires both outcome classes")
        self.model.fit(x, y)
        self._fitted = True
        return self

    def predict(self, probabilities: Sequence[float]) -> np.ndarray:
        raw = np.clip(np.asarray(probabilities, dtype=float), 1e-8, 1 - 1e-8)
        return self.model.predict_proba(_logit(raw).reshape(-1, 1))[:, 1] if self._fitted else raw


class _FrameForecaster:
    def __init__(self, numeric_features: Sequence[str], categorical_features: Sequence[str]) -> None:
        self.numeric_features = tuple(numeric_features)
        self.categorical_features = tuple(categorical_features)
        self.pipeline: Pipeline
        self.calibrator = PlattCalibrator()
        self._fitted = False

    def _frame(self, frame: pd.DataFrame | Sequence[Mapping[str, object]]) -> pd.DataFrame:
        data = frame.copy() if isinstance(frame, pd.DataFrame) else pd.DataFrame(frame)
        for name in self.numeric_features:
            if name not in data:
                data[name] = np.nan
        for name in self.categorical_features:
            if name not in data:
                data[name] = "unknown"
        return data

    def fit(
        self,
        frame: pd.DataFrame | Sequence[Mapping[str, object]],
        outcomes: Sequence[int],
        sample_weight: Sequence[float] | None = None,
    ) -> "_FrameForecaster":
        kwargs = {"model__sample_weight": sample_weight} if sample_weight is not None else {}
        self.pipeline.fit(self._frame(frame), np.asarray(outcomes, dtype=int), **kwargs)
        self._fitted = True
        return self

    def predict_raw(self, frame: pd.DataFrame | Sequence[Mapping[str, object]]) -> np.ndarray:
        if not self._fitted:
            raise RuntimeError("fit the forecaster before prediction")
        return np.clip(self.pipeline.predict_proba(self._frame(frame))[:, 1], 1e-8, 1 - 1e-8)

    def fit_calibrator(
        self,
        calibration_frame: pd.DataFrame | Sequence[Mapping[str, object]],
        outcomes: Sequence[int],
    ) -> "_FrameForecaster":
        self.calibrator.fit(self.predict_raw(calibration_frame), outcomes)
        return self

    def predict_proba(self, frame: pd.DataFrame | Sequence[Mapping[str, object]]) -> np.ndarray:
        return self.calibrator.predict(self.predict_raw(frame))


def _base_transform(numeric: Sequence[str], categorical: Sequence[str], dense: bool = False) -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        [
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        [
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=not dense),
            ),
        ]
    )
    return ColumnTransformer(
        [
            ("numeric", numeric_pipeline, list(numeric)),
            ("categorical", categorical_pipeline, list(categorical)),
        ]
    )


class ElasticNetForecastLayer(_FrameForecaster):
    """Sparse contextual challenger; coefficients remain inspectable."""

    def __init__(
        self,
        numeric_features: Sequence[str] = DEFAULT_CONTEXT_NUMERIC,
        categorical_features: Sequence[str] = DEFAULT_CONTEXT_CATEGORICAL,
        regularization: float = 0.2,
        l1_ratio: float = 0.25,
        seed: int = 20260714,
    ) -> None:
        super().__init__(numeric_features, categorical_features)
        self.pipeline = Pipeline(
            [
                ("features", _base_transform(self.numeric_features, self.categorical_features)),
                (
                    "model",
                    LogisticRegression(
                        penalty="elasticnet",
                        l1_ratio=l1_ratio,
                        C=regularization,
                        solver="saga",
                        max_iter=4000,
                        random_state=seed,
                    ),
                ),
            ]
        )

    def coefficient_table(self) -> pd.DataFrame:
        if not self._fitted:
            raise RuntimeError("fit the forecaster first")
        names = self.pipeline.named_steps["features"].get_feature_names_out()
        values = self.pipeline.named_steps["model"].coef_[0]
        return pd.DataFrame({"feature": names, "coefficient": values}).sort_values(
            "coefficient", key=np.abs, ascending=False
        )


class SplineGAMForecastLayer(_FrameForecaster):
    """Additive nonlinear challenger using regularized cubic splines."""

    def __init__(
        self,
        numeric_features: Sequence[str] = DEFAULT_CONTEXT_NUMERIC,
        categorical_features: Sequence[str] = DEFAULT_CONTEXT_CATEGORICAL,
        knots: int = 4,
        regularization: float = 0.3,
    ) -> None:
        super().__init__(numeric_features, categorical_features)
        numeric_pipeline = Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                ("spline", SplineTransformer(n_knots=knots, degree=3, include_bias=False)),
                ("scale", StandardScaler()),
            ]
        )
        categorical_pipeline = Pipeline(
            [
                ("impute", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]
        )
        transform = ColumnTransformer(
            [
                ("numeric", numeric_pipeline, list(self.numeric_features)),
                ("categorical", categorical_pipeline, list(self.categorical_features)),
            ]
        )
        self.pipeline = Pipeline(
            [
                ("features", transform),
                ("model", LogisticRegression(C=regularization, max_iter=3000)),
            ]
        )


class BoostedForecastLayer(_FrameForecaster):
    """Shallow boosted challenger constrained to reduce overfitting."""

    def __init__(
        self,
        numeric_features: Sequence[str] = DEFAULT_CONTEXT_NUMERIC,
        categorical_features: Sequence[str] = DEFAULT_CONTEXT_CATEGORICAL,
        seed: int = 20260714,
    ) -> None:
        super().__init__(numeric_features, categorical_features)
        self.pipeline = Pipeline(
            [
                (
                    "features",
                    _base_transform(self.numeric_features, self.categorical_features, dense=True),
                ),
                (
                    "model",
                    HistGradientBoostingClassifier(
                        learning_rate=0.045,
                        max_iter=180,
                        max_leaf_nodes=10,
                        max_depth=3,
                        min_samples_leaf=30,
                        l2_regularization=2.0,
                        random_state=seed,
                    ),
                ),
            ]
        )


@dataclass(frozen=True)
class BlendFit:
    weight_on_first: float
    uncalibrated_log_loss: float
    calibrated_log_loss: float | None


class CalibratedBlend:
    """Log-odds blend whose weight is selected on out-of-fold predictions."""

    def __init__(self) -> None:
        self.weight_on_first = 0.5
        self.calibrator = PlattCalibrator()
        self.fit_summary: BlendFit | None = None

    def _blend(self, first: Sequence[float], second: Sequence[float]) -> np.ndarray:
        return _sigmoid(
            self.weight_on_first * _logit(first)
            + (1.0 - self.weight_on_first) * _logit(second)
        )

    def fit(
        self,
        first: Sequence[float],
        second: Sequence[float],
        outcomes: Sequence[int],
        calibrate: bool = True,
    ) -> "CalibratedBlend":
        first_arr, second_arr = np.asarray(first), np.asarray(second)
        y = np.asarray(outcomes, dtype=int)
        if not (len(first_arr) == len(second_arr) == len(y)):
            raise ValueError("blend inputs and outcomes must align")

        objective = lambda weight: _binary_log_loss(
            y,
            _sigmoid(weight * _logit(first_arr) + (1 - weight) * _logit(second_arr)),
        )
        result = minimize_scalar(objective, bounds=(0.0, 1.0), method="bounded")
        self.weight_on_first = float(result.x)
        raw = self._blend(first_arr, second_arr)
        calibrated_loss: float | None = None
        if calibrate:
            self.calibrator.fit(raw, y)
            calibrated_loss = _binary_log_loss(y, self.calibrator.predict(raw))
        self.fit_summary = BlendFit(self.weight_on_first, float(result.fun), calibrated_loss)
        return self

    def predict(self, first: Sequence[float], second: Sequence[float]) -> np.ndarray:
        return self.calibrator.predict(self._blend(first, second))


__all__ = [
    "BlendFit",
    "BoostedForecastLayer",
    "CalibratedBlend",
    "DEFAULT_CONTEXT_CATEGORICAL",
    "DEFAULT_CONTEXT_NUMERIC",
    "ElasticNetForecastLayer",
    "PlattCalibrator",
    "SplineGAMForecastLayer",
]
