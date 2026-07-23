from __future__ import annotations

import pandas as pd

from valorant_ratings.features import add_next_team_result_target, enrich_player_labels, orient_maps_team1


def _maps() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "map_id": [1, 2],
            "match_id": [10, 11],
            "map_name": ["Haven", "Bind"],
            "team1_id": [100, 100],
            "team2_id": [200, 300],
            "winner_team_id": [200, 100],
            "winner_rounds": [13, 13],
            "loser_rounds": [8, 10],
            "prediction_cutoff": pd.to_datetime(["2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z"]),
            "event_name": ["E1", "E2"],
            "stage": ["group", "playoff"],
        }
    )


def test_canonical_orientation_does_not_mirror_maps() -> None:
    oriented = orient_maps_team1(_maps())
    assert len(oriented) == 2
    assert oriented["team_a_won"].tolist() == [0, 1]
    assert oriented["round_margin"].tolist() == [-5, 3]


def test_player_labels_are_signed_to_player_team_and_future_target_is_shifted() -> None:
    players = pd.DataFrame(
        {
            "map_id": [1, 1, 2],
            "match_id": [10, 10, 11],
            "team_id": [100, 200, 100],
            "player_id": [1, 2, 1],
            "map_name": ["Haven", "Haven", "Bind"],
            "agent": ["Sova", "Omen", "Sova"],
        }
    )
    enriched = enrich_player_labels(players, _maps())
    assert enriched["map_win"].tolist() == [0, 1, 1]
    assert enriched.loc[0, "team_round_margin"] < 0
    with_target = add_next_team_result_target(enriched)
    first = with_target.loc[(with_target.team_id == 100) & (with_target.map_id == 1)].iloc[0]
    assert first["next_lineup_round_margin"] > 0
    assert first["next_team_match_normalized_round_margin"] == first[
        "next_lineup_round_margin"
    ]
    assert first["target_observed_at"] > first["timestamp"]


def test_future_target_uses_match_completion_for_label_availability() -> None:
    enriched = enrich_player_labels(
        pd.DataFrame(
            {
                "map_id": [1, 2],
                "match_id": [10, 11],
                "team_id": [100, 100],
                "player_id": [1, 1],
                "map_name": ["Haven", "Bind"],
                "agent": ["Sova", "Sova"],
            }
        ),
        _maps(),
    )
    enriched["match_completed_at"] = pd.to_datetime(
        ["2024-01-01T03:00:00Z", "2024-02-01T05:00:00Z"]
    )
    with_target = add_next_team_result_target(enriched)
    first = with_target.loc[with_target["match_id"].eq(10)].iloc[0]
    assert first["target_observed_at"] == pd.Timestamp("2024-02-01T05:00:00Z")
