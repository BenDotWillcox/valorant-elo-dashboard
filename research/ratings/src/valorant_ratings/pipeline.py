"""End-to-end research orchestration and batch artifact production."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd

from .artifacts import ArtifactStore, verify_artifact_store
from .evaluation import (
    FINAL_CONFIRMATION_TOKEN,
    BootstrapDifference,
    DevelopmentResult,
    MapOrderingComparison,
    MapReadinessDevelopmentResult,
    PromotionDecision,
    load_map_form_episodes,
    run_final_confirmation,
    run_map_readiness_confirmation,
    run_map_readiness_development,
    run_rolling_development,
    split_development_lockbox,
)
from .elo import EloConfig, MapReadinessConfig, MapResetSchedule
from .experiment import (
    MAP_READINESS_EXPERIMENT_VERSION,
    SelectionManifest,
    directory_digest,
    freeze_selection,
    load_selection,
    record_lockbox_result,
    sha256_file,
)
from .features import add_next_team_result_target
from .feasibility import expansion_decision
from .natural_experiments import summarize_swap_pairs, teammate_agent_swap_pairs
from .player import estimate_player_uncertainty_calibration, run_player_development
from .priors import build_asof_player_priors
from .reporting import render_map_readiness_report, render_model_selection_report
from .scoring import (
    DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
    VIEW_SUPPORT_OBSERVED_MIN_MAPS,
    estimate_performance_display_reference,
    score_rating_snapshots,
)
from .series_evaluation import run_series_veto_development
from .snapshot import audit_snapshot, load_snapshot


SEED = 20260714


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _prepare_player_frame(
    player_maps: pd.DataFrame,
    maps: pd.DataFrame | None = None,
) -> pd.DataFrame:
    frame = player_maps.copy()
    if maps is not None and "match_completed_at" in maps:
        match_observation = maps[["match_id", "match_completed_at"]].drop_duplicates()
        if match_observation["match_id"].duplicated().any():
            raise ValueError("match_completed_at must be stable within each match")
        frame = frame.merge(
            match_observation,
            on="match_id",
            how="left",
            validate="many_to_one",
        )
    frame["timestamp"] = pd.to_datetime(frame["prediction_cutoff"], utc=True)
    if "map_win" not in frame:
        frame["map_win"] = frame["team_win"]
    if "patch" not in frame:
        frame["patch"] = "__UNKNOWN_PATCH__"
    frame["patch"] = frame["patch"].fillna("__UNKNOWN_PATCH__")
    frame = add_next_team_result_target(frame)
    return frame


def _sparsity_summary(player_maps: pd.DataFrame) -> dict[str, Any]:
    team_map = player_maps.groupby(["map_id", "team_id"], sort=False)
    composition = (
        team_map["agent"]
        .agg(lambda values: "|".join(sorted(map(str, values))))
        .rename("composition_key")
        .reset_index()
    )
    base = player_maps.merge(
        composition,
        on=["map_id", "team_id"],
        how="left",
        validate="many_to_one",
    )

    def median_count(columns: list[str]) -> float:
        return float(base.groupby(columns).size().median())

    return {
        "players": int(base["player_id"].nunique()),
        "teams": int(base["team_id"].nunique()),
        "maps": int(base["map_id"].nunique()),
        "median_maps_per_player": median_count(["player_id"]),
        "median_player_map_support": median_count(["player_id", "map_name"]),
        "median_player_agent_support": median_count(["player_id", "agent"]),
        "median_player_map_agent_support": median_count(["player_id", "map_name", "agent"]),
        "median_exact_composition_support": median_count(
            ["player_id", "map_name", "agent", "composition_key"]
        ),
    }


def _gates_payload(gates: tuple[PromotionDecision, ...]) -> list[dict[str, Any]]:
    return [asdict(gate) | {"promoted": gate.promoted} for gate in gates]


def _development_decision(
    gates: tuple[PromotionDecision, ...],
    metrics: pd.DataFrame,
    player_metrics: pd.DataFrame,
) -> dict[str, Any]:
    by_pair = {(gate.candidate, gate.baseline): gate for gate in gates}
    carryover = by_pair.get(("carryover", "current_elo"))
    backbone = by_pair.get(("backbone", "current_elo"))
    context_gate = next((gate for gate in gates if gate.baseline == "backbone"), None)
    if backbone and backbone.development_pass:
        rating_backbone = "backbone"
    elif carryover and carryover.development_pass:
        rating_backbone = "carryover"
    else:
        rating_backbone = "current_elo"
    forecast_champion = (
        context_gate.candidate
        if context_gate is not None and context_gate.development_pass
        else rating_backbone
    )
    box = player_metrics.loc[player_metrics["component"] == "__box_vpm__"]
    if box.empty:
        selected_player = "composition"
    else:
        selected_player = str(box.sort_values("mae", kind="stable").iloc[0]["ablation"])
    return {
        "rating_backbone": rating_backbone,
        "forecast_champion": forecast_champion,
        "selected_player_ablation": selected_player,
        "development_gates_passed": {
            f"{gate.candidate}_vs_{gate.baseline}": bool(gate.development_pass)
            for gate in gates
        },
        "promotion_passed": False,
        "lockbox_status": "sealed",
        "best_map_log_loss": (
            float(metrics.iloc[0]["map_log_loss"]) if not metrics.empty else None
        ),
    }


def _conditional_task_metrics(predictions: pd.DataFrame) -> list[dict[str, Any]]:
    full = predictions.loc[
        (predictions["ablation"] == "composition")
        & (predictions["component"] == "__box_vpm__")
    ]
    if full.empty:
        return []
    names = {
        "observed": "familiar player-map-agent/composition",
        "partially-pooled": "sparse player-map-agent",
        "extrapolated": "unseen/cold-start context",
    }
    rows: list[dict[str, Any]] = []
    for support, group in full.groupby("support"):
        rows.append(
            {
                "task": names.get(str(support), str(support)),
                "support": support,
                "observations": len(group),
                "mae": float(group["absolute_error"].mean()),
                "mean_log_likelihood": float(group["log_likelihood"].mean()),
                "interval80_coverage": float(group["covered80"].mean()),
            }
        )
    return rows


def _report_payload(
    *,
    snapshot_data: Any,
    audit: Mapping[str, Any],
    decision: Mapping[str, Any],
    team_metrics: pd.DataFrame,
    player_metrics: pd.DataFrame,
    conditional_tasks: list[dict[str, Any]],
    series_metrics: pd.DataFrame,
    veto_metrics: pd.DataFrame,
    veto_step_metrics: pd.DataFrame,
    veto_utility_correlations: pd.DataFrame,
    veto_readiness_source: str | None,
    gates: tuple[PromotionDecision, ...],
    code_digest: str,
    extra_rejected: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    rejected = [
        {
            "model": gate.candidate,
            "reason": (
                "development paired-confidence/calibration gate failed"
                if not gate.development_pass
                else "preselected pending 2026 confirmation"
            ),
        }
        for gate in gates
        if not gate.development_pass
    ]
    rejected.extend(extra_rejected or [])
    snapshot_summary = {
        "cutoff": snapshot_data.manifest["cutoff"],
        "data_sha256": snapshot_data.manifest["data_sha256"],
        "maps": len(snapshot_data["maps"]),
        "player_maps": len(snapshot_data["player_maps"]),
        "veto_actions": len(snapshot_data["vetoes"]),
        "audit_ok": bool(audit["ok"]),
    }
    map_metrics = team_metrics.to_dict("records")
    calibration = [
        {
            "model": row["model"],
            "intercept": row["calibration_intercept"],
            "slope": row["calibration_slope"],
            "ece": row["expected_calibration_error"],
        }
        for row in map_metrics
    ]
    player_selected = player_metrics.loc[
        player_metrics["ablation"] == decision["selected_player_ablation"]
    ]
    conditional_ablations = player_metrics.loc[
        player_metrics["component"] == "__box_vpm__"
    ].to_dict("records")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "decision": dict(decision),
        "snapshot": snapshot_summary,
        "map_metrics": map_metrics,
        "series_metrics": series_metrics.to_dict("records"),
        "veto_metrics": veto_metrics.to_dict("records"),
        "veto_step_metrics": veto_step_metrics.to_dict("records"),
        "veto_utility_analysis": {
            "summary": (
                "Fold-local veto utilities are correlated with subsequent played-map "
                "outcomes; readiness is included only when a verified challenger artifact "
                "for the same snapshot is available. Historical pool age uses only prior "
                "observed pool exposure where announcement metadata is absent, and the "
                "current snapshot has no side-choice advantage input."
            ),
            "map_utility_artifact": "predictions/veto_map_utilities.parquet",
            "correlation_artifact": "metrics/veto_utility_correlations.parquet",
            "readiness_source": veto_readiness_source,
            "correlations": veto_utility_correlations.to_dict("records"),
        },
        "player_metrics": player_selected.to_dict("records"),
        "conditional_ablations": conditional_ablations,
        "conditional_tasks": conditional_tasks,
        "calibration": calibration,
        "rejected_candidates": rejected,
        "ranking_artifacts": {},
        "limitations": [
            "Roster announcements are absent; observed lineups become eligible only after their completed match.",
            "Historical 2023–2025 map-pool announcements remain unknown and are not reconstructed from eventual vetoes for standardized ratings.",
            "For veto modeling only, unknown historical pool age is a low-confidence, past-only proxy from first prior legal-pool exposure in the current patch; it is not treated as an announcement date.",
            "The snapshot has no side-choice advantage field, so the conditional-logit side-choice channel is marked unknown and contributes zero until a leakage-safe source is added.",
            "Map-level data cannot isolate side, credits/loadouts, pistol/bonus state, ults, utility, trades, or IGL communication.",
            "Contribution updates are rejected in this phase unless a transfer/roster-change OOF test demonstrates lift.",
            "Agent and teammate-agent swaps are associational predictions, not causal interventions.",
        ],
        "reproducibility": {
            "code_sha256": code_digest,
            "snapshot_manifest_sha256": snapshot_data.manifest.get("manifest_payload_sha256"),
            "configuration_sha256": snapshot_data.manifest.get("config_sha256"),
            "seed": SEED,
        },
    }


def _optional_readiness_predictions(
    artifact_root: Path,
    snapshot_digest: str,
    *,
    explicit: Path | None,
) -> tuple[pd.DataFrame | None, str | None]:
    """Load the newest compatible readiness OOF artifact when one exists."""

    if explicit is not None:
        candidates = [Path(explicit)]
    else:
        candidates = sorted(
            (
                path
                for path in artifact_root.iterdir()
                if path.is_dir()
                and (path / "selection.json").exists()
                and (path / "predictions" / "map_oof.parquet").exists()
            ),
            key=lambda path: path.stat().st_mtime_ns,
            reverse=True,
        ) if artifact_root.exists() else []
    for candidate in candidates:
        try:
            selection = load_selection(candidate / "selection.json")
            if (
                selection.get("selected_model") != "map_readiness"
                or selection.get("snapshot_digest") != snapshot_digest
            ):
                if explicit is not None:
                    raise ValueError(
                        "explicit readiness artifact is not a compatible map-readiness selection"
                    )
                continue
            verify_artifact_store(candidate)
            path = candidate / "predictions" / "map_oof.parquet"
            return pd.read_parquet(path), str(candidate.resolve())
        except (FileNotFoundError, KeyError, ValueError):
            if explicit is not None:
                raise
    return None, None


def run_development(
    snapshot_path: Path,
    artifact_root: Path,
    *,
    experiment_id: str | None = None,
    fast: bool = False,
    readiness_artifact: Path | None = None,
) -> Path:
    snapshot_data = load_snapshot(snapshot_path)
    audit = audit_snapshot(snapshot_path)
    if not audit["ok"]:
        raise ValueError(f"snapshot failed audit: {audit['errors']}")
    maps = snapshot_data["maps"]
    player_frame = _prepare_player_frame(snapshot_data["player_maps"], maps)

    if fast:
        prior_cutoffs = (
            pd.Timestamp("2024-01-01T00:00:00Z"),
            pd.Timestamp("2025-01-01T00:00:00Z"),
        )
    else:
        prior_cutoffs = None
    player_priors = build_asof_player_priors(
        player_frame,
        maps,
        snapshot_data["rosters"],
        cutoffs=prior_cutoffs,
    )
    team_predictions, team_result = run_rolling_development(
        maps,
        player_priors=player_priors,
        seed=SEED,
        max_carryover_configs=8 if fast else 48,
        bootstrap_resamples=200 if fast else 2000,
    )
    player_result = run_player_development(
        player_frame,
        cutoffs=prior_cutoffs,
        ablations=("player-only", "composition") if fast else (
            "player-only",
            "additive",
            "two-way",
            "triple",
            "composition",
        ),
        target_col="next_team_match_normalized_round_margin",
    )
    readiness_predictions, readiness_source = _optional_readiness_predictions(
        Path(artifact_root),
        snapshot_data.manifest["data_sha256"],
        explicit=readiness_artifact,
    )
    series_result = run_series_veto_development(
        maps.loc[pd.to_datetime(maps["prediction_cutoff"], utc=True).dt.year <= 2025],
        snapshot_data["vetoes"],
        team_result.selected_carryover_config,
        simulation_draws_per_match=8 if fast else 64,
        seed=SEED,
        readiness_predictions=readiness_predictions,
    )
    swap_pairs = teammate_agent_swap_pairs(snapshot_data["player_maps"])
    swap_summary = summarize_swap_pairs(swap_pairs)
    decision = _development_decision(
        team_result.promotion_gates,
        team_result.metrics,
        player_result.ablation_metrics,
    )
    player_uncertainty = estimate_player_uncertainty_calibration(
        player_result.oof_predictions,
        ablation=str(decision["selected_player_ablation"]),
    )
    decision["player_uncertainty_scale"] = player_uncertainty["scale"]
    code_digest = directory_digest(Path(__file__).resolve().parents[1])
    experiment_id = experiment_id or f"ratings-development-{_utc_stamp()}"
    store = ArtifactStore(
        Path(artifact_root),
        experiment_id,
        snapshot_data.manifest["data_sha256"],
        "research-v2-vpm-audit",
    ).initialize()
    store.write_parquet("predictions/map_oof.parquet", team_predictions)
    store.write_parquet("predictions/player_oof.parquet", player_result.oof_predictions)
    store.write_parquet("predictions/series_oof.parquet", series_result.series_predictions)
    store.write_parquet("predictions/veto_oof.parquet", series_result.veto_predictions)
    store.write_parquet(
        "predictions/veto_map_utilities.parquet", series_result.map_utilities
    )
    store.write_parquet("features/player_priors_asof.parquet", player_priors)
    store.write_parquet("metrics/team.parquet", team_result.metrics)
    store.write_parquet("metrics/player_ablations.parquet", player_result.ablation_metrics)
    store.write_parquet("metrics/series.parquet", series_result.series_metrics)
    store.write_parquet("metrics/veto.parquet", series_result.veto_metrics)
    store.write_parquet("metrics/veto_steps.parquet", series_result.veto_step_metrics)
    store.write_parquet(
        "metrics/veto_utility_correlations.parquet",
        series_result.utility_correlations,
    )
    store.write_json("metrics/player_uncertainty_calibration.json", player_uncertainty)
    store.write_parquet("associational/teammate_agent_swap_pairs.parquet", swap_pairs)
    store.write_parquet("associational/teammate_agent_swap_summary.parquet", swap_summary)
    store.write_json("snapshot_audit.json", dict(audit))
    store.write_json("data_sparsity.json", _sparsity_summary(snapshot_data["player_maps"]))
    feasibility = expansion_decision(
        vct_rows=len(maps),
        tier2_rows=0,
        tier2_schema_compatible=False,
        round_columns=set().union(*(set(frame.columns) for frame in snapshot_data.values())),
    )
    store.write_json("round_level_feasibility.json", feasibility)
    store.write_json("promotion_gates.json", {"gates": _gates_payload(team_result.promotion_gates)})
    report_payload = _report_payload(
        snapshot_data=snapshot_data,
        audit=audit,
        decision=decision,
        team_metrics=team_result.metrics,
        player_metrics=player_result.ablation_metrics,
        conditional_tasks=_conditional_task_metrics(player_result.oof_predictions),
        series_metrics=series_result.series_metrics,
        veto_metrics=series_result.veto_metrics,
        veto_step_metrics=series_result.veto_step_metrics,
        veto_utility_correlations=series_result.utility_correlations,
        veto_readiness_source=readiness_source,
        gates=team_result.promotion_gates,
        code_digest=code_digest,
        extra_rejected=[
            {
                "model": "separately identified player contribution",
                "reason": "not promoted without transfer/roster-change prediction lift",
            },
            {
                "model": "full-data PyMC finalist",
                "reason": "empirical-Bayes screen runs first; MCMC is gated to finalists that add OOF lift",
            },
        ],
    )
    report_payload["player_uncertainty_calibration"] = [player_uncertainty]
    store.write_json("report_payload.json", report_payload)
    store.write_text("model_selection_report.md", render_model_selection_report(report_payload))
    selection = SelectionManifest.create(
        experiment_id=experiment_id,
        selected_model=str(decision["forecast_champion"]),
        selected_config={
            "selected_carryover": asdict(team_result.selected_carryover_config),
            "rating_backbone": decision["rating_backbone"],
            "forecast_champion": decision["forecast_champion"],
            "selected_player_ablation": decision["selected_player_ablation"],
            "player_uncertainty_scale": player_uncertainty["scale"],
            "seed": SEED,
        },
        development_metrics={
            "team": team_result.metrics.to_dict("records"),
            "gates": _gates_payload(team_result.promotion_gates),
        },
        snapshot_digest=snapshot_data.manifest["data_sha256"],
        code_digest=code_digest,
    )
    selection_path = freeze_selection(store.directory / "selection.json", selection)
    store.register_existing(selection_path.relative_to(store.directory).as_posix())
    store.finalize(
        {
            "fast": fast,
            "temporal_protocol": "2023 warmup; rolling 2024-25 development; 2026 sealed",
        }
    )
    return store.directory


def _restore_gates(payload: Mapping[str, Any]) -> tuple[PromotionDecision, ...]:
    gates: list[PromotionDecision] = []
    for value in payload.get("gates", []):
        paired = BootstrapDifference(**value["paired_difference"])
        gates.append(
            PromotionDecision(
                candidate=value["candidate"],
                baseline=value["baseline"],
                development_pass=bool(value["development_pass"]),
                paired_difference=paired,
                brier_degradation=float(value["brier_degradation"]),
                calibration_slope_degradation=float(value["calibration_slope_degradation"]),
                final_holdout_pass=value.get("final_holdout_pass"),
            )
        )
    return tuple(gates)


def run_confirmation(snapshot_path: Path, development: Path, artifact_root: Path) -> Path:
    verify_artifact_store(development)
    selection = load_selection(development / "selection.json")
    snapshot_data = load_snapshot(snapshot_path)
    if selection["snapshot_digest"] != snapshot_data.manifest["data_sha256"]:
        raise ValueError("confirmation snapshot differs from frozen development selection")
    marker = development.parent / f"{development.name}__2026-lockbox-opened.json"
    if marker.exists():
        raise FileExistsError(f"2026 confirmation was already recorded: {marker}")
    _, lockbox = split_development_lockbox(snapshot_data["maps"])
    gates_payload = json.loads((development / "promotion_gates.json").read_text(encoding="utf-8"))
    development_result = DevelopmentResult(
        metrics=pd.read_parquet(development / "metrics" / "team.parquet"),
        selected_carryover_config=EloConfig(
            **selection["selected_config"]["selected_carryover"]
        ),
        promotion_gates=_restore_gates(gates_payload),
        lockbox=lockbox,
    )
    predictions, result = run_final_confirmation(
        snapshot_data["maps"],
        development_result,
        FINAL_CONFIRMATION_TOKEN,
        seed=SEED,
        bootstrap_resamples=2000,
    )
    gate_payload = _gates_payload(result.promotion_gates)
    record_lockbox_result(
        marker,
        selection_path=development / "selection.json",
        snapshot_digest=snapshot_data.manifest["data_sha256"],
        metrics={"team": result.metrics.to_dict("records"), "gates": gate_payload},
    )
    experiment_id = f"{development.name}__2026-confirmation"
    store = ArtifactStore(
        Path(artifact_root),
        experiment_id,
        snapshot_data.manifest["data_sha256"],
        "research-v1-confirmation",
    ).initialize()
    store.write_parquet("predictions/map_2026.parquet", predictions)
    store.write_parquet("metrics/team_2026.parquet", result.metrics)
    store.write_json("promotion_gates_2026.json", {"gates": gate_payload})
    original_payload = json.loads((development / "report_payload.json").read_text(encoding="utf-8"))
    selected_rating = original_payload["decision"]["rating_backbone"]
    required_rating = next(
        (
            gate
            for gate in result.promotion_gates
            if gate.baseline == "current_elo" and gate.candidate == selected_rating
        ),
        None,
    )
    required_context = next(
        (gate for gate in result.promotion_gates if gate.baseline == "backbone"),
        None,
    )
    original_payload["decision"]["lockbox_status"] = "confirmed-once"
    original_payload["decision"]["promotion_passed"] = bool(
        required_rating and required_rating.promoted
    )
    if required_context is not None and original_payload["decision"]["forecast_champion"] == required_context.candidate:
        original_payload["decision"]["promotion_passed"] &= required_context.promoted
    original_payload["map_metrics"] = [
        *[dict(row) | {"period": "development-2024-25"} for row in original_payload["map_metrics"]],
        *[dict(row) | {"period": "confirmation-2026"} for row in result.metrics.to_dict("records")],
    ]
    original_payload["holdout_map_metrics"] = result.metrics.to_dict("records")
    original_payload["holdout_gates"] = gate_payload
    original_payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    store.write_json("final_report_payload.json", original_payload)
    store.write_text("final_model_selection_report.md", render_model_selection_report(original_payload))
    store.finalize({"development_selection_digest": selection["selection_digest"]})
    return store.directory


def _map_ordering_payload(
    ordering: MapOrderingComparison | None,
    period: str,
) -> dict[str, Any]:
    if ordering is None:
        return {
            "period": period,
            "status": "unavailable-no-comparable-series",
        }
    return {
        "period": period,
        "candidate": ordering.candidate,
        "baseline": ordering.baseline,
        "multimap_series": ordering.multimap_series,
        "comparable_series": ordering.comparable_series,
        "comparable_pairs": ordering.comparable_pairs,
        "candidate_accuracy": ordering.candidate_accuracy,
        "baseline_accuracy": ordering.baseline_accuracy,
        "accuracy_difference": ordering.paired_difference.mean_difference,
        "interval_lower": ordering.paired_difference.lower,
        "interval_upper": ordering.paired_difference.upper,
        "confidence": ordering.paired_difference.confidence,
        "resamples": ordering.paired_difference.resamples,
        "unit": ordering.paired_difference.unit,
    }


def _restore_map_ordering(payload: Mapping[str, Any]) -> MapOrderingComparison | None:
    if payload.get("status") == "unavailable-no-comparable-series":
        return None
    return MapOrderingComparison(
        candidate=str(payload["candidate"]),
        baseline=str(payload["baseline"]),
        multimap_series=int(payload["multimap_series"]),
        comparable_series=int(payload["comparable_series"]),
        comparable_pairs=int(payload["comparable_pairs"]),
        candidate_accuracy=float(payload["candidate_accuracy"]),
        baseline_accuracy=float(payload["baseline_accuracy"]),
        paired_difference=BootstrapDifference(
            mean_difference=float(payload["accuracy_difference"]),
            lower=float(payload["interval_lower"]),
            upper=float(payload["interval_upper"]),
            confidence=float(payload["confidence"]),
            resamples=int(payload["resamples"]),
            unit=str(payload["unit"]),
        ),
    )


def _map_readiness_report_payload(
    *,
    snapshot_data: Any,
    audit: Mapping[str, Any],
    result: MapReadinessDevelopmentResult,
    promoted_selection: Mapping[str, Any],
    code_digest: str,
    config_hashes: Mapping[str, str],
) -> dict[str, Any]:
    config = result.selected_config
    gate = result.promotion_gate
    episodes = result.episode_diagnostics.to_dict("records")
    limitations = [
        "Historical 2023–2025 map-pool announcements are unavailable, so development uses patch resets but cannot identify historical pool re-entries.",
        "Readiness is a predictive state inferred from map outcomes; it does not identify tactical causes, roster intent, side selection, or veto effects.",
        "Within-series ordering excludes sweeps because no opposite-winner map pair exists.",
    ]
    if not episodes:
        limitations.append(
            "No maintainer-supplied predeclared episodes were provided; the sign diagnostic remains unevaluated rather than being selected after viewing outcomes."
        )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "decision": {
            "baseline": "carryover",
            "candidate": "map_readiness",
            "development_pass": bool(gate.development_pass),
            "final_holdout_pass": None,
            "promotion_passed": False,
            "lockbox_status": "sealed",
        },
        "snapshot": {
            "audit_ok": bool(audit["ok"]),
            "cutoff": snapshot_data.manifest["cutoff"],
            "data_sha256": snapshot_data.manifest["data_sha256"],
            "maps": len(snapshot_data["maps"]),
            "development_maps": int(result.metrics["maps"].max()),
            "lockbox_maps": result.lockbox.row_count,
        },
        "selected_config": {
            "global_k_factor": config.carryover.k_factor,
            "probability_scale": config.carryover.probability_scale,
            "offseason_regression": config.carryover.offseason_regression,
            "global_half_life_days": config.carryover.time_decay_half_life_days,
            "global_weight": config.carryover.global_weight,
            "affinity_update_weight": config.carryover.map_update_weight,
            "readiness_half_life_days": config.readiness_half_life_days,
            "readiness_k_factor": config.readiness_k_factor,
            "patch_retention": config.patch_retention,
        },
        "search_space": {
            "candidates": len(result.search_results),
            "global_weight": "promoted, 0.95, 1.0",
            "readiness_half_life_days": "21, 45, 90",
            "readiness_k_factor": "8, 16, 32",
            "patch_retention": "0.1, 0.25, 0.5",
        },
        "top_search_results": result.search_results.head(10).to_dict("records"),
        "map_metrics": [
            dict(row) | {"period": "development-2024-25"}
            for row in result.metrics.to_dict("records")
        ],
        "map_ordering": [
            _map_ordering_payload(result.map_ordering, "development-2024-25")
        ],
        "episode_diagnostics": [
            dict(row) | {"period": "development-2024-25"} for row in episodes
        ],
        "promotion_gates": [
            _gates_payload((result.promotion_gate,))[0]
            | {"period": "development-2024-25"}
        ],
        "limitations": limitations,
        "reproducibility": {
            "experiment_version": MAP_READINESS_EXPERIMENT_VERSION,
            "code_sha256": code_digest,
            "snapshot_manifest_sha256": snapshot_data.manifest.get(
                "manifest_payload_sha256"
            ),
            "promoted_selection_sha256": promoted_selection["selection_digest"],
            "patches_sha256": config_hashes["patches"],
            "map_pools_sha256": config_hashes["map_pools"],
            "episodes_sha256": config_hashes["episodes"],
            "seed": SEED,
        },
    }


def run_map_readiness_experiment(
    snapshot_path: Path,
    promoted_development: Path,
    artifact_root: Path,
    *,
    experiment_id: str | None = None,
    fast: bool = False,
    episodes_path: Path | None = None,
) -> Path:
    """Freeze a Workstream-C development selection without opening 2026."""

    verify_artifact_store(promoted_development)
    promoted_selection = load_selection(promoted_development / "selection.json")
    snapshot_data = load_snapshot(snapshot_path)
    audit = audit_snapshot(snapshot_path)
    if not audit["ok"]:
        raise ValueError(f"snapshot failed audit: {audit['errors']}")
    if promoted_selection["snapshot_digest"] != snapshot_data.manifest["data_sha256"]:
        raise ValueError("promoted carryover selection uses a different snapshot")

    config_dir = Path(__file__).resolve().parents[2] / "config"
    patches_path = config_dir / "patches.json"
    map_pools_path = config_dir / "map_pools.json"
    episodes_path = episodes_path or config_dir / "map_form_episodes.json"
    config_hashes = {
        "patches": sha256_file(patches_path),
        "map_pools": sha256_file(map_pools_path),
        "episodes": sha256_file(episodes_path),
    }
    schedule = MapResetSchedule.from_config(patches_path, map_pools_path)
    episodes = load_map_form_episodes(episodes_path)
    promoted_config = EloConfig(
        **promoted_selection["selected_config"]["selected_carryover"]
    )
    predictions, result = run_map_readiness_development(
        snapshot_data["maps"],
        promoted_config,
        reset_schedule=schedule,
        episodes=episodes,
        seed=SEED,
        max_configs=9 if fast else None,
        bootstrap_resamples=200 if fast else 2000,
    )

    code_digest = directory_digest(Path(__file__).resolve().parents[1])
    experiment_id = experiment_id or (
        f"{MAP_READINESS_EXPERIMENT_VERSION}-development-{_utc_stamp()}"
    )
    store = ArtifactStore(
        Path(artifact_root),
        experiment_id,
        snapshot_data.manifest["data_sha256"],
        MAP_READINESS_EXPERIMENT_VERSION,
    ).initialize()
    store.write_parquet("predictions/map_oof.parquet", predictions)
    store.write_parquet("metrics/team.parquet", result.metrics)
    store.write_parquet("metrics/search_grid.parquet", result.search_results)
    store.write_parquet("diagnostics/map_form_episodes.parquet", result.episode_diagnostics)
    ordering_payload = _map_ordering_payload(
        result.map_ordering, "development-2024-25"
    )
    store.write_json("metrics/map_ordering.json", ordering_payload)
    gate_payload = _gates_payload((result.promotion_gate,))
    store.write_json("promotion_gate.json", {"gates": gate_payload})
    store.write_json("snapshot_audit.json", dict(audit))
    report_payload = _map_readiness_report_payload(
        snapshot_data=snapshot_data,
        audit=audit,
        result=result,
        promoted_selection=promoted_selection,
        code_digest=code_digest,
        config_hashes=config_hashes,
    )
    store.write_json("report_payload.json", report_payload)
    store.write_text(
        "model_selection_report.md", render_map_readiness_report(report_payload)
    )
    selection = SelectionManifest.create(
        experiment_id=experiment_id,
        experiment_version=MAP_READINESS_EXPERIMENT_VERSION,
        selected_model="map_readiness",
        selected_config={
            "promoted_carryover": asdict(result.promoted_carryover_config),
            "selected_map_readiness": asdict(result.selected_config),
            "config_hashes": config_hashes,
            "seed": SEED,
        },
        development_metrics={
            "team": result.metrics.to_dict("records"),
            "gate": gate_payload[0],
            "map_ordering": ordering_payload,
        },
        snapshot_digest=snapshot_data.manifest["data_sha256"],
        code_digest=code_digest,
    )
    selection_path = freeze_selection(store.directory / "selection.json", selection)
    store.register_existing(selection_path.relative_to(store.directory).as_posix())
    store.finalize(
        {
            "fast": fast,
            "temporal_protocol": "2023 warmup; rolling 2024-25 development; 2026 sealed",
            "promoted_selection_digest": promoted_selection["selection_digest"],
        }
    )
    return store.directory


def run_map_readiness_confirmation_experiment(
    snapshot_path: Path,
    development: Path,
    artifact_root: Path,
    *,
    episodes_path: Path | None = None,
) -> Path:
    """Open and record the Workstream-C 2026 confirmation exactly once."""

    verify_artifact_store(development)
    selection = load_selection(development / "selection.json")
    if selection.get("experiment_version") != MAP_READINESS_EXPERIMENT_VERSION:
        raise ValueError("development artifact is not a map-readiness experiment")
    snapshot_data = load_snapshot(snapshot_path)
    if selection["snapshot_digest"] != snapshot_data.manifest["data_sha256"]:
        raise ValueError("confirmation snapshot differs from frozen development selection")
    marker = development.parent / f"{development.name}__2026-lockbox-opened.json"
    if marker.exists():
        raise FileExistsError(f"2026 confirmation was already recorded: {marker}")

    config_dir = Path(__file__).resolve().parents[2] / "config"
    patches_path = config_dir / "patches.json"
    map_pools_path = config_dir / "map_pools.json"
    episodes_path = episodes_path or config_dir / "map_form_episodes.json"
    actual_hashes = {
        "patches": sha256_file(patches_path),
        "map_pools": sha256_file(map_pools_path),
        "episodes": sha256_file(episodes_path),
    }
    if actual_hashes != selection["selected_config"]["config_hashes"]:
        raise ValueError("map-readiness metadata changed after development was frozen")

    schedule = MapResetSchedule.from_config(patches_path, map_pools_path)
    episodes = load_map_form_episodes(episodes_path)
    _, lockbox = split_development_lockbox(snapshot_data["maps"])
    gates = _restore_gates(
        json.loads((development / "promotion_gate.json").read_text(encoding="utf-8"))
    )
    ordering_payload = json.loads(
        (development / "metrics" / "map_ordering.json").read_text(encoding="utf-8")
    )
    development_result = MapReadinessDevelopmentResult(
        metrics=pd.read_parquet(development / "metrics" / "team.parquet"),
        search_results=pd.read_parquet(development / "metrics" / "search_grid.parquet"),
        promoted_carryover_config=EloConfig(
            **selection["selected_config"]["promoted_carryover"]
        ),
        selected_config=MapReadinessConfig.from_mapping(
            selection["selected_config"]["selected_map_readiness"]
        ),
        promotion_gate=gates[0],
        map_ordering=_restore_map_ordering(ordering_payload),
        episode_diagnostics=pd.read_parquet(
            development / "diagnostics" / "map_form_episodes.parquet"
        ),
        reset_schedule=schedule,
        lockbox=lockbox,
    )
    predictions, result = run_map_readiness_confirmation(
        snapshot_data["maps"],
        development_result,
        FINAL_CONFIRMATION_TOKEN,
        episodes=episodes,
        seed=SEED,
        bootstrap_resamples=2000,
    )
    gate_payload = _gates_payload((result.promotion_gate,))
    confirmation_metrics = {
        "team": result.metrics.to_dict("records"),
        "gate": gate_payload[0],
        "map_ordering": _map_ordering_payload(result.map_ordering, "confirmation-2026"),
        "episodes": result.episode_diagnostics.to_dict("records"),
    }
    record_lockbox_result(
        marker,
        selection_path=development / "selection.json",
        snapshot_digest=snapshot_data.manifest["data_sha256"],
        metrics=confirmation_metrics,
    )

    experiment_id = f"{development.name}__2026-confirmation"
    store = ArtifactStore(
        Path(artifact_root),
        experiment_id,
        snapshot_data.manifest["data_sha256"],
        MAP_READINESS_EXPERIMENT_VERSION,
    ).initialize()
    store.write_parquet("predictions/map_2026.parquet", predictions)
    store.write_parquet("metrics/team_2026.parquet", result.metrics)
    store.write_parquet(
        "diagnostics/map_form_episodes_2026.parquet", result.episode_diagnostics
    )
    store.write_json("promotion_gate_2026.json", {"gates": gate_payload})
    store.write_json(
        "metrics/map_ordering_2026.json",
        _map_ordering_payload(result.map_ordering, "confirmation-2026"),
    )

    report_payload = json.loads(
        (development / "report_payload.json").read_text(encoding="utf-8")
    )
    report_payload["decision"].update(
        {
            "development_pass": bool(result.promotion_gate.development_pass),
            "final_holdout_pass": result.promotion_gate.final_holdout_pass,
            "promotion_passed": result.promotion_gate.promoted,
            "lockbox_status": "confirmed-once",
        }
    )
    report_payload["map_metrics"].extend(
        dict(row) | {"period": "confirmation-2026"}
        for row in result.metrics.to_dict("records")
    )
    report_payload["map_ordering"].append(
        _map_ordering_payload(result.map_ordering, "confirmation-2026")
    )
    report_payload["episode_diagnostics"].extend(
        dict(row) | {"period": "confirmation-2026"}
        for row in result.episode_diagnostics.to_dict("records")
    )
    report_payload["promotion_gates"] = [
        gate_payload[0] | {"period": "development-plus-confirmation"}
    ]
    report_payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    report_payload["reproducibility"]["development_selection_sha256"] = selection[
        "selection_digest"
    ]
    store.write_json("final_report_payload.json", report_payload)
    store.write_text(
        "final_model_selection_report.md",
        render_map_readiness_report(report_payload),
    )
    store.finalize({"development_selection_digest": selection["selection_digest"]})
    return store.directory


def run_batch_scoring(
    snapshot_path: Path,
    development: Path,
    artifact_root: Path,
    *,
    demonstrated_recency_months: int = DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    player_agent_uncertainty_penalty: float = DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
    performance_reference_predictions: Path | None = None,
) -> Path:
    verify_artifact_store(development)
    selection = load_selection(development / "selection.json")
    snapshot_data = load_snapshot(snapshot_path)
    if selection["snapshot_digest"] != snapshot_data.manifest["data_sha256"]:
        raise ValueError("scoring snapshot differs from frozen selection")
    selected_config = dict(selection["selected_config"])
    player_oof = pd.read_parquet(development / "predictions" / "player_oof.parquet")
    player_uncertainty = estimate_player_uncertainty_calibration(
        player_oof,
        ablation=str(selected_config.get("selected_player_ablation", "composition")),
    )
    reference_path = (
        Path(performance_reference_predictions)
        if performance_reference_predictions is not None
        else development / "predictions" / "player_oof.parquet"
    )
    default_reference_path = development / "predictions" / "player_oof.parquet"
    reference_is_default = reference_path.resolve() == default_reference_path.resolve()
    reference_predictions = (
        player_oof
        if reference_is_default
        else pd.read_parquet(reference_path)
    )
    performance_reference = estimate_performance_display_reference(
        reference_predictions,
        ablation=str(selected_config.get("selected_player_ablation", "composition")),
        legacy_source_multiplier=24.0,
    )
    performance_reference["source_artifact"] = str(reference_path.resolve())
    performance_reference["source_sha256"] = sha256_file(reference_path)
    selected_config.setdefault(
        "player_uncertainty_scale", player_uncertainty["scale"]
    )
    outputs = score_rating_snapshots(
        snapshot_data,
        selected_config,
        performance_reference=performance_reference,
        seed=SEED,
        demonstrated_recency_months=demonstrated_recency_months,
        player_agent_uncertainty_penalty=player_agent_uncertainty_penalty,
    )
    experiment_id = f"{development.name}__rating-snapshots-v5"
    if not reference_is_default:
        experiment_id = (
            f"{experiment_id}-ref-{performance_reference['source_sha256'][:12]}"
        )
    if (
        int(demonstrated_recency_months) != DEFAULT_DEMONSTRATED_RECENCY_MONTHS
        or float(player_agent_uncertainty_penalty)
        != DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY
    ):
        penalty_slug = format(float(player_agent_uncertainty_penalty), ".6g").replace(
            ".", "p"
        )
        experiment_id += (
            f"__recency-{int(demonstrated_recency_months)}m"
            f"__lambda-{penalty_slug}"
        )
    store = ArtifactStore(
        Path(artifact_root),
        experiment_id,
        snapshot_data.manifest["data_sha256"],
        "research-v5-scoring",
    ).initialize()
    for name, frame in outputs.items():
        store.write_parquet(f"{name}.parquet", frame)
    store.write_json("player_uncertainty_calibration.json", player_uncertainty)
    store.write_json("performance_display_reference.json", performance_reference)
    publication_cutoff = pd.Timestamp(snapshot_data.manifest["cutoff"])
    publication_as_of = publication_cutoff + pd.Timedelta(microseconds=1)
    publication_config = {
        "schema_version": "player-agent-publication-v2",
        "default_player_agent_view": "demonstrated",
        "published_views": ["demonstrated", "forced-counterfactual"],
        "demonstrated_recency_months": int(demonstrated_recency_months),
        "recency_window_start": (
            publication_cutoff - pd.DateOffset(months=int(demonstrated_recency_months))
        ).isoformat(),
        "recency_window_end_exclusive": publication_as_of.isoformat(),
        "maps_played_unit": "distinct map_id",
        "player_agent_uncertainty_penalty": float(
            player_agent_uncertainty_penalty
        ),
        "ranking_score_formula": "performance_mean - lambda * standard_deviation",
        "raw_performance_column": "performance_rounds_per_24",
        "raw_performance_unit": "rounds_per_24",
        "performance_mean_compatibility_unit": "rounds_per_24",
        "vpm_target_column": "next_team_match_normalized_round_margin",
        "vpm_target_raw_unit": "normalized_round_margin",
        "vpm_target_multiplier": 24.0,
        "display_performance_column": "performance_z_score",
        "display_uncertainty_column": "standard_deviation_z",
        "display_reference": performance_reference,
        "scenario_player_logit_weight_per_round_24": 0.08 / 24.0,
        "agent_probability_aggregation": "equal mean over active maps",
        "view_support_observed_min_maps": VIEW_SUPPORT_OBSERVED_MIN_MAPS,
    }
    store.write_json("publication_config.json", publication_config)
    store.finalize(
        {
            "selection_digest": selection["selection_digest"],
            "publication_config": publication_config,
            "scoring_code_sha256": directory_digest(
                Path(__file__).resolve().parents[1]
            ),
        }
    )
    return store.directory


__all__ = ["run_batch_scoring", "run_confirmation", "run_development"]
