"""Scenario and standardized conditional-rating interface.

Agent swaps are *predictive/associational counterfactuals*: they report the
model's expected difference while specified inputs are held fixed.  Strategic
agent choice is not randomized, so these deltas must not be presented as causal
effects of forcing a player onto an agent.
"""

from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
from math import exp, sqrt
from typing import Any, Callable, Iterable, Mapping, Sequence

import numpy as np

from .agent_selection import AgentSelectionModel
from .contracts import (
    ConditionalRating,
    canonical_agent_key,
    PlayerRatingQuery,
    ScenarioComparison,
    Support,
    TeammateAssignment,
)
from .player import HierarchicalPlayerModel, PlayerForecast


def _sigmoid(value: float) -> float:
    value = float(np.clip(value, -30.0, 30.0))
    return 1.0 / (1.0 + exp(-value))


def _seed(*values: Any) -> int:
    digest = sha256("|".join(map(str, values)).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "little") % (2**32 - 1)


def _query_signature(query: PlayerRatingQuery) -> tuple[Any, ...]:
    teammates = tuple(
        sorted(
            (
                (item.player_id, canonical_agent_key(item.agent))
                for item in query.teammate_assignments
            )
        )
    )
    return (
        query.as_of,
        query.player_id,
        query.map_name,
        canonical_agent_key(query.agent) if query.agent else None,
        query.team_id,
        teammates,
        query.opponent_team_id,
        query.forecast_mode.value,
    )


class ScenarioEngine:
    """Marginalize conditional player forecasts and compare explicit scenarios.

    ``rate`` is the stable entry point.  With no map or agent, it returns the
    canonical standardized rating: equal active-map weights and predicted legal
    agent/composition weights.  Fixing map and/or agent yields map, agent, and
    map-agent views; supplying four teammate assignments fixes the composition.
    """

    def __init__(
        self,
        player_model: HierarchicalPlayerModel,
        agent_selection_model: AgentSelectionModel | None,
        *,
        active_maps: Sequence[str],
        current_patch: str = "__UNKNOWN_PATCH__",
        composition_samples: int = 48,
        neutral_opponent_team_id: int | None = None,
        team_logit_scale: float = 1.0,
        team_win_probability: Callable[[PlayerRatingQuery, ConditionalRating], float] | None = None,
    ) -> None:
        if not active_maps:
            raise ValueError("active_maps cannot be empty")
        self.player_model = player_model
        self.agent_selection_model = agent_selection_model
        self.active_maps = tuple(dict.fromkeys(map(str, active_maps)))
        self.current_patch = str(current_patch)
        self.composition_samples = int(composition_samples)
        self.neutral_opponent_team_id = neutral_opponent_team_id
        self.team_logit_scale = float(team_logit_scale)
        self.team_win_probability = team_win_probability

    def _roster(self, query: PlayerRatingQuery) -> tuple[Any, ...]:
        if query.teammate_assignments:
            return tuple(sorted((query.player_id, *(item.player_id for item in query.teammate_assignments)), key=str))
        if query.team_id is None:
            return tuple()
        roster = self.player_model.roster_for_team(query.team_id)
        if query.player_id not in roster:
            return tuple()
        return roster if len(roster) == 5 else tuple()

    def _agent_choices(
        self,
        query: PlayerRatingQuery,
        map_name: str,
        roster: Sequence[Any],
        forbidden_agents: Iterable[str],
    ) -> list[tuple[str, float]]:
        if query.agent:
            if canonical_agent_key(query.agent) in {
                canonical_agent_key(agent) for agent in forbidden_agents
            }:
                raise ValueError("the focal agent duplicates a teammate agent")
            return [(query.agent, 1.0)]
        if self.agent_selection_model is None:
            raise ValueError("an agent-selection model is required to marginalize an unspecified agent")
        probability = self.agent_selection_model.predict_proba(
            query.player_id,
            map_name,
            patch=self.current_patch,
            roster=roster,
            forbidden_agents=forbidden_agents,
        )
        return list(probability.items())

    def _composition_choices(
        self,
        query: PlayerRatingQuery,
        map_name: str,
        focal_agent: str,
        roster: Sequence[Any],
    ) -> list[tuple[tuple[TeammateAssignment, ...], float]]:
        if query.teammate_assignments:
            assignments = tuple(sorted(query.teammate_assignments, key=lambda item: item.player_id))
            return [(assignments, 1.0)]
        if self.agent_selection_model is None or len(roster) != 5 or self.composition_samples <= 0:
            return [(tuple(), 1.0)]
        distribution = self.agent_selection_model.composition_distribution(
            roster,
            map_name,
            patch=self.current_patch,
            n=self.composition_samples,
            forced_assignments={query.player_id: focal_agent},
            random_state=_seed(query.as_of.isoformat(), query.player_id, map_name, focal_agent),
        )
        result: list[tuple[tuple[TeammateAssignment, ...], float]] = []
        for composition in distribution:
            teammates = tuple(
                sorted(
                    (
                        TeammateAssignment(player_id=int(player), agent=agent)
                        for player, agent in composition.assignments
                        if player != query.player_id
                    ),
                    key=lambda item: item.player_id,
                )
            )
            result.append((teammates, composition.probability))
        return result

    def _forecast(
        self,
        query: PlayerRatingQuery,
        map_name: str,
        agent: str,
        teammates: Sequence[TeammateAssignment],
    ) -> PlayerForecast:
        return self.player_model.forecast(
            {
                "as_of": query.as_of,
                "player_id": query.player_id,
                "map_name": map_name,
                "agent": agent,
                "patch": self.current_patch,
                "team_id": query.team_id,
                "teammate_assignments": tuple(teammates),
                "opponent_team_id": query.opponent_team_id or self.neutral_opponent_team_id,
            }
        )

    @staticmethod
    def _mix(weighted: Sequence[tuple[PlayerForecast, float]]) -> ConditionalRating:
        total = sum(weight for _, weight in weighted)
        if total <= 0:
            raise ValueError("scenario marginalization produced zero probability mass")
        normalized = [(forecast, weight / total) for forecast, weight in weighted]
        performance = sum(weight * item.performance_mean for item, weight in normalized)
        contribution = sum(weight * item.contribution_mean for item, weight in normalized)
        second_moment = sum(
            weight * (item.standard_deviation**2 + item.performance_mean**2)
            for item, weight in normalized
        )
        standard_deviation = sqrt(max(second_moment - performance**2, 0.0))
        decomposition_keys = set().union(*(item.decomposition for item, _ in normalized))
        decomposition = {
            key: sum(weight * item.decomposition.get(key, 0.0) for item, weight in normalized)
            for key in sorted(decomposition_keys)
        }
        support_mass = {value: 0.0 for value in ("observed", "partially-pooled", "extrapolated")}
        for item, weight in normalized:
            support_mass[item.support] += weight
        if support_mass["extrapolated"] >= 0.20:
            support = Support.EXTRAPOLATED
        elif support_mass["observed"] >= 0.80:
            support = Support.OBSERVED
        else:
            support = Support.PARTIALLY_POOLED
        return ConditionalRating(
            performance_mean=performance,
            contribution_mean=contribution,
            standard_deviation=standard_deviation,
            interval80=(performance - 1.2815515655 * standard_deviation, performance + 1.2815515655 * standard_deviation),
            interval95=(performance - 1.9599639845 * standard_deviation, performance + 1.9599639845 * standard_deviation),
            support=support,
            decomposition=decomposition,
        )

    def rate(self, query: PlayerRatingQuery) -> ConditionalRating:
        maps = (query.map_name,) if query.map_name else self.active_maps
        roster = self._roster(query)
        fixed_teammate_agents = tuple(item.agent for item in query.teammate_assignments)
        weighted: list[tuple[PlayerForecast, float]] = []
        map_weight = 1.0 / len(maps)
        for map_name in maps:
            agent_choices = self._agent_choices(query, map_name, roster, fixed_teammate_agents)
            for agent, agent_weight in agent_choices:
                for teammates, composition_weight in self._composition_choices(query, map_name, agent, roster):
                    forecast = self._forecast(query, map_name, agent, teammates)
                    weighted.append((forecast, map_weight * agent_weight * composition_weight))
        return self._mix(weighted)

    predict = rate
    standardize = rate

    def _team_probability(self, query: PlayerRatingQuery, rating: ConditionalRating) -> float:
        if self.team_win_probability is not None:
            value = float(self.team_win_probability(query, rating))
            if not 0.0 <= value <= 1.0:
                raise ValueError("team_win_probability callback must return a value in [0, 1]")
            return value
        return _sigmoid(rating.contribution_mean / self.team_logit_scale)

    def compare(
        self,
        baseline_query: PlayerRatingQuery,
        alternative_query: PlayerRatingQuery,
    ) -> ScenarioComparison:
        baseline = self.rate(baseline_query)
        if _query_signature(baseline_query) == _query_signature(alternative_query):
            return ScenarioComparison(
                baseline=baseline,
                alternative=baseline,
                performance_delta=0.0,
                contribution_delta=0.0,
                team_win_probability_delta=0.0,
                uncertainty_of_delta=0.0,
            )
        alternative = self.rate(alternative_query)
        shared_context = baseline_query.player_id == alternative_query.player_id
        shared_context &= baseline_query.map_name == alternative_query.map_name
        correlation = 0.65 if shared_context else 0.25
        variance = (
            baseline.standard_deviation**2
            + alternative.standard_deviation**2
            - 2.0 * correlation * baseline.standard_deviation * alternative.standard_deviation
        )
        return ScenarioComparison(
            baseline=baseline,
            alternative=alternative,
            performance_delta=alternative.performance_mean - baseline.performance_mean,
            contribution_delta=alternative.contribution_mean - baseline.contribution_mean,
            team_win_probability_delta=(
                self._team_probability(alternative_query, alternative)
                - self._team_probability(baseline_query, baseline)
            ),
            uncertainty_of_delta=sqrt(max(variance, 0.0)),
        )

    @staticmethod
    def with_agent_swap(
        query: PlayerRatingQuery,
        *,
        player_id: int,
        new_agent: str,
    ) -> PlayerRatingQuery:
        """Return a new query changing only the explicitly selected assignment."""
        if player_id == query.player_id:
            return replace(query, agent=str(new_agent))
        found = False
        changed: list[TeammateAssignment] = []
        for assignment in query.teammate_assignments:
            if assignment.player_id == player_id:
                changed.append(TeammateAssignment(player_id=player_id, agent=str(new_agent)))
                found = True
            else:
                changed.append(assignment)
        if not found:
            raise ValueError("the requested teammate is not present in the scenario")
        return replace(
            query,
            teammate_assignments=tuple(changed),
        )


def compare_scenarios(
    engine: ScenarioEngine,
    baseline: PlayerRatingQuery,
    alternative: PlayerRatingQuery,
) -> ScenarioComparison:
    """Functional alias useful in notebooks and batch scorers."""
    return engine.compare(baseline, alternative)


__all__ = ["ScenarioEngine", "compare_scenarios"]
