from __future__ import annotations

from valorant_ratings.reporting import (
    render_map_readiness_report,
    render_model_selection_report,
)


def test_report_leads_with_decision_and_preserves_null_result() -> None:
    report = render_model_selection_report(
        {
            "decision": {
                "promotion_passed": False,
                "rating_backbone": "carryover_elo",
                "forecast_champion": "carryover_elo",
            },
            "map_metrics": [{"model": "carryover_elo", "log_loss": 0.64}],
            "conditional_ablations": [{"ablation": "additive", "mae": 0.12}],
            "conditional_tasks": [{"task": "cold-start", "mae": 0.18}],
            "veto_metrics": [{"metric": "action_log_loss", "value": 0.91}],
            "rating_snapshot_support": [{"support": "observed", "rows": 20}],
            "scenario_summary": [{"change_type": "teammate_agent", "scenarios": 5}],
            "top_field_rankings": [{"rank": 1, "team_id": 12}],
            "player_uncertainty_calibration": [{"scale": 2.5}],
        }
    )
    assert "No complex model cleared" in report.split("## Decision", 1)[0]
    assert "carryover_elo" in report
    assert "predictive associations" in report
    assert "cold-start" in report
    assert "action_log_loss" in report
    assert "teammate_agent" in report
    assert "observed" in report
    assert "team_id" in report
    assert "2.50000" in report


def test_map_readiness_report_keeps_episode_diagnostic_non_gating() -> None:
    report = render_map_readiness_report(
        {
            "decision": {
                "development_pass": False,
                "final_holdout_pass": True,
                "promotion_passed": False,
            },
            "map_metrics": [{"model": "map_readiness", "map_log_loss": 0.67}],
            "map_ordering": [{"accuracy_difference": 0.03}],
            "episode_diagnostics": [],
            "promotion_gates": [{"promoted": False}],
            "limitations": [],
        }
    )
    assert "Retain **carryover**" in report
    assert "No maintainer-supplied episodes" in report
    assert "never a promotion gate" not in report  # no results were available
