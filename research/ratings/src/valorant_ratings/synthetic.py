"""Synthetic conditional-rating data and parameter-recovery checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

import numpy as np
import pandas as pd

from .player import HierarchicalPlayerModel


@dataclass(frozen=True, slots=True)
class SyntheticRatingData:
    frame: pd.DataFrame
    player_skill: Mapping[int, float]
    map_effect: Mapping[str, float]
    agent_effect: Mapping[str, float]
    player_agent_effect: Mapping[tuple[int, str], float]


def generate_synthetic_player_data(
    *,
    n_maps: int = 500,
    n_teams: int = 6,
    players_per_team: int = 5,
    random_state: int = 19,
) -> SyntheticRatingData:
    """Generate ten player rows per canonical map with known latent effects.

    The simulation deliberately makes selection non-random: players prefer
    several agents.  That makes it useful for checking predictive recovery and
    uncertainty behavior, but not for claiming causal agent effects.
    """
    if n_teams < 2 or players_per_team != 5:
        raise ValueError("synthetic generator expects at least two five-player teams")
    rng = np.random.default_rng(random_state)
    maps = ("Ascent", "Bind", "Haven", "Lotus", "Split", "Sunset", "Icebox")
    agents = (
        "Jett",
        "Raze",
        "Omen",
        "Viper",
        "Sova",
        "Skye",
        "Cypher",
        "Killjoy",
        "Breach",
        "KAY/O",
    )
    players = tuple(range(1, n_teams * players_per_team + 1))
    rosters = {
        team: players[(team - 1) * players_per_team : team * players_per_team]
        for team in range(1, n_teams + 1)
    }
    player_skill = {player: float(rng.normal(0.0, 0.85)) for player in players}
    map_effect = {name: float(rng.normal(0.0, 0.28)) for name in maps}
    agent_effect = {name: float(rng.normal(0.0, 0.24)) for name in agents}
    player_map = {(player, name): float(rng.normal(0.0, 0.16)) for player in players for name in maps}
    player_agent = {(player, name): float(rng.normal(0.0, 0.18)) for player in players for name in agents}
    preferences = {
        player: rng.dirichlet(np.exp(rng.normal(0.0, 1.0, len(agents))))
        for player in players
    }
    agent_pair = {
        tuple(sorted(pair)): float(rng.normal(0.0, 0.055))
        for i, left in enumerate(agents)
        for pair in ((left, right) for right in agents[i + 1 :])
    }

    rows: list[dict[str, Any]] = []
    start = pd.Timestamp("2023-01-01", tz="UTC")
    for map_id in range(1, n_maps + 1):
        team_a, team_b = rng.choice(np.arange(1, n_teams + 1), size=2, replace=False)
        map_name = str(rng.choice(maps))
        patch = f"synthetic-{1 + (map_id - 1) // max(n_maps // 4, 1)}"
        timestamp = start + pd.to_timedelta(12 * map_id, unit="h")
        rounds = int(rng.integers(18, 27))
        team_latents: dict[int, list[tuple[int, str, float]]] = {}
        for team in (int(team_a), int(team_b)):
            used: set[str] = set()
            selected: dict[int, str] = {}
            # Sequentially enforce Valorant's no-duplicate-agent rule.
            for player in rosters[team]:
                probability = preferences[player].copy()
                probability[[index for index, agent in enumerate(agents) if agent in used]] = 0.0
                probability /= probability.sum()
                agent = str(rng.choice(agents, p=probability))
                selected[player] = agent
                used.add(agent)
            pair_bonus = sum(agent_pair[tuple(sorted(pair))] for i, left in enumerate(used) for pair in ((left, right) for right in list(used)[i + 1 :]))
            values: list[tuple[int, str, float]] = []
            for player, agent in selected.items():
                latent = (
                    player_skill[player]
                    + map_effect[map_name]
                    + agent_effect[agent]
                    + player_map[player, map_name]
                    + player_agent[player, agent]
                    + pair_bonus / 5.0
                    + rng.normal(0.0, 0.32)
                )
                values.append((player, agent, float(latent)))
            team_latents[team] = values
        strength_a = sum(value for _, _, value in team_latents[int(team_a)]) / 5.0
        strength_b = sum(value for _, _, value in team_latents[int(team_b)]) / 5.0
        margin_a = float(np.clip(0.22 * (strength_a - strength_b) + rng.normal(0.0, 0.12), -0.8, 0.8))
        for team, opponent, signed_margin in (
            (int(team_a), int(team_b), margin_a),
            (int(team_b), int(team_a), -margin_a),
        ):
            for player, agent, latent in team_latents[team]:
                kpr = float(np.clip(0.70 + 0.075 * latent + rng.normal(0.0, 0.035), 0.25, 1.25))
                dpr = float(np.clip(0.70 - 0.042 * latent + rng.normal(0.0, 0.028), 0.25, 1.15))
                apr = float(np.clip(0.31 + 0.045 * latent + rng.normal(0.0, 0.03), 0.02, 0.85))
                fd_attempt = float(np.clip(0.18 + 0.014 * latent + rng.normal(0.0, 0.012), 0.04, 0.40))
                fd_win = float(np.clip(0.50 + 0.065 * latent + rng.normal(0.0, 0.04), 0.08, 0.92))
                adr = float(np.clip(140.0 + 11.5 * latent + rng.normal(0.0, 7.0), 65.0, 240.0))
                kast = float(np.clip(0.71 + 0.035 * latent + rng.normal(0.0, 0.023), 0.35, 0.95))
                acs = float(np.clip(205.0 + 19.0 * latent + rng.normal(0.0, 11.0), 75.0, 360.0))
                attempts = int(round(fd_attempt * rounds))
                first_kills = int(round(attempts * fd_win))
                rows.append(
                    {
                        "map_id": map_id,
                        "match_id": (map_id - 1) // 3 + 1,
                        "game_number": (map_id - 1) % 3 + 1,
                        "timestamp": timestamp,
                        "player_id": player,
                        "team_id": team,
                        "opponent_team_id": opponent,
                        "map_name": map_name,
                        "agent": agent,
                        "patch": patch,
                        "region": "synthetic",
                        "event_context": "synthetic-league",
                        "rounds": rounds,
                        "kills": int(round(kpr * rounds)),
                        "deaths": int(round(dpr * rounds)),
                        "assists": int(round(apr * rounds)),
                        "first_kills": first_kills,
                        "first_deaths": attempts - first_kills,
                        "kpr": kpr,
                        "dpr": dpr,
                        "apr": apr,
                        "first_duel_attempt_rate": fd_attempt,
                        "first_duel_win_rate": fd_win,
                        "adr": adr,
                        "kast": kast,
                        "acs": acs,
                        "normalized_round_margin": signed_margin,
                        "map_win": int(signed_margin > 0),
                    }
                )
    return SyntheticRatingData(
        frame=pd.DataFrame.from_records(rows),
        player_skill=player_skill,
        map_effect=map_effect,
        agent_effect=agent_effect,
        player_agent_effect=player_agent,
    )


def recovery_report(
    model: HierarchicalPlayerModel,
    synthetic: SyntheticRatingData,
    *,
    component: str = "kpr",
) -> dict[str, float]:
    """Summarize rank recovery; intended for tests, not model selection."""
    true_player = []
    estimated_player = []
    for player, truth in synthetic.player_skill.items():
        true_player.append(truth)
        estimated_player.append(model.effect_value("player_state", player, component))
    true_map = []
    estimated_map = []
    for map_name, truth in synthetic.map_effect.items():
        true_map.append(truth)
        estimated_map.append(model.effect_value("map_effect", map_name, component))
    true_agent = []
    estimated_agent = []
    for agent, truth in synthetic.agent_effect.items():
        true_agent.append(truth)
        estimated_agent.append(model.effect_value("agent_effect", agent, component))

    def correlation(left: list[float], right: list[float]) -> float:
        if np.std(left) < 1e-12 or np.std(right) < 1e-12:
            return 0.0
        return float(np.corrcoef(left, right)[0, 1])

    return {
        "player_rank_correlation": correlation(true_player, estimated_player),
        "map_rank_correlation": correlation(true_map, estimated_map),
        "agent_rank_correlation": correlation(true_agent, estimated_agent),
    }


__all__ = ["SyntheticRatingData", "generate_synthetic_player_data", "recovery_report"]
