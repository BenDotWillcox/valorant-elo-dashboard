from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from valorant_ratings.series import SeriesSimulator, independent_series_probability
from valorant_ratings.veto import (
    SequentialVetoModel,
    VetoChoiceSet,
    VetoMapFeatures,
    VetoStep,
    standard_veto_actions,
)


UTC = timezone.utc
MAP_POOL = ("Ascent", "Bind", "Haven", "Icebox", "Lotus", "Split", "Sunset")


def training_steps() -> list[VetoStep]:
    timestamp = datetime(2024, 1, 1, tzinfo=UTC)
    return [
        VetoStep(1, timestamp, 0, 1, 2, "ban", "Bind"),
        VetoStep(1, timestamp, 1, 2, 1, "ban", "Icebox"),
        VetoStep(1, timestamp, 2, 1, 2, "pick", "Haven"),
        VetoStep(1, timestamp, 3, 2, 1, "pick", "Ascent"),
        VetoStep(1, timestamp, 4, 1, 2, "ban", "Sunset"),
        VetoStep(1, timestamp, 5, 2, 1, "ban", "Split"),
    ]


def test_sequential_veto_probabilities_are_legal_and_normalized() -> None:
    model = SequentialVetoModel().fit(
        training_steps(), cutoff=datetime(2025, 1, 1, tzinfo=UTC)
    )
    probabilities = model.probabilities(1, 2, "ban", MAP_POOL)
    assert set(probabilities) == set(MAP_POOL)
    assert np.isclose(sum(probabilities.values()), 1.0)


def test_simulated_best_of_three_has_unique_maps_and_a_decider() -> None:
    model = SequentialVetoModel().fit(training_steps())
    simulated = model.simulate(
        2,
        datetime(2025, 1, 1, tzinfo=UTC),
        standard_veto_actions(1, 2, 3),
        MAP_POOL,
        np.random.default_rng(10),
    )
    chosen = [step.chosen_map for step in simulated.steps]
    assert len(chosen) == len(set(chosen)) == 6
    assert len(simulated.played_maps) == 3
    assert len(set(simulated.played_maps)) == 3


def test_series_probability_uses_shared_draws_and_is_sensible() -> None:
    independent = independent_series_probability([0.5, 0.5, 0.5], 3)
    assert independent == 0.5
    simulator = SeriesSimulator(shared_strength_std=0.25, seed=12)
    forecast = simulator.post_veto(
        ["Haven", "Ascent", "Bind"],
        {"Haven": 0.65, "Ascent": 0.60, "Bind": 0.55},
        best_of=3,
        simulations=4000,
    )
    assert forecast.team_a_win_probability > 0.5
    assert forecast.simulation_standard_error < 0.02


def test_conditional_logit_learns_map_rating_signal_without_future_rows() -> None:
    rows: list[VetoChoiceSet] = []
    for index in range(40):
        timestamp = datetime(2023, 1, 1 + index % 28, 12, tzinfo=UTC).replace(
            month=1 + index // 28
        )
        haven_high = index % 2 == 0
        features = {
            "Haven": VetoMapFeatures(
                own_rating=1100.0 if haven_high else 900.0,
                own_global_rating=1000.0,
            ),
            "Bind": VetoMapFeatures(
                own_rating=900.0 if haven_high else 1100.0,
                own_global_rating=1000.0,
            ),
        }
        rows.append(
            VetoChoiceSet(
                match_id=index,
                timestamp=timestamp,
                step_index=2,
                acting_team=1,
                opponent_team=2,
                action="pick",
                chosen_map="Haven" if haven_high else "Bind",
                available_maps=("Haven", "Bind"),
                map_pool=("Haven", "Bind"),
                map_features=features,
            )
        )
    cutoff = datetime(2023, 3, 1, tzinfo=UTC)
    model = SequentialVetoModel(minimum_action_choices=10).fit(rows, cutoff=cutoff)
    prediction_features = {
        "Ascent": VetoMapFeatures(own_rating=1125.0, own_global_rating=1000.0),
        "Split": VetoMapFeatures(own_rating=875.0, own_global_rating=1000.0),
    }
    probabilities = model.probabilities(
        1,
        2,
        "pick",
        ("Ascent", "Split"),
        timestamp=cutoff,
        map_features=prediction_features,
    )
    assert probabilities["Ascent"] > probabilities["Split"]

    future = rows[-1]
    with np.testing.assert_raises_regex(ValueError, "strictly earlier"):
        SequentialVetoModel().fit([future], cutoff=future.timestamp)
