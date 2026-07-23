"""Build and execute the reproducible research notebook suite with nbformat."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent
from typing import Any

import nbformat
from nbclient import NotebookClient


NOTEBOOK_NAMES = (
    "00_data_audit.ipynb",
    "01_team_baselines.ipynb",
    "02_player_components.ipynb",
    "03_conditional_interactions.ipynb",
    "04_agent_selection_and_veto.ipynb",
    "05_final_holdout_comparison.ipynb",
    "06_round_level_feasibility.ipynb",
    "07_rating_explorer.ipynb",
)


def _code(source: str) -> Any:
    return nbformat.v4.new_code_cell(dedent(source).strip())


def _markdown(source: str) -> Any:
    return nbformat.v4.new_markdown_cell(dedent(source).strip())


def _parameters(snapshot: Path, development: Path | None) -> Any:
    artifact_root = development.parent if development is not None else Path("artifacts").resolve()
    final = (
        artifact_root / f"{development.name}__2026-confirmation"
        if development is not None
        else artifact_root / "__missing_confirmation__"
    )
    canonical_scoring_v5 = (
        artifact_root / f"{development.name}__rating-snapshots-v5"
        if development is not None
        else artifact_root / "__missing_scoring_v5__"
    )
    scoring_v5_candidates = (
        [canonical_scoring_v5]
        + sorted(
            artifact_root.glob(
                f"{development.name}__rating-snapshots-v5-ref-*"
            ),
            key=lambda path: path.stat().st_mtime_ns,
        )
        if development is not None
        else [canonical_scoring_v5]
    )
    existing_scoring_v5 = [path for path in scoring_v5_candidates if path.exists()]
    scoring_v5 = (
        max(existing_scoring_v5, key=lambda path: path.stat().st_mtime_ns)
        if existing_scoring_v5
        else canonical_scoring_v5
    )
    scoring_v4 = (
        artifact_root / f"{development.name}__rating-snapshots-v4"
        if development is not None
        else artifact_root / "__missing_scoring_v4__"
    )
    scoring_v3 = (
        artifact_root / f"{development.name}__rating-snapshots-v3"
        if development is not None
        else artifact_root / "__missing_scoring_v3__"
    )
    scoring_v2 = (
        artifact_root / f"{development.name}__rating-snapshots-v2"
        if development is not None
        else artifact_root / "__missing_scoring_v2__"
    )
    scoring_v1 = (
        artifact_root / f"{development.name}__rating-snapshots"
        if development is not None
        else artifact_root / "__missing_scoring_v1__"
    )
    return _code(
        f"""
        from pathlib import Path

        SNAPSHOT = Path(r"{snapshot.resolve()}")
        DEVELOPMENT = Path(r"{development.resolve() if development is not None else (artifact_root / '__missing_development__').resolve()}")
        CONFIRMATION = Path(r"{final.resolve()}")
        SCORING_V5 = Path(r"{scoring_v5.resolve()}")
        SCORING_V4 = Path(r"{scoring_v4.resolve()}")
        SCORING_V3 = Path(r"{scoring_v3.resolve()}")
        SCORING_V2 = Path(r"{scoring_v2.resolve()}")
        SCORING_V1 = Path(r"{scoring_v1.resolve()}")
        SCORING = (
            SCORING_V5
            if SCORING_V5.exists()
            else (SCORING_V4 if SCORING_V4.exists() else (SCORING_V3 if SCORING_V3.exists() else (SCORING_V2 if SCORING_V2.exists() else SCORING_V1)))
        )

        print("snapshot:", SNAPSHOT)
        print("development:", DEVELOPMENT if DEVELOPMENT.exists() else "not supplied")
        print("confirmation:", CONFIRMATION if CONFIRMATION.exists() else "not available")
        print("scoring:", SCORING if SCORING.exists() else "not available")
        """
    )


def _document(title: str, purpose: str, cells: list[Any]) -> Any:
    notebook = nbformat.v4.new_notebook()
    notebook.metadata = {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python", "version": "3.12"},
        "valorant_ratings": {"executed": False, "research_contract": "research-v1"},
    }
    notebook.cells = [
        _markdown(
            f"""
            # {title}

            {purpose}

            This notebook is generated from immutable, hash-manifested artifacts. Any
            counterfactual agent or composition result is predictive/associational,
            not a causal estimate.
            """
        ),
        *cells,
    ]
    return notebook


def build_notebook_documents(
    *, snapshot: Path, development: Path | None = None
) -> dict[str, Any]:
    """Create validated notebook documents without executing them."""

    common = _parameters(snapshot, development)
    documents: dict[str, Any] = {}

    documents[NOTEBOOK_NAMES[0]] = _document(
        "Immutable snapshot and leakage audit",
        "Validate canonical map identity, temporal cutoffs, source coverage, and sparsity before modeling.",
        [
            common,
            _code(
                """
                import json
                import pandas as pd
                import matplotlib.pyplot as plt
                from IPython.display import display

                manifest = json.loads((SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))
                tables = {
                    name: pd.read_parquet(SNAPSHOT / f"{name}.parquet")
                    for name in ("maps", "player_maps", "rosters", "vetoes")
                }
                summary = pd.DataFrame(
                    {
                        "table": name,
                        "rows": len(frame),
                        "columns": len(frame.columns),
                    }
                    for name, frame in tables.items()
                )
                display(summary)
                print("data sha256:", manifest["data_sha256"])
                print("cutoff:", manifest["cutoff"])
                """
            ),
            _code(
                """
                maps = tables["maps"].copy()
                player_maps = tables["player_maps"].copy()
                cutoff = pd.Timestamp(manifest["cutoff"])
                prediction_times = pd.to_datetime(maps["prediction_cutoff"], utc=True)

                checks = pd.Series(
                    {
                        "one row per map_id": not maps["map_id"].duplicated().any(),
                        "all prediction cutoffs within snapshot": bool((prediction_times <= cutoff).all()),
                        "ten player rows per map": bool(player_maps.groupby("map_id").size().eq(10).all()),
                        "positive score-derived total rounds": bool((maps["total_rounds"] > 0).all()),
                        "player rows reference canonical maps": bool(player_maps["map_id"].isin(maps["map_id"]).all()),
                    },
                    name="passed",
                )
                display(checks.to_frame())
                assert checks.all(), checks[~checks].index.tolist()

                missing = player_maps[[column for column in ("adr", "kast", "acs") if column in player_maps]].isna().mean()
                display(missing.rename("missing_fraction").to_frame())
                """
            ),
            _code(
                """
                composition = (
                    player_maps.groupby(["map_id", "team_id"])["agent"]
                    .agg(lambda values: "|".join(sorted(map(str, values))))
                    .rename("composition")
                    .reset_index()
                )
                support = player_maps.merge(composition, on=["map_id", "team_id"], validate="many_to_one")
                sparsity = pd.Series(
                    {
                        "median maps/player": support.groupby("player_id").size().median(),
                        "median player-map": support.groupby(["player_id", "map_name"]).size().median(),
                        "median player-agent": support.groupby(["player_id", "agent"]).size().median(),
                        "median player-map-agent": support.groupby(["player_id", "map_name", "agent"]).size().median(),
                        "median exact context": support.groupby(["player_id", "map_name", "agent", "composition"]).size().median(),
                    },
                    name="maps",
                )
                display(sparsity.to_frame())

                yearly = prediction_times.dt.year.value_counts().sort_index()
                ax = yearly.plot.bar(title="Canonical maps by prediction year", color="#ff4655")
                ax.set(xlabel="year", ylabel="maps")
                plt.tight_layout()
                plt.show()
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[1]] = _document(
        "Team baselines and predictive backbone",
        "Compare the base rate, hard-reset Elo, tuned carryover, uncertainty baseline, dynamic backbone, and contextual challengers on rolling 2024–2025 forecasts.",
        [
            common,
            _code(
                """
                import json
                import numpy as np
                import pandas as pd
                import matplotlib.pyplot as plt
                from IPython.display import display

                if not DEVELOPMENT.exists():
                    raise FileNotFoundError("Pass --development to render model results")
                metrics = pd.read_parquet(DEVELOPMENT / "metrics" / "team.parquet")
                predictions = pd.read_parquet(DEVELOPMENT / "predictions" / "map_oof.parquet")
                gates = json.loads((DEVELOPMENT / "promotion_gates.json").read_text(encoding="utf-8"))["gates"]
                selection = json.loads((DEVELOPMENT / "selection.json").read_text(encoding="utf-8"))
                display(metrics.sort_values("map_log_loss"))
                display(pd.json_normalize(gates))
                print("frozen decision:", selection["selected_config"])
                """
            ),
            _code(
                """
                fig, ax = plt.subplots(figsize=(8, 5))
                for model in ("current_elo", "carryover", "backbone", "blend"):
                    column = f"{model}_probability"
                    if column not in predictions:
                        continue
                    work = predictions[[column, "team_a_won"]].dropna().copy()
                    work["bin"] = pd.qcut(work[column], 10, duplicates="drop")
                    reliability = work.groupby("bin", observed=True).agg(
                        predicted=(column, "mean"), observed=("team_a_won", "mean"), maps=("team_a_won", "size")
                    )
                    ax.plot(reliability["predicted"], reliability["observed"], marker="o", label=model)
                ax.plot([0, 1], [0, 1], linestyle="--", color="black", alpha=0.5)
                ax.set(xlabel="predicted map-win probability", ylabel="observed rate", title="Development reliability")
                ax.legend()
                plt.tight_layout()
                plt.show()
                """
            ),
            _markdown(
                """
                Promotion requires a match-clustered paired log-loss interval below
                zero, no material Brier/calibration degradation, and the same-direction
                result on the untouched 2026 confirmation set.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[2]] = _document(
        "Player component and Predictive Box VPM forecasts",
        "Evaluate next-map component forecasts, learned box weights, ablations, likelihood, and interval coverage.",
        [
            common,
            _code(
                """
                import pandas as pd
                import matplotlib.pyplot as plt
                from IPython.display import display

                metrics = pd.read_parquet(DEVELOPMENT / "metrics" / "player_ablations.parquet")
                predictions = pd.read_parquet(DEVELOPMENT / "predictions" / "player_oof.parquet")
                box = metrics.loc[metrics["component"] == "__box_vpm__"].sort_values("mae")
                display(box)
                best = str(box.iloc[0]["ablation"])
                print("lowest-MAE player ablation:", best)
                calibration_path = SCORING / "player_uncertainty_calibration.json"
                if calibration_path.exists():
                    import json
                    display(pd.Series(json.loads(calibration_path.read_text(encoding="utf-8")), name="value").to_frame())

                ax = box.set_index("ablation")["mae"].sort_values().plot.barh(
                    title="Predictive Box VPM MAE by interaction layer", color="#0f9d8a"
                )
                ax.set(xlabel="MAE", ylabel="ablation")
                plt.tight_layout()
                plt.show()
                """
            ),
            _code(
                """
                component_rows = metrics.loc[
                    (metrics["ablation"] == best) & (metrics["component"] != "__box_vpm__")
                ].sort_values("mae")
                display(component_rows)

                selected = predictions.loc[predictions["ablation"] == best]
                coverage = selected.groupby("component").agg(
                    observations=("absolute_error", "size"),
                    mae=("absolute_error", "mean"),
                    interval80_coverage=("covered80", "mean"),
                    mean_log_likelihood=("log_likelihood", "mean"),
                )
                display(coverage)
                """
            ),
            _markdown(
                """
                The player performance score is retained independently of a causal
                contribution interpretation. A lineup-result contribution update is
                promoted only if it adds transfer and roster-change forecast lift.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[3]] = _document(
        "Conditional interactions and scenario support",
        "Inspect map, agent, map–agent, composition, support, uncertainty, and teammate-agent swap behavior.",
        [
            common,
            _code(
                """
                import pandas as pd
                import matplotlib.pyplot as plt
                from IPython.display import display

                ratings = pd.read_parquet(SCORING / "player_ratings.parquet")
                scenarios = pd.read_parquet(SCORING / "scenario_comparisons.parquet")
                natural = pd.read_parquet(DEVELOPMENT / "associational" / "teammate_agent_swap_summary.parquet")

                support = ratings.groupby("support").agg(
                    rows=("player_id", "size"),
                    mean_sd=("standard_deviation", "mean"),
                    median_sd=("standard_deviation", "median"),
                ).sort_values("mean_sd")
                display(support)
                display(ratings.groupby(["view", "support"]).size().unstack(fill_value=0))
                """
            ),
            _code(
                """
                order = [value for value in ("observed", "partially-pooled", "extrapolated") if value in support.index]
                ax = support.loc[order, "mean_sd"].plot.bar(
                    title="Mean predictive uncertainty by support", color=["#4caf50", "#ffb300", "#ef5350"][:len(order)]
                )
                ax.set(xlabel="support class", ylabel="rating standard deviation")
                plt.tight_layout()
                plt.show()

                scenario_summary = scenarios.groupby("change_type").agg(
                    scenarios=("player_id", "size"),
                    mean_performance_delta=("performance_delta", "mean"),
                    mean_abs_performance_delta=("performance_delta", lambda values: values.abs().mean()),
                    mean_abs_win_probability_delta=("team_win_probability_delta", lambda values: values.abs().mean()),
                    median_delta_uncertainty=("uncertainty_of_delta", "median"),
                )
                display(scenario_summary)
                display(natural)
                """
            ),
            _markdown(
                """
                Exact five-agent lineups are not assigned independent coefficients.
                Shared player–agent, role, pair, focal-response, and pooled interaction
                terms provide estimates for unseen cells. Swap deltas hold recorded
                inputs fixed but remain associational because agent choices are strategic.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[4]] = _document(
        "Agent selection, veto, and series forecasts",
        "Audit legal agent probabilities, pre/post-veto series scores, and whether the pooled sequential veto model beats a uniform choice baseline.",
        [
            common,
            _code(
                """
                import numpy as np
                import pandas as pd
                from IPython.display import display

                probabilities = pd.read_parquet(SCORING / "agent_selection_probabilities.parquet")
                veto = pd.read_parquet(DEVELOPMENT / "metrics" / "veto.parquet")
                series = pd.read_parquet(DEVELOPMENT / "metrics" / "series.parquet")

                sums = probabilities.groupby(["player_id", "team_id", "map_name"])["probability"].sum()
                print("maximum probability-sum error:", float((sums - 1).abs().max()))
                assert np.allclose(sums, 1.0)
                display(series)
                display(veto)
                """
            ),
            _code(
                """
                probabilities["entropy_term"] = -probabilities["probability"] * np.log(
                    probabilities["probability"].clip(lower=1e-12)
                )
                entropy = probabilities.groupby(["player_id", "team_id", "map_name"])["entropy_term"].sum()
                display(entropy.describe().rename("agent_assignment_entropy"))

                example_key = probabilities.groupby(["player_id", "team_id", "map_name"]).size().index[0]
                example = probabilities.set_index(["player_id", "team_id", "map_name"]).loc[example_key]
                display(example.nlargest(10, "probability")[["agent", "probability"]])

                row = veto.iloc[0]
                if row["choice_log_loss"] >= row["uniform_choice_log_loss"]:
                    print("Decision: reject the current veto model; it underperforms uniform choice log loss.")
                else:
                    print("Decision: veto model improves on uniform choice log loss.")
                """
            ),
            _markdown(
                """
                Series simulations use shared latent strength draws so map outcomes are
                correlated. A veto model is useful only when its held-out action log loss
                improves on the legal uniform baseline; otherwise pre-veto integration
                should retain a simpler map prior.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[5]] = _document(
        "Frozen 2026 confirmation and model decision",
        "Report the one-time holdout outcome after selection and calibration were frozen on 2024–2025 development data.",
        [
            common,
            _code(
                """
                import json
                import pandas as pd
                import matplotlib.pyplot as plt
                from IPython.display import display, Markdown

                payload = json.loads((CONFIRMATION / "final_report_payload.json").read_text(encoding="utf-8"))
                metrics = pd.read_parquet(CONFIRMATION / "metrics" / "team_2026.parquet")
                gates = json.loads((CONFIRMATION / "promotion_gates_2026.json").read_text(encoding="utf-8"))["gates"]
                display(metrics.sort_values("map_log_loss"))
                display(pd.json_normalize(gates))

                decision = payload["decision"]
                display(Markdown(
                    f"**Decision:** rating backbone `{decision['rating_backbone']}`; "
                    f"forecast champion `{decision['forecast_champion']}`; "
                    f"promotion passed `{decision['promotion_passed']}`; "
                    f"lockbox `{decision['lockbox_status']}`."
                ))
                """
            ),
            _code(
                """
                indexed = metrics.set_index("model")
                comparison = pd.Series(
                    {
                        "current Elo log loss": indexed.loc["current_elo", "map_log_loss"],
                        "carryover log loss": indexed.loc["carryover", "map_log_loss"],
                        "log-loss improvement": indexed.loc["current_elo", "map_log_loss"] - indexed.loc["carryover", "map_log_loss"],
                        "current Elo Brier": indexed.loc["current_elo", "brier"],
                        "carryover Brier": indexed.loc["carryover", "brier"],
                        "carryover calibration slope": indexed.loc["carryover", "calibration_slope"],
                        "holdout maps": indexed.loc["carryover", "maps"],
                    },
                    name="2026 confirmation",
                )
                display(comparison.to_frame())

                ax = metrics.sort_values("map_log_loss").set_index("model")["map_log_loss"].plot.barh(
                    title="2026 map log loss (lower is better)", color="#ff4655"
                )
                ax.set(xlabel="log loss", ylabel="model")
                plt.tight_layout()
                plt.show()
                """
            ),
            _markdown(
                """
                The holdout is confirmation, not another tuning set. A model that failed
                its development gate remains rejected even if its 2026 point estimate is
                favorable. The lockbox marker prevents a second confirmation run for this
                frozen experiment.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[6]] = _document(
        "Round-level and staged data-expansion feasibility",
        "Record which economy, side, utility, trade, plant, and ult features exist today and define the next data gate without leaking realized match state into pre-match forecasts.",
        [
            common,
            _code(
                """
                import json
                import pandas as pd
                from IPython.display import display

                feasibility = json.loads((DEVELOPMENT / "round_level_feasibility.json").read_text(encoding="utf-8"))
                sparsity = json.loads((DEVELOPMENT / "data_sparsity.json").read_text(encoding="utf-8"))
                display(pd.json_normalize([feasibility]).T.rename(columns={0: "value"}))
                display(pd.Series(sparsity, name="value").to_frame())
                """
            ),
            _code(
                """
                staged = pd.DataFrame(
                    [
                        ("VCT map-level benchmark", "complete", "team and conditional-player promotion gates"),
                        ("Tier 2 history", "next", "rerun identical VCT holdouts; improve debut/transfer priors"),
                        ("Round economy/side", "feasibility", "credits, loadouts, pistol/bonus, ults, plants, utility, trades"),
                        ("Live between-map forecast", "out of scope", "requires live state and a separate evaluation protocol"),
                    ],
                    columns=["stage", "status", "decision rule"],
                )
                display(staged)
                """
            ),
            _markdown(
                """
                Realized credits, ult state, plants, and round outcomes cannot be used in
                a pre-match forecast. A later round-level model may convert historical
                economy performance into cutoff-safe team/player skills, and should be
                judged by the same untouched future-map and transfer tests.
                """
            ),
        ],
    )

    documents[NOTEBOOK_NAMES[7]] = _document(
        "Interactive team and player rating explorer",
        "Explore the frozen global, map, agent, and player-conditional rating snapshots with editable display and ranking parameters.",
        [
            _markdown(
                """
                ## Goal

                This notebook provides a compact playground for the selected rating
                snapshots. It includes global and per-map team rankings, per-map and
                per-agent player leaderboards, and name-based player profiles.

                The editable parameters change how frozen predictions are filtered and
                ranked. They do **not** refit the model or constitute new model selection.
                """
            ),
            common,
            _code(
                """
                import sys

                if sys.version_info[:2] != (3, 12):
                    raise RuntimeError(
                        "This notebook requires the 'Python 3.12 (Valorant Ratings)' kernel. "
                        f"Current interpreter: {sys.executable} ({sys.version.split()[0]}). "
                        "Use the notebook kernel picker, select the Valorant Ratings kernel, "
                        "restart the kernel, and Run All."
                    )

                print("kernel:", sys.executable)
                print("python:", sys.version.split()[0])
                """
            ),
            _markdown(
                """
                ## Setup

                ### 1. Edit exploration parameters

                Run the notebook from the top after changing this cell. Conditional
                player ratings are predictive associations, shown as both raw rounds per
                24 and development-referenced z-scores. Keep uncertainty and support
                visible when interpreting sparse combinations.
                """
            ),
            _code(
                """
                TOP_N = 10
                PLAYER_METRIC = "performance_z_score"  # recommended display; raw is performance_rounds_per_24
                PLAYER_AGENT_VIEW = "demonstrated"  # or "forced-counterfactual"
                PLAYER_UNCERTAINTY_PENALTY = 0.5     # score = mean - penalty * SD
                TEAM_UNCERTAINTY_PENALTY = 0.0       # applied to Elo rating rankings
                ALLOWED_SUPPORT = ("observed", "partially-pooled", "extrapolated")
                MIN_AGENT_USE_PROBABILITY = 0.0

                PLAYER_QUERY = "something"          # case-insensitive IGN, slug, or player_id
                MAP_QUERY = "Ascent"
                AGENT_QUERY = "Jett"
                ROUND_DIGITS = 4

                print("Configured player-agent view:", PLAYER_AGENT_VIEW)
                print("Edit these values, then choose Run All Above or restart the kernel and Run All.")
                """
            ),
            _markdown(
                """
                ### Key assumptions

                - The snapshot is standardized to the current patch and current complete
                  five-player rosters at the recorded cutoff.
                - Global team rank is mean pairwise map-win probability against the other
                  active teams, averaged equally over the active maps; it is not a
                  tournament-win probability.
                - A player map rating fixes the map and marginalizes over predicted legal
                  agents. An agent rating fixes the agent and equally averages active maps.
                - The default player-agent leaderboard is `demonstrated`, which requires at
                  least one map on that agent in the configured recency window. The
                  `forced-counterfactual` view is the explicitly flagged full grid.
                - `performance_rounds_per_24` (and its compatibility alias
                  `performance_mean`) is the raw Predictive Box VPM association in signed
                  rounds per 24 played rounds. `performance_z_score` standardizes that raw
                  value within each view against arithmetic means of observed rolling
                  2024-2025 OOF contexts. It is an empirical display reference, not a
                  reconstruction of the current map-pool or agent-selection weights; a
                  0.1 z-score difference is only one tenth of that reference SD.
                - `contribution_mean` currently equals performance because separately
                  identified contribution updates were not promoted.
                """
            ),
            _code(
                """
                import difflib
                import json
                import sys
                from numbers import Integral

                import matplotlib.pyplot as plt
                import numpy as np
                import pandas as pd
                from IPython.display import Markdown, display

                # Make the local research package importable even when this notebook is
                # opened with a Jupyter/VS Code kernel that did not install it editable.
                RATINGS_WORKSPACE = SNAPSHOT.parents[2]
                SOURCE_ROOT = RATINGS_WORKSPACE / "src"
                if not SOURCE_ROOT.is_dir():
                    raise FileNotFoundError(f"ratings source directory not found: {SOURCE_ROOT}")
                if str(SOURCE_ROOT) not in sys.path:
                    sys.path.insert(0, str(SOURCE_ROOT))

                from valorant_ratings.artifacts import verify_artifact_store

                if not SCORING.exists():
                    raise FileNotFoundError("Run the batch-scoring command before opening this notebook")

                scoring_manifest = verify_artifact_store(SCORING)
                snapshot_manifest = json.loads((SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))

                team_directory = pd.read_parquet(SNAPSHOT / "teams.parquet").rename(
                    columns={"name": "team_name", "slug": "team_slug"}
                )
                player_directory_all = pd.read_parquet(SNAPSHOT / "players.parquet").rename(
                    columns={"ign": "player_name", "name": "player_full_name", "slug": "player_slug"}
                )
                def _bridge_legacy_vpm_units(frame):
                    # Convert pre-v5 normalized-margin player outputs to rounds/24.
                    if "performance_z_score" in frame.columns:
                        return frame
                    result = frame.copy()
                    for column in (
                        "performance_mean",
                        "contribution_mean",
                        "standard_deviation",
                        "interval80_low",
                        "interval80_high",
                        "interval95_low",
                        "interval95_high",
                        "ranking_score",
                    ):
                        if column in result:
                            result[column] = pd.to_numeric(result[column], errors="raise") * 24.0
                    if "performance_mean" in result:
                        result["performance_rounds_per_24"] = result["performance_mean"]
                    return result


                field_rankings_raw = pd.read_parquet(SCORING / "field_rankings.parquet")
                team_ratings_raw = pd.read_parquet(SCORING / "team_ratings.parquet")
                player_ratings_raw = _bridge_legacy_vpm_units(
                    pd.read_parquet(SCORING / "player_ratings.parquet")
                )
                agent_probabilities = pd.read_parquet(SCORING / "agent_selection_probabilities.parquet")
                if (
                    PLAYER_METRIC == "performance_z_score"
                    and "performance_z_score" not in player_ratings_raw.columns
                ):
                    PLAYER_METRIC = "performance_rounds_per_24"
                    print(
                        "WARNING: this legacy scoring bundle has no development-referenced "
                        "z-scores; converting its normalized-margin values by 24 and "
                        "falling back to raw rounds per 24."
                    )

                player_agent_paths = {
                    "demonstrated": SCORING / "player_agent_ratings_demonstrated.parquet",
                    "forced-counterfactual": SCORING / "player_agent_ratings_forced_counterfactual.parquet",
                }
                if all(path.exists() for path in player_agent_paths.values()):
                    player_agent_ratings_raw_by_view = {
                        view: _bridge_legacy_vpm_units(pd.read_parquet(path))
                        for view, path in player_agent_paths.items()
                    }
                    PLAYER_AGENT_ARTIFACT_MODE = (
                        "dedicated-v5"
                        if "performance_z_score" in player_ratings_raw.columns
                        else "dedicated-v4"
                    )
                else:
                    # Legacy bundles published only one unqualified agent grid. Preserve
                    # access to it as explicitly forced-counterfactual; a demonstrated
                    # leaderboard requires the v4 recency-windowed artifact.
                    legacy_agent_ratings = player_ratings_raw.loc[
                        player_ratings_raw["view"].eq("agent")
                    ].copy()
                    if "publication_view" in legacy_agent_ratings:
                        player_agent_ratings_raw_by_view = {
                            view: legacy_agent_ratings.loc[
                                legacy_agent_ratings["publication_view"].eq(view)
                            ].copy()
                            for view in ("demonstrated", "forced-counterfactual")
                            if legacy_agent_ratings["publication_view"].eq(view).any()
                        }
                    else:
                        legacy_agent_ratings["publication_view"] = "forced-counterfactual"
                        legacy_agent_ratings["is_default_view"] = False
                        legacy_agent_ratings["is_forced_counterfactual"] = True
                        player_agent_ratings_raw_by_view = {
                            "forced-counterfactual": legacy_agent_ratings
                        }
                    PLAYER_AGENT_ARTIFACT_MODE = "legacy-single-grid"

                print("snapshot cutoff:", snapshot_manifest["cutoff"])
                print("ratings source:", SOURCE_ROOT)
                print("snapshot data sha256:", snapshot_manifest["data_sha256"])
                print("scoring experiment:", scoring_manifest["experiment_id"])
                print("scoring manifest sha256:", scoring_manifest["manifest_digest"])
                """
            ),
            _code(
                """
                def _nonblank(series):
                    values = series.astype("string").str.strip()
                    return values.mask(values.eq(""))


                player_directory_all["player_name"] = (
                    _nonblank(player_directory_all["player_name"])
                    .fillna(_nonblank(player_directory_all["player_full_name"]))
                    .fillna("Player " + player_directory_all["player_id"].astype(str))
                )
                team_directory["team_name"] = (
                    _nonblank(team_directory["team_name"])
                    .fillna(_nonblank(team_directory["team_slug"]))
                    .fillna("Team " + team_directory["team_id"].astype(str))
                )

                team_names = team_directory[["team_id", "team_name", "team_slug"]].drop_duplicates("team_id")
                player_names = player_directory_all[
                    ["player_id", "player_name", "player_full_name", "player_slug"]
                ].drop_duplicates("player_id")

                team_ratings = team_ratings_raw.merge(
                    team_names, on="team_id", how="left", validate="many_to_one"
                )
                overall_teams = team_ratings.loc[
                    team_ratings["view"].eq("overall"),
                    ["team_id", "rating", "uncertainty"],
                ]
                global_teams = (
                    field_rankings_raw.merge(overall_teams, on="team_id", validate="one_to_one")
                    .merge(team_names, on="team_id", how="left", validate="many_to_one")
                )

                active_player_teams = player_ratings_raw[["player_id", "team_id"]].drop_duplicates()
                active_player_directory = (
                    active_player_teams.merge(player_names, on="player_id", how="left", validate="many_to_one")
                    .merge(team_names, on="team_id", how="left", validate="many_to_one")
                )
                player_ratings = (
                    player_ratings_raw.merge(player_names, on="player_id", how="left", validate="many_to_one")
                    .merge(team_names, on="team_id", how="left", validate="many_to_one")
                )
                mean_agent_use = (
                    agent_probabilities.groupby(["player_id", "team_id", "agent"], as_index=False)
                    .agg(predicted_agent_use_probability=("probability", "mean"))
                )

                def _prepare_player_agent_view(publication_view, frame):
                    prepared = frame.copy()
                    if "predicted_agent_use_probability" not in prepared:
                        prepared = prepared.merge(
                            mean_agent_use,
                            on=["player_id", "team_id", "agent"],
                            how="left",
                            validate="many_to_one",
                        )
                    if "maps_played" not in prepared:
                        prepared["maps_played"] = np.nan
                    prepared["publication_view"] = publication_view
                    if "is_default_view" not in prepared:
                        prepared["is_default_view"] = publication_view == "demonstrated"
                    if "is_forced_counterfactual" not in prepared:
                        prepared["is_forced_counterfactual"] = publication_view == "forced-counterfactual"
                    return (
                        prepared.merge(player_names, on="player_id", how="left", validate="many_to_one")
                        .merge(team_names, on="team_id", how="left", validate="many_to_one")
                    )


                player_agent_ratings_by_view = {
                    view: _prepare_player_agent_view(view, frame)
                    for view, frame in player_agent_ratings_raw_by_view.items()
                }
                PLAYER_AGENT_VIEWS = tuple(player_agent_ratings_by_view)
                if PLAYER_AGENT_VIEW in player_agent_ratings_by_view:
                    ACTIVE_PLAYER_AGENT_VIEW = PLAYER_AGENT_VIEW
                elif "forced-counterfactual" in player_agent_ratings_by_view:
                    ACTIVE_PLAYER_AGENT_VIEW = "forced-counterfactual"
                    print(
                        "WARNING: demonstrated player-agent ratings are unavailable in this "
                        "legacy bundle; using the explicitly forced-counterfactual grid."
                    )
                else:
                    raise ValueError("the scoring bundle contains no usable player-agent publication view")
                player_agent_ratings_raw = pd.concat(
                    player_agent_ratings_raw_by_view.values(), ignore_index=True, sort=False
                )
                player_agent_ratings = pd.concat(
                    player_agent_ratings_by_view.values(), ignore_index=True, sort=False
                )

                ACTIVE_MAPS = tuple(team_ratings.loc[team_ratings["view"].eq("map"), "map_name"].drop_duplicates())
                agent_directory_view = (
                    "forced-counterfactual"
                    if "forced-counterfactual" in player_agent_ratings_by_view
                    else ACTIVE_PLAYER_AGENT_VIEW
                )
                LEGAL_AGENTS = tuple(
                    player_agent_ratings_by_view[agent_directory_view]["agent"].drop_duplicates()
                )
                SUPPORT_VALUES = ("observed", "partially-pooled", "extrapolated")

                print(f"loaded {len(global_teams)} teams and {active_player_directory['player_id'].nunique()} players")
                print("active maps:", ", ".join(ACTIVE_MAPS))
                print("legal agents:", ", ".join(LEGAL_AGENTS))
                print("player-agent artifact mode:", PLAYER_AGENT_ARTIFACT_MODE)
                print("Active player-agent view:", ACTIVE_PLAYER_AGENT_VIEW)
                """
            ),
            _markdown(
                """
                ## Steps

                ### 2. Reusable ranking and lookup functions

                Functions return ordinary DataFrames, so you can filter, chart, or export
                their results in additional cells without changing the source artifacts.
                """
            ),
            _code(
                """
                def _positive_n(n):
                    value = TOP_N if n is None else int(n)
                    if value <= 0:
                        raise ValueError("n must be positive")
                    return value


                def _player_metric(metric):
                    value = PLAYER_METRIC if metric is None else str(metric)
                    allowed = {
                        "performance_z_score",
                        "performance_rounds_per_24",
                        "performance_mean",
                        "contribution_mean",
                    }
                    if value not in allowed:
                        raise ValueError(f"metric must be one of {sorted(allowed)}")
                    return value


                def _allowed_support(values):
                    allowed = tuple(ALLOWED_SUPPORT if values is None else values)
                    unknown = set(allowed).difference(SUPPORT_VALUES)
                    if unknown:
                        raise ValueError(f"unknown support values: {sorted(unknown)}")
                    if not allowed:
                        raise ValueError("allowed_support cannot be empty")
                    return allowed


                def _player_agent_view(value):
                    selected = ACTIVE_PLAYER_AGENT_VIEW if value is None else str(value).strip()
                    if selected not in player_agent_ratings_by_view:
                        raise ValueError(
                            f"unknown or unavailable player-agent view {selected!r}; "
                            f"choose one of {PLAYER_AGENT_VIEWS}"
                        )
                    return selected


                def _resolve_label(value, choices, label):
                    text = str(value).strip()
                    matches = [choice for choice in choices if str(choice).casefold() == text.casefold()]
                    if len(matches) == 1:
                        return matches[0]
                    suggestions = difflib.get_close_matches(text, list(map(str, choices)), n=5, cutoff=0.3)
                    hint = f" Close matches: {', '.join(suggestions)}" if suggestions else ""
                    raise ValueError(f"unknown {label} {value!r}.{hint}")


                def resolve_player(name_or_id):
                    directory = active_player_directory.copy()
                    if isinstance(name_or_id, Integral):
                        matches = directory.loc[directory["player_id"].eq(int(name_or_id))]
                    else:
                        query = str(name_or_id).strip().casefold()
                        exact = np.zeros(len(directory), dtype=bool)
                        for column in ("player_name", "player_full_name", "player_slug"):
                            exact |= directory[column].astype("string").fillna("").str.casefold().eq(query).to_numpy()
                        matches = directory.loc[exact]
                        if matches.empty:
                            contains = np.zeros(len(directory), dtype=bool)
                            for column in ("player_name", "player_full_name", "player_slug"):
                                contains |= directory[column].astype("string").fillna("").str.casefold().str.contains(
                                    query, regex=False
                                ).to_numpy()
                            matches = directory.loc[contains]
                    if len(matches) == 1:
                        return matches.iloc[0]
                    if matches.empty:
                        suggestions = difflib.get_close_matches(
                            str(name_or_id), directory["player_name"].astype(str).tolist(), n=8, cutoff=0.25
                        )
                        hint = f" Suggestions: {', '.join(suggestions)}" if suggestions else ""
                        raise ValueError(f"no active player matched {name_or_id!r}.{hint}")
                    candidates = matches[["player_id", "player_name", "team_name"]].sort_values(
                        ["player_name", "team_name"], kind="stable"
                    )
                    raise ValueError(
                        "ambiguous player query; use player_id:\\n" + candidates.to_string(index=False)
                    )


                def top_teams_global(n=None, method="field", uncertainty_penalty=None):
                    limit = _positive_n(n)
                    penalty = TEAM_UNCERTAINTY_PENALTY if uncertainty_penalty is None else float(uncertainty_penalty)
                    work = global_teams.copy()
                    if method == "field":
                        work["ranking_score"] = work["field_win_probability"]
                        work = work.sort_values(["ranking_score", "team_name"], ascending=[False, True], kind="stable")
                    elif method == "rating":
                        work["ranking_score"] = work["rating"] - penalty * work["uncertainty"]
                        work = work.sort_values(["ranking_score", "team_name"], ascending=[False, True], kind="stable")
                    else:
                        raise ValueError("method must be 'field' or 'rating'")
                    work["display_rank"] = np.arange(1, len(work) + 1)
                    return work.head(limit)[
                        ["display_rank", "rank", "team_id", "team_name", "team_slug",
                         "field_win_probability", "rating", "uncertainty", "ranking_score"]
                    ].reset_index(drop=True)


                def top_teams_by_map(map_name=None, n=None, uncertainty_penalty=None):
                    limit = _positive_n(n)
                    penalty = TEAM_UNCERTAINTY_PENALTY if uncertainty_penalty is None else float(uncertainty_penalty)
                    work = team_ratings.loc[team_ratings["view"].eq("map")].copy()
                    if map_name is not None:
                        resolved = _resolve_label(map_name, ACTIVE_MAPS, "map")
                        work = work.loc[work["map_name"].eq(resolved)]
                    work["ranking_score"] = work["rating"] - penalty * work["uncertainty"]
                    work = work.sort_values(
                        ["map_name", "ranking_score", "team_name"], ascending=[True, False, True], kind="stable"
                    )
                    work["map_rank"] = work.groupby("map_name").cumcount() + 1
                    return work.loc[work["map_rank"].le(limit),
                        ["map_name", "map_rank", "team_id", "team_name", "team_slug",
                         "rating", "uncertainty", "ranking_score"]
                    ].reset_index(drop=True)


                def _rank_player_view(view, group_column, metric=None, allowed_support=None,
                                      uncertainty_penalty=None, min_agent_use_probability=0.0,
                                      agent_view=None):
                    selected_metric = _player_metric(metric)
                    allowed = _allowed_support(allowed_support)
                    penalty = (
                        PLAYER_UNCERTAINTY_PENALTY
                        if uncertainty_penalty is None
                        else float(uncertainty_penalty)
                    )
                    if view == "agent":
                        selected_agent_view = _player_agent_view(agent_view)
                        work = player_agent_ratings_by_view[selected_agent_view].loc[
                            lambda frame: frame["support"].isin(allowed)
                        ].copy()
                        work = work.loc[
                            work["predicted_agent_use_probability"].fillna(0.0).ge(float(min_agent_use_probability))
                        ]
                    else:
                        work = player_ratings.loc[
                            player_ratings["view"].eq(view) & player_ratings["support"].isin(allowed)
                        ].copy()
                    uncertainty_column = (
                        "standard_deviation_z"
                        if selected_metric == "performance_z_score"
                        else "standard_deviation"
                    )
                    work["ranking_score"] = work[selected_metric] - penalty * work[uncertainty_column]
                    work = work.sort_values(
                        [group_column, "ranking_score", "player_name", "player_id"],
                        ascending=[True, False, True, True],
                        kind="stable",
                    )
                    work["conditional_rank"] = work.groupby(group_column).cumcount() + 1
                    return work, selected_metric


                def top_players_by_map(map_name=None, n=None, metric=None, allowed_support=None,
                                       uncertainty_penalty=None):
                    limit = _positive_n(n)
                    work, selected_metric = _rank_player_view(
                        "map", "map_name", metric, allowed_support, uncertainty_penalty
                    )
                    if map_name is not None:
                        resolved = _resolve_label(map_name, ACTIVE_MAPS, "map")
                        work = work.loc[work["map_name"].eq(resolved)]
                    columns = [
                        "map_name", "conditional_rank", "player_id", "player_name", "team_name",
                        selected_metric, "performance_rounds_per_24", "performance_z_score",
                        "standard_deviation", "standard_deviation_z", "interval80_low", "interval80_high",
                        "support", "ranking_score",
                    ]
                    columns = list(dict.fromkeys(columns))
                    return work.loc[work["conditional_rank"].le(limit), columns].reset_index(drop=True)


                def top_players_by_agent(agent=None, n=None, metric=None, allowed_support=None,
                                         uncertainty_penalty=None, min_agent_use_probability=None,
                                         agent_view=None):
                    limit = _positive_n(n)
                    selected_agent_view = _player_agent_view(agent_view)
                    print("Active player-agent view:", selected_agent_view)
                    minimum = (
                        MIN_AGENT_USE_PROBABILITY
                        if min_agent_use_probability is None
                        else float(min_agent_use_probability)
                    )
                    work, selected_metric = _rank_player_view(
                        "agent", "agent", metric, allowed_support, uncertainty_penalty, minimum,
                        selected_agent_view
                    )
                    if agent is not None:
                        resolved = _resolve_label(agent, LEGAL_AGENTS, "agent")
                        work = work.loc[work["agent"].eq(resolved)]
                    columns = [
                        "agent", "conditional_rank", "player_id", "player_name", "team_name",
                        selected_metric, "performance_rounds_per_24", "performance_z_score",
                        "standard_deviation", "standard_deviation_z", "interval80_low", "interval80_high",
                        "support", "maps_played", "predicted_agent_use_probability",
                        "publication_view", "ranking_score",
                    ]
                    columns = list(dict.fromkeys(columns))
                    return work.loc[work["conditional_rank"].le(limit), columns].reset_index(drop=True)


                def _rank_grid(frame, group_column, rank_column, name_column, value_column):
                    compact = frame.copy()
                    compact["label"] = (
                        compact[name_column].astype(str)
                        + " ("
                        + compact[value_column].round(ROUND_DIGITS).astype(str)
                        + ")"
                    )
                    return compact.pivot(index=rank_column, columns=group_column, values="label").sort_index()
                """
            ),
            _markdown("### 3. Global top teams"),
            _code(
                """
                GLOBAL_TEAM_TOP = top_teams_global()
                display(GLOBAL_TEAM_TOP.round(ROUND_DIGITS))

                ax = GLOBAL_TEAM_TOP.sort_values("field_win_probability").plot.barh(
                    x="team_name", y="field_win_probability", legend=False,
                    color="#ff4655", title="Global field-strength top teams"
                )
                ax.set(xlabel="mean pairwise map-win probability", ylabel="team")
                ax.set_xlim(0.45, max(0.75, float(GLOBAL_TEAM_TOP["field_win_probability"].max()) + 0.02))
                plt.tight_layout()
                plt.show()
                """
            ),
            _markdown("### 4. Team rankings on every active map"),
            _code(
                """
                TEAM_MAP_TOP = top_teams_by_map()
                TEAM_MAP_GRID = _rank_grid(
                    TEAM_MAP_TOP, "map_name", "map_rank", "team_name", "rating"
                )
                with pd.option_context("display.max_columns", None):
                    display(TEAM_MAP_GRID)

                print(f"Detailed {MAP_QUERY} table")
                display(top_teams_by_map(MAP_QUERY).round(ROUND_DIGITS))
                """
            ),
            _markdown("### 5. Player top 10 on every active map"),
            _code(
                """
                PLAYER_MAP_TOP = top_players_by_map()
                PLAYER_MAP_GRID = _rank_grid(
                    PLAYER_MAP_TOP, "map_name", "conditional_rank", "player_name", PLAYER_METRIC
                )
                with pd.option_context("display.max_columns", None):
                    display(PLAYER_MAP_GRID)

                print(f"Detailed {MAP_QUERY} table")
                display(top_players_by_map(MAP_QUERY).round(ROUND_DIGITS))
                """
            ),
            _markdown(
                """
                ### 6. Player top 10 for every legal agent

                The compact grid uses the active publication view and shows all agents.
                The detailed selected-agent table also shows support, recent maps played,
                and the player's model-predicted probability of using that agent averaged
                across active maps. Pass `agent_view="forced-counterfactual"` explicitly to
                inspect the full grid; it is never the default for a v4/v5 bundle.
                """
            ),
            _code(
                """
                PLAYER_AGENT_TOP = top_players_by_agent()
                PLAYER_AGENT_GRID = _rank_grid(
                    PLAYER_AGENT_TOP, "agent", "conditional_rank", "player_name", PLAYER_METRIC
                )
                with pd.option_context("display.max_columns", None):
                    display(PLAYER_AGENT_GRID)

                print(f"Detailed {AGENT_QUERY} table")
                display(top_players_by_agent(AGENT_QUERY).round(ROUND_DIGITS))
                """
            ),
            _markdown(
                """
                ### 7. Look up one player by name

                `show_player_map_ratings(name)` and `show_player_agent_ratings(name)`
                both display and return the underlying DataFrame. Partial names work only
                when they resolve to exactly one active player; ambiguous matches list IDs.
                """
            ),
            _code(
                """
                def player_map_profile(name_or_id, metric=None, allowed_support=None,
                                       uncertainty_penalty=None):
                    player = resolve_player(name_or_id)
                    selected_metric = _player_metric(metric)
                    ranked, _ = _rank_player_view(
                        "map", "map_name", selected_metric, allowed_support, uncertainty_penalty
                    )
                    result = ranked.loc[ranked["player_id"].eq(int(player["player_id"]))].copy()
                    overall = player_ratings.loc[
                        player_ratings["player_id"].eq(int(player["player_id"]))
                        & player_ratings["view"].eq("overall"), selected_metric
                    ]
                    overall_value = float(overall.iloc[0]) if not overall.empty else np.nan
                    result["delta_vs_overall"] = result[selected_metric] - overall_value
                    columns = [
                        "map_name", "conditional_rank", selected_metric, "delta_vs_overall",
                        "performance_rounds_per_24", "performance_z_score",
                        "standard_deviation", "standard_deviation_z",
                        "interval80_low", "interval80_high", "support"
                    ]
                    return result[list(dict.fromkeys(columns))].reset_index(drop=True)


                def player_agent_profile(name_or_id, metric=None, allowed_support=None,
                                         uncertainty_penalty=None, min_agent_use_probability=None,
                                         agent_view=None):
                    player = resolve_player(name_or_id)
                    selected_metric = _player_metric(metric)
                    selected_agent_view = _player_agent_view(agent_view)
                    print("Active player-agent view:", selected_agent_view)
                    minimum = (
                        MIN_AGENT_USE_PROBABILITY
                        if min_agent_use_probability is None
                        else float(min_agent_use_probability)
                    )
                    ranked, _ = _rank_player_view(
                        "agent", "agent", selected_metric, allowed_support,
                        uncertainty_penalty, minimum, selected_agent_view
                    )
                    result = ranked.loc[ranked["player_id"].eq(int(player["player_id"]))].copy()
                    overall = player_ratings.loc[
                        player_ratings["player_id"].eq(int(player["player_id"]))
                        & player_ratings["view"].eq("overall"), selected_metric
                    ]
                    overall_value = float(overall.iloc[0]) if not overall.empty else np.nan
                    result["delta_vs_overall"] = result[selected_metric] - overall_value
                    columns = [
                        "agent", "conditional_rank", selected_metric, "delta_vs_overall",
                        "performance_rounds_per_24", "performance_z_score",
                        "standard_deviation", "standard_deviation_z",
                        "interval80_low", "interval80_high", "support",
                        "maps_played", "predicted_agent_use_probability", "publication_view",
                        "ranking_score"
                    ]
                    return result[list(dict.fromkeys(columns))].sort_values(
                        "conditional_rank", kind="stable"
                    ).reset_index(drop=True)


                def show_player_map_ratings(name_or_id, **kwargs):
                    player = resolve_player(name_or_id)
                    frame = player_map_profile(name_or_id, **kwargs)
                    display(Markdown(
                        f"#### {player['player_name']} - ratings by map ({player['team_name']})"
                    ))
                    display(frame.round(ROUND_DIGITS))
                    return frame


                def show_player_agent_ratings(name_or_id, **kwargs):
                    player = resolve_player(name_or_id)
                    agent_kwargs = dict(kwargs)
                    selected_agent_view = _player_agent_view(agent_kwargs.get("agent_view"))
                    agent_kwargs["agent_view"] = selected_agent_view
                    frame = player_agent_profile(name_or_id, **agent_kwargs)
                    display(Markdown(
                        f"#### {player['player_name']} - ratings by agent ({player['team_name']}; "
                        f"view: {selected_agent_view})"
                    ))
                    display(frame.round(ROUND_DIGITS))
                    return frame


                def show_player_ratings(name_or_id, **kwargs):
                    map_kwargs = {
                        key: value
                        for key, value in kwargs.items()
                        if key in {"metric", "allowed_support", "uncertainty_penalty"}
                    }
                    maps = show_player_map_ratings(name_or_id, **map_kwargs)
                    agents = show_player_agent_ratings(name_or_id, **kwargs)
                    selected_metric = _player_metric(kwargs.get("metric"))
                    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
                    maps.sort_values(selected_metric).plot.barh(
                        x="map_name", y=selected_metric, legend=False, color="#ff4655", ax=axes[0],
                        title="Map-conditioned rating"
                    )
                    agents.head(12).sort_values(selected_metric).plot.barh(
                        x="agent", y=selected_metric, legend=False, color="#0f9d8a", ax=axes[1],
                        title="Top 12 agent-conditioned ratings"
                    )
                    axis_label = (
                        "Predictive Box VPM (development-population SDs)"
                        if selected_metric == "performance_z_score"
                        else "Predictive Box VPM (rounds per 24)"
                    )
                    axes[0].set(xlabel=axis_label, ylabel="map")
                    axes[1].set(xlabel=axis_label, ylabel="agent")
                    plt.tight_layout()
                    plt.show()
                    return {"map": maps, "agent": agents}
                """
            ),
            _code(
                """
                PLAYER_PROFILE = show_player_ratings(PLAYER_QUERY)
                """
            ),
            _markdown(
                """
                ## Checks

                These checks protect the ranking grain, lookup joins, intervals, and
                probability normalization. If an edited filter leaves fewer than ten
                eligible players, that is reported rather than silently filled with a
                different support class.
                """
            ),
            _code(
                """
                checks = {
                    "unique global team rows": not global_teams["team_id"].duplicated().any(),
                    "unique team-map rows": not team_ratings.loc[team_ratings["view"].eq("map")].duplicated(
                        ["team_id", "map_name"]
                    ).any(),
                    "unique player rating cells": not player_ratings_raw.duplicated(
                        ["player_id", "view", "map_name", "agent"]
                    ).any(),
                    "unique demonstrated player-agent cells": (
                        not player_agent_ratings_raw_by_view["demonstrated"].duplicated(
                            ["player_id", "team_id", "agent"]
                        ).any()
                        if "demonstrated" in player_agent_ratings_raw_by_view
                        else True
                    ),
                    "unique forced-counterfactual player-agent cells": (
                        not player_agent_ratings_raw_by_view["forced-counterfactual"].duplicated(
                            ["player_id", "team_id", "agent"]
                        ).any()
                        if "forced-counterfactual" in player_agent_ratings_raw_by_view
                        else True
                    ),
                    "unique player-agent publication cells": not player_agent_ratings_raw.duplicated(
                        ["player_id", "team_id", "agent", "publication_view"]
                    ).any(),
                    "publication labels match artifacts": all(
                        frame["publication_view"].eq(view).all()
                        for view, frame in player_agent_ratings_raw_by_view.items()
                    ),
                    "demonstrated cells have recent maps": (
                        player_agent_ratings_raw_by_view["demonstrated"]["maps_played"].gt(0).all()
                        if "demonstrated" in player_agent_ratings_raw_by_view
                        else True
                    ),
                    "forced-counterfactual cells are explicitly flagged": (
                        player_agent_ratings_raw_by_view["forced-counterfactual"][
                            "is_forced_counterfactual"
                        ].eq(True).all()
                        if "forced-counterfactual" in player_agent_ratings_raw_by_view
                        else True
                    ),
                    "v4/v5 default player-agent view is demonstrated": (
                        PLAYER_AGENT_ARTIFACT_MODE not in {"dedicated-v4", "dedicated-v5"}
                        or ACTIVE_PLAYER_AGENT_VIEW == "demonstrated"
                    ),
                    "v5 performance display is finite": (
                        PLAYER_AGENT_ARTIFACT_MODE != "dedicated-v5"
                        or (
                            np.isfinite(player_ratings["performance_z_score"]).all()
                            and np.isfinite(player_ratings["performance_rounds_per_24"]).all()
                        )
                    ),
                    "field probabilities in [0, 1]": bool(global_teams["field_win_probability"].between(0, 1).all()),
                    "nonnegative uncertainty": bool(
                        player_ratings["standard_deviation"].ge(0).all()
                        and player_agent_ratings["standard_deviation"].ge(0).all()
                        and team_ratings["uncertainty"].ge(0).all()
                    ),
                    "means inside 80% intervals": bool(
                        player_ratings["performance_mean"].between(
                            player_ratings["interval80_low"], player_ratings["interval80_high"]
                        ).all()
                    ),
                    "known support labels": (
                        set(player_ratings["support"]).issubset(SUPPORT_VALUES)
                        and set(player_agent_ratings["support"]).issubset(SUPPORT_VALUES)
                    ),
                    "all active names joined": bool(
                        global_teams["team_name"].notna().all()
                        and player_ratings["player_name"].notna().all()
                        and player_agent_ratings["player_name"].notna().all()
                    ),
                    "agent probabilities sum to one": bool(
                        np.allclose(
                            agent_probabilities.groupby(["player_id", "team_id", "map_name"])["probability"].sum(),
                            1.0,
                        )
                    ),
                    "default player resolves once": int(resolve_player(PLAYER_QUERY)["player_id"]) > 0,
                    "player map profile covers active maps": set(player_map_profile(PLAYER_QUERY)["map_name"]) == set(ACTIVE_MAPS),
                }
                check_frame = pd.Series(checks, name="passed").to_frame()
                display(check_frame)
                assert check_frame["passed"].all(), check_frame.loc[~check_frame["passed"]].index.tolist()

                map_counts = PLAYER_MAP_TOP.groupby("map_name").size()
                agent_counts = PLAYER_AGENT_TOP.groupby("agent").size()
                if (map_counts < TOP_N).any():
                    print("Maps with fewer eligible players than TOP_N:", map_counts[map_counts < TOP_N].to_dict())
                if (agent_counts < TOP_N).any():
                    print("Agents with fewer eligible players than TOP_N:", agent_counts[agent_counts < TOP_N].to_dict())
                print("All explorer checks passed.")
                """
            ),
            _markdown(
                """
                ## Next steps

                Useful calls to try in a new cell:

                ```python
                top_teams_by_map("Lotus", n=20)
                top_players_by_agent("Raze", allowed_support=("observed", "partially-pooled"))
                top_players_by_agent("Jett", min_agent_use_probability=0.10)
                top_players_by_agent("Sova", agent_view="forced-counterfactual")
                show_player_ratings("ZmjjKK")
                show_player_map_ratings(1057)
                ```

                To change fitted Elo, player-model, or prior parameters, create a new
                versioned development/scoring experiment and compare it out of sample.
                This explorer intentionally keeps those frozen.
                """
            ),
        ],
    )
    documents[NOTEBOOK_NAMES[7]].metadata["kernelspec"] = {
        "display_name": "Python 3.12 (Valorant Ratings)",
        "language": "python",
        "name": "valorant-ratings",
    }

    for notebook in documents.values():
        nbformat.validate(notebook)
    return documents


def build_and_execute_notebooks(
    *,
    snapshot: Path,
    development: Path | None = None,
    output_dir: Path | None = None,
    timeout_seconds: int = 600,
) -> list[Path]:
    """Generate, execute top-to-bottom, validate, and save every research notebook."""

    workspace = Path(__file__).resolve().parents[2]
    output = Path(output_dir) if output_dir is not None else workspace / "notebooks"
    output.mkdir(parents=True, exist_ok=True)
    documents = build_notebook_documents(
        snapshot=Path(snapshot), development=Path(development) if development else None
    )
    paths: list[Path] = []
    for filename in NOTEBOOK_NAMES:
        notebook = documents[filename]
        client = NotebookClient(
            notebook,
            timeout=timeout_seconds,
            kernel_name="python3",
            allow_errors=False,
            record_timing=True,
        )
        executed = client.execute(cwd=str(workspace))
        executed.metadata["valorant_ratings"]["executed"] = True
        nbformat.validate(executed)
        path = output / filename
        nbformat.write(executed, path)
        paths.append(path.resolve())
    return paths


__all__ = [
    "NOTEBOOK_NAMES",
    "build_and_execute_notebooks",
    "build_notebook_documents",
]
