from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from valorant_ratings.elo import EloConfig, EloModel, MapResetSchedule
from valorant_ratings.evaluation import (
    FINAL_CONFIRMATION_TOKEN,
    RollingOOFEvaluator,
    evaluate_map_form_episodes,
    paired_log_loss_bootstrap,
    run_final_confirmation,
    run_map_readiness_confirmation,
    run_map_readiness_development,
    run_rolling_development,
    split_development_lockbox,
    within_series_map_ordering_bootstrap,
)


UTC = timezone.utc


def map_row(
    match_id: int,
    game_number: int,
    timestamp: str,
    team1: int,
    team2: int,
    team1_win: int,
    map_name: str,
) -> dict[str, object]:
    winner = team1 if team1_win else team2
    loser = team2 if team1_win else team1
    return {
        "match_id": match_id,
        "game_number": game_number,
        "series_anchor_at": timestamp,
        "map_name": map_name,
        "team1_id": team1,
        "team2_id": team2,
        "team1_win": team1_win,
        "winner_team_id": winner,
        "loser_team_id": loser,
        "winner_rounds": 13,
        "loser_rounds": 7,
        "event_id": "event-a",
    }


def test_entire_series_and_shared_timestamp_are_predicted_before_updates() -> None:
    frame = pd.DataFrame(
        [
            map_row(1, 1, "2024-01-01T12:00:00Z", 1, 2, 1, "Haven"),
            map_row(1, 2, "2024-01-01T12:00:00Z", 1, 2, 1, "Ascent"),
            map_row(2, 1, "2024-01-01T12:00:00Z", 1, 2, 1, "Bind"),
            map_row(3, 1, "2024-01-02T12:00:00Z", 1, 2, 1, "Haven"),
        ]
    )
    model = EloModel(
        EloConfig(global_weight=1.0, offseason_regression=1.0, time_decay_half_life_days=None)
    )
    predictions = RollingOOFEvaluator(model, prediction_start_year=2024).run(frame)
    assert predictions.loc[predictions["match_id"].isin([1, 2]), "probability"].tolist() == [
        0.5,
        0.5,
        0.5,
    ]
    assert predictions.loc[predictions["match_id"] == 3, "probability"].iloc[0] > 0.5


def test_2026_lockbox_requires_explicit_one_time_confirmation() -> None:
    frame = pd.DataFrame(
        [
            map_row(1, 1, "2025-01-01T12:00:00Z", 1, 2, 1, "Haven"),
            map_row(2, 1, "2026-01-01T12:00:00Z", 1, 2, 0, "Haven"),
        ]
    )
    development, lockbox = split_development_lockbox(frame)
    assert len(development) == 1
    assert lockbox.row_count == 1
    with pytest.raises(PermissionError):
        lockbox.open_for_final_confirmation("not-confirmed")
    opened = lockbox.open_for_final_confirmation(FINAL_CONFIRMATION_TOKEN)
    assert len(opened) == 1
    with pytest.raises(RuntimeError):
        lockbox.open_for_final_confirmation(FINAL_CONFIRMATION_TOKEN)


def test_paired_match_cluster_bootstrap_detects_better_predictions() -> None:
    frame = pd.DataFrame(
        {
            "match_id": np.repeat(np.arange(40), 2),
            "team_a_won": np.tile([1, 0], 40),
            "candidate": np.tile([0.8, 0.2], 40),
            "baseline": 0.5,
        }
    )
    result = paired_log_loss_bootstrap(
        frame, "candidate", "baseline", resamples=300, seed=8
    )
    assert result.mean_difference < 0
    assert result.upper < 0


def test_within_series_map_ordering_uses_match_clustered_intervals() -> None:
    rows: list[dict[str, object]] = []
    for match_id in range(40):
        rows.extend(
            [
                {
                    "match_id": match_id,
                    "team_a": 1,
                    "team_b": 2,
                    "team_a_won": 1,
                    "candidate_probability": 0.8,
                    "baseline_probability": 0.5,
                },
                {
                    "match_id": match_id,
                    "team_a": 1,
                    "team_b": 2,
                    "team_a_won": 0,
                    "candidate_probability": 0.2,
                    "baseline_probability": 0.5,
                },
            ]
        )
    result = within_series_map_ordering_bootstrap(
        pd.DataFrame(rows),
        "candidate_probability",
        "baseline_probability",
        resamples=300,
        seed=4,
    )
    assert result.multimap_series == 40
    assert result.comparable_series == 40
    assert result.candidate_accuracy == 1.0
    assert result.baseline_accuracy == 0.5
    assert result.paired_difference.lower > 0
    assert result.paired_difference.unit == "match_id"


def test_predeclared_episode_diagnostic_reports_readiness_sign() -> None:
    predictions = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                ["2025-04-01T12:00:00Z", "2025-04-02T12:00:00Z"]
            ),
            "map_name": ["Haven", "Haven"],
            "team_a": [1, 1],
            "team_b": [2, 2],
            "map_readiness_team_a_readiness": [4.0, 2.0],
            "map_readiness_team_b_readiness": [-3.0, -1.0],
        }
    )
    episodes = [
        {
            "episode_id": "positive-case",
            "team": 1,
            "map": "Haven",
            "start": "2025-04-01T00:00:00Z",
            "end": "2025-04-03T00:00:00Z",
            "direction": "positive",
        },
        {
            "episode_id": "negative-case",
            "team": 2,
            "map": "Haven",
            "start": "2025-04-01T00:00:00Z",
            "end": "2025-04-03T00:00:00Z",
            "direction": "negative",
        },
    ]
    result = evaluate_map_form_episodes(predictions, episodes)
    assert result["declared_sign_met"].tolist() == [True, True]
    assert result["sign_agreement_rate"].tolist() == [1.0, 1.0]


def test_stable_development_entry_point_never_opens_2026() -> None:
    rows: list[dict[str, object]] = []
    match_id = 0
    for year in (2023, 2024, 2025, 2026):
        for month in range(1, 7):
            match_id += 1
            rows.append(
                map_row(
                    match_id,
                    1,
                    f"{year}-{month:02d}-01T12:00:00Z",
                    1 if month % 2 else 2,
                    2 if month % 2 else 1,
                    month % 2,
                    "Haven" if month % 2 else "Ascent",
                )
            )
    predictions, result = run_rolling_development(
        pd.DataFrame(rows),
        max_carryover_configs=2,
        bootstrap_resamples=50,
        seed=3,
    )
    assert set(predictions["timestamp"].dt.year) == {2024, 2025}
    assert result.lockbox.row_count == 6
    assert not result.lockbox.is_open
    assert "map_log_loss" in result.metrics

    final_predictions, final_result = run_final_confirmation(
        pd.DataFrame(rows),
        result,
        FINAL_CONFIRMATION_TOKEN,
        bootstrap_resamples=30,
        seed=3,
    )
    assert len(final_predictions) == 6
    assert set(final_predictions["timestamp"].dt.year) == {2026}
    assert "map_log_loss" in final_result.metrics
    assert result.lockbox.is_open
    with pytest.raises(RuntimeError):
        run_final_confirmation(
            pd.DataFrame(rows),
            result,
            FINAL_CONFIRMATION_TOKEN,
            bootstrap_resamples=10,
            seed=3,
        )


def test_map_readiness_experiment_uses_same_sealed_protocol() -> None:
    rows: list[dict[str, object]] = []
    match_id = 0
    for year in (2023, 2024, 2025, 2026):
        for month in range(1, 7):
            match_id += 1
            rows.append(
                map_row(
                    match_id,
                    1,
                    f"{year}-{month:02d}-01T12:00:00Z",
                    1,
                    2,
                    month % 2,
                    "Haven" if month % 2 else "Ascent",
                )
            )
    promoted = EloConfig(
        k_factor=32.0,
        global_weight=0.85,
        offseason_regression=0.7,
        time_decay_half_life_days=360.0,
        uncertainty_probability_weight=0.25,
    )
    predictions, result = run_map_readiness_development(
        pd.DataFrame(rows),
        promoted,
        reset_schedule=MapResetSchedule(),
        max_configs=2,
        bootstrap_resamples=30,
        seed=9,
    )
    assert set(predictions["timestamp"].dt.year) == {2024, 2025}
    assert "map_readiness_probability" in predictions
    assert len(result.search_results) == 2
    assert result.lockbox.row_count == 6
    assert not result.lockbox.is_open

    final_predictions, final_result = run_map_readiness_confirmation(
        pd.DataFrame(rows),
        result,
        FINAL_CONFIRMATION_TOKEN,
        bootstrap_resamples=20,
        seed=9,
    )
    assert set(final_predictions["timestamp"].dt.year) == {2026}
    assert final_result.promotion_gate.final_holdout_pass is not None
    assert result.lockbox.is_open
