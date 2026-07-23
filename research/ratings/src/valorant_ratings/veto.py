"""Leakage-safe conditional-logit Valorant veto choice model."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from itertools import groupby
from typing import Iterable, Mapping, Sequence

import numpy as np
from scipy.optimize import minimize


def _utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _action_key(action: str) -> str:
    value = str(action).casefold()
    if "ban" in value:
        return "ban"
    if "pick" in value:
        return "pick"
    if "side" in value:
        return "side"
    return value


@dataclass(frozen=True)
class VetoStep:
    match_id: int | str
    timestamp: datetime
    step_index: int
    acting_team: int | str
    opponent_team: int | str
    action: str
    chosen_map: str
    event_id: int | str | None = None

    @classmethod
    def from_mapping(cls, row: Mapping[str, object]) -> "VetoStep":
        return cls(
            match_id=row["match_id"],
            timestamp=_utc(row["timestamp"]),
            step_index=int(row["step_index"]),
            acting_team=row["acting_team"],
            opponent_team=row["opponent_team"],
            action=str(row["action"]).lower(),
            chosen_map=str(row["chosen_map"]),
            event_id=row.get("event_id"),
        )


@dataclass(frozen=True)
class VetoMapFeatures:
    """Alternative-specific information known before a series begins."""

    own_rating: float = 1000.0
    opponent_rating: float = 1000.0
    own_global_rating: float = 1000.0
    opponent_global_rating: float = 1000.0
    map_pool_age_days: float = 0.0
    map_pool_age_known: float = 0.0
    patch_age_days: float = 0.0
    side_choice_advantage: float = 0.0
    side_choice_known: float = 0.0


@dataclass(frozen=True)
class VetoChoiceSet:
    """One observed choice and every legal alternative at that step."""

    match_id: int | str
    timestamp: datetime
    step_index: int
    acting_team: int | str
    opponent_team: int | str
    action: str
    chosen_map: str
    available_maps: tuple[str, ...]
    map_pool: tuple[str, ...]
    map_features: Mapping[str, VetoMapFeatures] = field(default_factory=dict)
    event_id: int | str | None = None

    def as_step(self) -> VetoStep:
        return VetoStep(
            match_id=self.match_id,
            timestamp=_utc(self.timestamp),
            step_index=self.step_index,
            acting_team=self.acting_team,
            opponent_team=self.opponent_team,
            action=self.action,
            chosen_map=self.chosen_map,
            event_id=self.event_id,
        )


@dataclass(frozen=True)
class PlannedVetoAction:
    acting_team: int | str
    opponent_team: int | str
    action: str


@dataclass(frozen=True)
class SimulatedVeto:
    steps: tuple[VetoStep, ...]
    played_maps: tuple[str, ...]
    probability: float


@dataclass
class _DecayedMapHistory:
    bans: float = 0.0
    picks: float = 0.0
    floats: float = 0.0
    exposures: float = 0.0
    last_updated: datetime | None = None


class PooledSequentialVetoModel:
    """The previous count-based model, retained only as an OOF comparator."""

    def __init__(self, prior_strength: float = 4.0, opponent_weight: float = 0.35) -> None:
        if prior_strength <= 0:
            raise ValueError("prior_strength must be positive")
        self.prior_strength = float(prior_strength)
        self.opponent_weight = float(opponent_weight)
        self.team_action_counts: dict[tuple[int | str, str], Counter[str]] = defaultdict(Counter)
        self.opponent_action_counts: dict[tuple[int | str, str], Counter[str]] = defaultdict(Counter)
        self.action_counts: dict[str, Counter[str]] = defaultdict(Counter)
        self.all_counts: Counter[str] = Counter()
        self.cutoff: datetime | None = None

    def _accumulate(self, steps: Iterable[VetoStep]) -> None:
        for step in sorted(steps, key=lambda item: (_utc(item.timestamp), str(item.match_id), item.step_index)):
            action = _action_key(step.action)
            self.team_action_counts[(step.acting_team, action)][step.chosen_map] += 1
            self.opponent_action_counts[(step.opponent_team, action)][step.chosen_map] += 1
            self.action_counts[action][step.chosen_map] += 1
            self.all_counts[step.chosen_map] += 1

    def fit(
        self,
        steps: Iterable[VetoStep],
        cutoff: datetime | None = None,
    ) -> "PooledSequentialVetoModel":
        values = list(steps)
        self.cutoff = _utc(cutoff) if cutoff is not None else None
        if self.cutoff is not None and any(_utc(step.timestamp) >= self.cutoff for step in values):
            raise ValueError("veto training rows must be strictly earlier than cutoff")
        self._accumulate(values)
        return self

    def observe(self, steps: Iterable[VetoStep]) -> None:
        self._accumulate(steps)

    def probabilities(
        self,
        acting_team: int | str,
        opponent_team: int | str,
        action: str,
        available_maps: Sequence[str],
    ) -> dict[str, float]:
        available = tuple(dict.fromkeys(available_maps))
        if not available:
            raise ValueError("at least one legal map is required")
        action = _action_key(action)
        population = self.action_counts[action]
        population_total = sum(population[name] for name in available)
        if population_total:
            population_p = {name: population[name] / population_total for name in available}
        else:
            total = sum(self.all_counts[name] for name in available)
            population_p = {
                name: self.all_counts[name] / total if total else 1.0 / len(available)
                for name in available
            }
        team = self.team_action_counts[(acting_team, action)]
        opponent = self.opponent_action_counts[(opponent_team, action)]
        scores = {
            name: team[name] + self.opponent_weight * opponent[name] + self.prior_strength * population_p[name]
            for name in available
        }
        total = sum(scores.values())
        if total <= 0:
            return {name: 1.0 / len(available) for name in available}
        return {name: score / total for name, score in scores.items()}


class SequentialVetoModel:
    """Action-specific conditional logit over the legal maps at every step.

    Coefficients are refit at a caller-supplied rolling cutoff.  The fit builds
    every recency feature using only earlier series and freezes all matches at
    an identical timestamp before adding any of their vetoes to history.
    """

    BASE_FEATURES = (
        "own_map_rating_diff",
        "opponent_map_rating_diff",
        "matchup_rating_diff",
        "historical_ban_rate",
        "historical_pick_rate",
        "historical_float_rate",
        "history_support",
        "map_pool_age",
        "map_pool_age_known",
        "patch_age",
        "patch_age_x_own_map_rating_diff",
        "patch_age_x_opponent_map_rating_diff",
        "patch_age_x_pick_rate",
        "side_choice_advantage",
        "side_choice_known",
    )

    def __init__(
        self,
        *,
        history_half_life_days: float = 90.0,
        history_prior_strength: float = 3.0,
        l2_strength: float = 8.0,
        minimum_action_choices: int = 20,
        maximum_iterations: int = 150,
    ) -> None:
        if history_half_life_days <= 0 or history_prior_strength <= 0:
            raise ValueError("history decay and prior strength must be positive")
        if l2_strength < 0 or minimum_action_choices < 1 or maximum_iterations < 1:
            raise ValueError("invalid conditional-logit fitting controls")
        self.history_half_life_days = float(history_half_life_days)
        self.history_prior_strength = float(history_prior_strength)
        self.l2_strength = float(l2_strength)
        self.minimum_action_choices = int(minimum_action_choices)
        self.maximum_iterations = int(maximum_iterations)
        self.cutoff: datetime | None = None
        self.map_names_: tuple[str, ...] = ()
        self.feature_names_: tuple[str, ...] = ()
        self.coefficients_: dict[str, np.ndarray] = {}
        self.fit_diagnostics_: dict[str, dict[str, object]] = {}
        self._history: dict[tuple[int | str, str], _DecayedMapHistory] = {}

    def _decay_factor(self, last_updated: datetime | None, as_of: datetime) -> float:
        if last_updated is None:
            return 0.0
        days = max(0.0, (_utc(as_of) - last_updated).total_seconds() / 86400.0)
        return 0.5 ** (days / self.history_half_life_days)

    def history_rates(
        self,
        team: int | str,
        map_name: str,
        as_of: datetime,
    ) -> tuple[float, float, float, float]:
        state = self._history.get((team, map_name), _DecayedMapHistory())
        factor = self._decay_factor(state.last_updated, _utc(as_of))
        bans = state.bans * factor
        picks = state.picks * factor
        floats = state.floats * factor
        exposures = state.exposures * factor
        prior = self.history_prior_strength
        denominator = exposures + prior
        return (
            (bans + prior / 3.0) / denominator,
            (picks + prior / 3.0) / denominator,
            (floats + prior / 3.0) / denominator,
            exposures,
        )

    def _add_history(
        self,
        team: int | str,
        map_name: str,
        category: str,
        timestamp: datetime,
    ) -> None:
        timestamp = _utc(timestamp)
        state = self._history.setdefault((team, map_name), _DecayedMapHistory())
        factor = self._decay_factor(state.last_updated, timestamp)
        state.bans *= factor
        state.picks *= factor
        state.floats *= factor
        state.exposures *= factor
        if category == "ban":
            state.bans += 1.0
        elif category == "pick":
            state.picks += 1.0
        else:
            state.floats += 1.0
        state.exposures += 1.0
        state.last_updated = timestamp

    def _observe_timestamp_block(self, choices: Sequence[VetoChoiceSet]) -> None:
        by_match: dict[int | str, list[VetoChoiceSet]] = defaultdict(list)
        for choice in choices:
            by_match[choice.match_id].append(choice)
        for match_choices in by_match.values():
            first = match_choices[0]
            pool = tuple(dict.fromkeys(first.map_pool or first.available_maps))
            teams = {choice.acting_team for choice in match_choices}
            teams.update(choice.opponent_team for choice in match_choices)
            selected: dict[tuple[int | str, str], str] = {}
            for choice in match_choices:
                action = _action_key(choice.action)
                if action in {"ban", "pick"}:
                    selected[(choice.acting_team, choice.chosen_map)] = action
            for team in teams:
                for map_name in pool:
                    self._add_history(
                        team,
                        map_name,
                        selected.get((team, map_name), "float"),
                        first.timestamp,
                    )

    def observe_choice_sets(self, choices: Iterable[VetoChoiceSet]) -> None:
        ordered = sorted(
            choices,
            key=lambda item: (_utc(item.timestamp), str(item.match_id), item.step_index),
        )
        for _, block in groupby(ordered, key=lambda item: _utc(item.timestamp)):
            self._observe_timestamp_block(list(block))

    @staticmethod
    def _choice_sets_from_steps(steps: Sequence[VetoStep]) -> list[VetoChoiceSet]:
        by_match: dict[int | str, list[VetoStep]] = defaultdict(list)
        for step in steps:
            by_match[step.match_id].append(step)
        result: list[VetoChoiceSet] = []
        for match_steps in by_match.values():
            ordered = sorted(match_steps, key=lambda item: item.step_index)
            pool = tuple(dict.fromkeys(step.chosen_map for step in ordered))
            available = list(pool)
            for step in ordered:
                if step.chosen_map not in available:
                    continue
                result.append(
                    VetoChoiceSet(
                        match_id=step.match_id,
                        timestamp=_utc(step.timestamp),
                        step_index=step.step_index,
                        acting_team=step.acting_team,
                        opponent_team=step.opponent_team,
                        action=step.action,
                        chosen_map=step.chosen_map,
                        available_maps=tuple(available),
                        map_pool=pool,
                        event_id=step.event_id,
                    )
                )
                available.remove(step.chosen_map)
        return result

    def _coerce_choices(
        self,
        values: Iterable[VetoChoiceSet | VetoStep],
    ) -> list[VetoChoiceSet]:
        rows = list(values)
        if not rows:
            return []
        if all(isinstance(row, VetoChoiceSet) for row in rows):
            return [row for row in rows if isinstance(row, VetoChoiceSet)]
        if all(isinstance(row, VetoStep) for row in rows):
            return self._choice_sets_from_steps(
                [row for row in rows if isinstance(row, VetoStep)]
            )
        raise TypeError("veto fit rows must all be VetoChoiceSet or all be VetoStep")

    def _feature_vector(self, choice: VetoChoiceSet, map_name: str) -> np.ndarray:
        context = choice.map_features.get(map_name, VetoMapFeatures())
        ban_rate, pick_rate, float_rate, support = self.history_rates(
            choice.acting_team, map_name, choice.timestamp
        )
        own_map_diff = (context.own_rating - context.own_global_rating) / 100.0
        opponent_map_diff = (
            context.opponent_rating - context.opponent_global_rating
        ) / 100.0
        matchup_diff = (context.own_rating - context.opponent_rating) / 100.0
        pool_age = float(np.clip(context.map_pool_age_days / 180.0, 0.0, 4.0))
        patch_age = float(np.clip(context.patch_age_days / 180.0, 0.0, 4.0))
        values = [
            own_map_diff,
            opponent_map_diff,
            matchup_diff,
            ban_rate,
            pick_rate,
            float_rate,
            float(np.clip(support / 10.0, 0.0, 1.0)),
            pool_age,
            float(context.map_pool_age_known),
            patch_age,
            patch_age * own_map_diff,
            patch_age * opponent_map_diff,
            patch_age * pick_rate,
            float(context.side_choice_advantage),
            float(context.side_choice_known),
        ]
        progress = choice.step_index / max(1, len(choice.map_pool) - 1)
        values.extend(1.0 if map_name == name else 0.0 for name in self.map_names_)
        values.extend(progress if map_name == name else 0.0 for name in self.map_names_)
        return np.asarray(values, dtype=float)

    def _matrix(self, choice: VetoChoiceSet) -> np.ndarray:
        return np.vstack(
            [self._feature_vector(choice, name) for name in choice.available_maps]
        )

    def fit(
        self,
        choices: Iterable[VetoChoiceSet | VetoStep],
        cutoff: datetime | None = None,
    ) -> "SequentialVetoModel":
        rows = self._coerce_choices(choices)
        rows.sort(key=lambda item: (_utc(item.timestamp), str(item.match_id), item.step_index))
        self.cutoff = _utc(cutoff) if cutoff is not None else None
        if self.cutoff is not None and any(_utc(row.timestamp) >= self.cutoff for row in rows):
            raise ValueError("veto training rows must be strictly earlier than cutoff")
        self.map_names_ = tuple(
            sorted(
                {name for row in rows for name in (*row.map_pool, *row.available_maps)},
                key=str.casefold,
            )
        )
        self.feature_names_ = (
            *self.BASE_FEATURES,
            *(f"map_bias:{name}" for name in self.map_names_),
            *(f"late_map_bias:{name}" for name in self.map_names_),
        )
        self.coefficients_ = {}
        self.fit_diagnostics_ = {}
        self._history = {}
        action_rows: dict[str, list[tuple[np.ndarray, int]]] = defaultdict(list)
        for _, block_iter in groupby(rows, key=lambda item: _utc(item.timestamp)):
            block = list(block_iter)
            for row in block:
                if row.chosen_map not in row.available_maps or len(row.available_maps) < 2:
                    continue
                action_rows[_action_key(row.action)].append(
                    (self._matrix(row), row.available_maps.index(row.chosen_map))
                )
            self._observe_timestamp_block(block)

        dimension = len(self.feature_names_)
        for action, samples in action_rows.items():
            if len(samples) < self.minimum_action_choices:
                self.coefficients_[action] = np.zeros(dimension, dtype=float)
                self.fit_diagnostics_[action] = {
                    "choices": len(samples),
                    "success": False,
                    "reason": "insufficient_training_choices",
                }
                continue

            def objective(beta: np.ndarray) -> tuple[float, np.ndarray]:
                loss = 0.5 * self.l2_strength * float(beta @ beta)
                gradient = self.l2_strength * beta.copy()
                for matrix, chosen_index in samples:
                    utility = matrix @ beta
                    shifted = utility - float(np.max(utility))
                    exp_utility = np.exp(shifted)
                    probabilities = exp_utility / exp_utility.sum()
                    loss += float(np.log(exp_utility.sum()) + np.max(utility) - utility[chosen_index])
                    gradient += matrix.T @ probabilities - matrix[chosen_index]
                return loss, gradient

            fitted = minimize(
                objective,
                np.zeros(dimension, dtype=float),
                method="L-BFGS-B",
                jac=True,
                options={"maxiter": self.maximum_iterations, "ftol": 1e-10},
            )
            self.coefficients_[action] = np.asarray(fitted.x, dtype=float)
            self.fit_diagnostics_[action] = {
                "choices": len(samples),
                "success": bool(fitted.success),
                "iterations": int(getattr(fitted, "nit", 0)),
                "objective": float(fitted.fun),
                "message": str(fitted.message),
            }
        return self

    def utilities(self, choice: VetoChoiceSet) -> dict[str, float]:
        coefficient = self.coefficients_.get(_action_key(choice.action))
        if coefficient is None or not self.feature_names_:
            return {name: 0.0 for name in choice.available_maps}
        matrix = self._matrix(choice)
        values = matrix @ coefficient
        return {
            name: float(value)
            for name, value in zip(choice.available_maps, values, strict=True)
        }

    def probabilities(
        self,
        acting_team: int | str,
        opponent_team: int | str,
        action: str,
        available_maps: Sequence[str],
        *,
        timestamp: datetime | None = None,
        step_index: int = 0,
        map_pool: Sequence[str] | None = None,
        map_features: Mapping[str, VetoMapFeatures] | None = None,
        choice_context: VetoChoiceSet | None = None,
    ) -> dict[str, float]:
        available = tuple(dict.fromkeys(available_maps))
        if not available:
            raise ValueError("at least one legal map is required")
        if choice_context is None:
            context = VetoChoiceSet(
                match_id="__prediction__",
                timestamp=_utc(timestamp or self.cutoff or datetime(1970, 1, 1, tzinfo=timezone.utc)),
                step_index=int(step_index),
                acting_team=acting_team,
                opponent_team=opponent_team,
                action=action,
                chosen_map="",
                available_maps=available,
                map_pool=tuple(map_pool or available),
                map_features=map_features or {},
            )
        else:
            context = replace(
                choice_context,
                acting_team=acting_team,
                opponent_team=opponent_team,
                action=action,
                available_maps=available,
                chosen_map="",
            )
        utilities = self.utilities(context)
        values = np.asarray([utilities[name] for name in available], dtype=float)
        values -= float(np.max(values))
        probabilities = np.exp(values)
        probabilities /= probabilities.sum()
        return {
            name: float(probability)
            for name, probability in zip(available, probabilities, strict=True)
        }

    def sequence_probability(
        self,
        steps: Sequence[VetoStep],
        map_pool: Sequence[str],
    ) -> float:
        available = list(dict.fromkeys(map_pool))
        probability = 1.0
        for step in sorted(steps, key=lambda item: item.step_index):
            if step.chosen_map not in available:
                return 0.0
            distribution = self.probabilities(
                step.acting_team,
                step.opponent_team,
                step.action,
                available,
                timestamp=step.timestamp,
                step_index=step.step_index,
                map_pool=map_pool,
            )
            probability *= distribution[step.chosen_map]
            available.remove(step.chosen_map)
        return float(probability)

    def simulate(
        self,
        match_id: int | str,
        timestamp: datetime,
        actions: Sequence[PlannedVetoAction],
        map_pool: Sequence[str],
        rng: np.random.Generator | None = None,
        *,
        choice_contexts: Sequence[VetoChoiceSet] | None = None,
    ) -> SimulatedVeto:
        rng = rng or np.random.default_rng()
        available = list(dict.fromkeys(map_pool))
        if len(available) != len(map_pool):
            raise ValueError("map_pool must contain unique maps")
        if len(actions) >= len(available):
            raise ValueError("veto actions must leave at least one legal decider")
        if choice_contexts is not None and len(choice_contexts) != len(actions):
            raise ValueError("choice_contexts must align with actions")
        probability = 1.0
        steps: list[VetoStep] = []
        picks: list[str] = []
        for index, planned in enumerate(actions):
            context = choice_contexts[index] if choice_contexts is not None else None
            distribution = self.probabilities(
                planned.acting_team,
                planned.opponent_team,
                planned.action,
                available,
                timestamp=timestamp,
                step_index=index,
                map_pool=map_pool,
                choice_context=context,
            )
            maps = list(distribution)
            probabilities = np.asarray([distribution[name] for name in maps], dtype=float)
            probabilities /= probabilities.sum()
            chosen = str(rng.choice(maps, p=probabilities))
            probability *= distribution[chosen]
            steps.append(
                VetoStep(
                    match_id=match_id,
                    timestamp=_utc(timestamp),
                    step_index=index,
                    acting_team=planned.acting_team,
                    opponent_team=planned.opponent_team,
                    action=_action_key(planned.action),
                    chosen_map=chosen,
                )
            )
            if _action_key(planned.action) == "pick":
                picks.append(chosen)
            available.remove(chosen)
        played = tuple(picks + ([available[0]] if len(available) == 1 else []))
        return SimulatedVeto(tuple(steps), played, float(probability))


ConditionalLogitVetoModel = SequentialVetoModel


def standard_veto_actions(
    team_a: int | str,
    team_b: int | str,
    best_of: int,
) -> tuple[PlannedVetoAction, ...]:
    """Return a common seven-map alternating template."""

    if best_of == 3:
        labels = (
            (team_a, team_b, "ban"),
            (team_b, team_a, "ban"),
            (team_a, team_b, "pick"),
            (team_b, team_a, "pick"),
            (team_a, team_b, "ban"),
            (team_b, team_a, "ban"),
        )
    elif best_of == 5:
        labels = (
            (team_a, team_b, "ban"),
            (team_b, team_a, "ban"),
            (team_a, team_b, "pick"),
            (team_b, team_a, "pick"),
            (team_a, team_b, "pick"),
            (team_b, team_a, "pick"),
        )
    else:
        raise ValueError("only best-of-three and best-of-five are supported")
    return tuple(PlannedVetoAction(*item) for item in labels)


__all__ = [
    "ConditionalLogitVetoModel",
    "PlannedVetoAction",
    "PooledSequentialVetoModel",
    "SequentialVetoModel",
    "SimulatedVeto",
    "VetoChoiceSet",
    "VetoMapFeatures",
    "VetoStep",
    "standard_veto_actions",
]
