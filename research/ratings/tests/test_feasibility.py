from __future__ import annotations

from valorant_ratings.feasibility import assess_round_level_columns, expansion_decision


def test_map_level_schema_does_not_claim_round_economy_support() -> None:
    assessments = assess_round_level_columns(
        {"match_id", "map_id", "winner_rounds", "loser_rounds", "kills", "agent"}
    )
    assert not any(item.available for item in assessments)
    economy = next(item for item in assessments if item.capability == "economy")
    assert "endogenous" in economy.pre_match_use


def test_tier2_requires_rows_and_schema_compatibility() -> None:
    result = expansion_decision(
        vct_rows=3818,
        tier2_rows=100,
        tier2_schema_compatible=False,
    )
    assert result["vct_benchmark_ready"] is True
    assert result["tier2_ready"] is False
    assert result["live_forecast_in_scope"] is False
