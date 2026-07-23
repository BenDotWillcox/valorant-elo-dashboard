"""Canonical orientations and labels shared by player and team research."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd


def orient_maps_team1(maps: pd.DataFrame) -> pd.DataFrame:
    """Orient one canonical map row to the match table's team1/team2 order."""

    required = {
        "map_id",
        "match_id",
        "map_name",
        "team1_id",
        "team2_id",
        "winner_team_id",
        "winner_rounds",
        "loser_rounds",
        "prediction_cutoff",
    }
    missing = required.difference(maps.columns)
    if missing:
        raise ValueError(f"canonical maps missing columns: {sorted(missing)}")
    result = maps.copy()
    team1_won = result["winner_team_id"] == result["team1_id"]
    result["team_a"] = result["team1_id"]
    result["team_b"] = result["team2_id"]
    result["team_a_won"] = team1_won.astype("int8")
    result["team_a_rounds"] = np.where(team1_won, result["winner_rounds"], result["loser_rounds"])
    result["team_b_rounds"] = np.where(team1_won, result["loser_rounds"], result["winner_rounds"])
    result["round_margin"] = result["team_a_rounds"] - result["team_b_rounds"]
    denominator = result["team_a_rounds"] + result["team_b_rounds"]
    if (denominator <= 0).any():
        raise ValueError("every map must contain at least one played round")
    result["normalized_round_margin"] = result["round_margin"] / denominator
    result["timestamp"] = pd.to_datetime(result["prediction_cutoff"], utc=True)
    return result


def enrich_player_labels(player_maps: pd.DataFrame, maps: pd.DataFrame) -> pd.DataFrame:
    """Attach labels and context without turning same-map outcomes into features."""

    oriented = orient_maps_team1(maps)
    columns = [
        "map_id",
        "team_a",
        "team_b",
        "team_a_won",
        "team_a_rounds",
        "team_b_rounds",
        "normalized_round_margin",
        "event_name",
        "stage",
        "timestamp",
    ]
    columns = [column for column in columns if column in oriented]
    result = player_maps.merge(oriented[columns], on="map_id", how="left", validate="many_to_one")
    if result["team_a"].isna().any():
        raise ValueError("player rows reference an unknown canonical map")
    is_a = result["team_id"] == result["team_a"]
    is_b = result["team_id"] == result["team_b"]
    if not (is_a | is_b).all():
        raise ValueError("player team is neither canonical map participant")
    result["opponent_team_id"] = np.where(is_a, result["team_b"], result["team_a"])
    result["map_win"] = np.where(is_a, result["team_a_won"], 1 - result["team_a_won"]).astype("int8")
    result["team_round_margin"] = np.where(
        is_a,
        result["normalized_round_margin"],
        -result["normalized_round_margin"],
    )
    result["event_context"] = list(
        zip(
            result.get("event_name", pd.Series("unknown", index=result.index)).fillna("unknown"),
            result.get("stage", pd.Series("unknown", index=result.index)).fillna("unknown"),
        )
    )
    return result


def add_next_team_result_target(player_maps: pd.DataFrame) -> pd.DataFrame:
    """Add a genuinely future team-match target for Predictive Box VPM.

    The canonical target is the same team's next match-average normalized round
    margin; it is not conditioned on retaining the same five-player lineup.
    ``next_lineup_round_margin`` is retained as a compatibility alias for v1
    artifacts.  Both are labels, never prediction-time features, and both the
    source row and ``target_observed_at`` must be inside the training or
    validation side of a rolling fold.  When ``match_completed_at`` is
    available it is the label-availability timestamp; ``timestamp`` is used
    only for legacy or synthetic frames that do not carry completion times.
    """

    margin_column = next(
        (
            name
            for name in ("normalized_team_round_margin", "team_round_margin")
            if name in player_maps.columns
        ),
        None,
    )
    required = {"team_id", "match_id", "map_id", "timestamp"}
    missing = required.difference(player_maps.columns)
    if margin_column is None:
        missing.add("normalized_team_round_margin")
    if missing:
        raise ValueError(f"future target requires columns: {sorted(missing)}")
    result = player_maps.copy()
    observation_column = (
        "match_completed_at" if "match_completed_at" in result else "timestamp"
    )
    result["_target_source_observed_at"] = pd.to_datetime(
        result[observation_column], utc=True, errors="coerce"
    )
    team_matches = (
        result[
            [
                "team_id",
                "match_id",
                "map_id",
                "timestamp",
                margin_column,
                "_target_source_observed_at",
            ]
        ]
        .drop_duplicates(["team_id", "map_id"])
        .groupby(["team_id", "match_id", "timestamp"], as_index=False)
        .agg(
            team_match_normalized_round_margin=(margin_column, "mean"),
            team_match_observed_at=("_target_source_observed_at", "max"),
        )
        .sort_values(["team_id", "timestamp", "match_id"], kind="stable")
    )
    team_matches["next_team_match_normalized_round_margin"] = team_matches.groupby(
        "team_id"
    )["team_match_normalized_round_margin"].shift(-1)
    team_matches["next_lineup_round_margin"] = team_matches[
        "next_team_match_normalized_round_margin"
    ]
    team_matches["target_observed_at"] = team_matches.groupby("team_id")[
        "team_match_observed_at"
    ].shift(-1)
    result = result.merge(
        team_matches[
            [
                "team_id",
                "match_id",
                "next_team_match_normalized_round_margin",
                "next_lineup_round_margin",
                "target_observed_at",
            ]
        ],
        on=["team_id", "match_id"],
        how="left",
        validate="many_to_one",
    )
    return result


def development_cutoffs(
    maps: pd.DataFrame,
    *,
    frequency: str = "QS",
    years: Iterable[int] = (2024, 2025),
) -> list[pd.Timestamp]:
    timestamps = pd.to_datetime(maps["prediction_cutoff"], utc=True)
    allowed = timestamps[timestamps.dt.year.isin(tuple(years))]
    if allowed.empty:
        return []
    starts = pd.date_range(allowed.min().floor("D"), allowed.max().ceil("D"), freq=frequency, tz="UTC")
    return [cutoff for cutoff in starts if cutoff.year in set(years)]
