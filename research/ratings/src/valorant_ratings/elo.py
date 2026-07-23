"""Time-safe Elo and uncertainty-aware team-rating baselines.

The serving Elo is intentionally left alone.  This module reconstructs it from
canonical map observations and supplies research challengers whose state can be
frozen for an entire series.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
import json
from math import exp, log, log10, pi, sqrt
from pathlib import Path
from typing import Iterable, Mapping, Protocol, Sequence

import numpy as np


def _as_utc(value: datetime | str | np.datetime64) -> datetime:
    if isinstance(value, np.datetime64):
        value = str(value)
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clip_probability(value: float, eps: float = 1e-8) -> float:
    return float(np.clip(value, eps, 1.0 - eps))


@dataclass(frozen=True)
class EloObservation:
    match_id: int | str
    timestamp: datetime
    map_name: str
    team_a: int | str
    team_b: int | str
    team_a_won: int
    round_margin: float = 0.0
    event_id: int | str | None = None

    @classmethod
    def from_mapping(cls, row: Mapping[str, object]) -> "EloObservation":
        score_a = row.get("team_a_rounds")
        score_b = row.get("team_b_rounds")
        margin = row.get("round_margin")
        if margin is None and score_a is not None and score_b is not None:
            margin = float(score_a) - float(score_b)
        return cls(
            match_id=row["match_id"],
            timestamp=_as_utc(row["timestamp"]),
            map_name=str(row["map_name"]),
            team_a=row["team_a"],
            team_b=row["team_b"],
            team_a_won=int(row["team_a_won"]),
            round_margin=float(margin or 0.0),
            event_id=row.get("event_id"),
        )


@dataclass(frozen=True)
class EloConfig:
    initial_rating: float = 1000.0
    k_factor: float = 74.0
    probability_scale: float = 1000.0
    margin_power: float = 1.0
    margin_cap: float = 2.5
    offseason_regression: float = 0.72
    reset_yearly: bool = False
    time_decay_half_life_days: float | None = 360.0
    inactivity_uncertainty_per_day: float = 0.18
    uncertainty_probability_weight: float = 0.20
    global_weight: float = 0.65
    map_update_weight: float = 0.55

    @classmethod
    def current_hard_reset(cls) -> "EloConfig":
        """Configuration matching the dashboard's independent-map Elo."""

        return cls(
            k_factor=74.0,
            probability_scale=1000.0,
            offseason_regression=0.0,
            reset_yearly=True,
            time_decay_half_life_days=None,
            uncertainty_probability_weight=0.0,
            global_weight=0.0,
            map_update_weight=1.0,
        )

    def __post_init__(self) -> None:
        if self.k_factor <= 0 or self.probability_scale <= 0:
            raise ValueError("k_factor and probability_scale must be positive")
        for name in ("offseason_regression", "global_weight", "map_update_weight"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1]")
        if self.inactivity_uncertainty_per_day < 0 or self.uncertainty_probability_weight < 0:
            raise ValueError("uncertainty controls cannot be negative")


@dataclass
class EloState:
    global_rating: float
    map_ratings: dict[str, float] = field(default_factory=dict)
    last_seen: datetime | None = None
    last_season: int | None = None
    games: int = 0
    uncertainty: float = 350.0

    def clone(self) -> "EloState":
        return EloState(
            global_rating=self.global_rating,
            map_ratings=dict(self.map_ratings),
            last_seen=self.last_seen,
            last_season=self.last_season,
            games=self.games,
            uncertainty=self.uncertainty,
        )


@dataclass(frozen=True)
class RatingForecast:
    probability: float
    team_a_rating: float
    team_b_rating: float
    team_a_uncertainty: float
    team_b_uncertainty: float


@dataclass(frozen=True)
class EloRatingComponents:
    """Effective carryover components available at one prediction cutoff."""

    global_rating: float
    map_rating: float
    total_rating: float
    uncertainty: float


class SequentialTeamRating(Protocol):
    def predict(
        self,
        team_a: int | str,
        team_b: int | str,
        map_name: str,
        as_of: datetime,
    ) -> RatingForecast: ...

    def update_batch(self, observations: Sequence[EloObservation]) -> None: ...


class EloModel:
    """Global/map pooled Elo with learned carryover and inactivity behavior.

    ``predict`` is non-mutating. ``update_batch`` computes every residual from
    one snapshot and then applies their accumulated deltas, which prevents a
    map-one outcome from changing a map-two pre-match forecast.
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        self.config = config or EloConfig()
        self._states: dict[int | str, EloState] = {}

    @property
    def states(self) -> Mapping[int | str, EloState]:
        return self._states

    def clone(self) -> "EloModel":
        other = EloModel(self.config)
        other._states = {team: state.clone() for team, state in self._states.items()}
        return other

    def _state(self, team: int | str) -> EloState:
        return self._states.get(team, EloState(self.config.initial_rating))

    def _regression_factor(self, state: EloState, as_of: datetime) -> float:
        as_of = _as_utc(as_of)
        if state.last_seen is None:
            return 0.0
        if self.config.reset_yearly and as_of.year > state.last_seen.year:
            return 0.0
        seasons = max(0, as_of.year - state.last_seen.year)
        factor = self.config.offseason_regression**seasons
        if self.config.time_decay_half_life_days:
            days = max(0.0, (as_of - state.last_seen).total_seconds() / 86400.0)
            factor *= 0.5 ** (days / self.config.time_decay_half_life_days)
        return factor

    def _effective_components(
        self, team: int | str, map_name: str, as_of: datetime
    ) -> tuple[float, float, float]:
        state = self._state(team)
        factor = self._regression_factor(state, as_of)
        base = self.config.initial_rating
        global_rating = base + factor * (state.global_rating - base)
        raw_map = state.map_ratings.get(map_name, state.global_rating)
        map_rating = base + factor * (raw_map - base)
        rating = (
            self.config.global_weight * global_rating
            + (1.0 - self.config.global_weight) * map_rating
        )
        days = 0.0
        if state.last_seen is not None:
            days = max(0.0, (_as_utc(as_of) - state.last_seen).total_seconds() / 86400.0)
        uncertainty = min(
            500.0,
            sqrt(state.uncertainty**2 + (days * self.config.inactivity_uncertainty_per_day) ** 2),
        )
        return rating, uncertainty, factor

    def predict(
        self,
        team_a: int | str,
        team_b: int | str,
        map_name: str,
        as_of: datetime,
    ) -> RatingForecast:
        rating_a, uncertainty_a, _ = self._effective_components(team_a, map_name, as_of)
        rating_b, uncertainty_b, _ = self._effective_components(team_b, map_name, as_of)
        uncertainty_scale = sqrt(
            1.0
            + self.config.uncertainty_probability_weight
            * (uncertainty_a**2 + uncertainty_b**2)
            / (2.0 * 350.0**2)
        )
        probability = 1.0 / (
            1.0
            + 10.0
            ** (
                (rating_b - rating_a)
                / (self.config.probability_scale * uncertainty_scale)
            )
        )
        return RatingForecast(
            probability=_clip_probability(probability),
            team_a_rating=rating_a,
            team_b_rating=rating_b,
            team_a_uncertainty=uncertainty_a,
            team_b_uncertainty=uncertainty_b,
        )

    def rating_components(
        self,
        team: int | str,
        map_name: str,
        as_of: datetime,
    ) -> EloRatingComponents:
        """Expose the same non-mutating global/map state used by ``predict``.

        Downstream choice models need each team's own map profile, not only the
        head-to-head win probability.  Keeping the decomposition here ensures
        those features use exactly the carryover model's as-of regression.
        """

        state = self._state(team)
        factor = self._regression_factor(state, as_of)
        base = self.config.initial_rating
        global_rating = base + factor * (state.global_rating - base)
        raw_map = state.map_ratings.get(map_name, state.global_rating)
        map_rating = base + factor * (raw_map - base)
        total_rating, uncertainty, _ = self._effective_components(
            team, map_name, as_of
        )
        return EloRatingComponents(
            global_rating=float(global_rating),
            map_rating=float(map_rating),
            total_rating=float(total_rating),
            uncertainty=float(uncertainty),
        )

    def _margin_multiplier(self, margin: float) -> float:
        transformed = log(1.0 + abs(float(margin))) ** self.config.margin_power
        return float(np.clip(max(1.0, transformed), 1.0, self.config.margin_cap))

    def update_batch(self, observations: Sequence[EloObservation]) -> None:
        if not observations:
            return
        timestamps = {_as_utc(obs.timestamp) for obs in observations}
        match_ids = {obs.match_id for obs in observations}
        if len(match_ids) != 1:
            raise ValueError("update_batch accepts exactly one complete match")
        if len(timestamps) != 1:
            raise ValueError("all maps in a match must share one prediction cutoff")
        timestamp = next(iter(timestamps))

        global_deltas: dict[int | str, float] = defaultdict(float)
        map_deltas: dict[tuple[int | str, str], float] = defaultdict(float)
        forecast_cache: list[tuple[EloObservation, RatingForecast]] = []
        for obs in observations:
            forecast = self.predict(obs.team_a, obs.team_b, obs.map_name, timestamp)
            forecast_cache.append((obs, forecast))
            residual = obs.team_a_won - forecast.probability
            delta = self.config.k_factor * self._margin_multiplier(obs.round_margin) * residual
            global_deltas[obs.team_a] += delta * self.config.global_weight
            global_deltas[obs.team_b] -= delta * self.config.global_weight
            map_weight = (1.0 - self.config.global_weight) * self.config.map_update_weight
            map_deltas[(obs.team_a, obs.map_name)] += delta * map_weight
            map_deltas[(obs.team_b, obs.map_name)] -= delta * map_weight

        teams = {obs.team_a for obs in observations} | {obs.team_b for obs in observations}
        for team in teams:
            prior = self._state(team).clone()
            factor = self._regression_factor(prior, timestamp)
            base = self.config.initial_rating
            if self.config.reset_yearly and factor == 0.0 and prior.last_seen is not None:
                prior.global_rating = base
                prior.map_ratings = {}
                prior.games = 0
                prior.uncertainty = 350.0
            elif prior.last_seen is not None:
                prior.global_rating = base + factor * (prior.global_rating - base)
                prior.map_ratings = {
                    name: base + factor * (value - base)
                    for name, value in prior.map_ratings.items()
                }
            pre_update_global = prior.global_rating
            prior.global_rating += global_deltas[team]
            maps_played = {
                obs.map_name for obs in observations if team in (obs.team_a, obs.team_b)
            }
            for map_name in maps_played:
                key = (team, map_name)
                map_prior = prior.map_ratings.get(map_name, pre_update_global)
                prior.map_ratings[map_name] = map_prior + map_deltas[key]
            prior.games += sum(team in (obs.team_a, obs.team_b) for obs in observations)
            prior.last_seen = timestamp
            prior.last_season = timestamp.year
            # Information accumulates, while a floor acknowledges roster churn.
            prior.uncertainty = max(75.0, prior.uncertainty * (0.97 ** len(observations)))
            self._states[team] = prior


@dataclass(frozen=True)
class MapResetSchedule:
    """Patch and map-pool boundaries that reset transient map readiness."""

    patch_boundaries: tuple[datetime, ...] = ()
    map_reentry_boundaries: Mapping[str, tuple[datetime, ...]] = field(default_factory=dict)

    @classmethod
    def from_payloads(
        cls,
        patches: Mapping[str, object],
        map_pools: Mapping[str, object],
    ) -> "MapResetSchedule":
        patch_boundaries = tuple(
            sorted(
                {
                    _as_utc(str(row["effective_from"]))
                    for row in patches.get("patches", [])
                    if isinstance(row, Mapping) and row.get("effective_from")
                }
            )
        )
        pools = sorted(
            (
                row
                for row in map_pools.get("map_pools", [])
                if isinstance(row, Mapping) and row.get("effective_from")
            ),
            key=lambda row: _as_utc(str(row["effective_from"])),
        )
        reentries: dict[str, list[datetime]] = defaultdict(list)
        previous_maps: set[str] | None = None
        for row in pools:
            current_maps = {str(value) for value in row.get("maps", [])}
            if previous_maps is not None:
                boundary = _as_utc(str(row["effective_from"]))
                for map_name in current_maps.difference(previous_maps):
                    reentries[map_name].append(boundary)
            previous_maps = current_maps
        return cls(
            patch_boundaries=patch_boundaries,
            map_reentry_boundaries={
                map_name: tuple(sorted(set(boundaries)))
                for map_name, boundaries in reentries.items()
            },
        )

    @classmethod
    def from_config(
        cls,
        patches_path: Path | str | None = None,
        map_pools_path: Path | str | None = None,
    ) -> "MapResetSchedule":
        config_dir = Path(__file__).resolve().parents[2] / "config"
        patches_path = Path(patches_path or config_dir / "patches.json")
        map_pools_path = Path(map_pools_path or config_dir / "map_pools.json")
        patches = json.loads(patches_path.read_text(encoding="utf-8"))
        map_pools = json.loads(map_pools_path.read_text(encoding="utf-8"))
        return cls.from_payloads(patches, map_pools)

    def reset_boundaries(
        self,
        map_name: str,
        after: datetime,
        through: datetime,
    ) -> tuple[datetime, ...]:
        """Return unique reset instants in ``(after, through]``."""

        start = _as_utc(after)
        end = _as_utc(through)
        boundaries = set(self.patch_boundaries)
        boundaries.update(self.map_reentry_boundaries.get(map_name, ()))
        return tuple(sorted(boundary for boundary in boundaries if start < boundary <= end))


@dataclass(frozen=True)
class MapReadinessConfig:
    """Carryover Elo plus a separately tuned transient map pathway."""

    carryover: EloConfig = field(default_factory=EloConfig)
    readiness_half_life_days: float = 45.0
    readiness_k_factor: float = 16.0
    patch_retention: float = 0.25
    readiness_initial_uncertainty: float = 350.0
    readiness_minimum_uncertainty: float = 75.0
    readiness_uncertainty_per_day: float = 1.5
    readiness_uncertainty_contraction: float = 0.85
    readiness_uncertainty_weight: float = 0.25

    def __post_init__(self) -> None:
        for name in (
            "readiness_half_life_days",
            "readiness_k_factor",
            "readiness_initial_uncertainty",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")
        for name in (
            "patch_retention",
            "readiness_uncertainty_contraction",
            "readiness_uncertainty_weight",
        ):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1]")
        if not 0.0 <= self.readiness_minimum_uncertainty <= self.readiness_initial_uncertainty:
            raise ValueError(
                "readiness_minimum_uncertainty must be between zero and the initial value"
            )
        if self.readiness_uncertainty_per_day < 0:
            raise ValueError("readiness_uncertainty_per_day cannot be negative")

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> "MapReadinessConfig":
        payload = dict(value)
        carryover = payload.get("carryover")
        if isinstance(carryover, Mapping):
            payload["carryover"] = EloConfig(**carryover)
        elif not isinstance(carryover, EloConfig):
            raise TypeError("map-readiness config requires a carryover configuration")
        return cls(**payload)


@dataclass
class MapReadinessState:
    value: float = 0.0
    last_played: datetime | None = None
    uncertainty: float = 350.0
    games: int = 0

    def clone(self) -> "MapReadinessState":
        return MapReadinessState(self.value, self.last_played, self.uncertainty, self.games)


@dataclass(frozen=True)
class MapRatingComponents:
    global_strength: float
    persistent_map_affinity: float
    map_readiness: float
    total_rating: float
    global_uncertainty: float
    readiness_uncertainty: float
    total_uncertainty: float
    readiness_reset_count: int


class MapReadinessEloModel(EloModel):
    """Carryover Elo challenger with a fast, patch-aware map state.

    The inherited carryover state preserves the promoted global and persistent
    map-affinity behavior. Readiness is an additive per-team/per-map offset
    with its own K-factor, last-played decay clock, and uncertainty. Prediction
    only materializes effective values; state changes happen in ``update_batch``.
    """

    def __init__(
        self,
        config: MapReadinessConfig,
        reset_schedule: MapResetSchedule | None = None,
    ) -> None:
        super().__init__(config.carryover)
        self.readiness_config = config
        self.reset_schedule = reset_schedule or MapResetSchedule.from_config()
        self._readiness_states: dict[tuple[int | str, str], MapReadinessState] = {}

    @property
    def readiness_states(self) -> Mapping[tuple[int | str, str], MapReadinessState]:
        return self._readiness_states

    def clone(self) -> "MapReadinessEloModel":
        other = MapReadinessEloModel(self.readiness_config, self.reset_schedule)
        other._states = {team: state.clone() for team, state in self._states.items()}
        other._readiness_states = {
            key: state.clone() for key, state in self._readiness_states.items()
        }
        return other

    def _readiness_effective(
        self,
        team: int | str,
        map_name: str,
        as_of: datetime,
    ) -> tuple[float, float, int]:
        as_of = _as_utc(as_of)
        stored = self._readiness_states.get((team, map_name))
        if stored is None or stored.last_played is None:
            return 0.0, self.readiness_config.readiness_initial_uncertainty, 0
        days = max(0.0, (as_of - stored.last_played).total_seconds() / 86400.0)
        reset_count = len(
            self.reset_schedule.reset_boundaries(map_name, stored.last_played, as_of)
        )
        decay = 0.5 ** (days / self.readiness_config.readiness_half_life_days)
        readiness = (
            stored.value
            * decay
            * self.readiness_config.patch_retention**reset_count
        )
        if reset_count:
            uncertainty = self.readiness_config.readiness_initial_uncertainty
        else:
            uncertainty = min(
                self.readiness_config.readiness_initial_uncertainty,
                sqrt(
                    stored.uncertainty**2
                    + (days * self.readiness_config.readiness_uncertainty_per_day) ** 2
                ),
            )
        return readiness, uncertainty, reset_count

    def components(
        self,
        team: int | str,
        map_name: str,
        as_of: datetime,
    ) -> MapRatingComponents:
        as_of = _as_utc(as_of)
        state = self._state(team)
        factor = self._regression_factor(state, as_of)
        base = self.config.initial_rating
        global_rating = base + factor * (state.global_rating - base)
        raw_map = state.map_ratings.get(map_name, state.global_rating)
        map_rating = base + factor * (raw_map - base)
        affinity = (1.0 - self.config.global_weight) * (map_rating - global_rating)
        readiness, readiness_uncertainty, reset_count = self._readiness_effective(
            team, map_name, as_of
        )
        days = 0.0
        if state.last_seen is not None:
            days = max(0.0, (as_of - state.last_seen).total_seconds() / 86400.0)
        global_uncertainty = min(
            500.0,
            sqrt(
                state.uncertainty**2
                + (days * self.config.inactivity_uncertainty_per_day) ** 2
            ),
        )
        total_uncertainty = sqrt(
            global_uncertainty**2
            + (
                self.readiness_config.readiness_uncertainty_weight
                * readiness_uncertainty
            )
            ** 2
        )
        return MapRatingComponents(
            global_strength=global_rating,
            persistent_map_affinity=affinity,
            map_readiness=readiness,
            total_rating=global_rating + affinity + readiness,
            global_uncertainty=global_uncertainty,
            readiness_uncertainty=readiness_uncertainty,
            total_uncertainty=total_uncertainty,
            readiness_reset_count=reset_count,
        )

    def predict(
        self,
        team_a: int | str,
        team_b: int | str,
        map_name: str,
        as_of: datetime,
    ) -> RatingForecast:
        component_a = self.components(team_a, map_name, as_of)
        component_b = self.components(team_b, map_name, as_of)
        uncertainty_scale = sqrt(
            1.0
            + self.config.uncertainty_probability_weight
            * (component_a.total_uncertainty**2 + component_b.total_uncertainty**2)
            / (2.0 * 350.0**2)
        )
        probability = 1.0 / (
            1.0
            + 10.0
            ** (
                (component_b.total_rating - component_a.total_rating)
                / (self.config.probability_scale * uncertainty_scale)
            )
        )
        return RatingForecast(
            probability=_clip_probability(probability),
            team_a_rating=component_a.total_rating,
            team_b_rating=component_b.total_rating,
            team_a_uncertainty=component_a.total_uncertainty,
            team_b_uncertainty=component_b.total_uncertainty,
        )

    def update_batch(self, observations: Sequence[EloObservation]) -> None:
        if not observations:
            return
        timestamps = {_as_utc(obs.timestamp) for obs in observations}
        match_ids = {obs.match_id for obs in observations}
        if len(match_ids) != 1:
            raise ValueError("update_batch accepts exactly one complete match")
        if len(timestamps) != 1:
            raise ValueError("all maps in a match must share one prediction cutoff")
        timestamp = next(iter(timestamps))

        global_deltas: dict[int | str, float] = defaultdict(float)
        map_deltas: dict[tuple[int | str, str], float] = defaultdict(float)
        readiness_deltas: dict[tuple[int | str, str], float] = defaultdict(float)
        readiness_games: dict[tuple[int | str, str], int] = defaultdict(int)
        for obs in observations:
            forecast = self.predict(obs.team_a, obs.team_b, obs.map_name, timestamp)
            residual = obs.team_a_won - forecast.probability
            margin = self._margin_multiplier(obs.round_margin)
            carryover_delta = self.config.k_factor * margin * residual
            global_deltas[obs.team_a] += carryover_delta * self.config.global_weight
            global_deltas[obs.team_b] -= carryover_delta * self.config.global_weight
            map_weight = (1.0 - self.config.global_weight) * self.config.map_update_weight
            map_deltas[(obs.team_a, obs.map_name)] += carryover_delta * map_weight
            map_deltas[(obs.team_b, obs.map_name)] -= carryover_delta * map_weight
            readiness_delta = self.readiness_config.readiness_k_factor * margin * residual
            readiness_deltas[(obs.team_a, obs.map_name)] += readiness_delta
            readiness_deltas[(obs.team_b, obs.map_name)] -= readiness_delta
            readiness_games[(obs.team_a, obs.map_name)] += 1
            readiness_games[(obs.team_b, obs.map_name)] += 1

        teams = {obs.team_a for obs in observations} | {obs.team_b for obs in observations}
        for team in teams:
            prior = self._state(team).clone()
            factor = self._regression_factor(prior, timestamp)
            base = self.config.initial_rating
            if self.config.reset_yearly and factor == 0.0 and prior.last_seen is not None:
                prior.global_rating = base
                prior.map_ratings = {}
                prior.games = 0
                prior.uncertainty = 350.0
            elif prior.last_seen is not None:
                prior.global_rating = base + factor * (prior.global_rating - base)
                prior.map_ratings = {
                    name: base + factor * (value - base)
                    for name, value in prior.map_ratings.items()
                }
            pre_update_global = prior.global_rating
            prior.global_rating += global_deltas[team]
            maps_played = {
                obs.map_name for obs in observations if team in (obs.team_a, obs.team_b)
            }
            for map_name in maps_played:
                key = (team, map_name)
                map_prior = prior.map_ratings.get(map_name, pre_update_global)
                prior.map_ratings[map_name] = map_prior + map_deltas[key]
                readiness, uncertainty, _ = self._readiness_effective(
                    team, map_name, timestamp
                )
                games = readiness_games[key]
                self._readiness_states[key] = MapReadinessState(
                    value=readiness + readiness_deltas[key],
                    last_played=timestamp,
                    uncertainty=max(
                        self.readiness_config.readiness_minimum_uncertainty,
                        uncertainty
                        * self.readiness_config.readiness_uncertainty_contraction**games,
                    ),
                    games=self._readiness_states.get(key, MapReadinessState()).games
                    + games,
                )
            prior.games += sum(team in (obs.team_a, obs.team_b) for obs in observations)
            prior.last_seen = timestamp
            prior.last_season = timestamp.year
            prior.uncertainty = max(75.0, prior.uncertainty * (0.97 ** len(observations)))
            self._states[team] = prior


@dataclass(frozen=True)
class GlickoConfig:
    initial_rating: float = 1500.0
    initial_deviation: float = 350.0
    probability_scale: float = 400.0
    inactivity_deviation_per_day: float = 1.25
    map_pooling: float = 0.55
    minimum_deviation: float = 45.0


@dataclass
class GlickoState:
    rating: float = 1500.0
    deviation: float = 350.0
    map_offsets: dict[str, float] = field(default_factory=dict)
    last_seen: datetime | None = None

    def clone(self) -> "GlickoState":
        return GlickoState(self.rating, self.deviation, dict(self.map_offsets), self.last_seen)


class GlickoLikeModel:
    """A light-weight Glicko baseline with explicit inactivity uncertainty."""

    def __init__(self, config: GlickoConfig | None = None) -> None:
        self.config = config or GlickoConfig()
        self._states: dict[int | str, GlickoState] = {}

    def _state(self, team: int | str) -> GlickoState:
        return self._states.get(
            team,
            GlickoState(self.config.initial_rating, self.config.initial_deviation),
        )

    def _inflated_deviation(self, state: GlickoState, as_of: datetime) -> float:
        if state.last_seen is None:
            return state.deviation
        days = max(0.0, (_as_utc(as_of) - state.last_seen).total_seconds() / 86400.0)
        return min(
            self.config.initial_deviation,
            sqrt(state.deviation**2 + days * self.config.inactivity_deviation_per_day**2),
        )

    def _rating(self, state: GlickoState, map_name: str) -> float:
        return state.rating + self.config.map_pooling * state.map_offsets.get(map_name, 0.0)

    def predict(
        self,
        team_a: int | str,
        team_b: int | str,
        map_name: str,
        as_of: datetime,
    ) -> RatingForecast:
        state_a, state_b = self._state(team_a), self._state(team_b)
        rating_a, rating_b = self._rating(state_a, map_name), self._rating(state_b, map_name)
        rd_a = self._inflated_deviation(state_a, as_of)
        rd_b = self._inflated_deviation(state_b, as_of)
        combined_rd = sqrt(rd_a**2 + rd_b**2)
        attenuation = 1.0 / sqrt(1.0 + 3.0 * (combined_rd / self.config.probability_scale) ** 2 / pi**2)
        probability = 1.0 / (
            1.0 + 10.0 ** (-attenuation * (rating_a - rating_b) / self.config.probability_scale)
        )
        return RatingForecast(_clip_probability(probability), rating_a, rating_b, rd_a, rd_b)

    def update_batch(self, observations: Sequence[EloObservation]) -> None:
        if not observations:
            return
        if len({obs.match_id for obs in observations}) != 1:
            raise ValueError("update_batch accepts exactly one complete match")
        timestamp = _as_utc(observations[0].timestamp)
        forecasts = [
            self.predict(obs.team_a, obs.team_b, obs.map_name, timestamp)
            for obs in observations
        ]
        rating_delta: dict[int | str, float] = defaultdict(float)
        map_delta: dict[tuple[int | str, str], float] = defaultdict(float)
        information: dict[int | str, float] = defaultdict(float)
        for obs, pred in zip(observations, forecasts, strict=True):
            residual = obs.team_a_won - pred.probability
            variance = max(0.02, pred.probability * (1.0 - pred.probability))
            step = 32.0 * residual / sqrt(variance / 0.25)
            rating_delta[obs.team_a] += step
            rating_delta[obs.team_b] -= step
            map_delta[(obs.team_a, obs.map_name)] += step * self.config.map_pooling
            map_delta[(obs.team_b, obs.map_name)] -= step * self.config.map_pooling
            information[obs.team_a] += variance
            information[obs.team_b] += variance

        teams = {obs.team_a for obs in observations} | {obs.team_b for obs in observations}
        for team in teams:
            state = self._state(team).clone()
            prior_rd = self._inflated_deviation(state, timestamp)
            state.rating += rating_delta[team]
            for obs in observations:
                if team in (obs.team_a, obs.team_b):
                    state.map_offsets[obs.map_name] = (
                        state.map_offsets.get(obs.map_name, 0.0)
                        + map_delta[(team, obs.map_name)]
                    )
            precision = 1.0 / prior_rd**2 + information[team] / 40000.0
            state.deviation = max(self.config.minimum_deviation, 1.0 / sqrt(precision))
            state.last_seen = timestamp
            self._states[team] = state


class ConstantMapPredictor:
    """Online base-rate benchmark with a conjugate Beta prior."""

    def __init__(self, alpha: float = 1.0, beta: float = 1.0) -> None:
        self.alpha = float(alpha)
        self.beta = float(beta)

    def predict(
        self,
        team_a: int | str,
        team_b: int | str,
        map_name: str,
        as_of: datetime,
    ) -> RatingForecast:
        probability = self.alpha / (self.alpha + self.beta)
        return RatingForecast(probability, 0.0, 0.0, float("inf"), float("inf"))

    def update_batch(self, observations: Sequence[EloObservation]) -> None:
        self.alpha += sum(obs.team_a_won for obs in observations)
        self.beta += sum(1 - obs.team_a_won for obs in observations)


def carryover_search_space() -> list[EloConfig]:
    """Small, auditable grid intended for rolling development folds only."""

    candidates: list[EloConfig] = []
    for k_factor in (32.0, 50.0, 74.0, 96.0):
        for scale in (400.0, 700.0, 1000.0):
            for carryover in (0.5, 0.7, 0.85):
                for half_life in (180.0, 360.0, 720.0):
                    for global_weight in (0.35, 0.65, 0.85):
                        for margin_power in (0.5, 1.0):
                            for uncertainty_weight in (0.0, 0.25):
                                candidates.append(
                                    EloConfig(
                                        k_factor=k_factor,
                                        probability_scale=scale,
                                        offseason_regression=carryover,
                                        time_decay_half_life_days=half_life,
                                        global_weight=global_weight,
                                        map_update_weight=0.55,
                                        margin_power=margin_power,
                                        uncertainty_probability_weight=uncertainty_weight,
                                    )
                                )
    return candidates


def map_readiness_search_space(promoted_carryover: EloConfig) -> list[MapReadinessConfig]:
    """Auditable Workstream-C grid with the promoted global pathway frozen."""

    candidates: list[MapReadinessConfig] = []
    global_weights = tuple(dict.fromkeys((promoted_carryover.global_weight, 0.95, 1.0)))
    for global_weight in global_weights:
        carryover = replace(promoted_carryover, global_weight=global_weight)
        for half_life in (21.0, 45.0, 90.0):
            for k_factor in (8.0, 16.0, 32.0):
                for patch_retention in (0.1, 0.25, 0.5):
                    candidates.append(
                        MapReadinessConfig(
                            carryover=carryover,
                            readiness_half_life_days=half_life,
                            readiness_k_factor=k_factor,
                            patch_retention=patch_retention,
                        )
                    )
    return candidates


__all__ = [
    "ConstantMapPredictor",
    "EloConfig",
    "EloModel",
    "EloObservation",
    "EloRatingComponents",
    "GlickoConfig",
    "GlickoLikeModel",
    "MapRatingComponents",
    "MapReadinessConfig",
    "MapReadinessEloModel",
    "MapReadinessState",
    "MapResetSchedule",
    "RatingForecast",
    "SequentialTeamRating",
    "carryover_search_space",
    "map_readiness_search_space",
]
