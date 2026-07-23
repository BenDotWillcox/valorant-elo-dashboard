"""Leakage-safe conditional player forecasts with hierarchical partial pooling.

The model is intentionally an empirical-Bayes research backbone: it is fast
enough to refit inside every rolling fold, while following the same hierarchy a
Bayesian finalist will use.  ``fit`` accepts one row per player/team/map and
never reads rows at or after ``cutoff``.

Required columns
----------------
``player_id``, ``team_id``, ``map_name``, ``agent`` and a time column named
``timestamp`` (``map_time`` and ``date`` are also accepted).  A stable team-map
identifier should be supplied as ``map_id`` or as ``match_id`` plus
``game_number``/``map_number``.  ``patch`` and ``opponent_team_id`` are optional.

Performance may be supplied directly as ``kpr``, ``dpr``, ``apr``,
``first_duel_attempt_rate``, ``first_duel_win_rate``, ``adr``, ``kast`` and
optional ``acs``.  Otherwise the rates are derived from ``kills``, ``deaths``,
``assists``, ``first_kills``, ``first_deaths`` and ``rounds``.  If ``rounds`` is
missing it is derived from ``winner_rounds`` + ``loser_rounds`` (or the common
score aliases).  Missing component values are imputed from the training fold
only.

Predictive Box VPM weights are learned only from the frame passed to ``fit``.
On the canonical snapshot, ``normalized_team_round_margin`` is the signed team
round differential divided by total played rounds.  The v1 pipeline copied
that fraction into a misleading ``team_round_margin`` alias, averaged it over
the maps in a team-match, then shifted it to the same team's next match under
the inaccurate name ``next_lineup_round_margin``.  The corrected pipeline
keeps the source name and publishes the shifted label as
``next_team_match_normalized_round_margin``; the legacy name remains only as a
compatibility alias because the five-player lineup can change.  The canonical
name is first in :attr:`PredictiveBoxVPM.TARGET_CANDIDATES`.

The raw label is a normalized-margin fraction.  The ridge multiplies both its
fitted label and OOF observed value by 24, so ``score``, ``transform_target``
and published ``performance_mean`` are all signed rounds per 24 played rounds.
Binary win fallbacks remain in outcome units.  Future-target rows are eligible
for a ridge fit or fold score only after ``target_observed_at`` (the next
match's completion time when available); already observed player components
do not inherit that later label-availability gate.

This module does not claim causal player value: the ridge maps five-player
team-mean box components to a future team result, and lineup-result updates are
optional and strongly shrunk.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from itertools import combinations
from math import sqrt
from statistics import NormalDist
from types import MappingProxyType
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from .contracts import canonical_agent_key


COMPONENTS: tuple[str, ...] = (
    "kpr",
    "dpr",
    "apr",
    "first_duel_attempt_rate",
    "first_duel_win_rate",
    "adr",
    "kast",
)
OPTIONAL_COMPONENTS: tuple[str, ...] = ("acs",)


def _clean(value: Any) -> Any:
    if isinstance(value, np.generic):
        value = value.item()
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "__MISSING__"
    if isinstance(value, list):
        return tuple(value)
    return value


def _utc_timestamp(value: Any) -> pd.Timestamp:
    if isinstance(value, pd.Timestamp):
        result = value
    elif isinstance(value, (datetime, date)):
        result = pd.Timestamp(value)
    elif isinstance(value, (int, float, np.integer, np.floating)):
        unit = "s" if abs(float(value)) < 10**12 else "ms"
        result = pd.to_datetime(value, unit=unit, utc=True)
    else:
        result = pd.to_datetime(value, utc=True)
    if result.tzinfo is None:
        result = result.tz_localize("UTC")
    else:
        result = result.tz_convert("UTC")
    return result


def _context_value(context: Any, name: str, default: Any = None) -> Any:
    if isinstance(context, Mapping):
        return context.get(name, default)
    return getattr(context, name, default)


def _sigmoid(value: float) -> float:
    value = float(np.clip(value, -30.0, 30.0))
    return 1.0 / (1.0 + np.exp(-value))


@dataclass(slots=True)
class EffectTable:
    fields: tuple[str, ...]
    values: dict[tuple[Any, ...], np.ndarray]
    counts: dict[tuple[Any, ...], int]
    prior_strength: float

    def get(self, key: tuple[Any, ...], width: int) -> np.ndarray:
        return self.values.get(key, np.zeros(width, dtype=float))

    def count(self, key: tuple[Any, ...]) -> int:
        return self.counts.get(key, 0)


@dataclass(frozen=True, slots=True)
class PlayerForecast:
    """A direct conditional forecast before map/agent marginalization."""

    component_means: Mapping[str, float]
    component_standard_deviations: Mapping[str, float]
    performance_mean: float
    contribution_mean: float
    standard_deviation: float
    support: str
    decomposition: Mapping[str, float]


@dataclass(frozen=True, slots=True)
class PlayerDevelopmentResult:
    """Rolling 2024-25 OOF predictions and progressive-ablation metrics."""

    oof_predictions: pd.DataFrame
    ablation_metrics: pd.DataFrame


@dataclass(frozen=True, slots=True)
class PlayerAblationSpecification:
    """The exact model terms and composition switches for one dev ablation."""

    enabled_terms: tuple[str, ...]
    enable_agent_pairs: bool
    enable_focal_response: bool


_PLAYER_ADDITIVE_TERMS = (
    "player_state",
    "map_effect",
    "agent_effect",
    "agent_role_effect",
    "patch_effect",
    "region_effect",
    "event_effect",
    "team_synergy",
    "opponent_context",
)
_PLAYER_TWO_WAY_TERMS = (
    *_PLAYER_ADDITIVE_TERMS,
    "player_map",
    "player_agent",
    "map_agent",
    "map_agent_role",
)
_PLAYER_TRIPLE_TERMS = (
    *_PLAYER_TWO_WAY_TERMS,
    "player_map_agent",
    "lineup_synergy",
)

PLAYER_ABLATION_SPECIFICATIONS: Mapping[str, PlayerAblationSpecification] = MappingProxyType(
    {
        "player-only": PlayerAblationSpecification(("player_state",), False, False),
        "additive": PlayerAblationSpecification(_PLAYER_ADDITIVE_TERMS, False, False),
        "two-way": PlayerAblationSpecification(_PLAYER_TWO_WAY_TERMS, False, False),
        "triple": PlayerAblationSpecification(_PLAYER_TRIPLE_TERMS, False, False),
        "composition": PlayerAblationSpecification(_PLAYER_TRIPLE_TERMS, True, True),
    }
)


def player_ablation_specification(name: str) -> PlayerAblationSpecification:
    """Return the shared development/scoring specification for ``name``."""

    try:
        return PLAYER_ABLATION_SPECIFICATIONS[str(name)]
    except KeyError as exc:
        raise ValueError(f"unknown player development ablation: {name!r}") from exc


def estimate_player_uncertainty_calibration(
    predictions: pd.DataFrame,
    *,
    ablation: str,
    component: str = "__box_vpm__",
    target_coverage: float = 0.80,
) -> dict[str, Any]:
    """Estimate a conservative predictive-interval scale from the latest dev year."""

    if not 0.5 < target_coverage < 1.0:
        raise ValueError("target_coverage must be between 0.5 and 1")
    selected = predictions.loc[
        (predictions["ablation"] == ablation)
        & (predictions["component"] == component)
    ].copy()
    if selected.empty:
        raise ValueError("no OOF predictions match the uncertainty calibration request")
    years = pd.to_datetime(selected["fold_cutoff"], utc=True).dt.year
    calibration_year = int(years.max())
    calibration = selected.loc[years == calibration_year].copy()
    ratio = calibration["absolute_error"] / calibration["standard_deviation"].clip(
        lower=1e-9
    )
    # Central 80% Gaussian intervals use this two-sided standard-normal quantile.
    z_value = float(NormalDist().inv_cdf((1.0 + target_coverage) / 2.0))
    scale = float(max(ratio.quantile(target_coverage) / z_value, 1.0))
    all_ratio = selected["absolute_error"] / selected["standard_deviation"].clip(
        lower=1e-9
    )
    return {
        "ablation": ablation,
        "component": component,
        "calibration_year": calibration_year,
        "calibration_rows": int(len(calibration)),
        "target_coverage": float(target_coverage),
        "scale": scale,
        "raw_calibration_year_coverage": float((ratio <= z_value).mean()),
        "scaled_calibration_year_coverage": float((ratio <= z_value * scale).mean()),
        "scaled_all_development_coverage": float((all_ratio <= z_value * scale).mean()),
    }


class PredictiveBoxVPM:
    """Training-fold ridge weights mapping components to rounds per 24.

    Normalized round-margin targets are multiplied by 24 before fitting.  When
    only a binary outcome is available the fallback remains in outcome units
    and ``output_unit_`` records that limitation for the model card.
    """

    TARGET_CANDIDATES = (
        "next_team_match_normalized_round_margin",
        "next_lineup_round_margin",
        "future_lineup_round_margin",
        "normalized_team_round_margin",
        "team_round_margin",
        "map_win",
        "team_win",
    )
    TARGET_MULTIPLIERS: Mapping[str, float] = MappingProxyType(
        {
            "next_team_match_normalized_round_margin": 24.0,
            "next_lineup_round_margin": 24.0,
            "future_lineup_round_margin": 24.0,
            "normalized_round_margin": 24.0,
            "normalized_team_round_margin": 24.0,
            # Inside this package, team_round_margin is player-team signed.
            "team_round_margin": 24.0,
            "map_win": 1.0,
            "team_win": 1.0,
        }
    )
    TARGET_RAW_UNITS: Mapping[str, str] = MappingProxyType(
        {
            "next_team_match_normalized_round_margin": "normalized_round_margin",
            "next_lineup_round_margin": "normalized_round_margin",
            "future_lineup_round_margin": "normalized_round_margin",
            "normalized_round_margin": "normalized_round_margin",
            "normalized_team_round_margin": "normalized_round_margin",
            "team_round_margin": "normalized_round_margin",
            "map_win": "binary_outcome",
            "team_win": "binary_outcome",
        }
    )
    FUTURE_TARGETS = frozenset(
        {
            "next_team_match_normalized_round_margin",
            "next_lineup_round_margin",
            "future_lineup_round_margin",
        }
    )

    def __init__(self, *, alpha: float = 8.0) -> None:
        self.alpha = float(alpha)
        self.is_fitted_ = False

    def fit(
        self,
        frame: pd.DataFrame,
        component_columns: Sequence[str],
        *,
        target_col: str | None = None,
    ) -> "PredictiveBoxVPM":
        columns = tuple(component_columns)
        target_col = target_col or next(
            (name for name in self.TARGET_CANDIDATES if name in frame.columns),
            None,
        )
        x_player = frame.loc[:, columns].to_numpy(dtype=float)
        self.component_columns_ = columns
        self.component_center_ = np.nanmedian(x_player, axis=0)
        scale = np.nanstd(x_player, axis=0)
        self.component_scale_ = np.where(scale < 1e-8, 1.0, scale)

        if target_col is None or "_team_map_key" not in frame.columns:
            # Transparent fallback used only when a result target is unavailable.
            defaults = {
                "kpr": 0.34,
                "dpr": -0.30,
                "apr": 0.12,
                "first_duel_attempt_rate": 0.04,
                "first_duel_win_rate": 0.09,
                "adr": 0.15,
                "kast": 0.11,
                "acs": 0.05,
            }
            self.weights_ = np.asarray([defaults.get(name, 0.0) for name in columns])
            self.intercept_ = 0.0
            self.target_col_ = None
            self.target_raw_unit_ = "heuristic_vpm"
            self.target_multiplier_ = 1.0
            self.output_unit_ = "heuristic_vpm"
            self.target_scale_ = 1.0
            self.n_training_targets_ = 0
            self.is_fitted_ = True
            return self
        if target_col not in self.TARGET_MULTIPLIERS:
            raise ValueError(
                f"unknown Predictive Box VPM target {target_col!r}; "
                f"choose one of {tuple(self.TARGET_MULTIPLIERS)}"
            )

        work = frame[["_team_map_key", target_col, *columns]].dropna(subset=[target_col]).copy()
        grouped_x = work.groupby("_team_map_key", sort=False)[list(columns)].mean()
        grouped_y = work.groupby("_team_map_key", sort=False)[target_col].first()
        common = grouped_x.index.intersection(grouped_y.index)
        x = (grouped_x.loc[common].to_numpy(dtype=float) - self.component_center_) / self.component_scale_
        y = grouped_y.loc[common].to_numpy(dtype=float)
        self.target_multiplier_ = float(self.TARGET_MULTIPLIERS[target_col])
        self.target_raw_unit_ = self.TARGET_RAW_UNITS[target_col]
        self.output_unit_ = (
            "rounds_per_24"
            if self.target_raw_unit_ == "normalized_round_margin"
            else "outcome_units"
        )
        y = y * self.target_multiplier_
        good = np.isfinite(x).all(axis=1) & np.isfinite(y)
        x, y = x[good], y[good]
        if len(y) < max(20, len(columns) * 3):
            without_targets = frame.drop(
                columns=[
                    name for name in self.TARGET_MULTIPLIERS if name in frame.columns
                ]
            )
            return self.fit(without_targets, columns, target_col=None)

        self.n_training_targets_ = int(len(y))
        self.intercept_ = float(np.mean(y))
        centered_y = y - self.intercept_
        penalty = self.alpha * np.eye(x.shape[1], dtype=float)
        self.weights_ = np.linalg.solve(x.T @ x + penalty, x.T @ centered_y)
        residual = centered_y - x @ self.weights_
        self.target_scale_ = float(max(np.std(residual), 1e-6))
        self.target_col_ = target_col
        self.is_fitted_ = True
        return self

    def score(self, components: Sequence[float] | np.ndarray) -> float:
        values = np.asarray(components, dtype=float)
        z = (values - self.component_center_) / self.component_scale_
        return float(self.intercept_ + z @ self.weights_)

    def score_delta(self, component_delta: Sequence[float] | np.ndarray) -> float:
        delta = np.asarray(component_delta, dtype=float)
        return float((delta / self.component_scale_) @ self.weights_)

    def score_standard_deviation(self, component_sd: Sequence[float] | np.ndarray) -> float:
        sd = np.asarray(component_sd, dtype=float)
        variance = np.sum(np.square(self.weights_ * sd / self.component_scale_))
        # Preserve irreducible lineup-result uncertainty without letting it dwarf
        # conditional comparisons.
        return float(sqrt(max(variance + 0.10 * self.target_scale_**2, 1e-12)))

    def transform_target(self, value: float) -> float:
        """Convert the fitted raw outcome to the displayed VPM unit."""
        return float(value) * self.target_multiplier_


class HierarchicalPlayerModel:
    """Fast, partially pooled next-map component and Predictive Box VPM model.

    ``fit`` is stable and fold-local. ``predict`` is an alias of
    :meth:`forecast`; :meth:`rolling_predict` repeatedly refits from scratch at
    supplied cutoffs so preprocessing and effect histories cannot leak.
    """

    DEFAULT_PRIORS: Mapping[str, float] = {
        "map_effect": 25.0,
        "agent_effect": 25.0,
        "agent_role_effect": 35.0,
        "patch_effect": 45.0,
        "region_effect": 80.0,
        "event_effect": 90.0,
        "player_state": 14.0,
        "player_map": 35.0,
        "player_agent": 35.0,
        "map_agent": 45.0,
        "map_agent_role": 60.0,
        "player_map_agent": 90.0,
        "team_synergy": 55.0,
        "opponent_context": 90.0,
        "lineup_synergy": 75.0,
    }

    TERM_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("map_effect", ("map_name",)),
        ("agent_effect", ("agent",)),
        ("agent_role_effect", ("agent_role",)),
        ("patch_effect", ("patch",)),
        ("region_effect", ("region",)),
        ("event_effect", ("event_context",)),
        ("player_state", ("player_id",)),
        ("player_map", ("player_id", "map_name")),
        ("player_agent", ("player_id", "agent")),
        ("map_agent", ("map_name", "agent")),
        ("map_agent_role", ("map_name", "agent_role")),
        ("player_map_agent", ("player_id", "map_name", "agent")),
        ("team_synergy", ("team_id",)),
        ("opponent_context", ("opponent_team_id",)),
        ("lineup_synergy", ("team_id", "lineup_key")),
    )

    def __init__(
        self,
        *,
        include_acs: bool = False,
        half_life_days: float = 120.0,
        inactivity_half_life_days: float = 540.0,
        effect_priors: Mapping[str, float] | None = None,
        backfit_iterations: int = 3,
        box_vpm_alpha: float = 8.0,
        enable_contribution: bool = False,
        contribution_prior: float = 125.0,
        enabled_terms: Sequence[str] | None = None,
        agent_roles: Mapping[str, str] | None = None,
        enable_agent_pairs: bool = True,
        enable_focal_response: bool = True,
        include_composition_effects: bool | None = None,
        rating_uncertainty_scale: float = 1.0,
        random_state: int = 7,
    ) -> None:
        self.include_acs = bool(include_acs)
        self.half_life_days = float(half_life_days)
        self.inactivity_half_life_days = float(inactivity_half_life_days)
        self.effect_priors = dict(self.DEFAULT_PRIORS)
        if effect_priors:
            self.effect_priors.update({key: float(value) for key, value in effect_priors.items()})
        self.backfit_iterations = int(backfit_iterations)
        self.box_vpm_alpha = float(box_vpm_alpha)
        self.enable_contribution = bool(enable_contribution)
        self.contribution_prior = float(contribution_prior)
        known_terms = {name for name, _ in self.TERM_FIELDS}
        self.enabled_terms = set(enabled_terms) if enabled_terms is not None else known_terms
        self.agent_roles = {str(agent): str(role) for agent, role in (agent_roles or {}).items()}
        self.agent_roles_by_fold = {
            canonical_agent_key(agent): str(role) for agent, role in (agent_roles or {}).items()
        }
        unknown_terms = self.enabled_terms.difference(known_terms)
        if unknown_terms:
            raise ValueError(f"unknown player effect terms: {sorted(unknown_terms)}")
        if include_composition_effects is not None:
            enable_agent_pairs = include_composition_effects
            enable_focal_response = include_composition_effects
        self.enable_agent_pairs = bool(enable_agent_pairs)
        self.enable_focal_response = bool(enable_focal_response)
        self.rating_uncertainty_scale = float(rating_uncertainty_scale)
        if self.rating_uncertainty_scale <= 0:
            raise ValueError("rating_uncertainty_scale must be positive")
        self.random_state = int(random_state)

    @property
    def component_columns(self) -> tuple[str, ...]:
        return COMPONENTS + OPTIONAL_COMPONENTS if self.include_acs else COMPONENTS

    def _prepare(self, raw: pd.DataFrame) -> pd.DataFrame:
        frame = raw.copy().reset_index(drop=True)
        required = {"player_id", "team_id", "map_name", "agent"}
        missing = sorted(required.difference(frame.columns))
        if missing:
            raise ValueError(f"player frame is missing required columns: {missing}")

        time_col = next(
            (
                name
                for name in (
                    "prediction_cutoff",
                    "timestamp",
                    "map_completed_at",
                    "match_completed_at",
                    "map_time",
                    "date",
                )
                if name in frame.columns
            ),
            None,
        )
        if time_col is None:
            raise ValueError("player frame needs timestamp, map_time, or date")
        frame["_timestamp"] = frame[time_col].map(_utc_timestamp)

        observed_agents = [str(agent) for agent in frame["agent"].dropna().unique()]
        self.agent_canonical_ = {
            canonical_agent_key(agent): agent
            for agent in (*observed_agents, *self.agent_roles.keys())
        }
        frame["agent"] = frame["agent"].map(
            lambda value: self.agent_canonical_.get(canonical_agent_key(value), str(value))
        )

        for column, default in (
            ("patch", "__UNKNOWN_PATCH__"),
            ("region", "__UNKNOWN_REGION__"),
            ("opponent_team_id", "__UNKNOWN_OPPONENT__"),
        ):
            if column not in frame:
                frame[column] = default
            frame[column] = frame[column].map(_clean)
        if "event_context" not in frame:
            event = next(
                (frame[name] for name in ("event_id", "event_name", "event") if name in frame),
                "__UNKNOWN_EVENT__",
            )
            stage = frame["stage"] if "stage" in frame else "__UNKNOWN_STAGE__"
            if isinstance(event, pd.Series):
                if isinstance(stage, pd.Series):
                    frame["event_context"] = list(zip(event.map(_clean), stage.map(_clean)))
                else:
                    frame["event_context"] = [( _clean(value), stage) for value in event]
            else:
                frame["event_context"] = "__UNKNOWN_EVENT__"
        if "agent_role" not in frame:
            frame["agent_role"] = frame["agent"].map(
                lambda agent: self.agent_roles_by_fold.get(
                    canonical_agent_key(agent), "__UNKNOWN_ROLE__"
                )
            )
        else:
            frame["agent_role"] = frame["agent_role"].fillna("__UNKNOWN_ROLE__").astype(str)

        rounds = None
        for column in ("rounds", "rounds_played", "total_rounds"):
            if column in frame:
                rounds = pd.to_numeric(frame[column], errors="coerce")
                break
        if rounds is None:
            for left, right in (
                ("winner_rounds", "loser_rounds"),
                ("winner_score", "loser_score"),
                ("team_1_score", "team_2_score"),
                ("score_a", "score_b"),
            ):
                if left in frame and right in frame:
                    rounds = pd.to_numeric(frame[left], errors="coerce") + pd.to_numeric(frame[right], errors="coerce")
                    break
        if rounds is None:
            rounds = pd.Series(np.nan, index=frame.index)
        frame["_rounds"] = rounds.where(rounds > 0)

        aliases = {
            "first_kills": ("first_kills", "fk"),
            "first_deaths": ("first_deaths", "fd"),
        }
        for target, candidates in aliases.items():
            if target not in frame:
                source = next((name for name in candidates if name in frame), None)
                frame[target] = frame[source] if source else np.nan

        derived = {
            "kpr": ("kills", frame["_rounds"]),
            "dpr": ("deaths", frame["_rounds"]),
            "apr": ("assists", frame["_rounds"]),
        }
        for target, (numerator, denominator) in derived.items():
            if target not in frame:
                frame[target] = pd.to_numeric(frame.get(numerator), errors="coerce") / denominator
        if "first_duel_attempt_rate" not in frame:
            attempts = pd.to_numeric(frame["first_kills"], errors="coerce") + pd.to_numeric(frame["first_deaths"], errors="coerce")
            frame["first_duel_attempt_rate"] = attempts / frame["_rounds"]
        if "first_duel_win_rate" not in frame:
            attempts = pd.to_numeric(frame["first_kills"], errors="coerce") + pd.to_numeric(frame["first_deaths"], errors="coerce")
            frame["first_duel_win_rate"] = pd.to_numeric(frame["first_kills"], errors="coerce") / attempts.where(attempts > 0)
        for column in self.component_columns:
            if column not in frame:
                frame[column] = np.nan
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        if frame["kast"].dropna().median() > 1.5:
            frame["kast"] = frame["kast"] / 100.0

        identity_cols = []
        if "map_id" in frame:
            identity_cols = ["map_id"]
        elif "canonical_map_id" in frame:
            identity_cols = ["canonical_map_id"]
        elif "match_id" in frame:
            identity_cols = ["match_id"]
            for candidate in ("game_number", "map_number", "map_name"):
                if candidate in frame:
                    identity_cols.append(candidate)
                    break
        else:
            frame["_row_map"] = np.arange(len(frame)) // 10
            identity_cols = ["_row_map"]
        frame["_map_key"] = [tuple(_clean(row[name]) for name in identity_cols) for _, row in frame.iterrows()]
        frame["_team_map_key"] = [(*key, _clean(team)) for key, team in zip(frame["_map_key"], frame["team_id"])]

        lineup_keys: list[tuple[Any, ...]] = [tuple() for _ in range(len(frame))]
        all_pairs: list[tuple[tuple[str, str], ...]] = [tuple() for _ in range(len(frame))]
        response_pairs: list[tuple[tuple[str, str], ...]] = [tuple() for _ in range(len(frame))]
        for _, group in frame.groupby("_team_map_key", sort=False):
            indices = group.index.to_list()
            player_ids = [_clean(value) for value in group["player_id"]]
            agents = [str(value) for value in group["agent"]]
            lineup = tuple(sorted(player_ids, key=str))
            pair_features = tuple(sorted((tuple(sorted((a, b), key=str)) for a, b in combinations(agents, 2)), key=str))
            for local_position, index in enumerate(indices):
                lineup_keys[index] = lineup
                all_pairs[index] = pair_features
                focal = agents[local_position]
                response_pairs[index] = tuple(sorted(((focal, agent) for j, agent in enumerate(agents) if j != local_position), key=str))
        frame["lineup_key"] = lineup_keys
        frame["_agent_pairs"] = all_pairs
        frame["_focal_response_pairs"] = response_pairs
        return frame

    @staticmethod
    def _keys(frame: pd.DataFrame, fields: Sequence[str]) -> list[tuple[Any, ...]]:
        return [tuple(_clean(row[field]) for field in fields) for _, row in frame.iterrows()]

    @staticmethod
    def _fit_effect(
        keys: Sequence[tuple[Any, ...]],
        residual: np.ndarray,
        weights: np.ndarray,
        fields: tuple[str, ...],
        prior_strength: float,
    ) -> EffectTable:
        sums: dict[tuple[Any, ...], np.ndarray] = {}
        weight_sums: dict[tuple[Any, ...], float] = {}
        counts: dict[tuple[Any, ...], int] = {}
        for key, value, weight in zip(keys, residual, weights):
            sums[key] = sums.get(key, np.zeros(residual.shape[1], dtype=float)) + weight * value
            weight_sums[key] = weight_sums.get(key, 0.0) + float(weight)
            counts[key] = counts.get(key, 0) + 1
        values = {key: sums[key] / (weight_sums[key] + prior_strength) for key in sums}
        return EffectTable(fields, values, counts, prior_strength)

    @staticmethod
    def _lookup(table: EffectTable, keys: Sequence[tuple[Any, ...]], width: int) -> np.ndarray:
        return np.vstack([table.get(key, width) for key in keys]) if keys else np.empty((0, width))

    @staticmethod
    def _fit_feature_effect(
        feature_rows: Sequence[Sequence[tuple[str, str]]],
        residual: np.ndarray,
        weights: np.ndarray,
        prior_strength: float,
    ) -> tuple[dict[tuple[str, str], np.ndarray], dict[tuple[str, str], int]]:
        sums: dict[tuple[str, str], np.ndarray] = {}
        weight_sums: dict[tuple[str, str], float] = {}
        counts: dict[tuple[str, str], int] = {}
        for features, value, weight in zip(feature_rows, residual, weights):
            if not features:
                continue
            divisor = float(len(features))
            for feature in set(features):
                sums[feature] = sums.get(feature, np.zeros(residual.shape[1], dtype=float)) + weight * value / divisor
                weight_sums[feature] = weight_sums.get(feature, 0.0) + float(weight) / divisor
                counts[feature] = counts.get(feature, 0) + 1
        values = {key: sums[key] / (weight_sums[key] + prior_strength) for key in sums}
        return values, counts

    def fit(
        self,
        frame: pd.DataFrame,
        *,
        cutoff: datetime | date | pd.Timestamp | None = None,
        target_col: str | None = None,
    ) -> "HierarchicalPlayerModel":
        prepared = self._prepare(frame)
        explicit_cutoff = _utc_timestamp(cutoff) if cutoff is not None else None
        if explicit_cutoff is not None:
            prepared = prepared.loc[prepared["_timestamp"] < explicit_cutoff].reset_index(drop=True)
        if prepared.empty:
            raise ValueError("no training rows strictly predate cutoff")
        self.fitted_agent_roles_ = {
            str(agent): str(role)
            for agent, role in (
                prepared[["agent", "agent_role"]]
                .drop_duplicates("agent", keep="last")
                .itertuples(index=False, name=None)
            )
        }
        latest_timestamp = prepared["_timestamp"].max()
        self.training_cutoff_ = explicit_cutoff or pd.Timestamp(
            latest_timestamp.value + 1, unit="ns", tz="UTC"
        )
        self.max_training_timestamp_ = prepared["_timestamp"].max()

        self.imputation_values_ = {}
        self.missing_rates_ = {}
        for column in self.component_columns:
            self.missing_rates_[column] = float(prepared[column].isna().mean())
            median = float(prepared[column].median()) if prepared[column].notna().any() else 0.0
            self.imputation_values_[column] = median
            prepared[column] = prepared[column].fillna(median)

        y = prepared.loc[:, self.component_columns].to_numpy(dtype=float)
        end = prepared["_timestamp"].max()
        age_days = (end - prepared["_timestamp"]).dt.total_seconds().to_numpy() / 86_400.0
        weights = np.power(0.5, np.maximum(age_days, 0.0) / self.half_life_days)
        self.global_mean_ = np.average(y, axis=0, weights=weights)

        key_cache = {name: self._keys(prepared, fields) for name, fields in self.TERM_FIELDS}
        width = y.shape[1]
        self.effects_: dict[str, EffectTable] = {
            name: EffectTable(fields, {}, {}, self.effect_priors[name])
            for name, fields in self.TERM_FIELDS
        }
        fitted = np.tile(self.global_mean_, (len(prepared), 1))
        for _ in range(max(self.backfit_iterations, 1)):
            for name, fields in self.TERM_FIELDS:
                if name not in self.enabled_terms:
                    continue
                old = self._lookup(self.effects_[name], key_cache[name], width)
                without = fitted - old
                table = self._fit_effect(
                    key_cache[name],
                    y - without,
                    weights,
                    fields,
                    self.effect_priors[name],
                )
                new = self._lookup(table, key_cache[name], width)
                self.effects_[name] = table
                fitted = without + new

        residual = y - fitted
        pair_source = prepared["_agent_pairs"].tolist() if self.enable_agent_pairs else [tuple()] * len(prepared)
        self.agent_pair_effects_, self.agent_pair_counts_ = self._fit_feature_effect(
            pair_source, residual, weights, prior_strength=130.0
        )
        pair_fitted = np.vstack([
            sum((self.agent_pair_effects_.get(key, np.zeros(width)) for key in keys), np.zeros(width))
            for keys in prepared["_agent_pairs"]
        ])
        residual = residual - pair_fitted
        response_source = prepared["_focal_response_pairs"].tolist() if self.enable_focal_response else [tuple()] * len(prepared)
        self.focal_response_effects_, self.focal_response_counts_ = self._fit_feature_effect(
            response_source, residual, weights, prior_strength=110.0
        )
        response_fitted = np.vstack([
            sum((self.focal_response_effects_.get(key, np.zeros(width)) for key in keys), np.zeros(width))
            for keys in prepared["_focal_response_pairs"]
        ])
        residual = residual - response_fitted
        self.component_residual_sd_ = np.maximum(np.sqrt(np.average(residual**2, axis=0, weights=weights)), 1e-4)

        selected_target = target_col or next(
            (
                name
                for name in PredictiveBoxVPM.TARGET_CANDIDATES
                if name in prepared.columns
            ),
            None,
        )
        box_frame = prepared
        if explicit_cutoff is not None and selected_target in PredictiveBoxVPM.FUTURE_TARGETS:
            if "target_observed_at" not in prepared.columns:
                raise ValueError(
                    "rolling fits with a future VPM target require "
                    "target_observed_at; refusing to expose labels by source time"
                )
            target_observed_at = pd.to_datetime(
                prepared["target_observed_at"], utc=True, errors="coerce"
            )
            target_visible = target_observed_at.notna() & (
                target_observed_at < explicit_cutoff
            )
            box_frame = prepared.copy()
            for future_target in PredictiveBoxVPM.FUTURE_TARGETS:
                if future_target in box_frame.columns:
                    box_frame.loc[~target_visible, future_target] = np.nan
        self.box_vpm_ = PredictiveBoxVPM(alpha=self.box_vpm_alpha).fit(
            box_frame, self.component_columns, target_col=selected_target
        )
        self.contribution_updates_: dict[Any, float] = {}
        if self.enable_contribution and self.box_vpm_.target_col_:
            observed_scores = np.asarray([self.box_vpm_.score(row) for row in y])
            contribution_frame = box_frame.copy()
            contribution_frame["_observed_box_score"] = observed_scores
            team_prediction = contribution_frame.groupby("_team_map_key")[
                "_observed_box_score"
            ].transform("mean")
            team_target = (
                contribution_frame.groupby("_team_map_key")[self.box_vpm_.target_col_]
                .transform("first")
                * self.box_vpm_.target_multiplier_
            )
            contribution_frame["_contribution_residual"] = (
                team_target - team_prediction
            )
            grouped = contribution_frame.groupby("player_id")[
                "_contribution_residual"
            ].agg(["mean", "count"])
            self.contribution_updates_ = {
                _clean(player): float(row["mean"] * row["count"] / (row["count"] + self.contribution_prior))
                for player, row in grouped.iterrows()
                if np.isfinite(row["mean"])
            }

        latest = prepared.sort_values("_timestamp").groupby("player_id", sort=False).tail(1)
        self.player_last_seen_ = {
            _clean(player): timestamp
            for player, timestamp in zip(latest["player_id"], latest["_timestamp"])
        }
        self.player_last_team_ = {
            _clean(player): _clean(team)
            for player, team in zip(latest["player_id"], latest["team_id"])
        }
        self.last_roster_by_team_: dict[Any, tuple[Any, ...]] = {}
        team_latest = (
            prepared[["team_id", "_team_map_key", "_timestamp", "lineup_key"]]
            .drop_duplicates("_team_map_key")
            .sort_values("_timestamp")
            .groupby("team_id", sort=False)
            .tail(1)
        )
        for _, row in team_latest.iterrows():
            self.last_roster_by_team_[_clean(row["team_id"])] = tuple(row["lineup_key"])
        self.training_frame_columns_ = tuple(prepared.columns)
        self.n_training_rows_ = len(prepared)
        self.is_fitted_ = True
        return self

    def _check_fitted(self) -> None:
        if not getattr(self, "is_fitted_", False):
            raise RuntimeError("fit the player model before forecasting")

    def roster_for_team(self, team_id: Any) -> tuple[Any, ...]:
        self._check_fitted()
        return self.last_roster_by_team_.get(_clean(team_id), tuple())

    def _prediction_context(self, context: Any) -> tuple[dict[str, Any], list[str], list[tuple[Any, str]]]:
        player_id = _clean(_context_value(context, "player_id"))
        team_id = _clean(_context_value(context, "team_id", self.player_last_team_.get(player_id)))
        focal_agent = self.agent_canonical_.get(
            canonical_agent_key(_context_value(context, "agent")),
            str(_context_value(context, "agent")),
        )
        teammates_raw = _context_value(context, "teammate_assignments", ()) or ()
        teammates: list[tuple[Any, str]] = []
        for item in teammates_raw:
            teammate_id = _clean(_context_value(item, "player_id"))
            raw_teammate_agent = str(_context_value(item, "agent"))
            teammate_agent = self.agent_canonical_.get(
                canonical_agent_key(raw_teammate_agent), raw_teammate_agent
            )
            teammates.append((teammate_id, teammate_agent))
        teammates.sort(key=lambda item: str(item[0]))
        lineup_key = tuple(sorted((player_id, *(item[0] for item in teammates)), key=str))
        values = {
            "player_id": player_id,
            "team_id": team_id,
            "map_name": _clean(_context_value(context, "map_name")),
            "agent": _clean(focal_agent),
            "agent_role": _clean(
                _context_value(
                    context,
                    "agent_role",
                    self.agent_roles_by_fold.get(
                        canonical_agent_key(focal_agent),
                        self.fitted_agent_roles_.get(
                            focal_agent, "__UNKNOWN_ROLE__"
                        ),
                    ),
                )
            ),
            "patch": _clean(_context_value(context, "patch", "__UNKNOWN_PATCH__")),
            "region": _clean(_context_value(context, "region", "__UNKNOWN_REGION__")),
            "event_context": _clean(_context_value(context, "event_context", "__UNKNOWN_EVENT__")),
            "opponent_team_id": _clean(_context_value(context, "opponent_team_id", "__UNKNOWN_OPPONENT__")),
            "lineup_key": lineup_key,
        }
        agents = [str(values["agent"]), *(item[1] for item in teammates)]
        return values, agents, teammates

    def _as_of(self, context: Any) -> pd.Timestamp:
        value = _context_value(context, "as_of", self.training_cutoff_)
        result = _utc_timestamp(value)
        if result < self.training_cutoff_:
            raise ValueError(
                f"prediction as_of {result.isoformat()} predates fitted cutoff "
                f"{self.training_cutoff_.isoformat()}; refit this fold"
            )
        return result

    def forecast(self, context: Any) -> PlayerForecast:
        self._check_fitted()
        as_of = self._as_of(context)
        values, agents, teammates = self._prediction_context(context)
        width = len(self.component_columns)
        mean = self.global_mean_.copy()
        component_decomposition: dict[str, np.ndarray] = {"population": self.global_mean_.copy()}
        retention = 1.0
        last_seen = self.player_last_seen_.get(values["player_id"])
        if last_seen is not None:
            gap_days = max((as_of - last_seen).total_seconds() / 86_400.0, 0.0)
            retention = float(0.5 ** (gap_days / self.inactivity_half_life_days))
        else:
            gap_days = 365.0

        counts: dict[str, int] = {}
        for name, fields in self.TERM_FIELDS:
            key = tuple(_clean(values[field]) for field in fields)
            effect = self.effects_[name].get(key, width).copy()
            if name.startswith("player"):
                effect *= retention
            mean += effect
            component_decomposition[name] = effect
            counts[name] = self.effects_[name].count(key)

        composition_effect = np.zeros(width, dtype=float)
        response_effect = np.zeros(width, dtype=float)
        unseen_pairs = 0
        if len(agents) >= 2 and all(agent != "__MISSING__" for agent in agents):
            for pair in combinations(agents, 2):
                key = tuple(sorted((str(pair[0]), str(pair[1])), key=str))
                composition_effect += self.agent_pair_effects_.get(key, np.zeros(width))
                unseen_pairs += int(self.agent_pair_counts_.get(key, 0) == 0)
            focal = str(values["agent"])
            for teammate_agent in (item[1] for item in teammates):
                key = (focal, str(teammate_agent))
                response_effect += self.focal_response_effects_.get(key, np.zeros(width))
                unseen_pairs += int(self.focal_response_counts_.get(key, 0) == 0)
        mean += composition_effect + response_effect
        component_decomposition["composition_synergy"] = composition_effect
        component_decomposition["focal_composition_response"] = response_effect

        uncertainty_load = 0.0
        for name in (
            "player_state",
            "player_map",
            "player_agent",
            "map_agent",
            "map_agent_role",
            "player_map_agent",
        ):
            if name not in self.enabled_terms:
                continue
            count = counts[name]
            prior = self.effects_[name].prior_strength
            uncertainty_load += prior / (count + prior)
        if teammates:
            uncertainty_load += min(unseen_pairs / max(len(teammates) + 1, 1), 2.0)
            if counts["lineup_synergy"] == 0:
                uncertainty_load += 0.5
        if last_seen is None:
            uncertainty_load += 2.0
        uncertainty_load += min(gap_days / 730.0, 1.0)
        transfer = (
            values["team_id"] != "__MISSING__"
            and values["player_id"] in self.player_last_team_
            and values["team_id"] != self.player_last_team_[values["player_id"]]
        )
        if transfer:
            uncertainty_load += 0.6
        component_sd = self.component_residual_sd_ * sqrt(1.0 + 0.22 * uncertainty_load)

        known_player = counts["player_state"] > 0
        known_map = counts["map_effect"] > 0
        known_agent = counts["agent_effect"] > 0
        triple_count = counts["player_map_agent"]
        if not (known_player and known_map and known_agent):
            support = "extrapolated"
        elif teammates and triple_count == 0 and unseen_pairs > 0:
            support = "extrapolated"
        elif triple_count >= 5 and (not teammates or counts["lineup_synergy"] >= 2):
            support = "observed"
        else:
            support = "partially-pooled"

        performance = self.box_vpm_.score(mean)
        contribution = performance + self.contribution_updates_.get(values["player_id"], 0.0)
        rating_sd = (
            self.box_vpm_.score_standard_deviation(component_sd)
            * self.rating_uncertainty_scale
        )
        decomposition = {
            name: (
                self.box_vpm_.score(vector)
                if name == "population"
                else self.box_vpm_.score_delta(vector)
            )
            for name, vector in component_decomposition.items()
        }
        if self.enable_contribution:
            decomposition["shrunk_lineup_result_update"] = self.contribution_updates_.get(values["player_id"], 0.0)
        return PlayerForecast(
            component_means=dict(zip(self.component_columns, mean.astype(float))),
            component_standard_deviations=dict(zip(self.component_columns, component_sd.astype(float))),
            performance_mean=float(performance),
            contribution_mean=float(contribution),
            standard_deviation=float(rating_sd),
            support=support,
            decomposition=decomposition,
        )

    predict = forecast

    def effect_value(self, name: str, key: Any, component: str = "kpr") -> float:
        """Inspect a fitted effect for synthetic recovery and model cards."""
        self._check_fitted()
        table = self.effects_[name]
        normalized = key if isinstance(key, tuple) else (key,)
        index = self.component_columns.index(component)
        return float(table.get(tuple(_clean(value) for value in normalized), len(self.component_columns))[index])

    @classmethod
    def rolling_predict(
        cls,
        frame: pd.DataFrame,
        cutoffs: Iterable[datetime | date | pd.Timestamp],
        contexts_by_cutoff: Mapping[Any, Sequence[Any]],
        **model_kwargs: Any,
    ) -> pd.DataFrame:
        """Refit at each cutoff and return long, leakage-safe forecast records."""
        records: list[dict[str, Any]] = []
        for raw_cutoff in cutoffs:
            cutoff = _utc_timestamp(raw_cutoff)
            model = cls(**model_kwargs).fit(frame, cutoff=cutoff)
            contexts = contexts_by_cutoff.get(raw_cutoff, contexts_by_cutoff.get(cutoff, ()))
            for context in contexts:
                forecast = model.forecast(context)
                records.append(
                    {
                        "cutoff": cutoff,
                        "player_id": _context_value(context, "player_id"),
                        "map_name": _context_value(context, "map_name"),
                        "agent": _context_value(context, "agent"),
                        "performance_mean": forecast.performance_mean,
                        "contribution_mean": forecast.contribution_mean,
                        "standard_deviation": forecast.standard_deviation,
                        "support": forecast.support,
                        **{f"pred_{key}": value for key, value in forecast.component_means.items()},
                    }
                )
        return pd.DataFrame.from_records(records)


def run_player_development(
    player_frame: pd.DataFrame,
    *,
    cutoffs: Sequence[datetime | date | pd.Timestamp] | None = None,
    development_end: datetime | date | pd.Timestamp = pd.Timestamp("2026-01-01", tz="UTC"),
    ablations: Sequence[str] = ("player-only", "additive", "two-way", "triple", "composition"),
    target_col: str | None = None,
    model_kwargs: Mapping[str, Any] | None = None,
) -> PlayerDevelopmentResult:
    """Run fold-local player ablations on 2024-25 without touching 2026.

    Default cutoffs are calendar quarters from 2024-01-01 through 2025-10-01.
    Each model is rebuilt from rows whose feature *and*, when available,
    ``target_observed_at``/map-completion timestamps strictly predate the fold
    boundary.  Validation uses the locked player/map/agent/composition context;
    pre-lock marginalization is evaluated separately by :mod:`scenario`.

    Metrics include component MAE, Gaussian log likelihood and empirical 80%
    interval coverage.  The ``__box_vpm__`` row evaluates the training-fold VPM
    scale against the available lineup-margin/outcome target.
    """
    base_kwargs = dict(model_kwargs or {})
    probe = HierarchicalPlayerModel(**base_kwargs)
    prepared_all = probe._prepare(player_frame)
    boundary_end = _utc_timestamp(development_end)
    if cutoffs is None:
        raw_cutoffs = list(pd.date_range("2024-01-01", "2025-10-01", freq="QS", tz="UTC"))
    else:
        raw_cutoffs = [_utc_timestamp(value) for value in cutoffs]
    fold_cutoffs = sorted({value for value in raw_cutoffs if value < boundary_end})
    if not fold_cutoffs:
        return PlayerDevelopmentResult(pd.DataFrame(), pd.DataFrame())

    unknown = set(ablations).difference(PLAYER_ABLATION_SPECIFICATIONS)
    if unknown:
        raise ValueError(f"unknown player development ablations: {sorted(unknown)}")
    selected_target = target_col or next(
        (name for name in PredictiveBoxVPM.TARGET_CANDIDATES if name in prepared_all),
        None,
    )
    if (
        selected_target in PredictiveBoxVPM.FUTURE_TARGETS
        and "target_observed_at" not in prepared_all.columns
    ):
        raise ValueError(
            "rolling development with a future VPM target requires "
            "target_observed_at"
        )

    records: list[dict[str, Any]] = []
    for fold_index, cutoff in enumerate(fold_cutoffs):
        next_boundary = fold_cutoffs[fold_index + 1] if fold_index + 1 < len(fold_cutoffs) else cutoff + pd.DateOffset(months=3)
        validation_end = min(_utc_timestamp(next_boundary), boundary_end)
        validation = prepared_all.loc[
            (prepared_all["_timestamp"] >= cutoff)
            & (prepared_all["_timestamp"] < validation_end)
            & (prepared_all["_timestamp"].dt.year.isin([2024, 2025]))
        ].copy()
        if validation.empty:
            continue
        teammates_by_index: dict[int, tuple[dict[str, Any], ...]] = {}
        for _, group in validation.groupby("_team_map_key", sort=False):
            group_rows = list(group[["player_id", "agent"]].itertuples(index=True))
            for focal in group_rows:
                teammates_by_index[int(focal.Index)] = tuple(
                    {"player_id": int(other.player_id), "agent": str(other.agent)}
                    for other in group_rows
                    if other.Index != focal.Index
        )

        for ablation in ablations:
            specification = player_ablation_specification(ablation)
            kwargs = {
                **base_kwargs,
                "enabled_terms": tuple(sorted(specification.enabled_terms)),
                "enable_agent_pairs": specification.enable_agent_pairs,
                "enable_focal_response": specification.enable_focal_response,
            }
            model = HierarchicalPlayerModel(**kwargs).fit(
                player_frame,
                cutoff=cutoff,
                target_col=selected_target,
            )
            for index, row in validation.iterrows():
                forecast = model.forecast(
                    {
                        "as_of": row["_timestamp"],
                        "player_id": row["player_id"],
                        "team_id": row["team_id"],
                        "map_name": row["map_name"],
                        "agent": row["agent"],
                        "patch": row["patch"],
                        "region": row["region"],
                        "event_context": row["event_context"],
                        "opponent_team_id": row["opponent_team_id"],
                        "teammate_assignments": teammates_by_index[index],
                    }
                )
                identity = {
                    "fold_cutoff": cutoff,
                    "validation_end": validation_end,
                    "ablation": ablation,
                    "map_id": row.get("map_id"),
                    "match_id": row.get("match_id"),
                    "player_id": row["player_id"],
                    "team_id": row["team_id"],
                    "map_name": row["map_name"],
                    "agent": row["agent"],
                }
                for component in model.component_columns:
                    records.append(
                        {
                            **identity,
                            "component": component,
                            "observed": float(row[component]),
                            "predicted": forecast.component_means[component],
                            "standard_deviation": forecast.component_standard_deviations[component],
                            "support": forecast.support,
                        }
                    )
                target_is_visible = bool(
                    selected_target and pd.notna(row.get(selected_target))
                )
                target_observed_at = row.get("target_observed_at")
                if (
                    target_is_visible
                    and selected_target in PredictiveBoxVPM.FUTURE_TARGETS
                    and "target_observed_at" in validation.columns
                ):
                    observed_at = pd.to_datetime(
                        target_observed_at, utc=True, errors="coerce"
                    )
                    target_is_visible = bool(
                        pd.notna(observed_at) and observed_at < validation_end
                    )
                if target_is_visible:
                    records.append(
                        {
                            **identity,
                            "component": "__box_vpm__",
                            "observed": model.box_vpm_.transform_target(float(row[selected_target])),
                            "predicted": forecast.performance_mean,
                            "standard_deviation": forecast.standard_deviation,
                            "support": forecast.support,
                            "target_column": model.box_vpm_.target_col_,
                            "target_raw_unit": model.box_vpm_.target_raw_unit_,
                            "target_multiplier": model.box_vpm_.target_multiplier_,
                            "output_unit": model.box_vpm_.output_unit_,
                            "target_observed_at": target_observed_at,
                        }
                    )

    predictions = pd.DataFrame.from_records(records)
    if predictions.empty:
        return PlayerDevelopmentResult(predictions, pd.DataFrame())
    predictions = predictions.dropna(
        subset=["observed", "predicted", "standard_deviation"]
    ).reset_index(drop=True)
    predictions["absolute_error"] = (predictions["observed"] - predictions["predicted"]).abs()
    sd = predictions["standard_deviation"].clip(lower=1e-9)
    standardized_error = (predictions["observed"] - predictions["predicted"]) / sd
    predictions["log_likelihood"] = -0.5 * (
        np.log(2.0 * np.pi) + 2.0 * np.log(sd) + standardized_error**2
    )
    predictions["covered80"] = (predictions["absolute_error"] <= 1.2815515655 * sd).astype(float)
    metrics = (
        predictions.groupby(["ablation", "component"], as_index=False)
        .agg(
            observations=("observed", "size"),
            mae=("absolute_error", "mean"),
            mean_log_likelihood=("log_likelihood", "mean"),
            interval80_coverage=("covered80", "mean"),
            extrapolated_rate=("support", lambda values: float(np.mean(np.asarray(values) == "extrapolated"))),
        )
        .sort_values(["component", "mae", "ablation"], kind="stable")
        .reset_index(drop=True)
    )
    return PlayerDevelopmentResult(predictions, metrics)


__all__ = [
    "COMPONENTS",
    "OPTIONAL_COMPONENTS",
    "PLAYER_ABLATION_SPECIFICATIONS",
    "HierarchicalPlayerModel",
    "PlayerAblationSpecification",
    "PlayerDevelopmentResult",
    "PlayerForecast",
    "PredictiveBoxVPM",
    "player_ablation_specification",
    "run_player_development",
]
