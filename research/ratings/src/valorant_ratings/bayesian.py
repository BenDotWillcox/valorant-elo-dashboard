"""Optional PyMC finalist matching the empirical-Bayes hierarchy.

PyMC and ArviZ are imported only when ``fit`` is called, keeping lightweight
batch scoring and unit tests usable without the Bayesian dependency group.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd


def _utc(value: Any) -> pd.Timestamp:
    result = pd.Timestamp(value)
    return result.tz_localize("UTC") if result.tzinfo is None else result.tz_convert("UTC")


@dataclass(frozen=True, slots=True)
class ConvergenceDiagnostics:
    r_hat_max: float
    ess_bulk_min: float
    divergences: int
    chains: int
    draws_per_chain: int
    passed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class BayesianHierarchicalFinalist:
    """Scalar Student-t player/map/agent partial-pooling finalist.

    Required frame columns are ``player_id``, ``map_name``, ``agent``, the
    selected target, and a timestamp column for cutoff filtering.  Fit one
    instance per component or use a downstream multivariate extension.  This
    class is deliberately a finalist wrapper rather than the default search
    model because MCMC must be rerun in every honest temporal fold.
    """

    def __init__(
        self,
        *,
        target_col: str = "kpr",
        timestamp_col: str = "timestamp",
        random_state: int = 17,
    ) -> None:
        self.target_col = str(target_col)
        self.timestamp_col = str(timestamp_col)
        self.random_state = int(random_state)

    @staticmethod
    def model_specification() -> Mapping[str, Any]:
        return {
            "likelihood": "StudentT",
            "fixed_effects": ["population intercept"],
            "hierarchical_effects": ["player", "map", "agent", "player×map", "player×agent"],
            "unseen_levels": "zero-centered population draw with posterior group-scale uncertainty",
            "diagnostic_gate": {"r_hat_max": 1.01, "ess_bulk_min": 400, "divergences": 0},
        }

    def fit(
        self,
        frame: pd.DataFrame,
        *,
        cutoff: datetime | date | pd.Timestamp | None = None,
        draws: int = 750,
        tune: int = 750,
        chains: int = 4,
        cores: int | None = None,
        target_accept: float = 0.92,
        progressbar: bool = False,
    ) -> "BayesianHierarchicalFinalist":
        try:
            import arviz as az  # noqa: F401
            import pymc as pm
        except ImportError as exc:  # pragma: no cover - dependency-specific
            raise RuntimeError(
                "BayesianHierarchicalFinalist requires the research Bayesian dependencies "
                "(install PyMC and ArviZ from the ratings workspace)"
            ) from exc

        required = {"player_id", "map_name", "agent", self.target_col}
        missing = sorted(required.difference(frame.columns))
        if missing:
            raise ValueError(f"Bayesian finalist frame is missing columns: {missing}")
        work = frame.copy()
        if cutoff is not None:
            if self.timestamp_col not in work:
                raise ValueError(f"cutoff requires {self.timestamp_col!r}")
            boundary = _utc(cutoff)
            timestamp = work[self.timestamp_col].map(_utc)
            work = work.loc[timestamp < boundary].copy()
            self.training_cutoff_ = boundary
        if work.empty:
            raise ValueError("no rows strictly predate the Bayesian fit cutoff")
        work = work.dropna(subset=[self.target_col]).reset_index(drop=True)

        self.levels_ = {}
        encoded = {}
        for column in ("player_id", "map_name", "agent"):
            levels = tuple(pd.unique(work[column]))
            self.levels_[column] = levels
            lookup = {value: index for index, value in enumerate(levels)}
            encoded[column] = work[column].map(lookup).to_numpy(dtype=int)
        player_map_levels = tuple(
            pd.unique(pd.Series(list(zip(work["player_id"], work["map_name"])), dtype=object))
        )
        player_agent_levels = tuple(
            pd.unique(pd.Series(list(zip(work["player_id"], work["agent"])), dtype=object))
        )
        player_map_lookup = {value: index for index, value in enumerate(player_map_levels)}
        player_agent_lookup = {value: index for index, value in enumerate(player_agent_levels)}
        player_map_index = np.asarray(
            [player_map_lookup[value] for value in zip(work["player_id"], work["map_name"])], dtype=int
        )
        player_agent_index = np.asarray(
            [player_agent_lookup[value] for value in zip(work["player_id"], work["agent"])], dtype=int
        )
        self.interaction_levels_ = {
            "player_map": player_map_levels,
            "player_agent": player_agent_levels,
        }
        y = work[self.target_col].to_numpy(dtype=float)
        y_scale = float(max(np.std(y), 1e-4))
        coords = {
            "player": self.levels_["player_id"],
            "map": self.levels_["map_name"],
            "agent": self.levels_["agent"],
            "player_map": np.arange(len(player_map_levels)),
            "player_agent": np.arange(len(player_agent_levels)),
            "observation": np.arange(len(work)),
        }
        with pm.Model(coords=coords) as model:
            population = pm.Normal("population", mu=float(np.mean(y)), sigma=2.0 * y_scale)
            sigma_player = pm.HalfNormal("sigma_player", sigma=y_scale)
            sigma_map = pm.HalfNormal("sigma_map", sigma=0.5 * y_scale)
            sigma_agent = pm.HalfNormal("sigma_agent", sigma=0.5 * y_scale)
            sigma_player_map = pm.HalfNormal("sigma_player_map", sigma=0.35 * y_scale)
            sigma_player_agent = pm.HalfNormal("sigma_player_agent", sigma=0.35 * y_scale)
            player_raw = pm.Normal("player_raw", 0.0, 1.0, dims="player")
            map_raw = pm.Normal("map_raw", 0.0, 1.0, dims="map")
            agent_raw = pm.Normal("agent_raw", 0.0, 1.0, dims="agent")
            player_map_raw = pm.Normal("player_map_raw", 0.0, 1.0, dims="player_map")
            player_agent_raw = pm.Normal("player_agent_raw", 0.0, 1.0, dims="player_agent")
            mu = (
                population
                + sigma_player * player_raw[encoded["player_id"]]
                + sigma_map * map_raw[encoded["map_name"]]
                + sigma_agent * agent_raw[encoded["agent"]]
                + sigma_player_map * player_map_raw[player_map_index]
                + sigma_player_agent * player_agent_raw[player_agent_index]
            )
            observation_scale = pm.HalfNormal("observation_scale", sigma=y_scale)
            nu = pm.Exponential("nu_minus_two", 1.0 / 20.0) + 2.0
            pm.StudentT(
                "observed",
                nu=nu,
                mu=mu,
                sigma=observation_scale,
                observed=y,
                dims="observation",
            )
            self.idata_ = pm.sample(
                draws=int(draws),
                tune=int(tune),
                chains=int(chains),
                cores=cores,
                target_accept=float(target_accept),
                random_seed=self.random_state,
                progressbar=progressbar,
                return_inferencedata=True,
            )
        self.model_ = model
        self.n_training_rows_ = len(work)
        self.is_fitted_ = True
        return self

    def diagnostics(self) -> ConvergenceDiagnostics:
        if not getattr(self, "is_fitted_", False):
            raise RuntimeError("fit the Bayesian finalist before requesting diagnostics")
        import arviz as az

        variables = [
            "population",
            "sigma_player",
            "sigma_map",
            "sigma_agent",
            "sigma_player_map",
            "sigma_player_agent",
            "observation_scale",
        ]
        summary = az.summary(self.idata_, var_names=variables, kind="diagnostics")
        r_hat_max = float(summary["r_hat"].max())
        ess_bulk_min = float(summary["ess_bulk"].min())
        divergences = int(self.idata_.sample_stats["diverging"].sum().item())
        chains = int(self.idata_.posterior.sizes["chain"])
        draws = int(self.idata_.posterior.sizes["draw"])
        return ConvergenceDiagnostics(
            r_hat_max=r_hat_max,
            ess_bulk_min=ess_bulk_min,
            divergences=divergences,
            chains=chains,
            draws_per_chain=draws,
            passed=(r_hat_max <= 1.01 and ess_bulk_min >= 400.0 and divergences == 0),
        )

    convergence_diagnostics = diagnostics

    def predict(self, contexts: pd.DataFrame, *, include_observation_noise: bool = True) -> pd.DataFrame:
        """Return posterior mean/SD and partial-pooling support for contexts."""
        if not getattr(self, "is_fitted_", False):
            raise RuntimeError("fit the Bayesian finalist before predicting")
        required = {"player_id", "map_name", "agent"}
        missing = sorted(required.difference(contexts.columns))
        if missing:
            raise ValueError(f"Bayesian prediction contexts are missing columns: {missing}")
        posterior = self.idata_.posterior.stack(sample=("chain", "draw"))
        population = posterior["population"].values
        scales = {
            "player_id": posterior["sigma_player"].values,
            "map_name": posterior["sigma_map"].values,
            "agent": posterior["sigma_agent"].values,
        }
        raw_names = {"player_id": "player_raw", "map_name": "map_raw", "agent": "agent_raw"}
        level_lookup = {
            column: {value: index for index, value in enumerate(levels)}
            for column, levels in self.levels_.items()
        }
        player_map_lookup = {value: index for index, value in enumerate(self.interaction_levels_["player_map"])}
        player_agent_lookup = {value: index for index, value in enumerate(self.interaction_levels_["player_agent"])}
        rng = np.random.default_rng(self.random_state)
        records = []
        for row in contexts.itertuples(index=False):
            values = {column: getattr(row, column) for column in required}
            draws = population.copy()
            unseen = 0
            for column in ("player_id", "map_name", "agent"):
                index = level_lookup[column].get(values[column])
                if index is None:
                    draws = draws + rng.normal(0.0, scales[column])
                    unseen += 1
                else:
                    raw = posterior[raw_names[column]].values[index]
                    draws = draws + scales[column] * raw
            pm_key = (values["player_id"], values["map_name"])
            pa_key = (values["player_id"], values["agent"])
            for key, lookup, raw_name, scale_name in (
                (pm_key, player_map_lookup, "player_map_raw", "sigma_player_map"),
                (pa_key, player_agent_lookup, "player_agent_raw", "sigma_player_agent"),
            ):
                index = lookup.get(key)
                scale = posterior[scale_name].values
                if index is None:
                    draws = draws + rng.normal(0.0, scale)
                    unseen += 1
                else:
                    draws = draws + scale * posterior[raw_name].values[index]
            if include_observation_noise:
                draws = draws + rng.normal(0.0, posterior["observation_scale"].values)
            records.append(
                {
                    "mean": float(np.mean(draws)),
                    "standard_deviation": float(np.std(draws)),
                    "interval80_low": float(np.quantile(draws, 0.10)),
                    "interval80_high": float(np.quantile(draws, 0.90)),
                    "interval95_low": float(np.quantile(draws, 0.025)),
                    "interval95_high": float(np.quantile(draws, 0.975)),
                    "support": "extrapolated" if unseen >= 3 else ("partially-pooled" if unseen else "observed"),
                }
            )
        return pd.DataFrame.from_records(records, index=contexts.index)


__all__ = ["BayesianHierarchicalFinalist", "ConvergenceDiagnostics"]
