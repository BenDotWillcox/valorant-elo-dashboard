"""Typed, serialization-stable contracts for conditional rating research.

The public application does not import these contracts.  They deliberately use
only the standard library so batch artifacts can be inspected without loading a
modeling environment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from enum import StrEnum
from math import isfinite
from typing import Any, Mapping, Sequence


class ForecastMode(StrEnum):
    STANDARDIZED = "standardized"
    PRE_VETO = "pre-veto"
    POST_VETO = "post-veto"
    SCENARIO = "scenario"


class Support(StrEnum):
    OBSERVED = "observed"
    PARTIALLY_POOLED = "partially-pooled"
    EXTRAPOLATED = "extrapolated"


def canonical_agent_key(value: Any) -> str:
    """Normalize display variants such as ``KAY/O`` and ``kayo`` identically."""

    return "".join(character for character in str(value).casefold() if character.isalnum())


def _utc(value: datetime | date) -> datetime:
    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime.combine(value, time.min)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _finite(value: float, name: str) -> float:
    value = float(value)
    if not isfinite(value):
        raise ValueError(f"{name} must be finite")
    return value


def _interval(value: Sequence[float], name: str) -> tuple[float, float]:
    if len(value) != 2:
        raise ValueError(f"{name} must contain exactly two bounds")
    low, high = (_finite(value[0], name), _finite(value[1], name))
    if low > high:
        raise ValueError(f"{name} lower bound must not exceed upper bound")
    return low, high


@dataclass(frozen=True, slots=True)
class TeammateAssignment:
    player_id: int
    agent: str

    def __post_init__(self) -> None:
        if self.player_id <= 0:
            raise ValueError("player_id must be positive")
        if not self.agent.strip():
            raise ValueError("agent must be non-empty")

    def to_dict(self) -> dict[str, Any]:
        return {"playerId": self.player_id, "agent": self.agent}


@dataclass(frozen=True, slots=True)
class PlayerRatingQuery:
    as_of: datetime | date
    player_id: int
    map_name: str | None = None
    agent: str | None = None
    team_id: int | None = None
    teammate_assignments: tuple[TeammateAssignment, ...] = ()
    opponent_team_id: int | None = None
    forecast_mode: ForecastMode = ForecastMode.STANDARDIZED

    def __post_init__(self) -> None:
        object.__setattr__(self, "as_of", _utc(self.as_of))
        object.__setattr__(self, "forecast_mode", ForecastMode(self.forecast_mode))
        object.__setattr__(self, "teammate_assignments", tuple(self.teammate_assignments))
        if self.player_id <= 0:
            raise ValueError("player_id must be positive")
        if self.team_id is not None and self.team_id <= 0:
            raise ValueError("team_id must be positive")
        if self.opponent_team_id is not None and self.opponent_team_id <= 0:
            raise ValueError("opponent_team_id must be positive")
        player_ids = [assignment.player_id for assignment in self.teammate_assignments]
        agents = [canonical_agent_key(assignment.agent) for assignment in self.teammate_assignments]
        if len(player_ids) != len(set(player_ids)):
            raise ValueError("teammate assignments must have unique player ids")
        if len(agents) != len(set(agents)):
            raise ValueError("a legal composition cannot contain duplicate agents")

    def to_dict(self) -> dict[str, Any]:
        return {
            "asOf": self.as_of.isoformat(),
            "playerId": self.player_id,
            "mapName": self.map_name,
            "agent": self.agent,
            "teamId": self.team_id,
            "teammateAssignments": [item.to_dict() for item in self.teammate_assignments],
            "opponentTeamId": self.opponent_team_id,
            "forecastMode": self.forecast_mode.value,
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "PlayerRatingQuery":
        assignments = tuple(
            TeammateAssignment(player_id=int(item["playerId"]), agent=str(item["agent"]))
            for item in value.get("teammateAssignments", ())
        )
        return cls(
            as_of=datetime.fromisoformat(str(value["asOf"]).replace("Z", "+00:00")),
            player_id=int(value["playerId"]),
            map_name=value.get("mapName"),
            agent=value.get("agent"),
            team_id=value.get("teamId"),
            teammate_assignments=assignments,
            opponent_team_id=value.get("opponentTeamId"),
            forecast_mode=ForecastMode(value.get("forecastMode", "standardized")),
        )


@dataclass(frozen=True, slots=True)
class ConditionalRating:
    performance_mean: float
    contribution_mean: float
    standard_deviation: float
    interval80: tuple[float, float]
    interval95: tuple[float, float]
    support: Support
    decomposition: Mapping[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "performance_mean", _finite(self.performance_mean, "performance_mean"))
        object.__setattr__(self, "contribution_mean", _finite(self.contribution_mean, "contribution_mean"))
        object.__setattr__(self, "standard_deviation", _finite(self.standard_deviation, "standard_deviation"))
        object.__setattr__(self, "interval80", _interval(self.interval80, "interval80"))
        object.__setattr__(self, "interval95", _interval(self.interval95, "interval95"))
        object.__setattr__(self, "support", Support(self.support))
        if self.standard_deviation < 0:
            raise ValueError("standard_deviation must be non-negative")
        if not (
            self.interval95[0] <= self.interval80[0]
            and self.interval80[1] <= self.interval95[1]
        ):
            raise ValueError("interval95 must contain interval80")
        cleaned = {str(key): _finite(value, f"decomposition[{key}]") for key, value in self.decomposition.items()}
        object.__setattr__(self, "decomposition", cleaned)

    def to_dict(self) -> dict[str, Any]:
        return {
            "performanceMean": self.performance_mean,
            "contributionMean": self.contribution_mean,
            "standardDeviation": self.standard_deviation,
            "interval80": list(self.interval80),
            "interval95": list(self.interval95),
            "support": self.support.value,
            "decomposition": dict(self.decomposition),
        }


@dataclass(frozen=True, slots=True)
class ScenarioComparison:
    baseline: ConditionalRating
    alternative: ConditionalRating
    performance_delta: float
    contribution_delta: float
    team_win_probability_delta: float
    uncertainty_of_delta: float

    def __post_init__(self) -> None:
        for name in (
            "performance_delta",
            "contribution_delta",
            "team_win_probability_delta",
            "uncertainty_of_delta",
        ):
            object.__setattr__(self, name, _finite(getattr(self, name), name))
        if self.uncertainty_of_delta < 0:
            raise ValueError("uncertainty_of_delta must be non-negative")
        if not -1.0 <= self.team_win_probability_delta <= 1.0:
            raise ValueError("team_win_probability_delta must be between -1 and 1")

    def to_dict(self) -> dict[str, Any]:
        return {
            "baseline": self.baseline.to_dict(),
            "alternative": self.alternative.to_dict(),
            "performanceDelta": self.performance_delta,
            "contributionDelta": self.contribution_delta,
            "teamWinProbabilityDelta": self.team_win_probability_delta,
            "uncertaintyOfDelta": self.uncertainty_of_delta,
        }
