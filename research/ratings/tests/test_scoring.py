from __future__ import annotations

from dataclasses import asdict

import pandas as pd
import pytest

from valorant_ratings.contracts import ConditionalRating, Support
from valorant_ratings.elo import EloConfig
from valorant_ratings.player import player_ablation_specification
from valorant_ratings.scoring import (
    _assemble_default_player_ratings,
    _build_player_agent_publication_views,
    _mix_ratings,
    _player_specification,
    _rating_row,
    _recent_player_view_counts,
    _selected_elo_config,
    _support_from_maps_played,
    apply_performance_display_scale,
    estimate_performance_display_reference,
)


def test_batch_scoring_uses_hard_reset_when_current_elo_wins() -> None:
    selected = {
        "rating_backbone": "current_elo",
        "selected_carryover": asdict(EloConfig()),
    }

    assert _selected_elo_config(selected) == EloConfig.current_hard_reset()


def test_batch_scoring_restores_carryover_for_predictive_backbone() -> None:
    carryover = EloConfig(k_factor=55.0, offseason_regression=0.8)
    selected = {
        "rating_backbone": "carryover",
        "selected_carryover": asdict(carryover),
    }

    assert _selected_elo_config(selected) == carryover


def test_cached_rating_marginalization_preserves_mixture_moments() -> None:
    first = ConditionalRating(
        1.0,
        0.8,
        0.2,
        (0.7, 1.3),
        (0.5, 1.5),
        Support.OBSERVED,
        {"player": 1.0},
    )
    second = ConditionalRating(
        3.0,
        2.8,
        0.4,
        (2.4, 3.6),
        (2.2, 3.8),
        Support.PARTIALLY_POOLED,
        {"player": 3.0},
    )

    result = _mix_ratings([(first, 0.75), (second, 0.25)])

    assert result.performance_mean == pytest.approx(1.5)
    assert result.contribution_mean == pytest.approx(1.3)
    assert result.standard_deviation == pytest.approx(
        ((0.75 * (0.2**2 + 1.0**2) + 0.25 * (0.4**2 + 3.0**2)) - 1.5**2)
        ** 0.5
    )
    assert result.support == Support.PARTIALLY_POOLED
    assert result.decomposition["player"] == pytest.approx(1.5)


def test_published_snapshot_terms_equal_the_promoted_development_ablation() -> None:
    promoted = player_ablation_specification("triple")
    enabled, agent_pairs, focal_response = _player_specification("triple")

    assert set(enabled) == set(promoted.enabled_terms)
    assert {"agent_role_effect", "map_agent_role"}.issubset(enabled)
    assert agent_pairs == promoted.enable_agent_pairs is False
    assert focal_response == promoted.enable_focal_response is False


def test_agent_publication_uses_aggregate_recent_support_and_canonical_agent_names() -> None:
    as_of = pd.Timestamp("2026-06-22T00:00:00Z")
    history = pd.DataFrame(
        {
            "player_id": [7] * 31,
            "map_id": range(100, 131),
            "map_name": ["Ascent"] * 31,
            "agent": ["neon"] * 31,
            "timestamp": pd.date_range("2026-05-01", periods=31, tz="UTC"),
        }
    )
    counts = _recent_player_view_counts(history, as_of=as_of, recency_months=12)
    extrapolated = ConditionalRating(
        performance_mean=1.0,
        contribution_mean=0.8,
        standard_deviation=0.2,
        interval80=(0.7, 1.3),
        interval95=(0.5, 1.5),
        support=Support.EXTRAPOLATED,
        decomposition={"player": 1.0},
    )
    agent_ratings = pd.DataFrame(
        [
            _rating_row(
                player_id=7,
                team_id=70,
                view="agent",
                map_name=None,
                agent=agent,
                rating=extrapolated,
            )
            for agent in ("Neon", "Sova")
        ]
    )
    probabilities = pd.DataFrame(
        {
            "player_id": [7, 7],
            "team_id": [70, 70],
            "map_name": ["Ascent", "Ascent"],
            "agent": ["NEON", "Sova"],
            "probability": [0.75, 0.25],
        }
    )

    published = _build_player_agent_publication_views(
        agent_ratings,
        probabilities,
        counts,
        uncertainty_penalty=0.5,
        recency_months=12,
    )
    demonstrated = published.loc[published["publication_view"].eq("demonstrated")]
    forced = published.loc[published["publication_view"].eq("forced-counterfactual")]

    assert demonstrated["agent"].tolist() == ["Neon"]
    assert int(demonstrated.iloc[0]["maps_played"]) == 31
    assert demonstrated.iloc[0]["support"] == "observed"
    assert demonstrated.iloc[0]["ranking_score"] == pytest.approx(0.9)
    assert demonstrated.iloc[0]["predicted_agent_use_probability"] == pytest.approx(0.75)
    assert forced.loc[forced["agent"].eq("Sova"), "support"].item() == "extrapolated"
    assert forced["is_forced_counterfactual"].all()
    assert not forced["is_default_view"].any()

    default_ratings = _assemble_default_player_ratings(pd.DataFrame(), published)
    assert set(default_ratings["publication_view"]) == {"demonstrated"}


def test_view_support_thresholds_match_marginalized_view_grain() -> None:
    assert _support_from_maps_played(0) == Support.EXTRAPOLATED
    assert _support_from_maps_played(1) == Support.PARTIALLY_POOLED
    assert _support_from_maps_played(4) == Support.PARTIALLY_POOLED
    assert _support_from_maps_played(5) == Support.OBSERVED


def test_map_and_overall_rows_override_conditional_support_at_their_own_grain() -> None:
    as_of = pd.Timestamp("2026-06-22T00:00:00.000001Z")
    history = pd.DataFrame(
        {
            "player_id": [11] * 5,
            "map_id": range(5),
            "map_name": ["Bind"] * 5,
            "agent": ["Sova"] * 5,
            "timestamp": pd.date_range("2026-06-01", periods=5, tz="UTC"),
        }
    )
    counts = _recent_player_view_counts(history, as_of=as_of)
    inherited = ConditionalRating(
        0.5,
        0.5,
        0.3,
        (0.1, 0.9),
        (-0.1, 1.1),
        Support.EXTRAPOLATED,
        {},
    )

    map_row = _rating_row(
        player_id=11,
        team_id=110,
        view="map",
        map_name="Bind",
        agent=None,
        rating=inherited,
        support_override=_support_from_maps_played(counts["map"][(11, "Bind")]),
    )
    overall_row = _rating_row(
        player_id=11,
        team_id=110,
        view="overall",
        map_name=None,
        agent=None,
        rating=inherited,
        support_override=_support_from_maps_played(counts["overall"][(11,)]),
    )

    assert map_row["support"] == "observed"
    assert overall_row["support"] == "observed"


def test_agent_publication_averages_map_probabilities_and_penalizes_uncertainty() -> None:
    rating_rows = []
    for player_id, mean, standard_deviation in ((1, 1.0, 0.2), (2, 1.05, 0.8)):
        rating = ConditionalRating(
            mean,
            mean,
            standard_deviation,
            (mean - 0.5, mean + 0.5),
            (mean - 0.8, mean + 0.8),
            Support.EXTRAPOLATED,
            {},
        )
        rating_rows.append(
            _rating_row(
                player_id=player_id,
                team_id=10,
                view="agent",
                map_name=None,
                agent="Sova",
                rating=rating,
            )
        )
    probabilities = pd.DataFrame(
        {
            "player_id": [1, 1, 2, 2],
            "team_id": [10] * 4,
            "map_name": ["Bind", "Haven", "Bind", "Haven"],
            "agent": ["sova"] * 4,
            "probability": [0.2, 0.6, 0.7, 0.9],
        }
    )
    recent_counts = {
        "overall": {(1,): 20, (2,): 1},
        "map": {},
        "agent": {(1, "sova"): 20, (2, "sova"): 1},
    }

    published = _build_player_agent_publication_views(
        pd.DataFrame(rating_rows),
        probabilities,
        recent_counts,
        uncertainty_penalty=0.5,
    )
    demonstrated = published.loc[
        published["publication_view"].eq("demonstrated")
    ].sort_values("rank")
    forced = published.loc[
        published["publication_view"].eq("forced-counterfactual")
    ].sort_values("rank")

    assert demonstrated["player_id"].tolist() == [1, 2]
    assert forced["player_id"].tolist() == [1, 2]
    assert demonstrated.set_index("player_id").loc[1, "predicted_agent_use_probability"] == pytest.approx(0.4)
    assert demonstrated.set_index("player_id").loc[2, "predicted_agent_use_probability"] == pytest.approx(0.8)
    assert demonstrated.set_index("player_id").loc[2, "support"] == "partially-pooled"

    with pytest.raises(ValueError, match="finite"):
        _build_player_agent_publication_views(
            pd.DataFrame(rating_rows),
            probabilities,
            recent_counts,
            uncertainty_penalty=float("nan"),
        )


def test_display_reference_bridges_legacy_units_and_aggregates_per_view() -> None:
    predictions = pd.DataFrame(
        {
            "fold_cutoff": pd.to_datetime(
                ["2024-01-01", "2024-01-01", "2024-04-01", "2024-04-01"],
                utc=True,
            ),
            "ablation": ["triple"] * 4,
            "component": ["__box_vpm__"] * 4,
            "player_id": [1, 1, 1, 2],
            "team_id": [10, 10, 10, 20],
            "map_name": ["Bind", "Bind", "Haven", "Bind"],
            "agent": ["Sova", "Sova", "Sova", "Jett"],
            "predicted": [0.0, 0.5, 0.5, 1.0],
        }
    )

    reference = estimate_performance_display_reference(
        predictions, ablation="triple", legacy_source_multiplier=24.0
    )

    assert reference["unit"] == "rounds_per_24"
    assert reference["unit_bridge"] == "multiply_by_24"
    # Duplicate locked map-agent rows collapse to one player/context/fold cell.
    assert reference["views"]["map-agent"]["observations"] == 3
    assert reference["views"]["map-agent"]["mean"] == pytest.approx(14.0)
    assert reference["views"]["overall"]["observations"] == 3


def test_per_view_display_scale_keeps_raw_rounds_and_adds_z_scores() -> None:
    reference = {
        "unit": "rounds_per_24",
        "population": "rolling_2024_2025_oof",
        "views": {
            "overall": {"mean": 1.0, "standard_deviation": 2.0},
            "map": {"mean": -1.0, "standard_deviation": 4.0},
        },
    }
    ratings = pd.DataFrame(
        {
            "view": ["overall", "map"],
            "performance_mean": [3.0, 3.0],
            "standard_deviation": [1.0, 2.0],
            "interval80_low": [2.0, 1.0],
            "interval80_high": [4.0, 5.0],
        }
    )

    displayed = apply_performance_display_scale(ratings, reference)

    assert displayed["performance_rounds_per_24"].tolist() == [3.0, 3.0]
    assert displayed["performance_z_score"].tolist() == pytest.approx([1.0, 1.0])
    assert displayed["standard_deviation_z"].tolist() == pytest.approx([0.5, 0.5])
    assert displayed["interval80_z_low"].tolist() == pytest.approx([0.5, 0.5])
