from __future__ import annotations

import pandas as pd

from valorant_ratings.natural_experiments import teammate_agent_swap_pairs


def test_swap_pair_requires_exactly_one_teammate_agent_change() -> None:
    rows = []
    for map_id, agents in ((1, ["A", "B", "C", "D", "E"]), (2, ["A", "F", "C", "D", "E"])):
        for player, agent in enumerate(agents, start=1):
            rows.append(
                {
                    "map_id": map_id,
                    "match_id": map_id,
                    "team_id": 10,
                    "player_id": player,
                    "map_name": "Haven",
                    "agent": agent,
                    "prediction_cutoff": pd.Timestamp(f"2024-01-0{map_id}T00:00:00Z"),
                    "rounds_played": 24,
                    "kills": 20 + map_id,
                    "deaths": 15,
                    "assists": 5,
                    "normalized_team_round_margin": 0.1 * map_id,
                }
            )
    pairs = teammate_agent_swap_pairs(pd.DataFrame(rows))
    focal = pairs.loc[pairs["focal_player_id"] == 1]
    assert len(focal) == 1
    assert focal.iloc[0]["teammate_player_id"] == 2
    assert focal.iloc[0]["interpretation"] == "associational; not causal"
