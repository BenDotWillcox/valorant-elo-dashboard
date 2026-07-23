"""Pre/post-veto series forecasts with shared latent strength draws."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from typing import Callable, Mapping, Sequence

import numpy as np

from .veto import PlannedVetoAction, SequentialVetoModel


def _logit(probability: float) -> float:
    p = float(np.clip(probability, 1e-8, 1 - 1e-8))
    return float(np.log(p / (1 - p)))


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + np.exp(-value))
    exp_value = np.exp(value)
    return float(exp_value / (1.0 + exp_value))


@dataclass(frozen=True)
class SeriesForecast:
    team_a_win_probability: float
    simulation_standard_error: float
    simulations: int
    expected_maps_played: float
    mode: str


class SeriesSimulator:
    """Monte Carlo series engine that preserves cross-map dependence.

    A single latent log-odds perturbation is drawn for each simulated series.
    That draw captures match-day form/lineup uncertainty shared by all maps;
    conditional map outcomes remain independent given the draw.
    """

    def __init__(
        self,
        shared_strength_std: float = 0.30,
        map_noise_std: float = 0.0,
        seed: int = 20260714,
    ) -> None:
        if shared_strength_std < 0 or map_noise_std < 0:
            raise ValueError("latent standard deviations cannot be negative")
        self.shared_strength_std = float(shared_strength_std)
        self.map_noise_std = float(map_noise_std)
        self.rng = np.random.default_rng(seed)

    @staticmethod
    def _needed(best_of: int) -> int:
        if best_of not in (1, 3, 5):
            raise ValueError("best_of must be 1, 3, or 5")
        return best_of // 2 + 1

    def _draw_series(
        self,
        ordered_maps: Sequence[str],
        probability_for_map: Callable[[str], float],
        best_of: int,
    ) -> tuple[bool, int]:
        needed = self._needed(best_of)
        if len(ordered_maps) < best_of:
            raise ValueError("ordered_maps must contain at least best_of maps")
        shared = float(self.rng.normal(0.0, self.shared_strength_std))
        wins_a = wins_b = maps_played = 0
        for map_name in ordered_maps[:best_of]:
            map_noise = float(self.rng.normal(0.0, self.map_noise_std))
            probability = _sigmoid(_logit(probability_for_map(map_name)) + shared + map_noise)
            won = bool(self.rng.random() < probability)
            wins_a += int(won)
            wins_b += int(not won)
            maps_played += 1
            if wins_a == needed or wins_b == needed:
                break
        return wins_a == needed, maps_played

    def post_veto(
        self,
        ordered_maps: Sequence[str],
        map_probabilities: Mapping[str, float] | Callable[[str], float],
        best_of: int,
        simulations: int = 20_000,
    ) -> SeriesForecast:
        probability_fn = (
            map_probabilities
            if callable(map_probabilities)
            else lambda map_name: map_probabilities[map_name]
        )
        outcomes = np.empty(simulations, dtype=float)
        maps_played = np.empty(simulations, dtype=float)
        for index in range(simulations):
            won, count = self._draw_series(ordered_maps, probability_fn, best_of)
            outcomes[index] = won
            maps_played[index] = count
        probability = float(outcomes.mean())
        standard_error = sqrt(max(0.0, probability * (1 - probability) / simulations))
        return SeriesForecast(
            probability,
            standard_error,
            simulations,
            float(maps_played.mean()),
            "post-veto",
        )

    def pre_veto(
        self,
        veto_model: SequentialVetoModel,
        match_id: int | str,
        timestamp: datetime,
        actions: Sequence[PlannedVetoAction],
        map_pool: Sequence[str],
        map_probabilities: Mapping[str, float] | Callable[[str], float],
        best_of: int,
        simulations: int = 20_000,
    ) -> SeriesForecast:
        probability_fn = (
            map_probabilities
            if callable(map_probabilities)
            else lambda map_name: map_probabilities[map_name]
        )
        outcomes = np.empty(simulations, dtype=float)
        maps_played = np.empty(simulations, dtype=float)
        for index in range(simulations):
            veto = veto_model.simulate(match_id, timestamp, actions, map_pool, self.rng)
            if len(veto.played_maps) < best_of:
                raise ValueError(
                    "veto action template does not determine enough maps for the requested series"
                )
            won, count = self._draw_series(veto.played_maps, probability_fn, best_of)
            outcomes[index] = won
            maps_played[index] = count
        probability = float(outcomes.mean())
        standard_error = sqrt(max(0.0, probability * (1 - probability) / simulations))
        return SeriesForecast(
            probability,
            standard_error,
            simulations,
            float(maps_played.mean()),
            "pre-veto",
        )


def independent_series_probability(map_probabilities: Sequence[float], best_of: int) -> float:
    """Exact comparator that intentionally assumes independent map outcomes."""

    needed = SeriesSimulator._needed(best_of)
    if len(map_probabilities) < best_of:
        raise ValueError("not enough map probabilities")
    states = {(0, 0): 1.0}
    for probability in map_probabilities[:best_of]:
        next_states: dict[tuple[int, int], float] = {}
        for (wins_a, wins_b), mass in states.items():
            if wins_a == needed or wins_b == needed:
                next_states[(wins_a, wins_b)] = next_states.get((wins_a, wins_b), 0.0) + mass
                continue
            next_states[(wins_a + 1, wins_b)] = next_states.get((wins_a + 1, wins_b), 0.0) + mass * probability
            next_states[(wins_a, wins_b + 1)] = next_states.get((wins_a, wins_b + 1), 0.0) + mass * (1 - probability)
        states = next_states
    return float(sum(mass for (wins_a, _), mass in states.items() if wins_a == needed))


__all__ = ["SeriesForecast", "SeriesSimulator", "independent_series_probability"]
