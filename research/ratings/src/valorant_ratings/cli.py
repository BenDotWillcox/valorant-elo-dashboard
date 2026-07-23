"""Command-line entry points for the isolated ratings research workspace."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from .feasibility import expansion_decision
from .scoring import (
    DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
)
from .snapshot import SNAPSHOT_CUTOFF, audit_snapshot, create_snapshot, load_snapshot


app = typer.Typer(
    name="ratings-research",
    no_args_is_help=True,
    help="Leakage-safe predictive and contextual Valorant ratings research.",
)
console = Console()
RATINGS_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SNAPSHOT = (
    RATINGS_ROOT / "data" / "snapshots" / "vct_2023_2026_cutoff_2026-06-21_v2"
)
DEFAULT_ARTIFACTS = RATINGS_ROOT / "artifacts"
DEFAULT_PROMOTED_DEVELOPMENT = DEFAULT_ARTIFACTS / "ratings-development-v1-full"


def _read_env_file(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return None


def database_url() -> str:
    value = os.environ.get("DATABASE_URL") or _read_env_file(REPOSITORY_ROOT / ".env.local", "DATABASE_URL")
    if not value:
        raise typer.BadParameter("DATABASE_URL is absent from the environment and repository .env.local")
    return value


def _json(value: object) -> None:
    console.print_json(json.dumps(value, default=str))


@app.command("snapshot")
def snapshot_command(
    output: Annotated[Path, typer.Option(help="New immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    cutoff: Annotated[str, typer.Option(help="Inclusive UTC data cutoff.")] = str(SNAPSHOT_CUTOFF),
    force_alternate: Annotated[
        bool,
        typer.Option(help="Create a versioned sibling if output exists; never overwrite."),
    ] = False,
) -> None:
    path = create_snapshot(
        output_dir=output,
        database_url=database_url(),
        cutoff=cutoff,
        force_alternate=force_alternate,
    )
    result = audit_snapshot(path)
    _json(result)
    if not result["ok"]:
        raise typer.Exit(code=1)


@app.command("audit")
def audit_command(
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
) -> None:
    result = audit_snapshot(snapshot)
    _json(result)
    if not result["ok"]:
        raise typer.Exit(code=1)


@app.command("feasibility")
def feasibility_command(
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    output: Annotated[Path | None, typer.Option(help="Optional JSON output path.")] = None,
) -> None:
    data = load_snapshot(snapshot)
    columns = set().union(*(set(frame.columns) for frame in data.values()))
    result = expansion_decision(
        vct_rows=len(data["maps"]),
        tier2_rows=0,
        tier2_schema_compatible=False,
        round_columns=columns,
    )
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    _json(result)


@app.command("develop")
def develop_command(
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    artifacts: Annotated[Path, typer.Option(help="Versioned artifact root.")] = DEFAULT_ARTIFACTS,
    experiment_id: Annotated[str | None, typer.Option(help="Unique immutable experiment id.")] = None,
    fast: Annotated[bool, typer.Option(help="Reduced search/bootstrap counts for smoke tests.")] = False,
    readiness_artifact: Annotated[
        Path | None,
        typer.Option(
            help="Optional verified map-readiness development artifact for veto-utility correlation."
        ),
    ] = None,
) -> None:
    from .pipeline import run_development

    path = run_development(
        snapshot,
        artifacts,
        experiment_id=experiment_id,
        fast=fast,
        readiness_artifact=readiness_artifact,
    )
    console.print(str(path))


@app.command("confirm-2026")
def confirm_command(
    development: Annotated[Path, typer.Option(help="Frozen development artifact directory.")],
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    artifacts: Annotated[Path, typer.Option(help="Versioned artifact root.")] = DEFAULT_ARTIFACTS,
) -> None:
    from .pipeline import run_confirmation

    path = run_confirmation(snapshot, development, artifacts)
    console.print(str(path))


@app.command("develop-map-readiness")
def develop_map_readiness_command(
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    promoted: Annotated[
        Path,
        typer.Option(help="Frozen development artifact containing the promoted carryover."),
    ] = DEFAULT_PROMOTED_DEVELOPMENT,
    artifacts: Annotated[Path, typer.Option(help="Versioned artifact root.")] = DEFAULT_ARTIFACTS,
    experiment_id: Annotated[str | None, typer.Option(help="Unique immutable experiment id.")] = None,
    fast: Annotated[bool, typer.Option(help="Reduced search/bootstrap counts for smoke tests.")] = False,
) -> None:
    from .pipeline import run_map_readiness_experiment

    path = run_map_readiness_experiment(
        snapshot,
        promoted,
        artifacts,
        experiment_id=experiment_id,
        fast=fast,
    )
    console.print(str(path))


@app.command("confirm-map-readiness-2026")
def confirm_map_readiness_command(
    development: Annotated[
        Path,
        typer.Option(help="Frozen map-readiness development artifact directory."),
    ],
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    artifacts: Annotated[Path, typer.Option(help="Versioned artifact root.")] = DEFAULT_ARTIFACTS,
) -> None:
    from .pipeline import run_map_readiness_confirmation_experiment

    path = run_map_readiness_confirmation_experiment(
        snapshot,
        development,
        artifacts,
    )
    console.print(str(path))


@app.command("score")
def score_command(
    development: Annotated[Path, typer.Option(help="Frozen selected-model artifact directory.")],
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    artifacts: Annotated[Path, typer.Option(help="Versioned artifact root.")] = DEFAULT_ARTIFACTS,
    demonstrated_recency_months: Annotated[
        int,
        typer.Option(
            min=1,
            help="Calendar-month lookback for demonstrated player-agent cells.",
        ),
    ] = DEFAULT_DEMONSTRATED_RECENCY_MONTHS,
    player_agent_uncertainty_penalty: Annotated[
        float,
        typer.Option(
            min=0.0,
            help="Lambda in the published player-agent score mean - lambda * SD.",
        ),
    ] = DEFAULT_PLAYER_AGENT_UNCERTAINTY_PENALTY,
    performance_reference_predictions: Annotated[
        Path | None,
        typer.Option(
            help=(
                "Optional corrected rolling-OOF player prediction artifact used "
                "only for per-view display z-score references."
            )
        ),
    ] = None,
) -> None:
    from .pipeline import run_batch_scoring

    path = run_batch_scoring(
        snapshot,
        development,
        artifacts,
        demonstrated_recency_months=demonstrated_recency_months,
        player_agent_uncertainty_penalty=player_agent_uncertainty_penalty,
        performance_reference_predictions=performance_reference_predictions,
    )
    console.print(str(path))


@app.command("notebooks")
def notebooks_command(
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    development: Annotated[Path | None, typer.Option(help="Development artifact directory.")] = None,
) -> None:
    from .notebooks import build_and_execute_notebooks

    paths = build_and_execute_notebooks(snapshot=snapshot, development=development)
    for path in paths:
        console.print(str(path))


@app.command("report")
def report_command(
    development: Annotated[Path, typer.Option(help="Frozen development artifact directory.")],
    snapshot: Annotated[Path, typer.Option(help="Immutable snapshot directory.")] = DEFAULT_SNAPSHOT,
    output: Annotated[
        Path,
        typer.Option(help="Markdown report output; a JSON payload is written beside it."),
    ] = RATINGS_ROOT / "reports" / "final_model_selection_report.md",
) -> None:
    from .reporting import synthesize_final_report

    confirmation = development.parent / f"{development.name}__2026-confirmation"
    canonical_scoring = development.parent / f"{development.name}__rating-snapshots-v5"
    scoring_candidates = [
        canonical_scoring,
        *development.parent.glob(f"{development.name}__rating-snapshots-v5-ref-*"),
    ]
    existing_scoring = [path for path in scoring_candidates if path.exists()]
    scoring = (
        max(existing_scoring, key=lambda path: path.stat().st_mtime_ns)
        if existing_scoring
        else canonical_scoring
    )
    path = synthesize_final_report(
        snapshot=snapshot,
        development=development,
        confirmation=confirmation,
        scoring=scoring,
        output=output,
    )
    console.print(str(path))


if __name__ == "__main__":  # pragma: no cover
    app()
