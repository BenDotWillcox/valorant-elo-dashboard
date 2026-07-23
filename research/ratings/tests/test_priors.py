from __future__ import annotations

import pandas as pd

from valorant_ratings.priors import build_asof_player_priors
from valorant_ratings.rosters import build_observed_roster_history
from valorant_ratings.synthetic import generate_synthetic_player_data


def test_team_player_priors_never_use_eventual_same_match_lineup() -> None:
    synthetic = generate_synthetic_player_data(
        n_teams=2, players_per_team=5, n_maps=120, random_state=91
    ).frame
    synthetic = synthetic.rename(columns={"timestamp": "prediction_cutoff"})
    synthetic["team1_id"] = synthetic.groupby("map_id")["team_id"].transform("min")
    synthetic["team2_id"] = synthetic.groupby("map_id")["team_id"].transform("max")
    maps = synthetic[
        ["match_id", "prediction_cutoff", "team1_id", "team2_id"]
    ].drop_duplicates("match_id")
    rosters = build_observed_roster_history(synthetic, inactivity_days=1000)
    cutoffs = [pd.Timestamp("2024-01-01T00:00:00Z")]
    # Synthetic dates start in 2023; move a validation match into 2024 while
    # retaining 2023 history for training and roster availability.
    validation_match = maps.iloc[-1]["match_id"]
    maps.loc[maps["match_id"] == validation_match, "prediction_cutoff"] = pd.Timestamp(
        "2024-01-15T00:00:00Z"
    )
    priors = build_asof_player_priors(synthetic, maps, rosters, cutoffs=cutoffs)
    assert not priors.empty
    match_cutoff = maps.set_index("match_id")["prediction_cutoff"]
    assert (
        pd.to_datetime(priors["roster_availability_at"], utc=True)
        < priors["match_id"].map(match_cutoff)
    ).all()
