"""Associational repeated-lineup analysis for one teammate-agent changes."""

from __future__ import annotations

from math import sqrt

import numpy as np
import pandas as pd


def teammate_agent_swap_pairs(player_maps: pd.DataFrame) -> pd.DataFrame:
    """Pair repeated contexts where exactly one teammate changes agent.

    This is a descriptive natural-experiment screen, not causal validation.
    The focal player, focal agent, team, map, and five player identities are
    held fixed; unobserved strategy/opponent/meta differences remain.
    """

    frame = player_maps.copy()
    frame["timestamp"] = pd.to_datetime(frame["prediction_cutoff"], utc=True)
    rounds = frame["rounds_played"].clip(lower=1)
    frame["performance_index"] = 24.0 * (
        (frame["kills"] - frame["deaths"] + 0.45 * frame["assists"]) / rounds
    )
    contexts: list[dict[str, object]] = []
    for (map_id, team_id), group in frame.groupby(["map_id", "team_id"], sort=False):
        if len(group) != 5:
            continue
        assignment = {int(row.player_id): str(row.agent) for row in group.itertuples(index=False)}
        roster = tuple(sorted(assignment))
        for row in group.itertuples(index=False):
            contexts.append(
                {
                    "map_id": map_id,
                    "match_id": row.match_id,
                    "timestamp": row.timestamp,
                    "team_id": int(team_id),
                    "map_name": str(row.map_name),
                    "focal_player_id": int(row.player_id),
                    "focal_agent": str(row.agent),
                    "roster_key": roster,
                    "assignment": assignment,
                    "focal_performance": float(row.performance_index),
                    "team_round_margin": float(row.normalized_team_round_margin),
                }
            )
    context = pd.DataFrame(contexts)
    if context.empty:
        return context
    pairs: list[dict[str, object]] = []
    keys = ["focal_player_id", "team_id", "map_name", "focal_agent", "roster_key"]
    for _, group in context.sort_values("timestamp").groupby(keys, sort=False):
        rows = list(group.itertuples(index=False))
        for baseline, alternative in zip(rows, rows[1:], strict=False):
            changed = [
                player
                for player in baseline.roster_key
                if player != baseline.focal_player_id
                and baseline.assignment[player] != alternative.assignment[player]
            ]
            if len(changed) != 1:
                continue
            teammate = changed[0]
            pairs.append(
                {
                    "focal_player_id": baseline.focal_player_id,
                    "team_id": baseline.team_id,
                    "map_name": baseline.map_name,
                    "focal_agent": baseline.focal_agent,
                    "teammate_player_id": teammate,
                    "baseline_teammate_agent": baseline.assignment[teammate],
                    "alternative_teammate_agent": alternative.assignment[teammate],
                    "baseline_match_id": baseline.match_id,
                    "alternative_match_id": alternative.match_id,
                    "days_between": (
                        alternative.timestamp - baseline.timestamp
                    ).total_seconds()
                    / 86_400.0,
                    "focal_performance_delta": (
                        alternative.focal_performance - baseline.focal_performance
                    ),
                    "team_round_margin_delta": (
                        alternative.team_round_margin - baseline.team_round_margin
                    ),
                    "interpretation": "associational; not causal",
                }
            )
    return pd.DataFrame(pairs)


def summarize_swap_pairs(pairs: pd.DataFrame, minimum_pairs: int = 3) -> pd.DataFrame:
    if pairs.empty:
        return pd.DataFrame()
    grouped = (
        pairs.groupby(
            ["map_name", "baseline_teammate_agent", "alternative_teammate_agent"],
            as_index=False,
        )
        .agg(
            pairs=("focal_performance_delta", "size"),
            players=("focal_player_id", "nunique"),
            mean_focal_performance_delta=("focal_performance_delta", "mean"),
            sd_focal_performance_delta=("focal_performance_delta", "std"),
            mean_team_round_margin_delta=("team_round_margin_delta", "mean"),
        )
    )
    grouped = grouped.loc[grouped["pairs"] >= minimum_pairs].copy()
    grouped["standard_error"] = grouped["sd_focal_performance_delta"].fillna(0.0) / np.sqrt(
        grouped["pairs"]
    )
    grouped["interval95_low"] = (
        grouped["mean_focal_performance_delta"] - 1.96 * grouped["standard_error"]
    )
    grouped["interval95_high"] = (
        grouped["mean_focal_performance_delta"] + 1.96 * grouped["standard_error"]
    )
    grouped["interpretation"] = "associational; not causal"
    return grouped.sort_values(["pairs", "players"], ascending=False, kind="stable")


__all__ = ["summarize_swap_pairs", "teammate_agent_swap_pairs"]
