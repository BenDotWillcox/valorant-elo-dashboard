"""Batch scoring for versioned team, player, and scenario Parquet artifacts."""

from __future__ import annotations

import json
from math import exp, log, sqrt
from typing import Any, Mapping

import numpy as np
import pandas as pd

from .agent_selection import AgentSelectionModel
from .contracts import (
    ConditionalRating,
    canonical_agent_key,
    ForecastMode,
    PlayerRatingQuery,
    Support,
    TeammateAssignment,
)
from .elo import EloConfig, EloModel, EloObservation
from .features import add_next_team_result_target, orient_maps_team1
from .metadata import load_agent_metadata, load_map_pool_metadata, load_patch_metadata
from .player import HierarchicalPlayerModel, player_ablation_specification
from .rosters import roster_as_of
from .scenario import ScenarioEngine


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + exp(-max(-30.0, min(30.0, value))))


DEFAULT_DEMONSTRATED_RECENCY_MONTHS = 12
DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY = 0.5
VIEW_SUPPORT_OBSERVED_MIN_MAPS = 5
# v4 used 0.08 per normalized-margin fraction. Performance is now displayed in
# rounds per 24, so divide by 24 to preserve the same scenario-probability map.
PLAYER_PERFORMANCE_LOGIT_WEIGHT_PER_ROUND_24 = 0.08 / 24.0
PERFORMANCE_REFERENCE_GROUPS: Mapping[str, tuple[str, ...]] = {
    "map-agent": ("fold_cutoff", "player_id", "team_id", "map_name", "agent"),
    "map": ("fold_cutoff", "player_id", "team_id", "map_name"),
    "agent": ("fold_cutoff", "player_id", "team_id", "agent"),
    "overall": ("fold_cutoff", "player_id", "team_id"),
}


def estimate_performance_display_reference(
    predictions: pd.DataFrame,
    *,
    ablation: str,
    legacy_source_multiplier: float = 24.0,
) -> dict[str, Any]:
    """Build per-view display references from rolling development forecasts.

    Each player/context cell contributes once per rolling fold. Progressively
    marginalizing the locked map-agent forecasts creates references at the map,
    agent and overall publication grains. Population SD (``ddof=0``) is used
    because these rows define the complete development reference.

    Development-v1 OOF artifacts predate explicit unit metadata and contain
    normalized-margin fractions despite claiming rounds per 24. The legacy
    multiplier corrects those immutable predictions at read time; new OOF
    artifacts carry ``output_unit=rounds_per_24`` and need no bridge.
    """

    reference_columns = set().union(*PERFORMANCE_REFERENCE_GROUPS.values())
    required = {"ablation", "component", "predicted", *reference_columns}
    missing = sorted(required.difference(predictions.columns))
    if missing:
        raise ValueError(f"OOF predictions are missing display-reference columns: {missing}")
    selected = predictions.loc[
        predictions["ablation"].eq(str(ablation))
        & predictions["component"].eq("__box_vpm__")
    ].copy()
    if selected.empty:
        raise ValueError("no OOF box predictions match the display reference request")

    explicit_units = (
        selected["output_unit"].dropna().astype(str).unique().tolist()
        if "output_unit" in selected.columns
        else []
    )
    if explicit_units:
        if explicit_units != ["rounds_per_24"]:
            raise ValueError(f"unsupported OOF performance units: {explicit_units}")
        multiplier = 1.0
        source_unit = "rounds_per_24"
        unit_bridge = "none"
    else:
        multiplier = float(legacy_source_multiplier)
        if not np.isfinite(multiplier) or multiplier <= 0:
            raise ValueError("legacy_source_multiplier must be finite and positive")
        source_unit = "legacy_normalized_round_margin"
        unit_bridge = f"multiply_by_{multiplier:g}"
    selected["_performance_rounds_per_24"] = (
        pd.to_numeric(selected["predicted"], errors="coerce") * multiplier
    )
    if selected["_performance_rounds_per_24"].isna().any():
        raise ValueError("OOF display-reference predictions contain non-numeric values")

    views: dict[str, dict[str, Any]] = {}
    for view, keys in PERFORMANCE_REFERENCE_GROUPS.items():
        distribution = (
            selected.groupby(list(keys), as_index=False, dropna=False)[
                "_performance_rounds_per_24"
            ]
            .mean()["_performance_rounds_per_24"]
            .to_numpy(dtype=float)
        )
        standard_deviation = float(np.std(distribution, ddof=0))
        if not np.isfinite(standard_deviation) or standard_deviation <= 1e-12:
            raise ValueError(f"development reference SD is degenerate for view {view!r}")
        views[view] = {
            "mean": float(np.mean(distribution)),
            "standard_deviation": standard_deviation,
            "observations": int(len(distribution)),
            "aggregation_keys": list(keys),
        }
    return {
        "schema_version": "performance-display-reference-v1",
        "population": "rolling_2024_2025_oof_observed_context_cells",
        "reference_aggregation": (
            "arithmetic means of observed OOF map-agent contexts at each view grain; "
            "not a reconstruction of current-map-pool or agent-selection weights"
        ),
        "ablation": str(ablation),
        "component": "__box_vpm__",
        "unit": "rounds_per_24",
        "source_unit": source_unit,
        "unit_bridge": unit_bridge,
        "source_rows": int(len(selected)),
        "views": views,
    }


def apply_performance_display_scale(
    ratings: pd.DataFrame,
    reference: Mapping[str, Any],
) -> pd.DataFrame:
    """Add raw rounds-per-24 and per-view development z-score columns."""

    required = {"view", "performance_mean"}
    missing = sorted(required.difference(ratings.columns))
    if missing:
        raise ValueError(f"ratings are missing display-scale columns: {missing}")
    if reference.get("unit") != "rounds_per_24":
        raise ValueError("performance display reference must use rounds_per_24")
    view_reference = reference.get("views")
    if not isinstance(view_reference, Mapping):
        raise ValueError("performance display reference has no per-view statistics")
    unknown = sorted(set(ratings["view"].dropna().astype(str)).difference(view_reference))
    if unknown:
        raise ValueError(f"ratings contain views without a development reference: {unknown}")

    result = ratings.copy()
    result["performance_rounds_per_24"] = pd.to_numeric(
        result["performance_mean"], errors="raise"
    )
    result["performance_reference_mean"] = result["view"].map(
        {view: float(values["mean"]) for view, values in view_reference.items()}
    )
    result["performance_reference_sd"] = result["view"].map(
        {
            view: float(values["standard_deviation"])
            for view, values in view_reference.items()
        }
    )
    result["performance_z_score"] = (
        result["performance_rounds_per_24"] - result["performance_reference_mean"]
    ) / result["performance_reference_sd"]
    if "standard_deviation" in result.columns:
        result["standard_deviation_z"] = (
            pd.to_numeric(result["standard_deviation"], errors="raise")
            / result["performance_reference_sd"]
        )
    for raw, display in (
        ("interval80_low", "interval80_z_low"),
        ("interval80_high", "interval80_z_high"),
        ("interval95_low", "interval95_z_low"),
        ("interval95_high", "interval95_z_high"),
    ):
        if raw in result.columns:
            result[display] = (
                pd.to_numeric(result[raw], errors="raise")
                - result["performance_reference_mean"]
            ) / result["performance_reference_sd"]
    result["performance_reference_population"] = str(reference.get("population"))
    return result


def _player_specification(name: str) -> tuple[tuple[str, ...], bool, bool]:
    """Compatibility seam backed by the promoted development specification."""

    specification = player_ablation_specification(name)
    return (
        specification.enabled_terms,
        specification.enable_agent_pairs,
        specification.enable_focal_response,
    )


def _support_from_maps_played(
    maps_played: int,
    *,
    observed_min_maps: int = VIEW_SUPPORT_OBSERVED_MIN_MAPS,
) -> Support:
    """Classify support at the grain of a published marginalized view."""

    if observed_min_maps <= 0:
        raise ValueError("observed_min_maps must be positive")
    count = int(maps_played)
    if count <= 0:
        return Support.EXTRAPOLATED
    if count < observed_min_maps:
        return Support.PARTIALLY_POOLED
    return Support.OBSERVED


def _recent_player_view_counts(
    player_frame: pd.DataFrame,
    *,
    as_of: pd.Timestamp,
    recency_months: int = DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
) -> dict[str, dict[Any, int]]:
    """Count recent maps at each view grain before exclusive ``as_of``.

    Snapshot scoring passes the first microsecond after the inclusive publication
    cutoff, so the calendar-month window starts from the actual cutoff itself.
    """

    months = int(recency_months)
    if months <= 0:
        raise ValueError("recency_months must be positive")
    required = {"player_id", "map_id", "map_name", "agent", "timestamp"}
    missing = sorted(required.difference(player_frame.columns))
    if missing:
        raise ValueError(f"player frame is missing publication count columns: {missing}")
    end = pd.Timestamp(as_of)
    if end.tzinfo is None:
        end = end.tz_localize("UTC")
    else:
        end = end.tz_convert("UTC")
    timestamps = pd.to_datetime(player_frame["timestamp"], utc=True)
    publication_cutoff = pd.Timestamp(end.value - 1_000, unit="ns", tz="UTC")
    start = publication_cutoff - pd.DateOffset(months=months)
    recent = player_frame.loc[(timestamps >= start) & (timestamps < end)].copy()
    if recent.empty:
        return {"overall": {}, "map": {}, "agent": {}}
    recent["_agent_key"] = recent["agent"].map(canonical_agent_key)
    overall = recent.groupby("player_id", sort=False)["map_id"].nunique()
    by_map = recent.groupby(["player_id", "map_name"], sort=False)["map_id"].nunique()
    by_agent = recent.groupby(["player_id", "_agent_key"], sort=False)["map_id"].nunique()
    return {
        "overall": {(player_id,): int(value) for player_id, value in overall.items()},
        "map": {
            (player_id, str(map_name)): int(value)
            for (player_id, map_name), value in by_map.items()
        },
        "agent": {
            (player_id, str(agent_key)): int(value)
            for (player_id, agent_key), value in by_agent.items()
        },
    }


def _fit_team_model(maps: pd.DataFrame, config: EloConfig) -> EloModel:
    oriented = orient_maps_team1(maps).sort_values(
        ["prediction_cutoff", "match_id", "game_number"], kind="stable"
    )
    model = EloModel(config)
    for cutoff, block in oriented.groupby("prediction_cutoff", sort=True):
        batches: list[list[EloObservation]] = []
        for match_id, match in block.groupby("match_id", sort=False):
            batches.append(
                [
                    EloObservation(
                        match_id=match_id,
                        timestamp=pd.Timestamp(cutoff).to_pydatetime(),
                        map_name=str(row.map_name),
                        team_a=row.team_a,
                        team_b=row.team_b,
                        team_a_won=int(row.team_a_won),
                        round_margin=float(row.round_margin),
                        event_id=getattr(row, "event_name", None),
                    )
                    for row in match.itertuples(index=False)
                ]
            )
        for batch in batches:
            model.update_batch(batch)
    return model


def _selected_elo_config(selected_config: Mapping[str, Any]) -> EloConfig:
    """Restore the Elo configuration corresponding to the frozen rating decision."""

    if selected_config.get("rating_backbone") == "current_elo":
        return EloConfig.current_hard_reset()
    return EloConfig(**selected_config["selected_carryover"])


def _current_metadata(as_of: pd.Timestamp) -> tuple[tuple[str, ...], str, dict[str, str], tuple[str, ...]]:
    pools = load_map_pool_metadata()
    pool = pools.loc[
        (pools["effective_from"] <= as_of)
        & (pools["effective_to"].isna() | (as_of < pools["effective_to"]))
        & (pools["announced_at"] <= as_of)
    ].sort_values("effective_from")
    if pool.empty:
        raise ValueError("no sourced active map pool exists at scoring cutoff")
    active_maps = tuple(pool.iloc[-1]["maps"])
    patches = load_patch_metadata()
    patch = patches.loc[
        (patches["effective_from"] <= as_of)
        & (patches["effective_to"].isna() | (as_of < patches["effective_to"]))
    ].sort_values("effective_from")
    current_patch = str(patch.iloc[-1]["patch"]) if not patch.empty else "__UNKNOWN_PATCH__"
    agents = load_agent_metadata()
    agents = agents.loc[
        agents["release_effective_at"].isna() | (agents["release_effective_at"] <= as_of)
    ]
    roles = dict(zip(agents["agent"].astype(str), agents["role"].astype(str)))
    legal_agents = tuple(sorted(roles, key=str.casefold))
    return active_maps, current_patch, roles, legal_agents


def _rating_row(
    *,
    player_id: int,
    team_id: int,
    view: str,
    map_name: str | None,
    agent: str | None,
    rating: Any,
    support_override: Support | None = None,
) -> dict[str, Any]:
    return {
        "player_id": player_id,
        "team_id": team_id,
        "view": view,
        "map_name": map_name,
        "agent": agent,
        "performance_mean": rating.performance_mean,
        "contribution_mean": rating.contribution_mean,
        "standard_deviation": rating.standard_deviation,
        "interval80_low": rating.interval80[0],
        "interval80_high": rating.interval80[1],
        "interval95_low": rating.interval95[0],
        "interval95_high": rating.interval95[1],
        "support": (support_override or rating.support).value,
        "decomposition_json": json.dumps(rating.decomposition, sort_keys=True),
    }


def _build_player_agent_publication_views(
    agent_ratings: pd.DataFrame,
    agent_probabilities: pd.DataFrame,
    recent_counts: Mapping[str, Mapping[Any, int]],
    *,
    uncertainty_penalty: float = DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
    recency_months: int = DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    observed_min_maps: int = VIEW_SUPPORT_OBSERVED_MIN_MAPS,
) -> pd.DataFrame:
    """Publish demonstrated cells plus a separately flagged forced full grid."""

    penalty = float(uncertainty_penalty)
    if not np.isfinite(penalty) or penalty < 0:
        raise ValueError("uncertainty_penalty must be finite and non-negative")
    if int(recency_months) <= 0:
        raise ValueError("recency_months must be positive")
    required_ratings = {
        "player_id",
        "team_id",
        "view",
        "agent",
        "performance_mean",
        "standard_deviation",
    }
    missing_ratings = sorted(required_ratings.difference(agent_ratings.columns))
    if missing_ratings:
        raise ValueError(f"agent ratings are missing publication columns: {missing_ratings}")
    required_probabilities = {"player_id", "team_id", "agent", "probability"}
    missing_probabilities = sorted(required_probabilities.difference(agent_probabilities.columns))
    if missing_probabilities:
        raise ValueError(
            f"agent probabilities are missing publication columns: {missing_probabilities}"
        )

    probability_source = agent_probabilities.copy()
    probability_source["_agent_key"] = probability_source["agent"].map(
        canonical_agent_key
    )
    probability = (
        probability_source.groupby(
            ["player_id", "team_id", "_agent_key"], as_index=False
        )
        .agg(predicted_agent_use_probability=("probability", "mean"))
    )
    base = agent_ratings.copy()
    base["_agent_key"] = base["agent"].map(canonical_agent_key)
    base = base.merge(
        probability,
        on=["player_id", "team_id", "_agent_key"],
        how="left",
        validate="one_to_one",
    )
    if base["predicted_agent_use_probability"].isna().any():
        raise ValueError("agent publication rows are missing predicted use probabilities")
    agent_support = recent_counts.get("agent", {})
    base["maps_played"] = [
        int(agent_support.get((player_id, agent_key), 0))
        for player_id, agent_key in zip(base["player_id"], base["_agent_key"])
    ]
    base["support"] = [
        _support_from_maps_played(value, observed_min_maps=observed_min_maps).value
        for value in base["maps_played"]
    ]
    base["ranking_score"] = (
        base["performance_mean"] - penalty * base["standard_deviation"]
    )
    if {"performance_z_score", "standard_deviation_z"}.issubset(base.columns):
        base["ranking_z_score"] = (
            base["performance_z_score"] - penalty * base["standard_deviation_z"]
        )
    base["recency_window_months"] = int(recency_months)
    base["uncertainty_penalty"] = penalty
    base = base.drop(columns="_agent_key")

    publications: list[pd.DataFrame] = []
    for publication_view, mask in (
        ("demonstrated", base["maps_played"].gt(0)),
        ("forced-counterfactual", pd.Series(True, index=base.index)),
    ):
        view = base.loc[mask].copy()
        view["publication_view"] = publication_view
        view["is_default_view"] = publication_view == "demonstrated"
        view["is_forced_counterfactual"] = publication_view == "forced-counterfactual"
        view = view.sort_values(
            ["agent", "ranking_score", "player_id"],
            ascending=[True, False, True],
            kind="stable",
        )
        view["rank"] = view.groupby("agent", sort=False).cumcount() + 1
        publications.append(view)
    return pd.concat(publications, ignore_index=True)


def _assemble_default_player_ratings(
    conditional_ratings: pd.DataFrame,
    player_agent_ratings: pd.DataFrame,
) -> pd.DataFrame:
    """Combine conditional rows with only the safe default agent publication."""

    demonstrated = player_agent_ratings.loc[
        player_agent_ratings["publication_view"].eq("demonstrated")
    ].copy()
    return pd.concat(
        [conditional_ratings, demonstrated],
        ignore_index=True,
        sort=False,
    )


def _mix_ratings(
    weighted: list[tuple[ConditionalRating, float]],
) -> ConditionalRating:
    """Marginalize already-scored map-agent cells without refitting them."""

    total = sum(weight for _, weight in weighted)
    if total <= 0:
        raise ValueError("rating marginalization produced zero probability mass")
    normalized = [(rating, weight / total) for rating, weight in weighted]
    performance = sum(weight * rating.performance_mean for rating, weight in normalized)
    contribution = sum(weight * rating.contribution_mean for rating, weight in normalized)
    second_moment = sum(
        weight * (rating.standard_deviation**2 + rating.performance_mean**2)
        for rating, weight in normalized
    )
    standard_deviation = sqrt(max(second_moment - performance**2, 0.0))
    keys = set().union(*(rating.decomposition for rating, _ in normalized))
    decomposition = {
        key: sum(weight * rating.decomposition.get(key, 0.0) for rating, weight in normalized)
        for key in sorted(keys)
    }
    support_mass = {support: 0.0 for support in Support}
    for rating, weight in normalized:
        support_mass[rating.support] += weight
    if support_mass[Support.EXTRAPOLATED] >= 0.20:
        support = Support.EXTRAPOLATED
    elif support_mass[Support.OBSERVED] >= 0.80:
        support = Support.OBSERVED
    else:
        support = Support.PARTIALLY_POOLED
    return ConditionalRating(
        performance_mean=performance,
        contribution_mean=contribution,
        standard_deviation=standard_deviation,
        interval80=(
            performance - 1.2815515655 * standard_deviation,
            performance + 1.2815515655 * standard_deviation,
        ),
        interval95=(
            performance - 1.9599639845 * standard_deviation,
            performance + 1.9599639845 * standard_deviation,
        ),
        support=support,
        decomposition=decomposition,
    )


def score_rating_snapshots(
    snapshot_data: Any,
    selected_config: Mapping[str, Any],
    *,
    performance_reference: Mapping[str, Any],
    seed: int = 20260714,
    demonstrated_recency_months: int = DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    player_agent_uncertainty_penalty: float = DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
    view_support_observed_min_maps: int = VIEW_SUPPORT_OBSERVED_MIN_MAPS,
) -> dict[str, pd.DataFrame]:
    maps = snapshot_data["maps"]
    player_frame = snapshot_data["player_maps"].copy()
    if "match_completed_at" in maps and "match_completed_at" not in player_frame:
        match_observation = maps[["match_id", "match_completed_at"]].drop_duplicates()
        if match_observation["match_id"].duplicated().any():
            raise ValueError("match_completed_at must be stable within each match")
        player_frame = player_frame.merge(
            match_observation,
            on="match_id",
            how="left",
            validate="many_to_one",
        )
    player_frame["timestamp"] = pd.to_datetime(player_frame["prediction_cutoff"], utc=True)
    player_frame["map_win"] = player_frame["team_win"]
    player_frame["patch"] = player_frame["patch"].fillna("__UNKNOWN_PATCH__")
    player_frame = add_next_team_result_target(player_frame)
    as_of = pd.Timestamp(snapshot_data.manifest["cutoff"]) + pd.Timedelta(microseconds=1)
    as_of_datetime = as_of.to_pydatetime()
    active_maps, current_patch, agent_roles, legal_agents = _current_metadata(as_of)
    recent_counts = _recent_player_view_counts(
        player_frame,
        as_of=as_of,
        recency_months=demonstrated_recency_months,
    )

    elo_config = _selected_elo_config(selected_config)
    team_model = _fit_team_model(maps, elo_config)
    roster_history = snapshot_data["rosters"].copy()
    current = roster_as_of(roster_history, as_of)
    current = current.sort_values(
        ["team_id", "availability_at", "confidence", "player_id"],
        ascending=[True, False, False, True],
        kind="stable",
    ).groupby("team_id", as_index=False).head(5)
    current = current.groupby("team_id").filter(lambda group: len(group) == 5)
    rosters = {
        int(team): tuple(int(value) for value in group["player_id"])
        for team, group in current.groupby("team_id")
    }

    selected_player = str(selected_config.get("selected_player_ablation", "composition"))
    enabled, pairs, focal = _player_specification(selected_player)
    player_model = HierarchicalPlayerModel(
        enabled_terms=enabled,
        enable_agent_pairs=pairs,
        enable_focal_response=focal,
        enable_contribution=False,
        agent_roles=agent_roles,
        rating_uncertainty_scale=float(
            selected_config.get("player_uncertainty_scale", 1.0)
        ),
    ).fit(player_frame, target_col="next_team_match_normalized_round_margin")
    agent_model = AgentSelectionModel(
        legal_agents=legal_agents,
        agent_roles=agent_roles,
        random_state=seed,
    ).fit(player_frame)

    def team_probability(query: PlayerRatingQuery, rating: Any) -> float:
        team_id = query.team_id
        if team_id is None:
            base_logit = 0.0
        elif query.opponent_team_id is not None:
            if query.map_name:
                base = team_model.predict(
                    team_id,
                    query.opponent_team_id,
                    query.map_name,
                    query.as_of,
                ).probability
            else:
                base = float(
                    np.mean(
                        [
                            team_model.predict(
                                team_id, query.opponent_team_id, map_name, query.as_of
                            ).probability
                            for map_name in active_maps
                        ]
                    )
                )
            base_logit = log(np.clip(base, 1e-8, 1 - 1e-8) / (1 - np.clip(base, 1e-8, 1 - 1e-8)))
        else:
            rating_mean = np.mean(
                [
                    team_model.predict(team_id, "__NEUTRAL_TEAM__", map_name, query.as_of).team_a_rating
                    for map_name in active_maps
                ]
            )
            base_logit = log(10.0) * (rating_mean - elo_config.initial_rating) / elo_config.probability_scale
        return _sigmoid(
            base_logit
            + PLAYER_PERFORMANCE_LOGIT_WEIGHT_PER_ROUND_24
            * rating.contribution_mean
        )

    engine = ScenarioEngine(
        player_model,
        agent_model,
        active_maps=active_maps,
        current_patch=current_patch,
        composition_samples=8,
        neutral_opponent_team_id=None,
        team_win_probability=team_probability,
    )
    rating_rows: list[dict[str, Any]] = []
    agent_rating_rows: list[dict[str, Any]] = []
    probability_rows: list[dict[str, Any]] = []
    comparison_rows: list[dict[str, Any]] = []
    for team_id, roster in sorted(rosters.items()):
        for player_id in roster:
            ratings_by_cell: dict[tuple[str, str], ConditionalRating] = {}
            distributions: dict[str, dict[str, float]] = {}
            for map_name in active_maps:
                distribution = agent_model.predict_proba(
                    player_id,
                    map_name,
                    patch=current_patch,
                    roster=roster,
                )
                distributions[map_name] = distribution
                for agent, probability in distribution.items():
                    probability_rows.append(
                        {
                            "player_id": player_id,
                            "team_id": team_id,
                            "map_name": map_name,
                            "agent": agent,
                            "probability": probability,
                        }
                    )
                for agent in legal_agents:
                    query = PlayerRatingQuery(
                        as_of=as_of_datetime,
                        player_id=player_id,
                        team_id=team_id,
                        map_name=map_name,
                        agent=agent,
                        forecast_mode=ForecastMode.SCENARIO,
                    )
                    rating = engine.rate(query)
                    ratings_by_cell[(map_name, agent)] = rating
                    rating_rows.append(
                        _rating_row(
                            player_id=player_id,
                            team_id=team_id,
                            view="map-agent",
                            map_name=map_name,
                            agent=agent,
                            rating=rating,
                        )
                    )
                map_rating = _mix_ratings(
                    [
                        (ratings_by_cell[(map_name, agent)], probability)
                        for agent, probability in distribution.items()
                    ]
                )
                rating_rows.append(
                    _rating_row(
                        player_id=player_id,
                        team_id=team_id,
                        view="map",
                        map_name=map_name,
                        agent=None,
                        rating=map_rating,
                        support_override=_support_from_maps_played(
                            recent_counts["map"].get((player_id, map_name), 0),
                            observed_min_maps=view_support_observed_min_maps,
                        ),
                    )
                )
                ordered_agents = sorted(distribution, key=distribution.get, reverse=True)
                if len(ordered_agents) >= 2:
                    baseline_query = PlayerRatingQuery(
                        as_of=as_of_datetime,
                        player_id=player_id,
                        team_id=team_id,
                        map_name=map_name,
                        agent=ordered_agents[0],
                        forecast_mode=ForecastMode.SCENARIO,
                    )
                    alternative_query = ScenarioEngine.with_agent_swap(
                        baseline_query,
                        player_id=player_id,
                        new_agent=ordered_agents[1],
                    )
                    comparison = engine.compare(baseline_query, alternative_query)
                    comparison_rows.append(
                        {
                            "change_type": "focal_agent",
                            "player_id": player_id,
                            "team_id": team_id,
                            "map_name": map_name,
                            "changed_player_id": player_id,
                            "baseline_agent": ordered_agents[0],
                            "alternative_agent": ordered_agents[1],
                            "performance_delta": comparison.performance_delta,
                            "contribution_delta": comparison.contribution_delta,
                            "team_win_probability_delta": comparison.team_win_probability_delta,
                            "uncertainty_of_delta": comparison.uncertainty_of_delta,
                            "interpretation": "predictive association; not causal",
                        }
                    )
            for agent in legal_agents:
                agent_rating = _mix_ratings(
                    [
                        (ratings_by_cell[(map_name, agent)], 1.0)
                        for map_name in active_maps
                    ]
                )
                agent_rating_rows.append(
                    _rating_row(
                        player_id=player_id,
                        team_id=team_id,
                        view="agent",
                        map_name=None,
                        agent=agent,
                        rating=agent_rating,
                    )
                )
            overall_rating = _mix_ratings(
                [
                    (
                        ratings_by_cell[(map_name, agent)],
                        probability / len(active_maps),
                    )
                    for map_name, distribution in distributions.items()
                    for agent, probability in distribution.items()
                ]
            )
            rating_rows.append(
                _rating_row(
                    player_id=player_id,
                    team_id=team_id,
                    view="overall",
                    map_name=None,
                    agent=None,
                    rating=overall_rating,
                    support_override=_support_from_maps_played(
                        recent_counts["overall"].get((player_id,), 0),
                        observed_min_maps=view_support_observed_min_maps,
                    ),
                )
            )

        # Produce explicit teammate-agent swaps from the most likely legal comp.
        for map_name in active_maps:
            compositions = agent_model.composition_distribution(
                roster,
                map_name,
                patch=current_patch,
                n=48,
                random_state=seed + team_id,
            )
            if not compositions:
                continue
            baseline_assignment = dict(compositions[0].assignments)
            used = {
                canonical_agent_key(agent) for agent in baseline_assignment.values()
            }
            for focal_player in roster:
                teammates = tuple(
                    TeammateAssignment(player_id=player, agent=baseline_assignment[player])
                    for player in roster
                    if player != focal_player
                )
                baseline_query = PlayerRatingQuery(
                    as_of=as_of_datetime,
                    player_id=focal_player,
                    team_id=team_id,
                    map_name=map_name,
                    agent=baseline_assignment[focal_player],
                    teammate_assignments=teammates,
                    forecast_mode=ForecastMode.SCENARIO,
                )
                changed_player = teammates[0].player_id
                candidate_agents = [
                    agent
                    for agent in legal_agents
                    if canonical_agent_key(agent) not in used
                    or canonical_agent_key(agent)
                    == canonical_agent_key(baseline_assignment[changed_player])
                ]
                candidate_agents = [
                    agent
                    for agent in candidate_agents
                    if canonical_agent_key(agent)
                    != canonical_agent_key(baseline_assignment[changed_player])
                ]
                if not candidate_agents:
                    continue
                alternative_agent = max(
                    candidate_agents,
                    key=lambda agent: agent_model.predict_proba(
                        changed_player,
                        map_name,
                        patch=current_patch,
                        roster=roster,
                    ).get(agent, 0.0),
                )
                alternative_query = ScenarioEngine.with_agent_swap(
                    baseline_query,
                    player_id=changed_player,
                    new_agent=alternative_agent,
                )
                comparison = engine.compare(baseline_query, alternative_query)
                comparison_rows.append(
                    {
                        "change_type": "teammate_agent",
                        "player_id": focal_player,
                        "team_id": team_id,
                        "map_name": map_name,
                        "changed_player_id": changed_player,
                        "baseline_agent": baseline_assignment[changed_player],
                        "alternative_agent": alternative_agent,
                        "performance_delta": comparison.performance_delta,
                        "contribution_delta": comparison.contribution_delta,
                        "team_win_probability_delta": comparison.team_win_probability_delta,
                        "uncertainty_of_delta": comparison.uncertainty_of_delta,
                        "interpretation": "predictive association; not causal",
                    }
                )

    active_teams = tuple(sorted(rosters))
    team_rating_rows: list[dict[str, Any]] = []
    for team_id in active_teams:
        map_values: list[float] = []
        map_uncertainties: list[float] = []
        for map_name in active_maps:
            forecast = team_model.predict(
                team_id, "__NEUTRAL_TEAM__", map_name, as_of_datetime
            )
            map_values.append(forecast.team_a_rating)
            map_uncertainties.append(forecast.team_a_uncertainty)
            team_rating_rows.append(
                {
                    "team_id": team_id,
                    "view": "map",
                    "map_name": map_name,
                    "rating": forecast.team_a_rating,
                    "uncertainty": forecast.team_a_uncertainty,
                }
            )
        team_rating_rows.append(
            {
                "team_id": team_id,
                "view": "overall",
                "map_name": None,
                "rating": float(np.mean(map_values)),
                "uncertainty": float(np.sqrt(np.mean(np.square(map_uncertainties)))),
            }
        )
    matchup_rows: list[dict[str, Any]] = []
    for team_a in active_teams:
        for team_b in active_teams:
            probability = 0.5 if team_a == team_b else float(
                np.mean(
                    [
                        team_model.predict(team_a, team_b, map_name, as_of_datetime).probability
                        for map_name in active_maps
                    ]
                )
            )
            matchup_rows.append(
                {"team_a": team_a, "team_b": team_b, "win_probability": probability}
            )
    matchup = pd.DataFrame(matchup_rows)
    ranking = (
        matchup.loc[matchup["team_a"] != matchup["team_b"]]
        .groupby("team_a", as_index=False)["win_probability"]
        .mean()
        .rename(columns={"team_a": "team_id", "win_probability": "field_win_probability"})
        .sort_values("field_win_probability", ascending=False, kind="stable")
        .reset_index(drop=True)
    )
    ranking["rank"] = np.arange(1, len(ranking) + 1)
    probabilities = pd.DataFrame(probability_rows)
    conditional_ratings = apply_performance_display_scale(
        pd.DataFrame(rating_rows), performance_reference
    )
    agent_ratings = apply_performance_display_scale(
        pd.DataFrame(agent_rating_rows), performance_reference
    )
    player_agent_ratings = _build_player_agent_publication_views(
        agent_ratings,
        probabilities,
        recent_counts,
        uncertainty_penalty=player_agent_uncertainty_penalty,
        recency_months=demonstrated_recency_months,
        observed_min_maps=view_support_observed_min_maps,
    )
    demonstrated_agent_ratings = player_agent_ratings.loc[
        player_agent_ratings["publication_view"].eq("demonstrated")
    ].copy()
    forced_counterfactual_agent_ratings = player_agent_ratings.loc[
        player_agent_ratings["publication_view"].eq("forced-counterfactual")
    ].copy()
    player_ratings = _assemble_default_player_ratings(
        conditional_ratings,
        player_agent_ratings,
    )
    return {
        "player_ratings": player_ratings,
        "player_agent_ratings_demonstrated": demonstrated_agent_ratings,
        "player_agent_ratings_forced_counterfactual": forced_counterfactual_agent_ratings,
        "agent_selection_probabilities": probabilities,
        "scenario_comparisons": pd.DataFrame(comparison_rows),
        "team_ratings": pd.DataFrame(team_rating_rows),
        "matchup_matrix": matchup,
        "field_rankings": ranking,
    }


__all__ = [
    "DEFAULT_DEMONSTRATED_RECENCY_MONTHS",
    "DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY",
    "PERFORMANCE_REFERENCE_GROUPS",
    "PLAYER_PERFORMANCE_LOGIT_WEIGHT_PER_ROUND_24",
    "VIEW_SUPPORT_OBSERVED_MIN_MAPS",
    "apply_performance_display_scale",
    "estimate_performance_display_reference",
    "score_rating_snapshots",
]
