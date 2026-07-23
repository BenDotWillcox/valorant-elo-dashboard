from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from valorant_ratings.player import (
    COMPONENTS,
    HierarchicalPlayerModel,
    PredictiveBoxVPM,
    estimate_player_uncertainty_calibration,
    run_player_development,
)
from valorant_ratings.synthetic import generate_synthetic_player_data, recovery_report


@pytest.fixture(scope="module")
def fitted_synthetic():
    synthetic = generate_synthetic_player_data(n_maps=160, random_state=41)
    model = HierarchicalPlayerModel(backfit_iterations=2).fit(synthetic.frame)
    return synthetic, model


def _known_context(synthetic, model):
    row = synthetic.frame.iloc[-1]
    team_map = synthetic.frame.loc[
        (synthetic.frame["map_id"] == row["map_id"])
        & (synthetic.frame["team_id"] == row["team_id"])
    ]
    teammates = [
        {"player_id": int(item.player_id), "agent": item.agent}
        for item in team_map.itertuples(index=False)
        if item.player_id != row["player_id"]
    ]
    return {
        "as_of": model.training_cutoff_,
        "player_id": int(row["player_id"]),
        "team_id": int(row["team_id"]),
        "map_name": row["map_name"],
        "agent": row["agent"],
        "patch": row["patch"],
        "opponent_team_id": int(row["opponent_team_id"]),
        "teammate_assignments": teammates,
    }


def test_component_model_produces_finite_conditional_forecast(fitted_synthetic):
    synthetic, model = fitted_synthetic
    forecast = model.predict(_known_context(synthetic, model))

    assert set(forecast.component_means) == set(COMPONENTS)
    assert all(np.isfinite(value) for value in forecast.component_means.values())
    assert forecast.standard_deviation > 0
    assert forecast.support in {"observed", "partially-pooled", "extrapolated"}
    assert "player_state" in forecast.decomposition
    assert "composition_synergy" in forecast.decomposition


def test_unseen_context_has_more_uncertainty(fitted_synthetic):
    synthetic, model = fitted_synthetic
    known = model.forecast(_known_context(synthetic, model))
    unseen = model.forecast(
        {
            "as_of": model.training_cutoff_,
            "player_id": 999_999,
            "team_id": 999_999,
            "map_name": "Unreleased Synthetic Map",
            "agent": "Unreleased Synthetic Agent",
            "patch": "future",
        }
    )

    assert unseen.support == "extrapolated"
    assert unseen.standard_deviation > known.standard_deviation


def test_agent_names_are_case_insensitive(fitted_synthetic):
    synthetic, model = fitted_synthetic
    context = _known_context(synthetic, model)
    alternate_case = dict(context, agent=str(context["agent"]).swapcase())

    expected = model.forecast(context)
    actual = model.forecast(alternate_case)

    assert actual.performance_mean == pytest.approx(expected.performance_mean, abs=1e-12)
    assert actual.support == expected.support


def test_agent_names_are_punctuation_insensitive(fitted_synthetic):
    synthetic, model = fitted_synthetic
    row = synthetic.frame.loc[synthetic.frame["agent"] == "KAY/O"].iloc[-1]
    context = {
        "as_of": model.training_cutoff_,
        "player_id": int(row["player_id"]),
        "team_id": int(row["team_id"]),
        "map_name": row["map_name"],
        "agent": "KAY/O",
        "patch": row["patch"],
    }

    assert model.forecast(dict(context, agent="kayo")).performance_mean == pytest.approx(
        model.forecast(context).performance_mean,
        abs=1e-12,
    )


def test_fit_is_strictly_cutoff_local_even_when_future_rows_change():
    synthetic = generate_synthetic_player_data(n_maps=70, random_state=5)
    timestamps = sorted(synthetic.frame["timestamp"].unique())
    cutoff = timestamps[50]
    changed = synthetic.frame.copy()
    future = changed["timestamp"] >= cutoff
    changed.loc[future, [*COMPONENTS]] = 10_000.0

    first = HierarchicalPlayerModel(backfit_iterations=1).fit(synthetic.frame, cutoff=cutoff)
    second = HierarchicalPlayerModel(backfit_iterations=1).fit(changed, cutoff=cutoff)
    historical = synthetic.frame.loc[synthetic.frame["timestamp"] < cutoff].iloc[-1]
    context = {
        "as_of": cutoff,
        "player_id": int(historical["player_id"]),
        "team_id": int(historical["team_id"]),
        "map_name": historical["map_name"],
        "agent": historical["agent"],
        "patch": historical["patch"],
    }

    assert first.n_training_rows_ == int((synthetic.frame["timestamp"] < cutoff).sum())
    assert second.forecast(context).performance_mean == pytest.approx(
        first.forecast(context).performance_mean,
        abs=1e-12,
    )


def test_prediction_cutoff_alias_and_synthetic_effect_recovery(fitted_synthetic):
    synthetic, model = fitted_synthetic
    alias_frame = synthetic.frame.rename(columns={"timestamp": "prediction_cutoff"})
    alias_model = HierarchicalPlayerModel(backfit_iterations=1).fit(alias_frame)
    assert alias_model.n_training_rows_ == len(alias_frame)

    recovery = recovery_report(model, synthetic)
    assert recovery["player_rank_correlation"] > 0.55
    assert recovery["map_rank_correlation"] > 0.20


def test_historical_as_of_is_rejected_after_full_fit(fitted_synthetic):
    synthetic, model = fitted_synthetic
    context = _known_context(synthetic, model)
    context["as_of"] = synthetic.frame["timestamp"].min()
    with pytest.raises(ValueError, match="predates fitted cutoff"):
        model.forecast(context)


def test_uncertainty_calibration_uses_latest_development_year() -> None:
    predictions = pd.DataFrame(
        {
            "ablation": ["triple"] * 8,
            "component": ["__box_vpm__"] * 8,
            "fold_cutoff": pd.to_datetime(
                ["2024-01-01"] * 4 + ["2025-01-01"] * 4, utc=True
            ),
            "absolute_error": [0.5, 1.0, 1.5, 2.0, 1.0, 2.0, 3.0, 4.0],
            "standard_deviation": [1.0] * 8,
        }
    )

    calibration = estimate_player_uncertainty_calibration(
        predictions, ablation="triple"
    )

    assert calibration["calibration_year"] == 2025
    assert calibration["calibration_rows"] == 4
    assert calibration["scale"] > 1.0
    assert calibration["scaled_calibration_year_coverage"] >= 0.75


def test_future_normalized_margin_is_transformed_to_rounds_per_24() -> None:
    rows = []
    for team_map in range(24):
        for player in range(5):
            rows.append(
                {
                    "_team_map_key": (team_map,),
                    "next_team_match_normalized_round_margin": (team_map - 12) / 48,
                    **{
                        component: float(team_map + player + index) / 100
                        for index, component in enumerate(COMPONENTS)
                    },
                }
            )
    model = PredictiveBoxVPM(alpha=8.0).fit(
        pd.DataFrame(rows),
        COMPONENTS,
        target_col="next_team_match_normalized_round_margin",
    )

    assert model.target_raw_unit_ == "normalized_round_margin"
    assert model.target_multiplier_ == 24.0
    assert model.output_unit_ == "rounds_per_24"
    assert model.transform_target(0.25) == pytest.approx(6.0)
    assert model.n_training_targets_ == 24


def test_auto_target_prefers_player_team_orientation() -> None:
    rows = []
    for team_map in range(24):
        for player in range(5):
            rows.append(
                {
                    "_team_map_key": (team_map,),
                    "normalized_round_margin": 0.25,
                    "normalized_team_round_margin": -0.25,
                    **{
                        component: float(team_map + player + index) / 100
                        for index, component in enumerate(COMPONENTS)
                    },
                }
            )
    model = PredictiveBoxVPM(alpha=8.0).fit(pd.DataFrame(rows), COMPONENTS)

    assert model.target_col_ == "normalized_team_round_margin"
    assert model.transform_target(-0.25) == pytest.approx(-6.0)


def test_rolling_future_target_requires_observation_timestamp() -> None:
    synthetic = generate_synthetic_player_data(n_maps=40, random_state=23)
    frame = synthetic.frame.copy()
    frame["next_team_match_normalized_round_margin"] = frame[
        "normalized_round_margin"
    ]
    cutoff = pd.Timestamp(frame["timestamp"].quantile(0.75))

    with pytest.raises(ValueError, match="target_observed_at"):
        HierarchicalPlayerModel(backfit_iterations=1).fit(
            frame,
            cutoff=cutoff,
            target_col="next_team_match_normalized_round_margin",
        )


def test_future_label_availability_does_not_hide_observed_components() -> None:
    synthetic = generate_synthetic_player_data(n_maps=80, random_state=17)
    frame = synthetic.frame.copy()
    frame["next_team_match_normalized_round_margin"] = frame[
        "normalized_round_margin"
    ]
    timestamp_ns = pd.to_datetime(frame["timestamp"], utc=True).astype("int64")
    frame["target_observed_at"] = pd.to_datetime(
        timestamp_ns + 10 * 86_400_000_000_000, utc=True
    )
    cutoff = pd.Timestamp(frame["timestamp"].quantile(0.75))
    source_visible = int((frame["timestamp"] < cutoff).sum())
    target_visible = int(
        (
            (frame["timestamp"] < cutoff)
            & (frame["target_observed_at"] < cutoff)
        ).sum()
    )

    model = HierarchicalPlayerModel(
        enabled_terms=("player_state",),
        enable_agent_pairs=False,
        enable_focal_response=False,
        backfit_iterations=1,
    ).fit(
        frame,
        cutoff=cutoff,
        target_col="next_team_match_normalized_round_margin",
    )

    assert target_visible < source_visible
    assert model.n_training_rows_ == source_visible
    assert model.box_vpm_.n_training_targets_ <= target_visible // 5


def test_oof_box_rows_require_target_to_be_visible_inside_fold() -> None:
    rows = []
    timestamps = [
        *pd.date_range("2023-01-01", periods=30, freq="10D", tz="UTC"),
        pd.Timestamp("2024-01-15T00:00:00Z"),
        pd.Timestamp("2024-03-15T00:00:00Z"),
    ]
    target_times = [
        *(
            pd.Timestamp(timestamp.value + 86_400_000_000_000, unit="ns", tz="UTC")
            for timestamp in timestamps[:30]
        ),
        pd.Timestamp("2024-02-01T00:00:00Z"),
        # Equal to the exclusive validation boundary, so this label is sealed.
        pd.Timestamp("2024-04-01T00:00:00Z"),
    ]
    agents = ("Jett", "Sova", "Omen", "Viper", "Cypher")
    for map_id, (timestamp, target_observed_at) in enumerate(
        zip(timestamps, target_times), start=1
    ):
        for player_id, agent in enumerate(agents, start=1):
            base = map_id / 100 + player_id / 1000
            rows.append(
                {
                    "map_id": map_id,
                    "match_id": map_id,
                    "timestamp": timestamp,
                    "player_id": player_id,
                    "team_id": 10,
                    "map_name": "Bind" if map_id % 2 else "Haven",
                    "agent": agent,
                    "next_team_match_normalized_round_margin": (map_id - 16) / 100,
                    "target_observed_at": target_observed_at,
                    "kpr": 0.70 + base,
                    "dpr": 0.70 - base / 2,
                    "apr": 0.30 + base / 3,
                    "first_duel_attempt_rate": 0.18 + base / 10,
                    "first_duel_win_rate": 0.50 + base / 8,
                    "adr": 140 + 10 * base,
                    "kast": 0.70 + base / 12,
                }
            )

    result = run_player_development(
        pd.DataFrame(rows),
        cutoffs=[pd.Timestamp("2024-01-01T00:00:00Z")],
        development_end=pd.Timestamp("2026-01-01T00:00:00Z"),
        ablations=("player-only",),
        target_col="next_team_match_normalized_round_margin",
        model_kwargs={"backfit_iterations": 1},
    )
    box = result.oof_predictions.loc[
        result.oof_predictions["component"].eq("__box_vpm__")
    ]

    assert box["map_id"].unique().tolist() == [31]
    assert box["target_column"].eq(
        "next_team_match_normalized_round_margin"
    ).all()
    assert box["target_multiplier"].eq(24.0).all()
    assert box["output_unit"].eq("rounds_per_24").all()
