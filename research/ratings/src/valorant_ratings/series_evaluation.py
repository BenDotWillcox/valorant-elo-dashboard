"""Rolling conditional-veto and pre/post-veto series evaluation."""

from __future__ import annotations

from dataclasses import dataclass
from math import log
from typing import Mapping, Sequence

import numpy as np
import pandas as pd

from .elo import EloConfig, EloModel, EloObservation
from .evaluation import binary_log_loss, brier_score
from .features import orient_maps_team1
from .metadata import load_map_pool_metadata, load_patch_metadata
from .series import independent_series_probability
from .veto import (
    PlannedVetoAction,
    PooledSequentialVetoModel,
    SequentialVetoModel,
    VetoChoiceSet,
    VetoMapFeatures,
)


def _logit(probability: float) -> float:
    value = float(np.clip(probability, 1e-8, 1 - 1e-8))
    return float(np.log(value / (1 - value)))


def _sigmoid(value: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(value, -30, 30)))


def shared_latent_series_probability(
    map_probabilities: Sequence[float],
    best_of: int,
    *,
    shared_logit_standard_deviation: float = 0.30,
    quadrature_nodes: int = 15,
) -> float:
    """Integrate a shared match-day strength draw with Gauss-Hermite nodes."""

    if len(map_probabilities) < best_of:
        raise ValueError("a series forecast needs best_of map probabilities")
    nodes, weights = np.polynomial.hermite.hermgauss(quadrature_nodes)
    probabilities = np.asarray(map_probabilities[:best_of], dtype=float)
    logits = np.asarray([_logit(value) for value in probabilities])
    total = 0.0
    for node, weight in zip(nodes, weights, strict=True):
        shifted = _sigmoid(logits + np.sqrt(2.0) * shared_logit_standard_deviation * node)
        total += float(weight) * independent_series_probability(shifted.tolist(), best_of)
    return float(total / np.sqrt(np.pi))


@dataclass(frozen=True, slots=True)
class SeriesVetoDevelopmentResult:
    series_predictions: pd.DataFrame
    veto_predictions: pd.DataFrame
    series_metrics: pd.DataFrame
    veto_metrics: pd.DataFrame
    veto_step_metrics: pd.DataFrame
    map_utilities: pd.DataFrame
    utility_correlations: pd.DataFrame


@dataclass(frozen=True)
class _PreparedMatch:
    match_id: int | str
    timestamp: pd.Timestamp
    event_name: object
    team_a: int | str
    team_b: int | str
    best_of: int
    team_a_series_win: int
    pool: tuple[str, ...]
    selected_maps: tuple[str, ...]
    map_probabilities: Mapping[str, float]
    choices: tuple[VetoChoiceSet, ...]


class _TemporalVetoMetadata:
    """As-of patch and announced-pool ages, with a past-only pool fallback."""

    def __init__(self) -> None:
        self.patches = load_patch_metadata().sort_values("effective_from").reset_index(drop=True)
        self.pools = load_map_pool_metadata().sort_values("effective_from").reset_index(drop=True)

    @staticmethod
    def _eligible(frame: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
        return frame.loc[
            (frame["announced_at"] < cutoff)
            & (frame["effective_from"] <= cutoff)
            & (frame["effective_to"].isna() | (cutoff < frame["effective_to"]))
        ]

    def patch(self, cutoff: pd.Timestamp) -> tuple[str, pd.Timestamp, float]:
        eligible = self._eligible(self.patches, cutoff)
        if eligible.empty:
            return "unknown", cutoff, 0.0
        row = eligible.iloc[-1]
        start = pd.Timestamp(row["effective_from"])
        return str(row["patch"]), start, max(0.0, (cutoff - start).total_seconds() / 86400.0)

    def pool_age(
        self,
        map_name: str,
        cutoff: pd.Timestamp,
        *,
        patch_id: str,
        observed_starts: Mapping[tuple[str, str], pd.Timestamp],
    ) -> tuple[float, float]:
        eligible = self._eligible(self.pools, cutoff)
        if not eligible.empty:
            current = eligible.iloc[-1]
            if map_name in set(current["maps"]):
                start = pd.Timestamp(current["effective_from"])
                current_position = int(current.name)
                for position in range(current_position - 1, -1, -1):
                    previous = self.pools.iloc[position]
                    if map_name not in set(previous["maps"]):
                        break
                    previous_end = previous.get("effective_to")
                    if pd.isna(previous_end) or pd.Timestamp(previous_end) != start:
                        break
                    start = pd.Timestamp(previous["effective_from"])
                return max(0.0, (cutoff - start).total_seconds() / 86400.0), 1.0
        observed = observed_starts.get((patch_id, map_name))
        if observed is None:
            return 0.0, 0.0
        return max(0.0, (cutoff - observed).total_seconds() / 86400.0), 0.0


def _ordered_selected_maps(
    match_maps: pd.DataFrame,
    match_vetoes: pd.DataFrame,
    best_of: int,
) -> list[str]:
    played = match_maps.sort_values("game_number")["map_name"].astype(str).tolist()
    selected = match_vetoes.loc[
        match_vetoes["action"].str.lower().isin(["pick", "decider"]), "map_name"
    ].astype(str).tolist()
    result = list(dict.fromkeys(played))
    result.extend(map_name for map_name in selected if map_name not in result)
    return result[:best_of]


def _observations(match_maps: pd.DataFrame) -> list[EloObservation]:
    first = match_maps.iloc[0]
    return [
        EloObservation(
            match_id=row.match_id,
            timestamp=pd.Timestamp(row.prediction_cutoff).to_pydatetime(),
            map_name=str(row.map_name),
            team_a=first["team_a"],
            team_b=first["team_b"],
            team_a_won=int(row.team_a_won),
            round_margin=float(row.round_margin),
            event_id=getattr(row, "event_name", None),
        )
        for row in match_maps.itertuples(index=False)
    ]


def _side_choice_lookup(side_choice_context: pd.DataFrame | None) -> dict[tuple[object, object, str], float]:
    if side_choice_context is None or side_choice_context.empty:
        return {}
    required = {"match_id", "team_id", "map_name", "side_choice_advantage"}
    missing = required.difference(side_choice_context.columns)
    if missing:
        raise ValueError(f"side-choice context missing columns: {sorted(missing)}")
    return {
        (row.match_id, row.team_id, str(row.map_name)): float(row.side_choice_advantage)
        for row in side_choice_context.itertuples(index=False)
        if pd.notna(row.side_choice_advantage)
    }


def _prepare_matches(
    oriented: pd.DataFrame,
    vetoes: pd.DataFrame,
    elo_config: EloConfig,
    *,
    side_choice_context: pd.DataFrame | None,
) -> list[_PreparedMatch]:
    veto = vetoes.copy()
    veto["action"] = veto["action"].astype(str).str.lower()
    identity = oriented[
        ["match_id", "prediction_cutoff", "team_a", "team_b", "best_of", "event_name"]
    ].drop_duplicates("match_id")
    veto = veto.merge(identity, on="match_id", how="inner", validate="many_to_one")
    side_lookup = _side_choice_lookup(side_choice_context)
    metadata = _TemporalVetoMetadata()
    rating_model = EloModel(elo_config)
    observed_pool_starts: dict[tuple[str, str], pd.Timestamp] = {}
    prepared: list[_PreparedMatch] = []

    for cutoff_value, block in oriented.groupby("prediction_cutoff", sort=True):
        cutoff = pd.Timestamp(cutoff_value)
        patch_id, _, patch_age = metadata.patch(cutoff)
        pending_updates: list[list[EloObservation]] = []
        pending_observed_maps: set[str] = set()
        for match_id, match_maps in block.groupby("match_id", sort=False):
            first = match_maps.iloc[0]
            team_a, team_b = first["team_a"], first["team_b"]
            best_of = int(first.get("best_of", len(match_maps)) or len(match_maps))
            match_vetoes = veto.loc[veto["match_id"] == match_id].sort_values("order_index")
            pool = tuple(dict.fromkeys(match_vetoes["map_name"].astype(str).tolist()))
            pending_updates.append(_observations(match_maps))
            pending_observed_maps.update(pool)

            map_probabilities = {
                map_name: rating_model.predict(
                    team_a, team_b, map_name, cutoff.to_pydatetime()
                ).probability
                for map_name in pool
            }
            available = list(pool)
            choices: list[VetoChoiceSet] = []
            for row in match_vetoes.itertuples(index=False):
                chosen = str(row.map_name)
                if chosen not in available:
                    continue
                if row.action == "decider" or pd.isna(row.team_id):
                    available.remove(chosen)
                    continue
                acting = row.team_id
                opponent = team_b if acting == team_a else team_a
                features: dict[str, VetoMapFeatures] = {}
                for map_name in pool:
                    own = rating_model.rating_components(
                        acting, map_name, cutoff.to_pydatetime()
                    )
                    other = rating_model.rating_components(
                        opponent, map_name, cutoff.to_pydatetime()
                    )
                    pool_age, pool_known = metadata.pool_age(
                        map_name,
                        cutoff,
                        patch_id=patch_id,
                        observed_starts=observed_pool_starts,
                    )
                    side_key = (match_id, acting, map_name)
                    features[map_name] = VetoMapFeatures(
                        own_rating=own.total_rating,
                        opponent_rating=other.total_rating,
                        own_global_rating=own.global_rating,
                        opponent_global_rating=other.global_rating,
                        map_pool_age_days=pool_age,
                        map_pool_age_known=pool_known,
                        patch_age_days=patch_age,
                        side_choice_advantage=side_lookup.get(side_key, 0.0),
                        side_choice_known=float(side_key in side_lookup),
                    )
                choices.append(
                    VetoChoiceSet(
                        match_id=match_id,
                        timestamp=cutoff.to_pydatetime(),
                        step_index=int(row.order_index),
                        acting_team=acting,
                        opponent_team=opponent,
                        action=str(row.action),
                        chosen_map=chosen,
                        available_maps=tuple(available),
                        map_pool=pool,
                        map_features=features,
                        event_id=first.get("event_name"),
                    )
                )
                available.remove(chosen)

            selected_maps = tuple(_ordered_selected_maps(match_maps, match_vetoes, best_of))
            needed = best_of // 2 + 1 if best_of in (1, 3, 5) else 1
            prepared.append(
                _PreparedMatch(
                    match_id=match_id,
                    timestamp=cutoff,
                    event_name=first.get("event_name"),
                    team_a=team_a,
                    team_b=team_b,
                    best_of=best_of,
                    team_a_series_win=int(match_maps["team_a_won"].sum() >= needed),
                    pool=pool,
                    selected_maps=selected_maps,
                    map_probabilities=map_probabilities,
                    choices=tuple(choices),
                )
            )

        # Ratings and inferred historical pool exposure advance only after every
        # match sharing this cutoff has been fully featurized.
        for observations in pending_updates:
            rating_model.update_batch(observations)
        for map_name in pending_observed_maps:
            observed_pool_starts.setdefault((patch_id, map_name), cutoff)
    return prepared


def _rating_model_before(
    oriented: pd.DataFrame,
    cutoff: pd.Timestamp,
    config: EloConfig,
) -> EloModel:
    model = EloModel(config)
    prior = oriented.loc[oriented["prediction_cutoff"] < cutoff]
    for _, block in prior.groupby("prediction_cutoff", sort=True):
        for _, match_maps in block.groupby("match_id", sort=False):
            model.update_batch(_observations(match_maps))
    return model


def _pool_starts_before(
    choices: Sequence[VetoChoiceSet],
    cutoff: pd.Timestamp,
    metadata: _TemporalVetoMetadata,
) -> dict[tuple[str, str], pd.Timestamp]:
    starts: dict[tuple[str, str], pd.Timestamp] = {}
    by_timestamp: dict[pd.Timestamp, set[str]] = {}
    for choice in choices:
        timestamp = pd.Timestamp(choice.timestamp)
        if timestamp >= cutoff:
            continue
        by_timestamp.setdefault(timestamp, set()).update(choice.map_pool)
    for timestamp in sorted(by_timestamp):
        patch_id, _, _ = metadata.patch(timestamp)
        for map_name in by_timestamp[timestamp]:
            starts.setdefault((patch_id, map_name), timestamp)
    return starts


def _fold_map_utilities(
    model: SequentialVetoModel,
    oriented: pd.DataFrame,
    all_choices: Sequence[VetoChoiceSet],
    fold_start: pd.Timestamp,
    elo_config: EloConfig,
) -> pd.DataFrame:
    training = [choice for choice in all_choices if pd.Timestamp(choice.timestamp) < fold_start]
    if not training:
        return pd.DataFrame()
    recent_boundary = fold_start - pd.DateOffset(days=180)
    recent = [choice for choice in training if pd.Timestamp(choice.timestamp) >= recent_boundary]
    active_source = recent or training
    maps = tuple(sorted({name for choice in active_source for name in choice.map_pool}, key=str.casefold))
    teams = tuple(sorted({choice.acting_team for choice in training}, key=str))
    if not maps or not teams:
        return pd.DataFrame()
    rating_model = _rating_model_before(oriented, fold_start, elo_config)
    reference_components: dict[str, tuple[float, float]] = {}
    for map_name in maps:
        values = [rating_model.rating_components(team, map_name, fold_start.to_pydatetime()) for team in teams]
        reference_components[map_name] = (
            float(np.median([value.total_rating for value in values])),
            float(np.median([value.global_rating for value in values])),
        )
    metadata = _TemporalVetoMetadata()
    patch_id, _, patch_age = metadata.patch(fold_start)
    observed_starts = _pool_starts_before(training, fold_start, metadata)
    records: list[dict[str, object]] = []
    for team in teams:
        contexts: dict[str, VetoMapFeatures] = {}
        own_components: dict[str, object] = {}
        for map_name in maps:
            own = rating_model.rating_components(team, map_name, fold_start.to_pydatetime())
            own_components[map_name] = own
            opponent_rating, opponent_global = reference_components[map_name]
            pool_age, pool_known = metadata.pool_age(
                map_name,
                fold_start,
                patch_id=patch_id,
                observed_starts=observed_starts,
            )
            contexts[map_name] = VetoMapFeatures(
                own_rating=own.total_rating,
                opponent_rating=opponent_rating,
                own_global_rating=own.global_rating,
                opponent_global_rating=opponent_global,
                map_pool_age_days=pool_age,
                map_pool_age_known=pool_known,
                patch_age_days=patch_age,
            )
        choices = {
            action: VetoChoiceSet(
                match_id=f"__utility__{fold_start.isoformat()}__{team}",
                timestamp=fold_start.to_pydatetime(),
                step_index=0 if action == "ban" else 2,
                acting_team=team,
                opponent_team="__field_reference__",
                action=action,
                chosen_map="",
                available_maps=maps,
                map_pool=maps,
                map_features=contexts,
            )
            for action in ("ban", "pick")
        }
        ban = model.utilities(choices["ban"])
        pick = model.utilities(choices["pick"])
        ban_mean = float(np.mean(list(ban.values())))
        pick_mean = float(np.mean(list(pick.values())))
        for map_name in maps:
            component = own_components[map_name]
            ban_rate, pick_rate, float_rate, support = model.history_rates(
                team, map_name, fold_start.to_pydatetime()
            )
            centered_ban = ban[map_name] - ban_mean
            centered_pick = pick[map_name] - pick_mean
            records.append(
                {
                    "fold_cutoff": fold_start,
                    "team_id": team,
                    "map_name": map_name,
                    "ban_utility": centered_ban,
                    "pick_utility": centered_pick,
                    "veto_skill_utility": centered_pick - centered_ban,
                    "own_total_rating": component.total_rating,
                    "own_global_rating": component.global_rating,
                    "own_map_rating_diff": component.total_rating - component.global_rating,
                    "historical_ban_rate": ban_rate,
                    "historical_pick_rate": pick_rate,
                    "historical_float_rate": float_rate,
                    "decayed_history_support": support,
                    "map_pool_age_days": contexts[map_name].map_pool_age_days,
                    "map_pool_age_known": contexts[map_name].map_pool_age_known,
                    "patch_age_days": patch_age,
                }
            )
    return pd.DataFrame.from_records(records)


def _played_team_maps(oriented: pd.DataFrame, fold_start: pd.Timestamp, quarter: str) -> pd.DataFrame:
    values = oriented.loc[
        oriented["prediction_cutoff"].dt.tz_localize(None).dt.to_period("Q").astype(str) == quarter
    ]
    records: list[dict[str, object]] = []
    for row in values.itertuples(index=False):
        records.extend(
            [
                {
                    "fold_cutoff": fold_start,
                    "match_id": row.match_id,
                    "map_name": str(row.map_name),
                    "team_id": row.team_a,
                    "subsequent_map_win": int(row.team_a_won),
                    "subsequent_round_margin": float(row.round_margin),
                },
                {
                    "fold_cutoff": fold_start,
                    "match_id": row.match_id,
                    "map_name": str(row.map_name),
                    "team_id": row.team_b,
                    "subsequent_map_win": 1 - int(row.team_a_won),
                    "subsequent_round_margin": -float(row.round_margin),
                },
            ]
        )
    return pd.DataFrame.from_records(records)


def _readiness_long(readiness_predictions: pd.DataFrame | None) -> tuple[pd.DataFrame, str]:
    if readiness_predictions is None or readiness_predictions.empty:
        return pd.DataFrame(), "not_available"
    required = {
        "match_id",
        "map_name",
        "team_a",
        "team_b",
        "map_readiness_team_a_readiness",
        "map_readiness_team_b_readiness",
    }
    if not required.issubset(readiness_predictions.columns):
        return pd.DataFrame(), "missing_required_columns"
    records: list[dict[str, object]] = []
    for row in readiness_predictions.itertuples(index=False):
        records.extend(
            [
                {
                    "match_id": row.match_id,
                    "map_name": str(row.map_name),
                    "team_id": row.team_a,
                    "transient_map_readiness": float(row.map_readiness_team_a_readiness),
                },
                {
                    "match_id": row.match_id,
                    "map_name": str(row.map_name),
                    "team_id": row.team_b,
                    "transient_map_readiness": float(row.map_readiness_team_b_readiness),
                },
            ]
        )
    return pd.DataFrame.from_records(records), "available"


def _correlation_rows(
    frame: pd.DataFrame,
    target: str,
    *,
    readiness_status: str = "not_applicable",
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    groups: list[tuple[str, pd.DataFrame]] = [("all", frame)]
    if not frame.empty and "fold_cutoff" in frame:
        groups.extend((str(cutoff), group) for cutoff, group in frame.groupby("fold_cutoff", sort=True))
    for period, group in groups:
        clean = group[["veto_skill_utility", target]].dropna() if not group.empty else pd.DataFrame()
        for method in ("pearson", "spearman"):
            value = np.nan
            status = readiness_status
            if len(clean) >= 3 and clean.nunique().min() > 1:
                value = float(clean["veto_skill_utility"].corr(clean[target], method=method))
                status = "estimated"
            elif readiness_status == "not_applicable":
                status = "insufficient_variation"
            records.append(
                {
                    "period": period,
                    "target": target,
                    "method": method,
                    "observations": len(clean),
                    "teams": int(group["team_id"].nunique()) if not group.empty else 0,
                    "maps": int(group["map_name"].nunique()) if not group.empty else 0,
                    "correlation": value,
                    "status": status,
                }
            )
    return records


def _utility_analysis(
    utilities: pd.DataFrame,
    outcomes: pd.DataFrame,
    readiness_predictions: pd.DataFrame | None,
) -> pd.DataFrame:
    if utilities.empty or outcomes.empty:
        return pd.DataFrame()
    joined = outcomes.merge(
        utilities,
        on=["fold_cutoff", "team_id", "map_name"],
        how="inner",
        validate="many_to_one",
    )
    records = _correlation_rows(joined, "subsequent_map_win")
    records.extend(_correlation_rows(joined, "subsequent_round_margin"))
    readiness, readiness_status = _readiness_long(readiness_predictions)
    if readiness.empty:
        records.extend(
            _correlation_rows(
                pd.DataFrame(),
                "transient_map_readiness",
                readiness_status=readiness_status,
            )
        )
    else:
        readiness_joined = joined.merge(
            readiness.drop_duplicates(["match_id", "map_name", "team_id"]),
            on=["match_id", "map_name", "team_id"],
            how="inner",
            validate="many_to_one",
        )
        records.extend(
            _correlation_rows(
                readiness_joined,
                "transient_map_readiness",
                readiness_status="available",
            )
        )
    return pd.DataFrame.from_records(records)


def _veto_metrics(veto_frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if veto_frame.empty:
        return pd.DataFrame(), pd.DataFrame()
    specifications = (
        ("conditional_logit_veto", "conditional_log_loss", "conditional_top1"),
        ("sequential_pooled_veto", "old_log_loss", "old_top1"),
        ("uniform_legal_choice", "uniform_log_loss", "uniform_expected_top1"),
    )
    overall: list[dict[str, object]] = []
    by_step: list[dict[str, object]] = []
    uniform_loss = float(veto_frame["uniform_log_loss"].mean())
    old_loss = float(veto_frame["old_log_loss"].mean())
    for model, loss_column, accuracy_column in specifications:
        overall.append(
            {
                "model": model,
                "choices": len(veto_frame),
                "matches": int(veto_frame["match_id"].nunique()),
                "choice_log_loss": float(veto_frame[loss_column].mean()),
                "top1_accuracy": float(veto_frame[accuracy_column].mean()),
                "uniform_choice_log_loss": uniform_loss,
                "old_choice_log_loss": old_loss,
                "weighting": "per_action",
            }
        )
        for (step_index, action), group in veto_frame.groupby(["step_index", "action"], sort=True):
            by_step.append(
                {
                    "model": model,
                    "step_index": int(step_index),
                    "action": action,
                    "choices": len(group),
                    "choice_log_loss": float(group[loss_column].mean()),
                    "top1_accuracy": float(group[accuracy_column].mean()),
                }
            )
    return pd.DataFrame.from_records(overall), pd.DataFrame.from_records(by_step)


def run_series_veto_development(
    maps: pd.DataFrame,
    vetoes: pd.DataFrame,
    elo_config: EloConfig,
    *,
    prediction_start_year: int = 2024,
    simulation_draws_per_match: int = 64,
    seed: int = 20260714,
    readiness_predictions: pd.DataFrame | None = None,
    side_choice_context: pd.DataFrame | None = None,
) -> SeriesVetoDevelopmentResult:
    """Quarter-refit OOF veto choices and series forecasts from prior state."""

    oriented = orient_maps_team1(maps)
    oriented = oriented.sort_values(
        ["prediction_cutoff", "match_id", "game_number"], kind="stable"
    ).reset_index(drop=True)
    oriented["prediction_cutoff"] = pd.to_datetime(
        oriented["prediction_cutoff"], utc=True
    )
    prepared = _prepare_matches(
        oriented,
        vetoes,
        elo_config,
        side_choice_context=side_choice_context,
    )
    all_choices = [choice for match in prepared for choice in match.choices]
    prediction_matches = [
        match for match in prepared if match.timestamp.year >= prediction_start_year
    ]
    quarters = sorted(
        {
            match.timestamp.tz_localize(None).to_period("Q").strftime("%YQ%q")
            for match in prediction_matches
        }
    )
    rng = np.random.default_rng(seed)
    veto_records: list[dict[str, object]] = []
    series_records: list[dict[str, object]] = []
    utility_frames: list[pd.DataFrame] = []
    outcome_frames: list[pd.DataFrame] = []

    for quarter in quarters:
        validation = [
            match
            for match in prediction_matches
            if match.timestamp.tz_localize(None).to_period("Q").strftime("%YQ%q") == quarter
        ]
        if not validation:
            continue
        fold_start = min(match.timestamp for match in validation)
        training_choices = [
            choice for choice in all_choices if pd.Timestamp(choice.timestamp) < fold_start
        ]
        model = SequentialVetoModel().fit(
            training_choices, cutoff=fold_start.to_pydatetime()
        )
        old_model = PooledSequentialVetoModel().fit(
            [choice.as_step() for choice in training_choices],
            cutoff=fold_start.to_pydatetime(),
        )
        utility_frames.append(
            _fold_map_utilities(
                model, oriented, all_choices, fold_start, elo_config
            )
        )
        outcome_frames.append(_played_team_maps(oriented, fold_start, quarter))

        by_cutoff: dict[pd.Timestamp, list[_PreparedMatch]] = {}
        for match in validation:
            by_cutoff.setdefault(match.timestamp, []).append(match)
        for cutoff in sorted(by_cutoff):
            cutoff_choices: list[VetoChoiceSet] = []
            for match in by_cutoff[cutoff]:
                cutoff_choices.extend(match.choices)
                for choice in match.choices:
                    conditional = model.probabilities(
                        choice.acting_team,
                        choice.opponent_team,
                        choice.action,
                        choice.available_maps,
                        choice_context=choice,
                    )
                    old = old_model.probabilities(
                        choice.acting_team,
                        choice.opponent_team,
                        choice.action,
                        choice.available_maps,
                    )
                    conditional_probability = max(conditional[choice.chosen_map], 1e-12)
                    old_probability = max(old[choice.chosen_map], 1e-12)
                    legal_count = len(choice.available_maps)
                    conditional_top = max(
                        conditional, key=lambda name: (conditional[name], name)
                    )
                    old_top = max(old, key=lambda name: (old[name], name))
                    veto_records.append(
                        {
                            "match_id": match.match_id,
                            "timestamp": match.timestamp,
                            "fold_cutoff": fold_start,
                            "event_name": match.event_name,
                            "step_index": choice.step_index,
                            "action": choice.action,
                            "acting_team": choice.acting_team,
                            "opponent_team": choice.opponent_team,
                            "chosen_map": choice.chosen_map,
                            "legal_choice_count": legal_count,
                            "conditional_probability": conditional_probability,
                            "old_probability": old_probability,
                            "uniform_probability": 1.0 / legal_count,
                            "conditional_predicted_map": conditional_top,
                            "old_predicted_map": old_top,
                            "conditional_log_loss": -log(conditional_probability),
                            "old_log_loss": -log(old_probability),
                            "uniform_log_loss": log(legal_count),
                            "conditional_top1": float(conditional_top == choice.chosen_map),
                            "old_top1": float(old_top == choice.chosen_map),
                            "uniform_expected_top1": 1.0 / legal_count,
                        }
                    )

                if (
                    match.best_of in (1, 3, 5)
                    and len(match.pool) >= match.best_of
                    and len(match.selected_maps) >= match.best_of
                    and all(name in match.map_probabilities for name in match.selected_maps)
                ):
                    post_probability = shared_latent_series_probability(
                        [match.map_probabilities[name] for name in match.selected_maps],
                        match.best_of,
                    )
                    mean_map_probability = float(np.mean(list(match.map_probabilities.values())))
                    blind_probability = shared_latent_series_probability(
                        [mean_map_probability] * match.best_of,
                        match.best_of,
                    )
                    planned = [
                        PlannedVetoAction(
                            choice.acting_team,
                            choice.opponent_team,
                            choice.action,
                        )
                        for choice in match.choices
                    ]
                    simulated_probabilities: list[float] = []
                    if planned and len(planned) < len(match.pool):
                        for _ in range(simulation_draws_per_match):
                            simulated = model.simulate(
                                match.match_id,
                                match.timestamp.to_pydatetime(),
                                planned,
                                match.pool,
                                rng,
                                choice_contexts=match.choices,
                            )
                            if len(simulated.played_maps) >= match.best_of:
                                simulated_probabilities.append(
                                    shared_latent_series_probability(
                                        [match.map_probabilities[name] for name in simulated.played_maps],
                                        match.best_of,
                                    )
                                )
                    pre_probability = (
                        float(np.mean(simulated_probabilities))
                        if simulated_probabilities
                        else blind_probability
                    )
                    series_records.append(
                        {
                            "match_id": match.match_id,
                            "timestamp": match.timestamp,
                            "fold_cutoff": fold_start,
                            "event_name": match.event_name,
                            "best_of": match.best_of,
                            "team_a_series_win": match.team_a_series_win,
                            "veto_blind_probability": blind_probability,
                            "pre_veto_probability": pre_probability,
                            "post_veto_probability": post_probability,
                        }
                    )

            # The validation history advances after all matches sharing this
            # series cutoff; coefficients remain frozen for the quarter.
            model.observe_choice_sets(cutoff_choices)
            old_model.observe([choice.as_step() for choice in cutoff_choices])

    series_frame = pd.DataFrame.from_records(series_records)
    veto_frame = pd.DataFrame.from_records(veto_records)
    series_metrics: list[dict[str, object]] = []
    if not series_frame.empty:
        for mode in ("veto_blind", "pre_veto", "post_veto"):
            column = f"{mode}_probability"
            series_metrics.append(
                {
                    "model": f"carryover_{mode}",
                    "series": len(series_frame),
                    "series_log_loss": binary_log_loss(
                        series_frame["team_a_series_win"], series_frame[column]
                    ),
                    "series_brier": brier_score(
                        series_frame["team_a_series_win"], series_frame[column]
                    ),
                    "veto_model": (
                        "conditional_logit_veto"
                        if mode == "pre_veto"
                        else "actual_veto" if mode == "post_veto" else "none"
                    ),
                }
            )
    veto_metrics, veto_step_metrics = _veto_metrics(veto_frame)
    utilities = (
        pd.concat([frame for frame in utility_frames if not frame.empty], ignore_index=True)
        if any(not frame.empty for frame in utility_frames)
        else pd.DataFrame()
    )
    outcomes = (
        pd.concat([frame for frame in outcome_frames if not frame.empty], ignore_index=True)
        if any(not frame.empty for frame in outcome_frames)
        else pd.DataFrame()
    )
    correlations = _utility_analysis(utilities, outcomes, readiness_predictions)
    return SeriesVetoDevelopmentResult(
        series_predictions=series_frame,
        veto_predictions=veto_frame,
        series_metrics=pd.DataFrame.from_records(series_metrics),
        veto_metrics=veto_metrics,
        veto_step_metrics=veto_step_metrics,
        map_utilities=utilities,
        utility_correlations=correlations,
    )


__all__ = [
    "SeriesVetoDevelopmentResult",
    "run_series_veto_development",
    "shared_latent_series_probability",
]
