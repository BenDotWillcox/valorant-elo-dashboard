from __future__ import annotations

import pandas as pd

from valorant_ratings.elo import EloConfig
from valorant_ratings.series_evaluation import run_series_veto_development
from valorant_ratings.series_evaluation import shared_latent_series_probability


def test_shared_latent_series_probability_is_symmetric_and_bounded() -> None:
    assert abs(shared_latent_series_probability([0.5, 0.5, 0.5], 3) - 0.5) < 1e-10
    strong = shared_latent_series_probability([0.7, 0.7, 0.7], 3)
    assert 0.5 < strong < 1.0


def _series_rows(match_id: int, timestamp: str) -> list[dict[str, object]]:
    return [
        {
            "map_id": match_id * 10 + game_number,
            "match_id": match_id,
            "game_number": game_number,
            "map_name": map_name,
            "team1_id": 1,
            "team2_id": 2,
            "winner_team_id": 1 if game_number < 3 else 2,
            "winner_rounds": 13,
            "loser_rounds": 8,
            "prediction_cutoff": timestamp,
            "best_of": 3,
            "event_name": "test-event",
        }
        for game_number, map_name in enumerate(("Haven", "Ascent", "Bind"), start=1)
    ]


def _veto_rows(match_id: int) -> list[dict[str, object]]:
    actions = (
        (0, "ban", "Icebox", 1),
        (1, "ban", "Lotus", 2),
        (2, "pick", "Haven", 1),
        (3, "pick", "Ascent", 2),
        (4, "ban", "Sunset", 1),
        (5, "ban", "Split", 2),
        (6, "decider", "Bind", None),
    )
    return [
        {
            "veto_id": match_id * 10 + order,
            "match_id": match_id,
            "order_index": order,
            "action": action,
            "map_name": map_name,
            "team_id": team_id,
            "resulted_game_number": None,
        }
        for order, action, map_name, team_id in actions
    ]


def test_veto_development_emits_per_action_step_and_series_comparators() -> None:
    maps = pd.DataFrame(
        [
            *_series_rows(1, "2023-06-01T12:00:00Z"),
            *_series_rows(2, "2024-02-01T12:00:00Z"),
        ]
    )
    vetoes = pd.DataFrame([*_veto_rows(1), *_veto_rows(2)])
    result = run_series_veto_development(
        maps,
        vetoes,
        EloConfig(),
        simulation_draws_per_match=2,
    )
    assert len(result.veto_predictions) == 6
    assert set(result.veto_metrics["model"]) == {
        "conditional_logit_veto",
        "sequential_pooled_veto",
        "uniform_legal_choice",
    }
    assert set(result.series_metrics["model"]) == {
        "carryover_veto_blind",
        "carryover_pre_veto",
        "carryover_post_veto",
    }
    assert set(result.veto_step_metrics["step_index"]) == {0, 1, 2, 3, 4, 5}
    assert {"fold_cutoff", "team_id", "map_name", "veto_skill_utility"}.issubset(
        result.map_utilities.columns
    )
