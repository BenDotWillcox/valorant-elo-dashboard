"""Strictly as-of player priors for the team-rating backbone."""

from __future__ import annotations

from typing import Sequence

import pandas as pd

from .player import HierarchicalPlayerModel
from .rosters import roster_as_of


def build_asof_player_priors(
    player_maps: pd.DataFrame,
    maps: pd.DataFrame,
    roster_history: pd.DataFrame,
    *,
    cutoffs: Sequence[pd.Timestamp] | None = None,
    development_end: pd.Timestamp = pd.Timestamp("2026-01-01T00:00:00Z"),
    max_roster_size: int = 5,
) -> pd.DataFrame:
    """Build neutral-context portable player priors without eventual lineups.

    Models refit quarterly. For each target match, only roster facts whose
    ``availability_at`` is strictly earlier than that match are eligible. The
    query deliberately uses neutral map/agent placeholders; map and composition
    context is learned by the downstream team/forecast layer rather than by
    leaking the eventually played lineup.
    """

    player_frame = player_maps.copy()
    if "timestamp" not in player_frame:
        player_frame["timestamp"] = pd.to_datetime(player_frame["prediction_cutoff"], utc=True)
    if "team_round_margin" not in player_frame and "normalized_team_round_margin" in player_frame:
        player_frame["team_round_margin"] = player_frame["normalized_team_round_margin"]
    if "map_win" not in player_frame and "team_win" in player_frame:
        player_frame["map_win"] = player_frame["team_win"]

    match_rows = (
        maps[["match_id", "prediction_cutoff", "team1_id", "team2_id"]]
        .drop_duplicates("match_id")
        .assign(prediction_cutoff=lambda frame: pd.to_datetime(frame["prediction_cutoff"], utc=True))
        .sort_values(["prediction_cutoff", "match_id"], kind="stable")
    )
    match_rows = match_rows.loc[
        (match_rows["prediction_cutoff"].dt.year.isin([2024, 2025]))
        & (match_rows["prediction_cutoff"] < development_end)
    ]
    if cutoffs is None:
        cutoffs = tuple(pd.date_range("2024-01-01", "2025-10-01", freq="QS", tz="UTC"))
    boundaries = sorted(pd.Timestamp(value).tz_convert("UTC") for value in cutoffs)
    records: list[dict[str, object]] = []
    for index, cutoff in enumerate(boundaries):
        upper = boundaries[index + 1] if index + 1 < len(boundaries) else development_end
        target_matches = match_rows.loc[
            (match_rows["prediction_cutoff"] >= cutoff)
            & (match_rows["prediction_cutoff"] < upper)
        ]
        if target_matches.empty:
            continue
        model = HierarchicalPlayerModel(
            enabled_terms=("player_state", "region_effect"),
            enable_agent_pairs=False,
            enable_focal_response=False,
            enable_contribution=False,
        ).fit(player_frame, cutoff=cutoff)
        feature_timestamp = model.max_training_timestamp_
        for row in target_matches.itertuples(index=False):
            as_of = pd.Timestamp(row.prediction_cutoff)
            for team_id in (int(row.team1_id), int(row.team2_id)):
                known = roster_as_of(roster_history.copy(), as_of, team_id=team_id)
                if known.empty:
                    continue
                known = known.sort_values(
                    ["availability_at", "confidence", "player_id"],
                    ascending=[False, False, True],
                    kind="stable",
                ).head(max_roster_size)
                for roster_row in known.itertuples(index=False):
                    forecast = model.forecast(
                        {
                            "as_of": as_of,
                            "player_id": int(roster_row.player_id),
                            "team_id": team_id,
                            "map_name": "__NEUTRAL_MAP__",
                            "agent": "__NEUTRAL_AGENT__",
                            "patch": "__AS_OF_PATCH__",
                            "region": "__NEUTRAL_REGION__",
                            "opponent_team_id": "__NEUTRAL_OPPONENT__",
                        }
                    )
                    records.append(
                        {
                            "match_id": int(row.match_id),
                            "team_id": team_id,
                            "player_id": int(roster_row.player_id),
                            "predictive_box_vpm": forecast.performance_mean,
                            "predictive_box_vpm_sd": forecast.standard_deviation,
                            "feature_timestamp": feature_timestamp,
                            "roster_availability_at": roster_row.availability_at,
                            "roster_confidence": float(roster_row.confidence),
                            "support": forecast.support,
                        }
                    )
    result = pd.DataFrame.from_records(records)
    if not result.empty:
        cutoff_by_match = match_rows.set_index("match_id")["prediction_cutoff"]
        prediction = result["match_id"].map(cutoff_by_match)
        if (pd.to_datetime(result["feature_timestamp"], utc=True) >= prediction).any():
            raise AssertionError("player prior model timestamp is not strictly pre-match")
        if (pd.to_datetime(result["roster_availability_at"], utc=True) >= prediction).any():
            raise AssertionError("player prior roster fact is not strictly pre-match")
    return result


__all__ = ["build_asof_player_priors"]
