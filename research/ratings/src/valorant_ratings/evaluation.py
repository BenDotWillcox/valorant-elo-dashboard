"""Temporal evaluation, uncertainty intervals, and promotion decisions.

``run_rolling_development`` is the stable integration entry point.  It consumes
canonical (or canonicalizable) map rows, rebuilds every rating state as-of,
selects carryover parameters on 2024-2025 rolling predictions, and seals any
2026 rows without inspecting their outcomes.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime
import json
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from .elo import (
    ConstantMapPredictor,
    EloConfig,
    EloModel,
    EloObservation,
    GlickoLikeModel,
    MapReadinessConfig,
    MapReadinessEloModel,
    MapResetSchedule,
    SequentialTeamRating,
    carryover_search_space,
    map_readiness_search_space,
)
from .forecast import (
    BoostedForecastLayer,
    CalibratedBlend,
    ElasticNetForecastLayer,
    PlattCalibrator,
)
from .team import StudentTRoundMarginAuxiliary, TeamHierarchicalBackbone


EPSILON = 1e-8
FINAL_CONFIRMATION_TOKEN = "CONFIRM-2026-FINAL-HOLDOUT"


def binary_log_loss(outcomes: Sequence[int], probabilities: Sequence[float]) -> float:
    y = np.asarray(outcomes, dtype=float)
    p = np.clip(np.asarray(probabilities, dtype=float), EPSILON, 1 - EPSILON)
    if len(y) != len(p) or len(y) == 0:
        raise ValueError("outcomes and probabilities must align and be non-empty")
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def brier_score(outcomes: Sequence[int], probabilities: Sequence[float]) -> float:
    y = np.asarray(outcomes, dtype=float)
    p = np.asarray(probabilities, dtype=float)
    if len(y) != len(p) or len(y) == 0:
        raise ValueError("outcomes and probabilities must align and be non-empty")
    return float(np.mean((y - p) ** 2))


def calibration_intercept_slope(
    outcomes: Sequence[int], probabilities: Sequence[float]
) -> tuple[float, float]:
    y = np.asarray(outcomes, dtype=int)
    p = np.clip(np.asarray(probabilities, dtype=float), EPSILON, 1 - EPSILON)
    if len(np.unique(y)) < 2:
        return float("nan"), float("nan")
    logits = np.log(p / (1 - p)).reshape(-1, 1)
    model = LogisticRegression(C=1e6, solver="lbfgs", max_iter=2000)
    model.fit(logits, y)
    return float(model.intercept_[0]), float(model.coef_[0, 0])


def reliability_curve(
    outcomes: Sequence[int], probabilities: Sequence[float], bins: int = 10
) -> pd.DataFrame:
    if bins < 2:
        raise ValueError("bins must be at least 2")
    frame = pd.DataFrame({"outcome": outcomes, "probability": probabilities})
    edges = np.linspace(0.0, 1.0, bins + 1)
    frame["bin"] = pd.cut(
        frame["probability"], edges, include_lowest=True, labels=False, duplicates="drop"
    )
    result = (
        frame.groupby("bin", observed=True)
        .agg(
            count=("outcome", "size"),
            mean_probability=("probability", "mean"),
            observed_rate=("outcome", "mean"),
        )
        .reset_index()
    )
    result["absolute_gap"] = (result["mean_probability"] - result["observed_rate"]).abs()
    return result


def metric_summary(
    frame: pd.DataFrame,
    probability_columns: Sequence[str],
    outcome_column: str = "team_a_won",
) -> pd.DataFrame:
    rows: list[dict[str, float | str | int]] = []
    y = frame[outcome_column].astype(int).to_numpy()
    for column in probability_columns:
        valid = frame[column].notna().to_numpy()
        if not valid.any():
            continue
        probabilities = frame.loc[valid, column].to_numpy(dtype=float)
        outcomes = y[valid]
        intercept, slope = calibration_intercept_slope(outcomes, probabilities)
        reliability = reliability_curve(outcomes, probabilities)
        ece = float(
            np.average(reliability["absolute_gap"], weights=reliability["count"])
        )
        rows.append(
            {
                "model": column.removesuffix("_probability"),
                "maps": int(valid.sum()),
                "map_log_loss": binary_log_loss(outcomes, probabilities),
                "brier": brier_score(outcomes, probabilities),
                "calibration_intercept": intercept,
                "calibration_slope": slope,
                "expected_calibration_error": ece,
            }
        )
    return pd.DataFrame(rows).sort_values("map_log_loss", kind="stable").reset_index(drop=True)


@dataclass(frozen=True)
class BootstrapDifference:
    mean_difference: float
    lower: float
    upper: float
    confidence: float
    resamples: int
    unit: str


def _cluster_bootstrap(
    frame: pd.DataFrame,
    difference: np.ndarray,
    cluster_column: str,
    resamples: int,
    confidence: float,
    seed: int,
) -> BootstrapDifference:
    if cluster_column not in frame:
        raise ValueError(f"missing cluster column {cluster_column}")
    working = pd.DataFrame(
        {"cluster": frame[cluster_column].astype(str).to_numpy(), "difference": difference}
    )
    cluster_means = working.groupby("cluster", sort=False)["difference"].mean().to_numpy()
    if not len(cluster_means):
        raise ValueError("bootstrap requires at least one cluster")
    rng = np.random.default_rng(seed)
    draws = rng.choice(cluster_means, size=(resamples, len(cluster_means)), replace=True).mean(axis=1)
    alpha = (1 - confidence) / 2
    lower, upper = np.quantile(draws, [alpha, 1 - alpha])
    return BootstrapDifference(
        mean_difference=float(np.mean(difference)),
        lower=float(lower),
        upper=float(upper),
        confidence=confidence,
        resamples=resamples,
        unit=cluster_column,
    )


def paired_log_loss_bootstrap(
    frame: pd.DataFrame,
    candidate_column: str,
    baseline_column: str,
    outcome_column: str = "team_a_won",
    cluster_column: str = "match_id",
    resamples: int = 2000,
    confidence: float = 0.95,
    seed: int = 20260714,
) -> BootstrapDifference:
    valid = frame[[candidate_column, baseline_column, outcome_column, cluster_column]].dropna()
    y = valid[outcome_column].to_numpy(dtype=float)
    candidate = np.clip(valid[candidate_column].to_numpy(dtype=float), EPSILON, 1 - EPSILON)
    baseline = np.clip(valid[baseline_column].to_numpy(dtype=float), EPSILON, 1 - EPSILON)
    candidate_loss = -(y * np.log(candidate) + (1 - y) * np.log(1 - candidate))
    baseline_loss = -(y * np.log(baseline) + (1 - y) * np.log(1 - baseline))
    return _cluster_bootstrap(
        valid,
        candidate_loss - baseline_loss,
        cluster_column,
        resamples,
        confidence,
        seed,
    )


def event_block_log_loss_bootstrap(
    frame: pd.DataFrame,
    candidate_column: str,
    baseline_column: str,
    event_column: str = "event_id",
    **kwargs: object,
) -> BootstrapDifference:
    return paired_log_loss_bootstrap(
        frame,
        candidate_column,
        baseline_column,
        cluster_column=event_column,
        **kwargs,
    )


@dataclass(frozen=True)
class MapOrderingComparison:
    """Within-series ability to rank maps with opposite realized winners."""

    candidate: str
    baseline: str
    multimap_series: int
    comparable_series: int
    comparable_pairs: int
    candidate_accuracy: float
    baseline_accuracy: float
    paired_difference: BootstrapDifference


def within_series_map_ordering_bootstrap(
    frame: pd.DataFrame,
    candidate_column: str,
    baseline_column: str,
    *,
    resamples: int = 2000,
    confidence: float = 0.95,
    seed: int = 20260714,
) -> MapOrderingComparison:
    """Compare map ranking accuracy with match-clustered intervals.

    Each multi-map series is oriented to a stable focal team. Series in which
    both teams win at least one map contribute the fraction of cross-outcome
    map pairs for which the model assigns the focal team a higher probability
    on the map it won. Exact probability ties receive half credit. The point
    estimate and bootstrap weight each comparable series equally.
    """

    required = {
        "match_id",
        "team_a",
        "team_b",
        "team_a_won",
        candidate_column,
        baseline_column,
    }
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"map-ordering metric missing columns: {sorted(missing)}")
    multimap_series = 0
    rows: list[dict[str, float | int | str]] = []
    for match_id, match in frame.groupby("match_id", sort=False):
        if len(match) < 2:
            continue
        teams = set(match["team_a"]).union(match["team_b"])
        if len(teams) != 2:
            continue
        multimap_series += 1
        focal = min(teams, key=str)
        focal_is_a = match["team_a"].map(lambda value: value == focal).to_numpy()
        outcome = np.where(
            focal_is_a,
            match["team_a_won"].to_numpy(dtype=int),
            1 - match["team_a_won"].to_numpy(dtype=int),
        )
        wins = np.flatnonzero(outcome == 1)
        losses = np.flatnonzero(outcome == 0)
        if not len(wins) or not len(losses):
            continue

        record: dict[str, float | int | str] = {
            "match_id": str(match_id),
            "pairs": int(len(wins) * len(losses)),
        }
        for label, column in (("candidate", candidate_column), ("baseline", baseline_column)):
            raw = match[column].to_numpy(dtype=float)
            probability = np.where(focal_is_a, raw, 1.0 - raw)
            scores: list[float] = []
            for win_index in wins:
                for loss_index in losses:
                    difference = probability[win_index] - probability[loss_index]
                    scores.append(0.5 if np.isclose(difference, 0.0) else float(difference > 0))
            record[label] = float(np.mean(scores))
        rows.append(record)
    if not rows:
        raise ValueError(
            "map-ordering metric requires a multi-map series with wins by both teams"
        )
    series_scores = pd.DataFrame(rows)
    difference = (
        series_scores["candidate"].to_numpy(dtype=float)
        - series_scores["baseline"].to_numpy(dtype=float)
    )
    paired = _cluster_bootstrap(
        series_scores,
        difference,
        "match_id",
        resamples,
        confidence,
        seed,
    )
    return MapOrderingComparison(
        candidate=candidate_column.removesuffix("_probability"),
        baseline=baseline_column.removesuffix("_probability"),
        multimap_series=multimap_series,
        comparable_series=len(series_scores),
        comparable_pairs=int(series_scores["pairs"].sum()),
        candidate_accuracy=float(series_scores["candidate"].mean()),
        baseline_accuracy=float(series_scores["baseline"].mean()),
        paired_difference=paired,
    )


EPISODE_COLUMNS = (
    "episode_id",
    "team",
    "map_name",
    "start",
    "end",
    "direction",
    "observations",
    "mean_readiness",
    "median_readiness",
    "sign_agreement_rate",
    "declared_sign_met",
)


def load_map_form_episodes(path: Path | str) -> list[dict[str, object]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    episodes = payload.get("episodes")
    if not isinstance(episodes, list):
        raise ValueError("map-form episode fixture requires an episodes list")
    validated: list[dict[str, object]] = []
    for index, episode in enumerate(episodes):
        if not isinstance(episode, Mapping):
            raise ValueError(f"episode {index} must be an object")
        required = {"team", "map", "start", "end", "direction"}
        missing = required.difference(episode)
        if missing:
            raise ValueError(f"episode {index} missing fields: {sorted(missing)}")
        direction = str(episode["direction"]).lower()
        if direction not in {"positive", "negative"}:
            raise ValueError(f"episode {index} direction must be positive or negative")
        start = pd.Timestamp(episode["start"])
        end = pd.Timestamp(episode["end"])
        if start.tzinfo is None:
            start = start.tz_localize("UTC")
        else:
            start = start.tz_convert("UTC")
        if end.tzinfo is None:
            end = end.tz_localize("UTC")
        else:
            end = end.tz_convert("UTC")
        if start > end:
            raise ValueError(f"episode {index} start must not be after end")
        validated.append(
            {
                "episode_id": str(episode.get("episode_id", f"episode-{index + 1}")),
                "team": episode["team"],
                "map": str(episode["map"]),
                "start": start,
                "end": end,
                "direction": direction,
            }
        )
    return validated


def evaluate_map_form_episodes(
    predictions: pd.DataFrame,
    episodes: Sequence[Mapping[str, object]],
) -> pd.DataFrame:
    """Check the sign of pre-match readiness during predeclared windows."""

    required = {
        "timestamp",
        "map_name",
        "team_a",
        "team_b",
        "map_readiness_team_a_readiness",
        "map_readiness_team_b_readiness",
    }
    missing = required.difference(predictions.columns)
    if missing and episodes:
        raise ValueError(f"episode diagnostics missing columns: {sorted(missing)}")
    rows: list[dict[str, object]] = []
    timestamp = pd.to_datetime(predictions.get("timestamp"), utc=True)
    for index, episode in enumerate(episodes):
        start = pd.Timestamp(episode["start"])
        end = pd.Timestamp(episode["end"])
        if start.tzinfo is None:
            start = start.tz_localize("UTC")
        else:
            start = start.tz_convert("UTC")
        if end.tzinfo is None:
            end = end.tz_localize("UTC")
        else:
            end = end.tz_convert("UTC")
        team = episode["team"]
        map_name = str(episode.get("map", episode.get("map_name")))
        in_window = (timestamp >= start) & (timestamp <= end)
        on_map = predictions["map_name"].astype(str) == map_name
        is_a = predictions["team_a"].map(str) == str(team)
        is_b = predictions["team_b"].map(str) == str(team)
        values = pd.concat(
            [
                predictions.loc[in_window & on_map & is_a, "map_readiness_team_a_readiness"],
                predictions.loc[in_window & on_map & is_b, "map_readiness_team_b_readiness"],
            ],
            ignore_index=True,
        ).astype(float)
        direction = str(episode["direction"]).lower()
        sign = 1.0 if direction == "positive" else -1.0
        observations = len(values)
        mean = float(values.mean()) if observations else float("nan")
        rows.append(
            {
                "episode_id": str(episode.get("episode_id", f"episode-{index + 1}")),
                "team": team,
                "map_name": map_name,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "direction": direction,
                "observations": observations,
                "mean_readiness": mean,
                "median_readiness": float(values.median()) if observations else float("nan"),
                "sign_agreement_rate": (
                    float((sign * values.to_numpy() > 0).mean())
                    if observations
                    else float("nan")
                ),
                "declared_sign_met": bool(sign * mean > 0) if observations else None,
            }
        )
    return pd.DataFrame(rows, columns=EPISODE_COLUMNS)


@dataclass(frozen=True)
class PromotionDecision:
    candidate: str
    baseline: str
    development_pass: bool
    paired_difference: BootstrapDifference
    brier_degradation: float
    calibration_slope_degradation: float
    final_holdout_pass: bool | None = None

    @property
    def promoted(self) -> bool:
        return bool(self.development_pass and self.final_holdout_pass is True)


def promotion_decision(
    predictions: pd.DataFrame,
    candidate_column: str,
    baseline_column: str,
    resamples: int = 2000,
    seed: int = 20260714,
    brier_tolerance: float = 0.002,
    slope_tolerance: float = 0.10,
) -> PromotionDecision:
    paired = paired_log_loss_bootstrap(
        predictions,
        candidate_column,
        baseline_column,
        resamples=resamples,
        seed=seed,
    )
    y = predictions["team_a_won"].to_numpy(dtype=int)
    candidate = predictions[candidate_column].to_numpy(dtype=float)
    baseline = predictions[baseline_column].to_numpy(dtype=float)
    candidate_brier = brier_score(y, candidate)
    baseline_brier = brier_score(y, baseline)
    _, candidate_slope = calibration_intercept_slope(y, candidate)
    _, baseline_slope = calibration_intercept_slope(y, baseline)
    slope_degradation = abs(candidate_slope - 1.0) - abs(baseline_slope - 1.0)
    development_pass = (
        paired.upper < 0
        and candidate_brier - baseline_brier <= brier_tolerance
        and slope_degradation <= slope_tolerance
    )
    return PromotionDecision(
        candidate_column.removesuffix("_probability"),
        baseline_column.removesuffix("_probability"),
        bool(development_pass),
        paired,
        float(candidate_brier - baseline_brier),
        float(slope_degradation),
    )


class FrozenLockbox:
    """Sealed raw 2026 rows; opening requires an explicit final-evaluation token."""

    __slots__ = ("__rows", "__opened")

    def __init__(self, rows: pd.DataFrame) -> None:
        self.__rows = rows.copy(deep=True)
        self.__opened = False

    @property
    def row_count(self) -> int:
        return len(self.__rows)

    @property
    def is_open(self) -> bool:
        return self.__opened

    def open_for_final_confirmation(self, confirmation: str) -> pd.DataFrame:
        if confirmation != FINAL_CONFIRMATION_TOKEN:
            raise PermissionError(
                "2026 lockbox is sealed; pass the explicit final confirmation token"
            )
        if self.__opened:
            raise RuntimeError("the final holdout has already been opened")
        self.__opened = True
        return self.__rows.copy(deep=True)


def _timestamp_series(frame: pd.DataFrame) -> pd.Series:
    for column in (
        "prediction_cutoff",
        "series_anchor_at",
        "match_completed_at",
        "timestamp",
        "completed_at",
    ):
        if column in frame:
            parsed = pd.to_datetime(frame[column], utc=True, errors="coerce")
            if parsed.notna().all():
                return parsed
    raise ValueError("map data requires a complete prediction timestamp column")


def _canonicalize(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    timestamp = _timestamp_series(data)
    if "match_id" not in data or "map_name" not in data:
        raise ValueError("map data requires match_id and map_name")
    data["timestamp"] = timestamp
    data["prediction_cutoff"] = timestamp.groupby(data["match_id"]).transform("min")
    if "team1_id" in data and "team2_id" in data:
        data["team_a"] = data["team1_id"]
        data["team_b"] = data["team2_id"]
        if "team1_win" in data:
            data["team_a_won"] = data["team1_win"].astype(int)
        elif "winner_team_id" in data:
            data["team_a_won"] = (data["winner_team_id"] == data["team_a"]).astype(int)
    elif {"team_a", "team_b", "team_a_won"}.issubset(data.columns):
        data["team_a_won"] = data["team_a_won"].astype(int)
    elif {"winner_team_id", "loser_team_id"}.issubset(data.columns):
        # Stable orientation prevents a degenerate all-winner target.
        winner_first = data.apply(
            lambda row: str(row["winner_team_id"]) <= str(row["loser_team_id"]), axis=1
        )
        data["team_a"] = np.where(winner_first, data["winner_team_id"], data["loser_team_id"])
        data["team_b"] = np.where(winner_first, data["loser_team_id"], data["winner_team_id"])
        data["team_a_won"] = winner_first.astype(int)
    else:
        raise ValueError("map data cannot be oriented into team_a/team_b")

    if "round_margin" not in data:
        if {"winner_rounds", "loser_rounds", "winner_team_id"}.issubset(data.columns):
            winner_margin = data["winner_rounds"].astype(float) - data["loser_rounds"].astype(float)
            data["round_margin"] = np.where(
                data["team_a"] == data["winner_team_id"], winner_margin, -winner_margin
            )
        elif {"team_a_rounds", "team_b_rounds"}.issubset(data.columns):
            data["round_margin"] = data["team_a_rounds"] - data["team_b_rounds"]
        else:
            data["round_margin"] = 0.0
    if "normalized_round_margin" not in data:
        total = None
        if {"winner_rounds", "loser_rounds"}.issubset(data.columns):
            total = data["winner_rounds"].astype(float) + data["loser_rounds"].astype(float)
        elif {"team_a_rounds", "team_b_rounds"}.issubset(data.columns):
            total = data["team_a_rounds"].astype(float) + data["team_b_rounds"].astype(float)
        data["normalized_round_margin"] = (
            data["round_margin"] / total.clip(lower=1) if total is not None else np.nan
        )
    if "patch_id" not in data and "patch" in data:
        data["patch_id"] = data["patch"]
    for column, default in (
        ("event_id", "unknown"),
        ("event_name", "unknown"),
        ("region", "unknown"),
        ("stage", "unknown"),
        ("patch_id", "unknown"),
        ("veto_state", "unknown"),
        ("map_picker", "unknown"),
        ("game_number", 1),
    ):
        if column not in data:
            data[column] = default
    if data.duplicated(["match_id", "game_number"]).any():
        raise ValueError("mirrored or duplicate map observations detected")
    if not data["team_a_won"].isin([0, 1]).all():
        raise ValueError("team_a_won must be binary")
    cutoff_counts = data.groupby("match_id")["prediction_cutoff"].nunique()
    if (cutoff_counts != 1).any():
        raise ValueError("all maps in a series must share one prediction cutoff")
    return data.sort_values(
        ["prediction_cutoff", "match_id", "game_number"], kind="stable"
    ).reset_index(drop=True)


def split_development_lockbox(raw_maps: pd.DataFrame) -> tuple[pd.DataFrame, FrozenLockbox]:
    timestamps = _timestamp_series(raw_maps)
    development = raw_maps.loc[timestamps.dt.year <= 2025].copy()
    lockbox = raw_maps.loc[timestamps.dt.year == 2026].copy()
    if (timestamps.dt.year > 2026).any():
        raise ValueError("snapshot contains rows after the frozen 2026 confirmation period")
    return development, FrozenLockbox(lockbox)


class RollingOOFEvaluator:
    """Generate sequential predictions while freezing state for each series."""

    def __init__(self, model: SequentialTeamRating, prediction_start_year: int = 2024) -> None:
        self.model = model
        self.prediction_start_year = prediction_start_year

    def run(self, maps: pd.DataFrame) -> pd.DataFrame:
        data = _canonicalize(maps)
        records: list[dict[str, object]] = []
        # Every match at a shared cutoff is predicted before any of those results
        # update state. This also groups identical timestamps in the same fold.
        for cutoff, timestamp_block in data.groupby("prediction_cutoff", sort=True):
            pending_updates: list[list[EloObservation]] = []
            for match_id, match in timestamp_block.groupby("match_id", sort=False):
                observations: list[EloObservation] = []
                for index, row in match.iterrows():
                    observation = EloObservation(
                        match_id=match_id,
                        timestamp=cutoff.to_pydatetime(),
                        map_name=str(row["map_name"]),
                        team_a=row["team_a"],
                        team_b=row["team_b"],
                        team_a_won=int(row["team_a_won"]),
                        round_margin=float(row["round_margin"]),
                        event_id=row["event_id"],
                    )
                    observations.append(observation)
                    forecast = self.model.predict(
                        observation.team_a,
                        observation.team_b,
                        observation.map_name,
                        observation.timestamp,
                    )
                    if cutoff.year >= self.prediction_start_year:
                        record = {
                            "row_index": int(index),
                            "match_id": match_id,
                            "event_id": row["event_id"],
                            "timestamp": cutoff,
                            "map_name": observation.map_name,
                            "team_a": observation.team_a,
                            "team_b": observation.team_b,
                            "team_a_won": observation.team_a_won,
                            "probability": forecast.probability,
                            "team_a_rating": forecast.team_a_rating,
                            "team_b_rating": forecast.team_b_rating,
                            "team_a_uncertainty": forecast.team_a_uncertainty,
                            "team_b_uncertainty": forecast.team_b_uncertainty,
                        }
                        if isinstance(self.model, MapReadinessEloModel):
                            component_a = self.model.components(
                                observation.team_a,
                                observation.map_name,
                                observation.timestamp,
                            )
                            component_b = self.model.components(
                                observation.team_b,
                                observation.map_name,
                                observation.timestamp,
                            )
                            record.update(
                                {
                                    "team_a_global_strength": component_a.global_strength,
                                    "team_b_global_strength": component_b.global_strength,
                                    "team_a_map_affinity": component_a.persistent_map_affinity,
                                    "team_b_map_affinity": component_b.persistent_map_affinity,
                                    "team_a_readiness": component_a.map_readiness,
                                    "team_b_readiness": component_b.map_readiness,
                                    "team_a_readiness_uncertainty": component_a.readiness_uncertainty,
                                    "team_b_readiness_uncertainty": component_b.readiness_uncertainty,
                                    "team_a_readiness_resets": component_a.readiness_reset_count,
                                    "team_b_readiness_resets": component_b.readiness_reset_count,
                                }
                            )
                        records.append(record)
                pending_updates.append(observations)
            for observations in pending_updates:
                self.model.update_batch(observations)
        return pd.DataFrame(records).sort_values("row_index", kind="stable").reset_index(drop=True)


def _rating_predictions(
    maps: pd.DataFrame,
    model: SequentialTeamRating,
    start_year: int,
    prefix: str,
) -> pd.DataFrame:
    predictions = RollingOOFEvaluator(model, start_year).run(maps)
    rename = {
        "probability": f"{prefix}_probability",
        "team_a_rating": f"{prefix}_team_a_rating",
        "team_b_rating": f"{prefix}_team_b_rating",
        "team_a_uncertainty": f"{prefix}_team_a_uncertainty",
        "team_b_uncertainty": f"{prefix}_team_b_uncertainty",
    }
    component_columns = (
        "team_a_global_strength",
        "team_b_global_strength",
        "team_a_map_affinity",
        "team_b_map_affinity",
        "team_a_readiness",
        "team_b_readiness",
        "team_a_readiness_uncertainty",
        "team_b_readiness_uncertainty",
        "team_a_readiness_resets",
        "team_b_readiness_resets",
    )
    rename.update(
        {
            column: f"{prefix}_{column}"
            for column in component_columns
            if column in predictions
        }
    )
    identity = [
        "row_index",
        "match_id",
        "event_id",
        "timestamp",
        "map_name",
        "team_a",
        "team_b",
        "team_a_won",
    ]
    return predictions[identity + list(rename)].rename(columns=rename)


def _merge_player_priors(maps: pd.DataFrame, priors: pd.DataFrame | None) -> pd.DataFrame:
    data = maps.copy()
    data["roster_prior_diff"] = 0.0
    if priors is None or priors.empty:
        return data
    required = {"match_id", "team_id", "predictive_box_vpm"}
    if not required.issubset(priors.columns):
        raise ValueError(f"player_priors requires columns {sorted(required)}")
    if "feature_timestamp" in priors:
        check = priors.merge(
            data[["match_id", "prediction_cutoff"]].drop_duplicates(), on="match_id", how="left"
        )
        feature_time = pd.to_datetime(check["feature_timestamp"], utc=True)
        if (feature_time >= check["prediction_cutoff"]).any():
            raise ValueError("player priors must be strictly earlier than prediction cutoff")
    totals = priors.groupby(["match_id", "team_id"])["predictive_box_vpm"].sum()
    data["roster_prior_diff"] = [
        float(totals.get((match_id, team_a), 0.0) - totals.get((match_id, team_b), 0.0))
        for match_id, team_a, team_b in zip(
            data["match_id"], data["team_a"], data["team_b"], strict=True
        )
    ]
    return data


def _context_frame(base: pd.DataFrame, maps: pd.DataFrame) -> pd.DataFrame:
    context = base.merge(
        maps[
            [
                "match_id",
                "map_name",
                "game_number",
                "event_name",
                "region",
                "stage",
                "patch_id",
                "veto_state",
                "map_picker",
                "normalized_round_margin",
                "roster_prior_diff",
            ]
        ],
        on=["match_id", "map_name"],
        how="left",
        validate="one_to_one",
    )
    context["rating_mean_diff"] = (
        context["carryover_team_a_rating"] - context["carryover_team_b_rating"]
    )
    context["rating_uncertainty_sum"] = (
        context["carryover_team_a_uncertainty"] + context["carryover_team_b_uncertainty"]
    )
    context["global_rating_diff"] = context["rating_mean_diff"]
    context["map_rating_diff"] = context["rating_mean_diff"]
    context["lineup_synergy_diff"] = 0.0
    context["continuity_diff"] = 0.0
    context["inactivity_diff"] = 0.0
    context["recent_residual_diff"] = 0.0
    context["volatility_sum"] = context["rating_uncertainty_sum"] / 350.0
    context["composition_diff"] = context["roster_prior_diff"]
    context["region_pair"] = context["region"].fillna("unknown").astype(str)
    context["event_tier"] = context["stage"].fillna("unknown").astype(str)
    context["backbone_probability"] = context["carryover_probability"]
    context["normalized_margin_aux"] = 0.0
    return context


def _rolling_contextual_predictions(
    context: pd.DataFrame,
    seed: int,
    minimum_training_rows: int = 150,
) -> pd.DataFrame:
    result = context[["row_index"]].copy()
    for name in ("backbone", "elastic_net", "boosted", "blend"):
        result[f"{name}_probability"] = np.nan
    context = context.copy()
    context["quarter"] = (
        context["timestamp"].dt.tz_localize(None).dt.to_period("Q").astype(str)
    )
    prior_oof: list[pd.DataFrame] = []
    for quarter in sorted(context.loc[context["timestamp"].dt.year >= 2024, "quarter"].unique()):
        test_mask = context["quarter"] == quarter
        fold_start = context.loc[test_mask, "timestamp"].min()
        train = context.loc[context["timestamp"] < fold_start].copy()
        test = context.loc[test_mask].copy()
        if len(train) < minimum_training_rows or train["team_a_won"].nunique() < 2:
            result.loc[test.index, "backbone_probability"] = test["carryover_probability"]
            result.loc[test.index, "elastic_net_probability"] = test["carryover_probability"]
            result.loc[test.index, "boosted_probability"] = test["carryover_probability"]
            result.loc[test.index, "blend_probability"] = test["carryover_probability"]
            continue

        margin_features = ["rating_mean_diff", "roster_prior_diff", "continuity_diff"]
        margin_train = train.dropna(subset=["normalized_round_margin"])
        if len(margin_train) >= 50:
            auxiliary = StudentTRoundMarginAuxiliary().fit(
                margin_train[margin_features].fillna(0).to_numpy(),
                margin_train["normalized_round_margin"],
            )
            train["normalized_margin_aux"] = auxiliary.predict(
                train[margin_features].fillna(0).to_numpy()
            )
            test["normalized_margin_aux"] = auxiliary.predict(
                test[margin_features].fillna(0).to_numpy()
            )

        backbone = TeamHierarchicalBackbone().fit(train, train["team_a_won"])
        backbone_train = backbone.predict_proba(train)
        backbone_test = backbone.predict_proba(test)
        train["backbone_probability"] = backbone_train
        test["backbone_probability"] = backbone_test
        elastic = ElasticNetForecastLayer(seed=seed).fit(train, train["team_a_won"])
        boosted = BoostedForecastLayer(seed=seed).fit(train, train["team_a_won"])
        elastic_test = elastic.predict_raw(test)
        boosted_test = boosted.predict_raw(test)

        if prior_oof:
            calibration = pd.concat(prior_oof, ignore_index=True)
            if calibration["team_a_won"].nunique() == 2 and len(calibration) >= 100:
                blend = CalibratedBlend().fit(
                    calibration["backbone_probability"],
                    calibration["boosted_probability"],
                    calibration["team_a_won"],
                    calibrate=True,
                )
                blended_test = blend.predict(backbone_test, boosted_test)
            else:
                blended_test = 0.5 * backbone_test + 0.5 * boosted_test
        else:
            blended_test = 0.5 * backbone_test + 0.5 * boosted_test

        result.loc[test.index, "backbone_probability"] = backbone_test
        result.loc[test.index, "elastic_net_probability"] = elastic_test
        result.loc[test.index, "boosted_probability"] = boosted_test
        result.loc[test.index, "blend_probability"] = blended_test
        prior_oof.append(
            pd.DataFrame(
                {
                    "team_a_won": test["team_a_won"].to_numpy(),
                    "backbone_probability": backbone_test,
                    "boosted_probability": boosted_test,
                }
            )
        )
    return result


@dataclass
class DevelopmentResult:
    metrics: pd.DataFrame
    selected_carryover_config: EloConfig
    promotion_gates: tuple[PromotionDecision, ...]
    lockbox: FrozenLockbox
    development_period: tuple[int, int] = (2024, 2025)
    warmup_year: int = 2023

    def configuration(self) -> dict[str, object]:
        return {
            "warmup_year": self.warmup_year,
            "development_period": list(self.development_period),
            "selected_carryover": asdict(self.selected_carryover_config),
            "lockbox_rows": self.lockbox.row_count,
            "lockbox_opened": self.lockbox.is_open,
        }


@dataclass
class FinalConfirmationResult:
    """One-time final-holdout readout with no parameter selection on 2026."""

    metrics: pd.DataFrame
    selected_carryover_config: EloConfig
    promotion_gates: tuple[PromotionDecision, ...]
    holdout_period: int = 2026


def _resolve_confirmation_inputs(
    maps_df: pd.DataFrame,
    development_result_or_config: DevelopmentResult | Mapping[str, object],
    confirmation_token: str,
) -> tuple[pd.DataFrame, pd.DataFrame, EloConfig, tuple[PromotionDecision, ...]]:
    raw_development, fallback_lockbox = split_development_lockbox(maps_df)
    if isinstance(development_result_or_config, DevelopmentResult):
        config = development_result_or_config.selected_carryover_config
        raw_lockbox = development_result_or_config.lockbox.open_for_final_confirmation(
            confirmation_token
        )
        development_gates = development_result_or_config.promotion_gates
    else:
        config_payload = development_result_or_config.get("selected_carryover")
        lockbox = development_result_or_config.get("lockbox")
        if isinstance(config_payload, EloConfig):
            config = config_payload
        elif isinstance(config_payload, Mapping):
            config = EloConfig(**config_payload)
        else:
            raise TypeError(
                "config mappings require selected_carryover as EloConfig or its field mapping"
            )
        if not isinstance(lockbox, FrozenLockbox):
            raise TypeError(
                "config mappings require the original FrozenLockbox so opening remains exactly-once"
            )
        raw_lockbox = lockbox.open_for_final_confirmation(confirmation_token)
        development_gates = ()
    if len(raw_lockbox) != fallback_lockbox.row_count:
        raise ValueError("sealed lockbox does not match maps_df's 2026 row count")
    return raw_development, raw_lockbox, config, tuple(development_gates)


def _fit_frozen_context_layers(
    context: pd.DataFrame,
    seed: int,
) -> tuple[pd.DataFrame, str]:
    """Fit once on pre-2026 rows and predict 2026 without outcome feedback."""

    development = context.loc[context["timestamp"].dt.year <= 2025].copy()
    holdout = context.loc[context["timestamp"].dt.year == 2026].copy()
    if development.empty or holdout.empty:
        raise ValueError("final confirmation requires both pre-2026 training and 2026 rows")
    if development["team_a_won"].nunique() < 2:
        raise ValueError("pre-2026 training requires both map outcomes")

    margin_features = ["rating_mean_diff", "roster_prior_diff", "continuity_diff"]
    margin_train = development.dropna(subset=["normalized_round_margin"])
    if len(margin_train) >= 50:
        auxiliary = StudentTRoundMarginAuxiliary().fit(
            margin_train[margin_features].fillna(0).to_numpy(),
            margin_train["normalized_round_margin"],
        )
        development["normalized_margin_aux"] = auxiliary.predict(
            development[margin_features].fillna(0).to_numpy()
        )
        holdout["normalized_margin_aux"] = auxiliary.predict(
            holdout[margin_features].fillna(0).to_numpy()
        )

    # Backbone parameters are fixed using every observation through 2025.
    backbone = TeamHierarchicalBackbone().fit(development, development["team_a_won"])
    holdout_backbone = backbone.predict_proba(holdout)

    # Train the stacked challengers on rolling OOF backbone probabilities. This
    # avoids teaching them from an in-sample backbone score.
    development_oof = _rolling_contextual_predictions(development, seed)
    development_oof = development_oof.rename(
        columns={
            column: f"{column}_oof"
            for column in development_oof.columns
            if column != "row_index"
        }
    )
    stacked = development.loc[development["timestamp"].dt.year >= 2024].merge(
        development_oof,
        on="row_index",
        how="inner",
        validate="one_to_one",
        suffixes=("", "_oof"),
    )
    stacked["backbone_probability"] = stacked["backbone_probability_oof"]
    holdout["backbone_probability"] = holdout_backbone
    if len(stacked) < 20 or stacked["team_a_won"].nunique() < 2:
        # A tiny synthetic/staging snapshot cannot estimate a distinct layer;
        # falling back to the backbone is explicit and leakage-safe.
        return (
            pd.DataFrame(
                {
                    "row_index": holdout["row_index"].to_numpy(),
                    "backbone_probability": holdout_backbone,
                    "elastic_net_probability": holdout_backbone,
                    "boosted_probability": holdout_backbone,
                    "blend_probability": holdout_backbone,
                }
            ),
            "blend_probability",
        )

    elastic = ElasticNetForecastLayer(seed=seed).fit(stacked, stacked["team_a_won"])
    boosted = BoostedForecastLayer(seed=seed).fit(stacked, stacked["team_a_won"])
    elastic_raw = elastic.predict_raw(holdout)
    boosted_raw = boosted.predict_raw(holdout)

    # Calibration and blend weights see development OOF predictions only.
    elastic_calibrator = PlattCalibrator()
    boosted_calibrator = PlattCalibrator()
    if stacked["elastic_net_probability_oof"].notna().all():
        elastic_calibrator.fit(
            stacked["elastic_net_probability_oof"], stacked["team_a_won"]
        )
    if stacked["boosted_probability_oof"].notna().all():
        boosted_calibrator.fit(stacked["boosted_probability_oof"], stacked["team_a_won"])
    elastic_probability = elastic_calibrator.predict(elastic_raw)
    boosted_probability = boosted_calibrator.predict(boosted_raw)
    blend = CalibratedBlend().fit(
        stacked["backbone_probability_oof"],
        stacked["boosted_probability_oof"],
        stacked["team_a_won"],
        calibrate=True,
    )
    blend_probability = blend.predict(holdout_backbone, boosted_raw)
    contextual_champion = min(
        (
            "elastic_net_probability",
            "boosted_probability",
            "blend_probability",
        ),
        key=lambda column: binary_log_loss(
            stacked["team_a_won"], stacked[f"{column}_oof"]
        ),
    )
    return (
        pd.DataFrame(
            {
                "row_index": holdout["row_index"].to_numpy(),
                "backbone_probability": holdout_backbone,
                "elastic_net_probability": elastic_probability,
                "boosted_probability": boosted_probability,
                "blend_probability": blend_probability,
            }
        ),
        contextual_champion,
    )


def run_final_confirmation(
    maps_df: pd.DataFrame,
    development_result_or_config: DevelopmentResult | Mapping[str, object],
    confirmation_token: str,
    seed: int = 20260714,
    bootstrap_resamples: int = 2000,
) -> tuple[pd.DataFrame, FinalConfirmationResult]:
    """Open and score the 2026 holdout exactly once, without 2026 tuning.

    The carryover configuration is the development-selected configuration.
    Rating states may update after each completed 2026 match, which mirrors an
    honest production as-of forecast, while backbone/context coefficients and
    calibration remain frozen at the end of 2025.

    A mapping alternative is supported with keys ``selected_carryover`` and
    ``lockbox``; the latter must be the original :class:`FrozenLockbox` so a
    second opening is still rejected.
    """

    raw_development, raw_lockbox, config, development_gates = _resolve_confirmation_inputs(
        maps_df, development_result_or_config, confirmation_token
    )
    combined = pd.concat([raw_development, raw_lockbox], ignore_index=True)
    maps = _merge_player_priors(_canonicalize(combined), None)
    current = _rating_predictions(
        maps, EloModel(EloConfig.current_hard_reset()), 2023, "current_elo"
    )
    carryover = _rating_predictions(maps, EloModel(config), 2023, "carryover")
    base = current.merge(
        carryover.drop(
            columns=[
                "match_id",
                "event_id",
                "timestamp",
                "map_name",
                "team_a",
                "team_b",
                "team_a_won",
            ]
        ),
        on="row_index",
        validate="one_to_one",
    )
    context = _context_frame(base, maps)
    contextual, contextual_champion = _fit_frozen_context_layers(context, seed)
    predictions = base.merge(contextual, on="row_index", validate="one_to_one")
    predictions = predictions.loc[predictions["timestamp"].dt.year == 2026].reset_index(
        drop=True
    )
    probability_columns = [
        "current_elo_probability",
        "carryover_probability",
        "backbone_probability",
        "elastic_net_probability",
        "boosted_probability",
        "blend_probability",
    ]
    metrics = metric_summary(predictions, probability_columns)

    comparisons = (
        ("carryover_probability", "current_elo_probability"),
        ("backbone_probability", "current_elo_probability"),
        (contextual_champion, "backbone_probability"),
    )
    gates: list[PromotionDecision] = []
    for offset, (candidate, baseline) in enumerate(comparisons):
        holdout = promotion_decision(
            predictions,
            candidate,
            baseline,
            resamples=bootstrap_resamples,
            seed=seed + offset,
        )
        matching = next(
            (
                gate
                for gate in development_gates
                if gate.candidate == candidate.removesuffix("_probability")
                and gate.baseline == baseline.removesuffix("_probability")
            ),
            None,
        )
        # Final requirement is same-direction improvement with no guardrail
        # degradation; the paired-CI threshold was already imposed in development.
        final_pass = (
            holdout.paired_difference.mean_difference < 0
            and holdout.brier_degradation <= 0.002
            and holdout.calibration_slope_degradation <= 0.10
        )
        if matching is not None:
            gates.append(replace(matching, final_holdout_pass=bool(final_pass)))
        else:
            gates.append(
                replace(
                    holdout,
                    development_pass=False,
                    final_holdout_pass=bool(final_pass),
                )
            )
    return predictions, FinalConfirmationResult(metrics, config, tuple(gates))


def run_rolling_development(
    maps_df: pd.DataFrame,
    player_priors: pd.DataFrame | None = None,
    seed: int = 20260714,
    max_carryover_configs: int | None = 48,
    bootstrap_resamples: int = 2000,
) -> tuple[pd.DataFrame, DevelopmentResult]:
    """Run the complete 2024-2025 development benchmark.

    2026 rows are split and sealed *before* outcomes are canonicalized.  This
    function never evaluates, summarizes, tunes on, or otherwise opens them.
    """

    raw_development, lockbox = split_development_lockbox(maps_df)
    maps = _canonicalize(raw_development)
    if (maps["timestamp"].dt.year > 2025).any():
        raise AssertionError("development runner must never see 2026")
    maps = _merge_player_priors(maps, player_priors)

    current = _rating_predictions(
        maps, EloModel(EloConfig.current_hard_reset()), 2023, "current_elo"
    )
    constant = _rating_predictions(maps, ConstantMapPredictor(), 2023, "constant")
    glicko = _rating_predictions(maps, GlickoLikeModel(), 2023, "glicko")

    candidates = carryover_search_space()
    if max_carryover_configs is not None and len(candidates) > max_carryover_configs:
        # Evenly cover the deterministic grid rather than selecting based on data.
        indices = np.linspace(0, len(candidates) - 1, max_carryover_configs, dtype=int)
        candidates = [candidates[index] for index in indices]
    candidate_scores: list[tuple[float, EloConfig]] = []
    for config in candidates:
        candidate = _rating_predictions(maps, EloModel(config), 2024, "candidate")
        score = binary_log_loss(candidate["team_a_won"], candidate["candidate_probability"])
        candidate_scores.append((score, config))
    selected_config = min(candidate_scores, key=lambda item: item[0])[1]
    carryover = _rating_predictions(maps, EloModel(selected_config), 2023, "carryover")

    predictions_all = current.merge(
        constant.drop(columns=["match_id", "event_id", "timestamp", "map_name", "team_a", "team_b", "team_a_won"]),
        on="row_index",
        validate="one_to_one",
    ).merge(
        glicko.drop(columns=["match_id", "event_id", "timestamp", "map_name", "team_a", "team_b", "team_a_won"]),
        on="row_index",
        validate="one_to_one",
    ).merge(
        carryover.drop(columns=["match_id", "event_id", "timestamp", "map_name", "team_a", "team_b", "team_a_won"]),
        on="row_index",
        validate="one_to_one",
    )
    context = _context_frame(predictions_all, maps)
    contextual = _rolling_contextual_predictions(context, seed)
    predictions_all = predictions_all.merge(contextual, on="row_index", validate="one_to_one")
    predictions = predictions_all.loc[predictions_all["timestamp"].dt.year >= 2024].reset_index(drop=True)

    probability_columns = [
        "constant_probability",
        "current_elo_probability",
        "glicko_probability",
        "carryover_probability",
        "backbone_probability",
        "elastic_net_probability",
        "boosted_probability",
        "blend_probability",
    ]
    metrics = metric_summary(predictions, probability_columns)
    gates: list[PromotionDecision] = []
    # Carryover is a baseline diagnostic; the displayed rating backbone must
    # independently clear the current-Elo gate before it can be promoted.
    gates.append(
        promotion_decision(
            predictions,
            "carryover_probability",
            "current_elo_probability",
            resamples=bootstrap_resamples,
            seed=seed,
        )
    )
    gates.append(
        promotion_decision(
            predictions,
            "backbone_probability",
            "current_elo_probability",
            resamples=bootstrap_resamples,
            seed=seed + 1,
        )
    )
    best_contextual = min(
        ("elastic_net_probability", "boosted_probability", "blend_probability"),
        key=lambda column: binary_log_loss(predictions["team_a_won"], predictions[column]),
    )
    gates.append(
        promotion_decision(
            predictions,
            best_contextual,
            "backbone_probability",
            resamples=bootstrap_resamples,
            seed=seed + 2,
        )
    )
    return predictions, DevelopmentResult(
        metrics=metrics,
        selected_carryover_config=selected_config,
        promotion_gates=tuple(gates),
        lockbox=lockbox,
    )


@dataclass
class MapReadinessDevelopmentResult:
    metrics: pd.DataFrame
    search_results: pd.DataFrame
    promoted_carryover_config: EloConfig
    selected_config: MapReadinessConfig
    promotion_gate: PromotionDecision
    map_ordering: MapOrderingComparison | None
    episode_diagnostics: pd.DataFrame
    reset_schedule: MapResetSchedule
    lockbox: FrozenLockbox
    development_period: tuple[int, int] = (2024, 2025)
    warmup_year: int = 2023

    def configuration(self) -> dict[str, object]:
        return {
            "warmup_year": self.warmup_year,
            "development_period": list(self.development_period),
            "promoted_carryover": asdict(self.promoted_carryover_config),
            "selected_map_readiness": asdict(self.selected_config),
            "lockbox_rows": self.lockbox.row_count,
            "lockbox_opened": self.lockbox.is_open,
        }


@dataclass
class MapReadinessConfirmationResult:
    metrics: pd.DataFrame
    selected_config: MapReadinessConfig
    promotion_gate: PromotionDecision
    map_ordering: MapOrderingComparison | None
    episode_diagnostics: pd.DataFrame
    holdout_period: int = 2026


def _merge_rating_predictions(
    baseline: pd.DataFrame,
    candidate: pd.DataFrame,
) -> pd.DataFrame:
    identity = [
        "match_id",
        "event_id",
        "timestamp",
        "map_name",
        "team_a",
        "team_b",
        "team_a_won",
    ]
    return baseline.merge(
        candidate.drop(columns=identity),
        on="row_index",
        validate="one_to_one",
    )


def _safe_map_ordering(
    predictions: pd.DataFrame,
    *,
    resamples: int,
    seed: int,
) -> MapOrderingComparison | None:
    try:
        return within_series_map_ordering_bootstrap(
            predictions,
            "map_readiness_probability",
            "carryover_probability",
            resamples=resamples,
            seed=seed,
        )
    except ValueError as exc:
        if "requires a multi-map series" not in str(exc):
            raise
        return None


def run_map_readiness_development(
    maps_df: pd.DataFrame,
    promoted_carryover_config: EloConfig,
    *,
    reset_schedule: MapResetSchedule | None = None,
    episodes: Sequence[Mapping[str, object]] = (),
    seed: int = 20260714,
    max_configs: int | None = None,
    bootstrap_resamples: int = 2000,
) -> tuple[pd.DataFrame, MapReadinessDevelopmentResult]:
    """Run Workstream C on the sealed rolling-development protocol."""

    raw_development, lockbox = split_development_lockbox(maps_df)
    maps = _canonicalize(raw_development)
    if (maps["timestamp"].dt.year > 2025).any():
        raise AssertionError("map-readiness development must never see 2026")
    schedule = reset_schedule or MapResetSchedule.from_config()
    candidates = map_readiness_search_space(promoted_carryover_config)
    if max_configs is not None and len(candidates) > max_configs:
        indices = np.linspace(0, len(candidates) - 1, max_configs, dtype=int)
        candidates = [candidates[index] for index in indices]

    search_rows: list[dict[str, float]] = []
    scored: list[tuple[float, MapReadinessConfig]] = []
    for config in candidates:
        candidate = _rating_predictions(
            maps,
            MapReadinessEloModel(config, schedule),
            2024,
            "candidate",
        )
        score = binary_log_loss(
            candidate["team_a_won"], candidate["candidate_probability"]
        )
        scored.append((score, config))
        search_rows.append(
            {
                "global_weight": config.carryover.global_weight,
                "readiness_half_life_days": config.readiness_half_life_days,
                "readiness_k_factor": config.readiness_k_factor,
                "patch_retention": config.patch_retention,
                "map_log_loss": score,
            }
        )
    if not scored:
        raise ValueError("map-readiness search space cannot be empty")
    selected_config = min(scored, key=lambda item: item[0])[1]

    carryover = _rating_predictions(
        maps, EloModel(promoted_carryover_config), 2023, "carryover"
    )
    readiness = _rating_predictions(
        maps,
        MapReadinessEloModel(selected_config, schedule),
        2023,
        "map_readiness",
    )
    predictions = _merge_rating_predictions(carryover, readiness)
    predictions = predictions.loc[predictions["timestamp"].dt.year >= 2024].reset_index(
        drop=True
    )
    metrics = metric_summary(
        predictions,
        ("carryover_probability", "map_readiness_probability"),
    )
    gate = promotion_decision(
        predictions,
        "map_readiness_probability",
        "carryover_probability",
        resamples=bootstrap_resamples,
        seed=seed,
    )
    ordering = _safe_map_ordering(
        predictions,
        resamples=bootstrap_resamples,
        seed=seed + 1,
    )
    episode_diagnostics = evaluate_map_form_episodes(predictions, episodes)
    search_results = (
        pd.DataFrame(search_rows)
        .sort_values("map_log_loss", kind="stable")
        .reset_index(drop=True)
    )
    return predictions, MapReadinessDevelopmentResult(
        metrics=metrics,
        search_results=search_results,
        promoted_carryover_config=promoted_carryover_config,
        selected_config=selected_config,
        promotion_gate=gate,
        map_ordering=ordering,
        episode_diagnostics=episode_diagnostics,
        reset_schedule=schedule,
        lockbox=lockbox,
    )


def run_map_readiness_confirmation(
    maps_df: pd.DataFrame,
    development_result: MapReadinessDevelopmentResult,
    confirmation_token: str,
    *,
    episodes: Sequence[Mapping[str, object]] = (),
    seed: int = 20260714,
    bootstrap_resamples: int = 2000,
) -> tuple[pd.DataFrame, MapReadinessConfirmationResult]:
    """Confirm the frozen readiness challenger on the rolled-forward 2026 window."""

    raw_development, fallback_lockbox = split_development_lockbox(maps_df)
    raw_lockbox = development_result.lockbox.open_for_final_confirmation(
        confirmation_token
    )
    if len(raw_lockbox) != fallback_lockbox.row_count:
        raise ValueError("sealed lockbox does not match maps_df's 2026 row count")
    maps = _canonicalize(pd.concat([raw_development, raw_lockbox], ignore_index=True))
    carryover = _rating_predictions(
        maps,
        EloModel(development_result.promoted_carryover_config),
        2023,
        "carryover",
    )
    readiness = _rating_predictions(
        maps,
        MapReadinessEloModel(
            development_result.selected_config,
            development_result.reset_schedule,
        ),
        2023,
        "map_readiness",
    )
    predictions = _merge_rating_predictions(carryover, readiness)
    predictions = predictions.loc[predictions["timestamp"].dt.year == 2026].reset_index(
        drop=True
    )
    metrics = metric_summary(
        predictions,
        ("carryover_probability", "map_readiness_probability"),
    )
    holdout = promotion_decision(
        predictions,
        "map_readiness_probability",
        "carryover_probability",
        resamples=bootstrap_resamples,
        seed=seed,
    )
    final_pass = (
        holdout.paired_difference.mean_difference < 0
        and holdout.brier_degradation <= 0.002
        and holdout.calibration_slope_degradation <= 0.10
    )
    gate = replace(
        development_result.promotion_gate,
        final_holdout_pass=bool(final_pass),
    )
    ordering = _safe_map_ordering(
        predictions,
        resamples=bootstrap_resamples,
        seed=seed + 1,
    )
    episode_diagnostics = evaluate_map_form_episodes(predictions, episodes)
    return predictions, MapReadinessConfirmationResult(
        metrics=metrics,
        selected_config=development_result.selected_config,
        promotion_gate=gate,
        map_ordering=ordering,
        episode_diagnostics=episode_diagnostics,
    )


__all__ = [
    "BootstrapDifference",
    "DevelopmentResult",
    "FinalConfirmationResult",
    "FINAL_CONFIRMATION_TOKEN",
    "FrozenLockbox",
    "MapOrderingComparison",
    "MapReadinessConfirmationResult",
    "MapReadinessDevelopmentResult",
    "PromotionDecision",
    "RollingOOFEvaluator",
    "binary_log_loss",
    "brier_score",
    "calibration_intercept_slope",
    "event_block_log_loss_bootstrap",
    "evaluate_map_form_episodes",
    "load_map_form_episodes",
    "metric_summary",
    "paired_log_loss_bootstrap",
    "promotion_decision",
    "reliability_curve",
    "run_rolling_development",
    "run_final_confirmation",
    "run_map_readiness_confirmation",
    "run_map_readiness_development",
    "split_development_lockbox",
    "within_series_map_ordering_bootstrap",
]
