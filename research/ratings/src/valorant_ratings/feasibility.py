"""Data-expansion gates for Tier 2 and round/economy research."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable, Mapping


ROUND_LEVEL_REQUIREMENTS: Mapping[str, frozenset[str]] = {
    "round_identity": frozenset({"match_id", "map_id", "round_number", "round_winner"}),
    "starting_side": frozenset({"attacking_team_id", "defending_team_id"}),
    "economy": frozenset({"player_id", "credits", "weapon", "armor"}),
    "round_state": frozenset({"is_pistol", "is_bonus", "is_eco"}),
    "ultimate_state": frozenset({"player_id", "ultimate_points", "ultimate_ready"}),
    "objective": frozenset({"spike_planted", "plant_site"}),
    "utility": frozenset({"player_id", "ability", "ability_event"}),
    "trades": frozenset({"killer_id", "victim_id", "traded_player_id"}),
}


@dataclass(frozen=True, slots=True)
class CapabilityAssessment:
    capability: str
    available: bool
    required_columns: tuple[str, ...]
    missing_columns: tuple[str, ...]
    pre_match_use: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def assess_round_level_columns(columns: Iterable[str]) -> list[CapabilityAssessment]:
    available_columns = {column.casefold() for column in columns}
    result: list[CapabilityAssessment] = []
    for capability, required in ROUND_LEVEL_REQUIREMENTS.items():
        missing = tuple(sorted(required - available_columns))
        if capability in {"economy", "ultimate_state", "round_state"}:
            use = (
                "historical conversion skill only; realized future state is endogenous "
                "and unavailable before a match"
            )
        else:
            use = "historical attribution/skill feature after strict as-of aggregation"
        result.append(
            CapabilityAssessment(
                capability=capability,
                available=not missing,
                required_columns=tuple(sorted(required)),
                missing_columns=missing,
                pre_match_use=use,
            )
        )
    return result


def expansion_decision(
    *,
    vct_rows: int,
    tier2_rows: int,
    tier2_schema_compatible: bool,
    round_columns: Iterable[str] = (),
) -> dict[str, object]:
    assessments = assess_round_level_columns(round_columns)
    complete_round_groups = sum(item.available for item in assessments)
    return {
        "vct_benchmark_ready": vct_rows > 0,
        "tier2_ready": tier2_rows > 0 and tier2_schema_compatible,
        "tier2_gate": (
            "rerun identical VCT holdouts and retain only if transfer/debut/new-agent metrics improve"
        ),
        "round_level_ready": complete_round_groups == len(assessments),
        "round_level_complete_groups": complete_round_groups,
        "round_level_total_groups": len(assessments),
        "capabilities": [item.to_dict() for item in assessments],
        "live_forecast_in_scope": False,
    }

