"""Answer-first Markdown model-selection reports from validated artifacts."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.5f}"
    return str(value).replace("|", "\\|")


def markdown_table(rows: Sequence[Mapping[str, Any]], columns: Sequence[str] | None = None) -> str:
    if not rows:
        return "_No validated results available._"
    columns = tuple(columns or rows[0].keys())
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(_fmt(row.get(column)) for column in columns) + " |" for row in rows]
    return "\n".join([header, separator, *body])


def render_model_selection_report(payload: Mapping[str, Any]) -> str:
    decision = payload.get("decision", {})
    champion = decision.get("forecast_champion", "not selected")
    backbone = decision.get("rating_backbone", "not selected")
    passed = bool(decision.get("promotion_passed", False))
    veto_utility = payload.get("veto_utility_analysis", {})
    utility_correlations = [
        row
        for row in veto_utility.get("correlations", [])
        if str(row.get("period")) == "all"
    ]
    conclusion = (
        f"Promote **{backbone}** as the displayed rating backbone and **{champion}** "
        "as the forecast champion."
        if passed
        else "No complex model cleared every promotion gate; retain the strongest simpler baseline."
    )
    lines = [
        "# Predictive and Contextual Valorant Ratings — Model Selection",
        "",
        conclusion,
        "",
        f"Generated: {payload.get('generated_at', datetime.now(timezone.utc).isoformat())}",
        "",
        "## Decision",
        "",
        f"- Displayed rating backbone: `{backbone}`",
        f"- Forecast champion: `{champion}`",
        f"- Promotion gates passed: `{passed}`",
        f"- 2026 confirmation status: `{decision.get('lockbox_status', 'unopened')}`",
        "",
        "Conditional ratings and agent-swap deltas are predictive associations. They are not causal estimates of what a roster would have achieved under a different strategic choice.",
        "",
        "## Data and temporal protocol",
        "",
        markdown_table([payload.get("snapshot", {})]),
        "",
        "2023 is warm-up; rolling 2024–2025 predictions select models; 2026 is opened once only after the model and calibration are frozen. All maps in a series share one pre-series state.",
        "",
        "## Map forecast performance",
        "",
        markdown_table(payload.get("map_metrics", [])),
        "",
        "Primary selection uses map log loss. Brier score and calibration intercept/slope are guardrails; paired intervals are clustered by match.",
        "",
        "## Series and veto forecasts",
        "",
        markdown_table(payload.get("series_metrics", [])),
        "",
        "### Veto action forecasts",
        "",
        markdown_table(payload.get("veto_metrics", [])),
        "",
        "### Veto top-1 accuracy by step",
        "",
        markdown_table(payload.get("veto_step_metrics", [])),
        "",
        "### Veto-implied map utility",
        "",
        str(veto_utility.get("summary", "No veto-utility analysis was produced.")),
        "",
        markdown_table(utility_correlations),
        "",
        f"Readiness source: `{veto_utility.get('readiness_source') or 'not available'}`",
        "",
        "## Player component forecasts",
        "",
        markdown_table(payload.get("player_metrics", [])),
        "",
        "### Player uncertainty calibration",
        "",
        markdown_table(payload.get("player_uncertainty_calibration", [])),
        "",
        "The player table reports raw out-of-fold interval diagnostics; published snapshot intervals apply the development-only scale recorded above.",
        "",
        "## Conditional interaction ablations",
        "",
        markdown_table(payload.get("conditional_ablations", [])),
        "",
        "### Conditional support tasks",
        "",
        markdown_table(payload.get("conditional_tasks", [])),
        "",
        "An interaction layer is retained only when it improves future observations. Sparse map–agent–composition cells shrink toward parent effects and carry wider intervals.",
        "",
        "## Published rating support",
        "",
        markdown_table(payload.get("rating_snapshot_support", [])),
        "",
        "## Scenario comparison audit",
        "",
        markdown_table(payload.get("scenario_summary", [])),
        "",
        "## Calibration and interval coverage",
        "",
        markdown_table(payload.get("calibration", [])),
        "",
        "## Final holdout gates",
        "",
        markdown_table(payload.get("holdout_gates", [])),
        "",
        "The paired-difference fields above are the frozen development comparisons; `final_holdout_pass` records the same-direction 2026 confirmation and guardrails.",
        "",
        "## Rejected candidates",
        "",
    ]
    rejected = payload.get("rejected_candidates", [])
    if rejected:
        lines.extend(f"- `{item.get('model', 'unknown')}` — {item.get('reason', 'gate failed')}" for item in rejected)
    else:
        lines.append("- None recorded.")
    lines.extend(["", "## Rankings and matchup artifacts", ""])
    artifacts = payload.get("ranking_artifacts", {})
    if artifacts:
        lines.extend(f"- {name}: `{path}`" for name, path in artifacts.items())
    else:
        lines.append("- Generated after a model clears the rating-backbone gate.")
    lines.extend(["", markdown_table(payload.get("top_field_rankings", [])), ""])
    lines.extend(["", "## Limitations", ""])
    limitations: Iterable[str] = payload.get(
        "limitations",
        (
            "Map-level data cannot isolate attack/defense, credits, loadouts, ult state, utility, trades, or IGL communication.",
            "Event timestamps approximate prediction cutoffs when scheduled/announcement timestamps are unavailable.",
            "Fixed five-player lineups identify the lineup total more reliably than each player's causal contribution.",
            "Unannounced lineups and unseen agent compositions remain extrapolations.",
        ),
    )
    lines.extend(f"- {item}" for item in limitations)
    lines.extend(["", "## Reproducibility", "", markdown_table([payload.get("reproducibility", {})]), ""])
    return "\n".join(lines)


def render_map_readiness_report(payload: Mapping[str, Any]) -> str:
    """Render the focused Workstream-C model-selection report."""

    decision = payload.get("decision", {})
    passed = bool(decision.get("promotion_passed", False))
    conclusion = (
        "Promote **map readiness** over the carryover baseline."
        if passed
        else "Retain **carryover**; the transient map-readiness challenger did not clear every gate."
    )
    episode_rows = payload.get("episode_diagnostics", [])
    lines = [
        "# Valorant Team Ratings — Transient Map Readiness Model Selection",
        "",
        conclusion,
        "",
        f"Generated: {payload.get('generated_at', datetime.now(timezone.utc).isoformat())}",
        "",
        "## Decision",
        "",
        f"- Baseline: `{decision.get('baseline', 'carryover')}`",
        f"- Challenger: `{decision.get('candidate', 'map_readiness')}`",
        f"- Development gate passed: `{decision.get('development_pass', False)}`",
        f"- Holdout gate passed: `{decision.get('final_holdout_pass')}`",
        f"- Promotion passed: `{passed}`",
        f"- 2026 confirmation status: `{decision.get('lockbox_status', 'sealed')}`",
        "",
        "The challenger decomposes rating into global strength + persistent map affinity + transient map readiness. All maps in a series use one pre-series state.",
        "",
        "## Data and temporal protocol",
        "",
        markdown_table([payload.get("snapshot", {})]),
        "",
        "2023 is warm-up; rolling 2024–2025 predictions select the frozen configuration; the rolled-forward 2026 window confirms direction and guardrails once.",
        "",
        "## Selected configuration",
        "",
        markdown_table([payload.get("selected_config", {})]),
        "",
        "## Search space",
        "",
        markdown_table([payload.get("search_space", {})]),
        "",
        "### Best development configurations",
        "",
        markdown_table(payload.get("top_search_results", [])),
        "",
        "## Aggregate map forecast performance",
        "",
        markdown_table(payload.get("map_metrics", [])),
        "",
        "Primary selection uses map log loss. Brier score and calibration slope are guardrails; paired log-loss intervals are clustered by match.",
        "",
        "## Within-series map ordering",
        "",
        markdown_table(payload.get("map_ordering", [])),
        "",
        "Only multi-map series with at least one map win by each team are comparable. Accuracy is the match-weighted fraction of cross-outcome map pairs ranked in the realized direction; ties receive half credit, and intervals are match-clustered.",
        "",
        "## Predeclared map-form episodes",
        "",
        markdown_table(episode_rows),
        "",
        (
            "Episode signs are a diagnostic and never a promotion gate."
            if episode_rows
            else "No maintainer-supplied episodes were available; this diagnostic was not evaluated and is not a gate."
        ),
        "",
        "## Promotion gate",
        "",
        markdown_table(payload.get("promotion_gates", [])),
        "",
        "## Limitations",
        "",
    ]
    lines.extend(f"- {item}" for item in payload.get("limitations", []))
    lines.extend(
        [
            "",
            "## Reproducibility",
            "",
            markdown_table([payload.get("reproducibility", {})]),
            "",
        ]
    )
    return "\n".join(lines)


def write_model_selection_report(path: Path, payload: Mapping[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"report already exists: {path}")
    path.write_text(render_model_selection_report(payload), encoding="utf-8")
    return path


def synthesize_final_report(
    *,
    snapshot: Path,
    development: Path,
    confirmation: Path,
    scoring: Path,
    output: Path,
) -> Path:
    """Join finalized experiment artifacts into the durable selection report."""

    import pandas as pd

    from .artifacts import verify_artifact_store

    development_manifest = verify_artifact_store(development)
    confirmation_manifest = verify_artifact_store(confirmation)
    scoring_manifest = verify_artifact_store(scoring)
    payload = json.loads(
        (confirmation / "final_report_payload.json").read_text(encoding="utf-8")
    )
    ratings = pd.read_parquet(scoring / "player_ratings.parquet")
    scenarios = pd.read_parquet(scoring / "scenario_comparisons.parquet")
    rankings = pd.read_parquet(scoring / "field_rankings.parquet")
    teams = pd.read_parquet(snapshot / "teams.parquet")
    team_name = next(
        (column for column in ("team_name", "name", "team") if column in teams),
        None,
    )
    if team_name is not None:
        rankings = rankings.merge(
            teams[["team_id", team_name]].drop_duplicates("team_id"),
            on="team_id",
            how="left",
            validate="one_to_one",
        ).rename(columns={team_name: "team_name"})

    support = (
        ratings.groupby("support", as_index=False)
        .agg(
            rows=("player_id", "size"),
            players=("player_id", "nunique"),
            mean_standard_deviation=("standard_deviation", "mean"),
            median_standard_deviation=("standard_deviation", "median"),
        )
        .sort_values("mean_standard_deviation", kind="stable")
    )
    scenario_summary = scenarios.groupby("change_type", as_index=False).agg(
        scenarios=("player_id", "size"),
        mean_absolute_performance_delta=(
            "performance_delta",
            lambda values: float(values.abs().mean()),
        ),
        mean_absolute_win_probability_delta=(
            "team_win_probability_delta",
            lambda values: float(values.abs().mean()),
        ),
        median_uncertainty_of_delta=("uncertainty_of_delta", "median"),
    )
    veto_rows = payload.get("veto_metrics", [])
    veto_by_model = {str(row.get("model")): row for row in veto_rows}
    uniform_row = veto_by_model.get("uniform_legal_choice")
    rejected = payload.setdefault("rejected_candidates", [])
    if uniform_row is not None:
        uniform_loss = float(uniform_row["choice_log_loss"])
        for model, label in (
            ("conditional_logit_veto", "conditional-logit veto"),
            ("sequential_pooled_veto", "sequential pooled veto"),
        ):
            row = veto_by_model.get(model)
            if row is None or float(row["choice_log_loss"]) < uniform_loss:
                continue
            if not any(item.get("model") == label for item in rejected):
                rejected.append(
                    {
                        "model": label,
                        "reason": "held-out per-action veto log loss was not better than uniform legal choice",
                    }
                )

    calibration_path = scoring / "player_uncertainty_calibration.json"
    if calibration_path.exists():
        payload["player_uncertainty_calibration"] = [
            json.loads(calibration_path.read_text(encoding="utf-8"))
        ]
    if payload["decision"].get("selected_player_ablation") != "composition":
        rejected = payload.setdefault("rejected_candidates", [])
        rejected.append(
            {
                "model": "teammate-agent composition interaction",
                "reason": "the composition ablation did not improve future player forecasts; published teammate-agent mean deltas remain zero",
            }
        )
        payload.setdefault("limitations", []).append(
            "The selected player model did not retain teammate-agent synergy; teammate-agent scenario means are zero until that layer demonstrates out-of-fold lift."
        )

    relative_scoring = Path("..") / "artifacts" / scoring.name
    payload["rating_snapshot_support"] = support.to_dict("records")
    payload["scenario_summary"] = scenario_summary.to_dict("records")
    ranking_columns = [
        column
        for column in ("rank", "team_id", "team_name", "field_win_probability")
        if column in rankings
    ]
    payload["top_field_rankings"] = (
        rankings.sort_values("rank", kind="stable")
        .head(20)[ranking_columns]
        .to_dict("records")
    )
    payload["ranking_artifacts"] = {
        "player ratings": str(relative_scoring / "player_ratings.parquet"),
        "demonstrated player-agent rankings": str(
            relative_scoring / "player_agent_ratings_demonstrated.parquet"
        ),
        "forced player-agent counterfactuals": str(
            relative_scoring / "player_agent_ratings_forced_counterfactual.parquet"
        ),
        "scenario comparisons": str(relative_scoring / "scenario_comparisons.parquet"),
        "team ratings": str(relative_scoring / "team_ratings.parquet"),
        "matchup matrix": str(relative_scoring / "matchup_matrix.parquet"),
        "field rankings": str(relative_scoring / "field_rankings.parquet"),
    }
    payload["reproducibility"].update(
        {
            "development_artifact_sha256": development_manifest["manifest_digest"],
            "confirmation_artifact_sha256": confirmation_manifest["manifest_digest"],
            "scoring_artifact_sha256": scoring_manifest["manifest_digest"],
        }
    )
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_model_selection_report(payload), encoding="utf-8")
    output.with_suffix(".json").write_text(
        json.dumps(payload, indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )
    return output.resolve()
