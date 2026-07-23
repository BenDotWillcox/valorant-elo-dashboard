from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from valorant_ratings.elo import (
    EloConfig,
    EloModel,
    EloObservation,
    GlickoLikeModel,
    MapReadinessConfig,
    MapReadinessEloModel,
    MapResetSchedule,
    map_readiness_search_space,
)
from valorant_ratings.team import (
    DynamicTeamFeatureState,
    StudentTRoundMarginAuxiliary,
    TeamContext,
    TeamHierarchicalBackbone,
)


UTC = timezone.utc


def observation(match_id: int, when: datetime, won: int = 1, map_name: str = "Haven") -> EloObservation:
    return EloObservation(match_id, when, map_name, 1, 2, won, 8.0)


def test_current_elo_hard_resets_on_january_first() -> None:
    model = EloModel(EloConfig.current_hard_reset())
    model.update_batch([observation(1, datetime(2023, 12, 20, tzinfo=UTC))])
    december = model.predict(1, 2, "Haven", datetime(2023, 12, 30, tzinfo=UTC))
    january = model.predict(1, 2, "Haven", datetime(2024, 1, 1, tzinfo=UTC))
    assert december.probability > 0.5
    assert january.probability == 0.5


def test_carryover_elo_retains_but_regresses_prior_information() -> None:
    config = EloConfig(
        offseason_regression=0.7,
        time_decay_half_life_days=None,
        global_weight=0.5,
    )
    model = EloModel(config)
    model.update_batch([observation(1, datetime(2023, 12, 20, tzinfo=UTC))])
    december = model.predict(1, 2, "Haven", datetime(2023, 12, 30, tzinfo=UTC))
    january = model.predict(1, 2, "Haven", datetime(2024, 1, 1, tzinfo=UTC))
    assert 0.5 < january.probability < december.probability


def test_glicko_uncertainty_contracts_then_inflates_with_inactivity() -> None:
    model = GlickoLikeModel()
    before = model.predict(1, 2, "Haven", datetime(2024, 1, 1, tzinfo=UTC))
    model.update_batch([observation(1, datetime(2024, 1, 1, tzinfo=UTC))])
    after = model.predict(1, 2, "Haven", datetime(2024, 1, 2, tzinfo=UTC))
    inactive = model.predict(1, 2, "Haven", datetime(2024, 12, 31, tzinfo=UTC))
    assert after.team_a_uncertainty < before.team_a_uncertainty
    assert inactive.team_a_uncertainty > after.team_a_uncertainty


def test_map_readiness_is_map_local_non_mutating_and_patch_aware() -> None:
    boundary = datetime(2024, 1, 10, tzinfo=UTC)
    schedule = MapResetSchedule(
        patch_boundaries=(boundary,),
        map_reentry_boundaries={"Haven": (boundary,)},
    )
    config = MapReadinessConfig(
        carryover=EloConfig(
            k_factor=32.0,
            global_weight=1.0,
            offseason_regression=1.0,
            time_decay_half_life_days=None,
            uncertainty_probability_weight=0.0,
        ),
        readiness_half_life_days=100.0,
        readiness_k_factor=16.0,
        patch_retention=0.25,
        readiness_uncertainty_weight=0.0,
    )
    model = MapReadinessEloModel(config, schedule)
    played_at = datetime(2024, 1, 1, tzinfo=UTC)
    model.update_batch([observation(1, played_at)])
    stored = model.readiness_states[(1, "Haven")].clone()
    before_reset = model.components(1, "Haven", datetime(2024, 1, 9, tzinfo=UTC))
    after_reset = model.components(1, "Haven", boundary)

    expected = stored.value * 0.5 ** (9.0 / 100.0) * 0.25
    assert after_reset.map_readiness == pytest.approx(expected)
    assert after_reset.readiness_reset_count == 1  # duplicate patch/pool instant is one reset
    assert after_reset.readiness_uncertainty == config.readiness_initial_uncertainty
    assert before_reset.readiness_uncertainty < after_reset.readiness_uncertainty
    assert model.components(1, "Ascent", boundary).map_readiness == 0.0
    assert model.readiness_states[(1, "Haven")] == stored


def test_map_readiness_batch_uses_one_frozen_series_state() -> None:
    config = MapReadinessConfig(
        carryover=EloConfig(
            global_weight=1.0,
            offseason_regression=1.0,
            time_decay_half_life_days=None,
            uncertainty_probability_weight=0.0,
        ),
        readiness_uncertainty_weight=0.0,
    )
    model = MapReadinessEloModel(config, MapResetSchedule())
    timestamp = datetime(2024, 2, 1, tzinfo=UTC)
    model.update_batch(
        [
            observation(1, timestamp, map_name="Haven"),
            observation(1, timestamp, map_name="Ascent"),
        ]
    )
    assert model.readiness_states[(1, "Haven")].value == pytest.approx(
        model.readiness_states[(1, "Ascent")].value
    )


def test_map_readiness_grid_is_small_and_auditable() -> None:
    promoted = EloConfig(global_weight=0.85)
    candidates = map_readiness_search_space(promoted)
    assert len(candidates) == 81
    assert {item.carryover.global_weight for item in candidates} == {0.85, 0.95, 1.0}
    assert {item.readiness_half_life_days for item in candidates} == {21.0, 45.0, 90.0}
    assert {item.readiness_k_factor for item in candidates} == {8.0, 16.0, 32.0}
    assert {item.patch_retention for item in candidates} == {0.1, 0.25, 0.5}


def test_dynamic_team_state_is_updated_only_after_complete_match() -> None:
    state = DynamicTeamFeatureState()
    timestamp = datetime(2024, 5, 1, tzinfo=UTC)
    contexts = [
        TeamContext(timestamp, 1, 2, "Haven", "1-2-3-4-5", "6-7-8-9-10"),
        TeamContext(timestamp, 1, 2, "Ascent", "1-2-3-4-5", "6-7-8-9-10"),
    ]
    before = [state.features(context)["global_rating_diff"] for context in contexts]
    state.update_match(contexts, [1, 1], [0.5, 0.5])
    after = state.features(contexts[0])["global_rating_diff"]
    assert before == [0.0, 0.0]
    assert after > 0


def test_backbone_and_student_t_auxiliary_fit_small_synthetic_problem() -> None:
    rng = np.random.default_rng(4)
    rating_diff = rng.normal(size=160)
    probability = 1 / (1 + np.exp(-rating_diff))
    outcomes = rng.binomial(1, probability)
    frame = pd.DataFrame(
        {
            "global_rating_diff": rating_diff,
            "map_name": np.where(np.arange(160) % 2, "Haven", "Ascent"),
        }
    )
    backbone = TeamHierarchicalBackbone().fit(frame, outcomes)
    predictions = backbone.predict_proba(frame)
    assert predictions.shape == (160,)
    assert np.corrcoef(predictions, rating_diff)[0, 1] > 0.5

    margins = rating_diff + rng.standard_t(df=4, size=160) * 0.2
    margins[0] = 20.0
    auxiliary = StudentTRoundMarginAuxiliary().fit(rating_diff[:, None], margins)
    assert np.isfinite(auxiliary.predict([[0.5]])).all()
    assert auxiliary.predictive_scale() > 0
