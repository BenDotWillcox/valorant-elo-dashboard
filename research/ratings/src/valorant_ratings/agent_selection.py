"""As-of agent selection probabilities and legal composition sampling.

Input rows require ``player_id``, ``team_id``, ``map_name`` and ``agent``.  A
``timestamp``/``map_time``/``date`` column is needed when a cutoff is supplied.
``patch`` is optional.  A canonical ``map_id`` (or ``match_id`` and map number)
lets the model infer historical five-player rosters.  All count tables are fit
only from rows strictly before the requested cutoff.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from math import log
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from .contracts import canonical_agent_key


def _clean(value: Any) -> Any:
    if isinstance(value, np.generic):
        value = value.item()
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "__MISSING__"
    return value


def _utc(value: Any) -> pd.Timestamp:
    if isinstance(value, (int, float, np.integer, np.floating)):
        return pd.to_datetime(value, unit="s" if abs(float(value)) < 10**12 else "ms", utc=True)
    result = pd.Timestamp(value)
    return result.tz_localize("UTC") if result.tzinfo is None else result.tz_convert("UTC")


@dataclass(frozen=True, slots=True)
class AgentComposition:
    """One legal no-duplicate assignment and its sequential sample weight."""

    assignments: tuple[tuple[Any, str], ...]
    probability: float

    def as_dict(self) -> dict[Any, str]:
        return dict(self.assignments)

    @property
    def agents(self) -> tuple[str, ...]:
        return tuple(agent for _, agent in self.assignments)


class AgentSelectionModel:
    """Hierarchical categorical model with player/map/patch/roster backoff."""

    LEVELS: tuple[str, ...] = (
        "exact",
        "player_map_patch",
        "player_map",
        "player_patch",
        "player",
        "map_patch",
        "map",
        "patch",
    )

    def __init__(
        self,
        *,
        concentration: float = 0.35,
        backoff_strength: float = 8.0,
        legal_agents: Sequence[str] | None = None,
        agent_roles: Mapping[str, str] | None = None,
        random_state: int = 7,
    ) -> None:
        self.concentration = float(concentration)
        self.backoff_strength = float(backoff_strength)
        self.declared_legal_agents = tuple(legal_agents or ())
        self.agent_roles = {str(agent): str(role) for agent, role in (agent_roles or {}).items()}
        self.agent_roles_by_fold = {
            canonical_agent_key(agent): str(role) for agent, role in (agent_roles or {}).items()
        }
        self.random_state = int(random_state)

    @staticmethod
    def _identity_columns(frame: pd.DataFrame) -> list[str]:
        if "map_id" in frame:
            return ["map_id"]
        if "canonical_map_id" in frame:
            return ["canonical_map_id"]
        if "match_id" in frame:
            result = ["match_id"]
            result.append(next((name for name in ("game_number", "map_number", "map_name") if name in frame), "map_name"))
            return result
        return []

    def fit(
        self,
        frame: pd.DataFrame,
        *,
        cutoff: datetime | date | pd.Timestamp | None = None,
    ) -> "AgentSelectionModel":
        required = {"player_id", "team_id", "map_name", "agent"}
        missing = sorted(required.difference(frame.columns))
        if missing:
            raise ValueError(f"agent selection frame is missing required columns: {missing}")
        work = frame.copy().reset_index(drop=True)
        time_col = next(
            (
                name
                for name in (
                    "prediction_cutoff",
                    "timestamp",
                    "map_completed_at",
                    "match_completed_at",
                    "map_time",
                    "date",
                )
                if name in work
            ),
            None,
        )
        if cutoff is not None:
            if time_col is None:
                raise ValueError("a timestamp column is required when cutoff is supplied")
            boundary = _utc(cutoff)
            work["_timestamp"] = work[time_col].map(_utc)
            work = work.loc[work["_timestamp"] < boundary].reset_index(drop=True)
            self.training_cutoff_ = boundary
        elif time_col is not None:
            work["_timestamp"] = work[time_col].map(_utc)
            latest_timestamp = work["_timestamp"].max()
            self.training_cutoff_ = pd.Timestamp(
                latest_timestamp.value + 1, unit="ns", tz="UTC"
            )
        else:
            self.training_cutoff_ = None
        if work.empty:
            raise ValueError("no agent selections strictly predate cutoff")
        if "patch" not in work:
            work["patch"] = "__UNKNOWN_PATCH__"

        identity = self._identity_columns(work)
        if not identity:
            work["_map_key"] = np.arange(len(work)) // 10
            identity = ["_map_key"]
        map_keys = [tuple(_clean(row[name]) for name in identity) for _, row in work.iterrows()]
        work["_team_map_key"] = [(*key, _clean(team)) for key, team in zip(map_keys, work["team_id"])]
        lineup_by_key = {
            key: tuple(sorted((_clean(value) for value in group["player_id"]), key=str))
            for key, group in work.groupby("_team_map_key", sort=False)
        }
        work["_lineup"] = [lineup_by_key[key] for key in work["_team_map_key"]]

        observed_agents = [str(agent) for agent in work["agent"].dropna().unique()]
        agents_by_fold = {
            canonical_agent_key(agent): agent
            for agent in (*observed_agents, *self.declared_legal_agents)
        }
        self.agent_by_fold_ = agents_by_fold
        self.agents_ = tuple(sorted(agents_by_fold.values(), key=str.casefold))
        if len(self.agents_) < 5:
            raise ValueError("at least five legal agents are required to sample a composition")
        work["agent"] = work["agent"].map(
            lambda value: self.agent_by_fold_.get(canonical_agent_key(value), str(value))
        )
        self.global_counts_ = Counter(str(agent) for agent in work["agent"])
        self.counts_: dict[str, dict[tuple[Any, ...], Counter[str]]] = {
            level: defaultdict(Counter) for level in self.LEVELS
        }
        self.player_role_counts_: dict[Any, Counter[str]] = defaultdict(Counter)
        for _, row in work.iterrows():
            player = _clean(row["player_id"])
            map_name = _clean(row["map_name"])
            patch = _clean(row["patch"])
            lineup = tuple(row["_lineup"])
            agent = str(row["agent"])
            keys = {
                "exact": (player, map_name, patch, lineup),
                "player_map_patch": (player, map_name, patch),
                "player_map": (player, map_name),
                "player_patch": (player, patch),
                "player": (player,),
                "map_patch": (map_name, patch),
                "map": (map_name,),
                "patch": (patch,),
            }
            for level, key in keys.items():
                self.counts_[level][key][agent] += 1
            role = self.agent_roles_by_fold.get(canonical_agent_key(agent))
            if role:
                self.player_role_counts_[player][role] += 1
        self.n_training_rows_ = len(work)
        self.is_fitted_ = True
        return self

    def _check(self) -> None:
        if not getattr(self, "is_fitted_", False):
            raise RuntimeError("fit the agent selection model before predicting")

    def _distribution(self, counts: Counter[str], candidates: Sequence[str]) -> np.ndarray:
        raw = np.asarray([counts.get(agent, 0.0) + self.concentration for agent in candidates], dtype=float)
        return raw / raw.sum()

    def predict_proba(
        self,
        player_id: Any,
        map_name: str,
        *,
        patch: Any = "__UNKNOWN_PATCH__",
        roster: Sequence[Any] | None = None,
        forbidden_agents: Iterable[str] = (),
        legal_agents: Sequence[str] | None = None,
    ) -> dict[str, float]:
        """Return ``P(agent | player, map, roster, patch, as-of history)``."""
        self._check()
        forbidden = {canonical_agent_key(agent) for agent in forbidden_agents}
        declared = tuple(legal_agents or self.agents_)
        canonical = {
            canonical_agent_key(agent): self.agent_by_fold_.get(
                canonical_agent_key(agent), str(agent)
            )
            for agent in declared
        }
        candidates = [
            agent for fold, agent in canonical.items() if fold not in forbidden
        ]
        if not candidates:
            raise ValueError("no legal agents remain after applying composition constraints")
        player = _clean(player_id)
        map_key = _clean(map_name)
        patch_key = _clean(patch)
        lineup = tuple(sorted((_clean(value) for value in (roster or ())), key=str))
        keys = {
            "exact": (player, map_key, patch_key, lineup),
            "player_map_patch": (player, map_key, patch_key),
            "player_map": (player, map_key),
            "player_patch": (player, patch_key),
            "player": (player,),
            "map_patch": (map_key, patch_key),
            "map": (map_key,),
            "patch": (patch_key,),
        }
        probability = self._distribution(self.global_counts_, candidates)
        # General-to-specific blending lets exact contexts dominate only after
        # accumulating enough support; sparse contexts inherit a legal prior.
        for level in reversed(self.LEVELS):
            counts = self.counts_[level].get(keys[level], Counter())
            support = sum(counts.values())
            if support <= 0:
                continue
            local = self._distribution(counts, candidates)
            blend = support / (support + self.backoff_strength)
            probability = (1.0 - blend) * probability + blend * local

        # A player's historical role supplies a weak prior when an agent is new
        # on this map/patch, without forbidding genuine role swaps.
        role_counts = self.player_role_counts_.get(player, Counter())
        if role_counts and self.agent_roles:
            role_mass = np.asarray([
                role_counts.get(
                    self.agent_roles_by_fold.get(
                        canonical_agent_key(agent), "__UNKNOWN_ROLE__"
                    ),
                    0.0,
                )
                + self.concentration
                for agent in candidates
            ])
            role_mass /= role_mass.sum()
            probability = 0.9 * probability + 0.1 * role_mass
        probability /= probability.sum()
        return {agent: float(value) for agent, value in zip(candidates, probability)}

    predict = predict_proba

    def sample_compositions(
        self,
        roster: Sequence[Any],
        map_name: str,
        *,
        patch: Any = "__UNKNOWN_PATCH__",
        n: int = 100,
        forced_assignments: Mapping[Any, str] | None = None,
        random_state: int | np.random.Generator | None = None,
    ) -> list[AgentComposition]:
        """Sample legal five-player assignments without duplicate agents."""
        self._check()
        players = tuple(_clean(value) for value in roster)
        if len(players) != 5 or len(set(players)) != 5:
            raise ValueError("a composition roster must contain five unique players")
        forced = {
            _clean(player): self.agent_by_fold_.get(
                canonical_agent_key(agent), str(agent)
            )
            for player, agent in (forced_assignments or {}).items()
        }
        if not set(forced).issubset(players):
            raise ValueError("forced assignments must refer to roster players")
        if len({canonical_agent_key(agent) for agent in forced.values()}) != len(forced):
            raise ValueError("forced assignments contain duplicate agents")
        legal_fold = {canonical_agent_key(agent) for agent in self.agents_}
        if any(canonical_agent_key(agent) not in legal_fold for agent in forced.values()):
            raise ValueError("a forced assignment names an unknown or inactive agent")
        rng = random_state if isinstance(random_state, np.random.Generator) else np.random.default_rng(
            self.random_state if random_state is None else random_state
        )
        output: list[AgentComposition] = []
        for _ in range(int(n)):
            assignment = dict(forced)
            used = {canonical_agent_key(agent) for agent in forced.values()}
            remaining = [player for player in players if player not in forced]
            # Most-constrained players draw first, reducing sequential-order bias
            # and eliminating dead ends in realistic five-agent pools.
            entropy_order: list[tuple[float, str, Any]] = []
            for player in remaining:
                p = np.asarray(list(self.predict_proba(player, map_name, patch=patch, roster=players).values()))
                entropy_order.append((float(-(p * np.log(np.maximum(p, 1e-12))).sum()), str(player), player))
            remaining = [item[2] for item in sorted(entropy_order)]
            log_probability = 0.0
            for player in remaining:
                distribution = self.predict_proba(
                    player,
                    map_name,
                    patch=patch,
                    roster=players,
                    forbidden_agents=used,
                )
                agents = list(distribution)
                probability = np.asarray(list(distribution.values()), dtype=float)
                probability /= probability.sum()
                selected_index = int(rng.choice(len(agents), p=probability))
                selected = agents[selected_index]
                assignment[player] = selected
                used.add(canonical_agent_key(selected))
                log_probability += log(max(float(probability[selected_index]), 1e-300))
            normalized = tuple(sorted(assignment.items(), key=lambda item: str(item[0])))
            output.append(AgentComposition(normalized, float(np.exp(log_probability))))
        return output

    def composition_distribution(
        self,
        roster: Sequence[Any],
        map_name: str,
        *,
        patch: Any = "__UNKNOWN_PATCH__",
        n: int = 250,
        forced_assignments: Mapping[Any, str] | None = None,
        random_state: int | None = None,
    ) -> list[AgentComposition]:
        """Collapse repeated Monte Carlo samples into normalized mass."""
        samples = self.sample_compositions(
            roster,
            map_name,
            patch=patch,
            n=n,
            forced_assignments=forced_assignments,
            random_state=random_state,
        )
        counts = Counter(sample.assignments for sample in samples)
        return [
            AgentComposition(assignments, count / len(samples))
            for assignments, count in sorted(counts.items(), key=lambda item: (-item[1], str(item[0])))
        ]

    @staticmethod
    def is_legal_composition(assignments: Mapping[Any, str] | Sequence[tuple[Any, str]]) -> bool:
        items = list(assignments.items() if isinstance(assignments, Mapping) else assignments)
        return (
            len(items) == 5
            and len({player for player, _ in items}) == 5
            and len({canonical_agent_key(agent) for _, agent in items}) == 5
        )


__all__ = ["AgentComposition", "AgentSelectionModel"]
