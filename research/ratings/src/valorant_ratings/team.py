"""Interpretable dynamic team backbone and robust margin auxiliary."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from math import exp, log, sqrt
from typing import Iterable, Mapping, Sequence

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def _utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _sigmoid(value: float | np.ndarray) -> float | np.ndarray:
    values = np.asarray(value, dtype=float)
    result = np.empty_like(values)
    positive = values >= 0
    result[positive] = 1.0 / (1.0 + np.exp(-values[positive]))
    negative_exp = np.exp(values[~positive])
    result[~positive] = negative_exp / (1.0 + negative_exp)
    return float(result.item()) if result.ndim == 0 else result


@dataclass(frozen=True)
class TeamContext:
    timestamp: datetime
    team_a: int | str
    team_b: int | str
    map_name: str
    roster_key_a: str | None = None
    roster_key_b: str | None = None
    roster_prior_a: float = 0.0
    roster_prior_b: float = 0.0
    roster_continuity_a: float = 0.0
    roster_continuity_b: float = 0.0
    region_a: str = "unknown"
    region_b: str = "unknown"
    event_tier: str = "unknown"
    patch_id: str = "unknown"
    veto_state: str = "unknown"
    map_picker: str = "unknown"


@dataclass
class LatentTeamState:
    global_strength: float = 0.0
    map_effects: dict[str, float] = field(default_factory=dict)
    lineup_effects: dict[str, float] = field(default_factory=dict)
    last_seen: datetime | None = None
    residuals: deque[float] = field(default_factory=lambda: deque(maxlen=12))

    def clone(self) -> "LatentTeamState":
        cloned = LatentTeamState(
            global_strength=self.global_strength,
            map_effects=dict(self.map_effects),
            lineup_effects=dict(self.lineup_effects),
            last_seen=self.last_seen,
        )
        cloned.residuals.extend(self.residuals)
        return cloned


@dataclass(frozen=True)
class BackboneStateConfig:
    global_step: float = 0.12
    map_step: float = 0.08
    lineup_step: float = 0.05
    map_prior_games: float = 8.0
    lineup_prior_games: float = 15.0
    decay_half_life_days: float = 300.0
    region_prior_weight: float = 0.15


class DynamicTeamFeatureState:
    """Online latent state used to generate strictly pre-match features.

    It is deliberately low-dimensional: the learned logistic backbone decides
    how much forecast value is present in the global, map and lineup states.
    """

    def __init__(
        self,
        config: BackboneStateConfig | None = None,
        region_priors: Mapping[str, float] | None = None,
    ) -> None:
        self.config = config or BackboneStateConfig()
        self.region_priors = dict(region_priors or {})
        self.states: dict[int | str, LatentTeamState] = {}
        self.map_counts: dict[tuple[int | str, str], int] = defaultdict(int)
        self.lineup_counts: dict[tuple[int | str, str], int] = defaultdict(int)

    def _state(self, team: int | str) -> LatentTeamState:
        return self.states.get(team, LatentTeamState())

    def _decay(self, state: LatentTeamState, as_of: datetime) -> float:
        if state.last_seen is None:
            return 0.0
        days = max(0.0, (_utc(as_of) - state.last_seen).total_seconds() / 86400.0)
        return 0.5 ** (days / self.config.decay_half_life_days)

    def _components(
        self,
        team: int | str,
        map_name: str,
        roster_key: str | None,
        region: str,
        as_of: datetime,
    ) -> tuple[float, float, float, float, float, float]:
        state = self._state(team)
        decay = self._decay(state, as_of)
        global_strength = decay * state.global_strength
        count = self.map_counts[(team, map_name)]
        map_shrink = count / (count + self.config.map_prior_games)
        map_effect = decay * map_shrink * state.map_effects.get(map_name, 0.0)
        lineup_effect = 0.0
        if roster_key:
            lineup_count = self.lineup_counts[(team, roster_key)]
            lineup_shrink = lineup_count / (lineup_count + self.config.lineup_prior_games)
            lineup_effect = decay * lineup_shrink * state.lineup_effects.get(roster_key, 0.0)
        region_prior = self.config.region_prior_weight * self.region_priors.get(region, 0.0)
        residual_mean = float(np.mean(state.residuals)) if state.residuals else 0.0
        volatility = float(np.std(state.residuals, ddof=1)) if len(state.residuals) > 1 else 0.5
        inactivity_days = (
            max(0.0, (_utc(as_of) - state.last_seen).total_seconds() / 86400.0)
            if state.last_seen
            else 365.0
        )
        total = global_strength + map_effect + lineup_effect + region_prior
        return total, map_effect, lineup_effect, residual_mean, volatility, inactivity_days

    def features(self, context: TeamContext) -> dict[str, float | str]:
        a = self._components(
            context.team_a,
            context.map_name,
            context.roster_key_a,
            context.region_a,
            context.timestamp,
        )
        b = self._components(
            context.team_b,
            context.map_name,
            context.roster_key_b,
            context.region_b,
            context.timestamp,
        )
        return {
            "global_rating_diff": a[0] - b[0],
            "map_rating_diff": a[1] - b[1],
            "lineup_synergy_diff": a[2] - b[2],
            "roster_prior_diff": context.roster_prior_a - context.roster_prior_b,
            "continuity_diff": context.roster_continuity_a - context.roster_continuity_b,
            "inactivity_diff": a[5] - b[5],
            "recent_residual_diff": a[3] - b[3],
            "volatility_sum": a[4] + b[4],
            "map_name": context.map_name,
            "region_pair": f"{context.region_a}__{context.region_b}",
            "event_tier": context.event_tier,
            "patch_id": context.patch_id,
            "veto_state": context.veto_state,
            "map_picker": context.map_picker,
        }

    def update_match(
        self,
        contexts: Sequence[TeamContext],
        outcomes: Sequence[int],
        predicted_probabilities: Sequence[float],
    ) -> None:
        if not (len(contexts) == len(outcomes) == len(predicted_probabilities)):
            raise ValueError("contexts, outcomes and predictions must have equal length")
        if not contexts:
            return
        timestamp = _utc(contexts[0].timestamp)
        if any(_utc(ctx.timestamp) != timestamp for ctx in contexts):
            raise ValueError("series state must be frozen at one timestamp")
        updates: dict[int | str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for ctx, outcome, probability in zip(
            contexts, outcomes, predicted_probabilities, strict=True
        ):
            residual = float(outcome) - float(probability)
            updates[ctx.team_a]["global"] += self.config.global_step * residual
            updates[ctx.team_b]["global"] -= self.config.global_step * residual
            updates[ctx.team_a][f"map:{ctx.map_name}"] += self.config.map_step * residual
            updates[ctx.team_b][f"map:{ctx.map_name}"] -= self.config.map_step * residual
            if ctx.roster_key_a:
                updates[ctx.team_a][f"lineup:{ctx.roster_key_a}"] += self.config.lineup_step * residual
            if ctx.roster_key_b:
                updates[ctx.team_b][f"lineup:{ctx.roster_key_b}"] -= self.config.lineup_step * residual

        for team, deltas in updates.items():
            state = self._state(team).clone()
            state.global_strength += deltas["global"]
            for key, delta in deltas.items():
                if key.startswith("map:"):
                    map_name = key.split(":", 1)[1]
                    state.map_effects[map_name] = state.map_effects.get(map_name, 0.0) + delta
                    self.map_counts[(team, map_name)] += 1
                elif key.startswith("lineup:"):
                    lineup = key.split(":", 1)[1]
                    state.lineup_effects[lineup] = state.lineup_effects.get(lineup, 0.0) + delta
                    self.lineup_counts[(team, lineup)] += 1
            signed_residuals: list[float] = []
            for ctx, outcome, probability in zip(
                contexts, outcomes, predicted_probabilities, strict=True
            ):
                if team == ctx.team_a:
                    signed_residuals.append(outcome - probability)
                elif team == ctx.team_b:
                    signed_residuals.append(-(outcome - probability))
            state.residuals.extend(signed_residuals)
            state.last_seen = timestamp
            self.states[team] = state


DEFAULT_NUMERIC_FEATURES = (
    "global_rating_diff",
    "map_rating_diff",
    "lineup_synergy_diff",
    "roster_prior_diff",
    "continuity_diff",
    "inactivity_diff",
    "recent_residual_diff",
    "volatility_sum",
    "rating_mean_diff",
    "rating_uncertainty_sum",
    "normalized_margin_aux",
)

DEFAULT_CATEGORICAL_FEATURES = (
    "map_name",
    "region_pair",
    "event_tier",
    "patch_id",
    "veto_state",
    "map_picker",
)


class TeamHierarchicalBackbone:
    """Regularized, decomposable logistic approximation to the latent backbone."""

    def __init__(
        self,
        numeric_features: Sequence[str] = DEFAULT_NUMERIC_FEATURES,
        categorical_features: Sequence[str] = DEFAULT_CATEGORICAL_FEATURES,
        regularization: float = 1.0,
    ) -> None:
        self.numeric_features = tuple(numeric_features)
        self.categorical_features = tuple(categorical_features)
        numeric_pipeline = Pipeline(
            [
                ("impute", SimpleImputer(strategy="median", add_indicator=True)),
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
            ],
            remainder="drop",
        )
        self.pipeline = Pipeline(
            [
                ("features", transform),
                (
                    "model",
                    LogisticRegression(
                        C=float(regularization),
                        penalty="l2",
                        solver="lbfgs",
                        max_iter=2000,
                    ),
                ),
            ]
        )
        self._is_fitted = False

    def _frame(self, frame: pd.DataFrame | Sequence[Mapping[str, object]]) -> pd.DataFrame:
        data = frame.copy() if isinstance(frame, pd.DataFrame) else pd.DataFrame(frame)
        for column in self.numeric_features:
            if column not in data:
                data[column] = np.nan
        for column in self.categorical_features:
            if column not in data:
                data[column] = "unknown"
        return data

    def fit(
        self,
        frame: pd.DataFrame | Sequence[Mapping[str, object]],
        outcomes: Sequence[int],
        sample_weight: Sequence[float] | None = None,
    ) -> "TeamHierarchicalBackbone":
        data = self._frame(frame)
        kwargs = {"model__sample_weight": sample_weight} if sample_weight is not None else {}
        self.pipeline.fit(data, np.asarray(outcomes, dtype=int), **kwargs)
        self._is_fitted = True
        return self

    def predict_proba(
        self, frame: pd.DataFrame | Sequence[Mapping[str, object]]
    ) -> np.ndarray:
        if not self._is_fitted:
            raise RuntimeError("fit the backbone before prediction")
        return np.clip(self.pipeline.predict_proba(self._frame(frame))[:, 1], 1e-8, 1 - 1e-8)

    def coefficient_table(self) -> pd.DataFrame:
        if not self._is_fitted:
            raise RuntimeError("fit the backbone before reading coefficients")
        transformer = self.pipeline.named_steps["features"]
        names = transformer.get_feature_names_out()
        coefficients = self.pipeline.named_steps["model"].coef_[0]
        return pd.DataFrame({"feature": names, "coefficient": coefficients}).sort_values(
            "coefficient", key=np.abs, ascending=False
        )


class StudentTRoundMarginAuxiliary:
    """Robust Student-t IRLS model for normalized round margin.

    The auxiliary is never fed realized margin for the match being predicted;
    callers supply only pre-match features and use this model's forecast.
    """

    def __init__(self, degrees_of_freedom: float = 4.0, ridge: float = 1.0) -> None:
        if degrees_of_freedom <= 2:
            raise ValueError("degrees_of_freedom must exceed 2")
        self.df = float(degrees_of_freedom)
        self.ridge = float(ridge)
        self.coef_: np.ndarray | None = None
        self.scale_: float | None = None

    def fit(self, features: np.ndarray, margins: Sequence[float], max_iter: int = 100) -> "StudentTRoundMarginAuxiliary":
        x = np.asarray(features, dtype=float)
        y = np.asarray(margins, dtype=float)
        if x.ndim != 2 or len(x) != len(y):
            raise ValueError("features must be 2D and align with margins")
        design = np.column_stack([np.ones(len(x)), x])
        penalty = np.eye(design.shape[1]) * self.ridge
        penalty[0, 0] = 0.0
        coef = np.linalg.solve(design.T @ design + penalty, design.T @ y)
        scale = max(1e-4, float(np.median(np.abs(y - design @ coef)) / 0.6745))
        for _ in range(max_iter):
            residual = (y - design @ coef) / scale
            weights = (self.df + 1.0) / (self.df + residual**2)
            weighted = design * np.sqrt(weights)[:, None]
            target = y * np.sqrt(weights)
            updated = np.linalg.solve(weighted.T @ weighted + penalty, weighted.T @ target)
            updated_scale = max(
                1e-4,
                sqrt(float(np.sum(weights * (y - design @ updated) ** 2) / np.sum(weights))),
            )
            if np.max(np.abs(updated - coef)) < 1e-8:
                coef, scale = updated, updated_scale
                break
            coef, scale = updated, updated_scale
        self.coef_, self.scale_ = coef, scale
        return self

    def predict(self, features: np.ndarray) -> np.ndarray:
        if self.coef_ is None:
            raise RuntimeError("fit the margin auxiliary before prediction")
        x = np.asarray(features, dtype=float)
        return np.column_stack([np.ones(len(x)), x]) @ self.coef_

    def predictive_scale(self) -> float:
        if self.scale_ is None:
            raise RuntimeError("fit the margin auxiliary before reading its scale")
        return self.scale_ * sqrt(self.df / (self.df - 2.0))


__all__ = [
    "BackboneStateConfig",
    "DEFAULT_CATEGORICAL_FEATURES",
    "DEFAULT_NUMERIC_FEATURES",
    "DynamicTeamFeatureState",
    "StudentTRoundMarginAuxiliary",
    "TeamContext",
    "TeamHierarchicalBackbone",
]
