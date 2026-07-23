"""Experiment immutability and the one-way 2026 lockbox protocol."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import pandas as pd


DEVELOPMENT_END = pd.Timestamp("2025-12-31T23:59:59.999999Z")
LOCKBOX_START = pd.Timestamp("2026-01-01T00:00:00Z")
SNAPSHOT_END = pd.Timestamp("2026-06-21T23:59:59.999999Z")
BASELINE_EXPERIMENT_VERSION = "ratings-development-v1"
MAP_READINESS_EXPERIMENT_VERSION = "ratings-map-readiness-v1"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Mapping[str, Any]) -> str:
    """Return a stable JSON encoding suitable for content addressing."""

    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def directory_digest(path: Path) -> str:
    """Hash a directory from relative names and file hashes, excluding caches."""

    records: list[str] = []
    excluded = {".venv", ".uv-cache", "__pycache__", ".pytest_cache"}
    for file_path in sorted(item for item in path.rglob("*") if item.is_file()):
        if any(part in excluded for part in file_path.parts):
            continue
        relative = file_path.relative_to(path).as_posix()
        records.append(f"{relative}:{sha256_file(file_path)}")
    return sha256_bytes("\n".join(records).encode("utf-8"))


def _timestamp_column(frame: pd.DataFrame) -> pd.Series:
    for candidate in ("prediction_cutoff", "completed_at", "timestamp"):
        if candidate in frame:
            return pd.to_datetime(frame[candidate], utc=True)
    raise KeyError("expected prediction_cutoff, completed_at, or timestamp")


def development_view(frame: pd.DataFrame) -> pd.DataFrame:
    """Return warm-up/development rows while making 2026 outcomes inaccessible."""

    timestamps = _timestamp_column(frame)
    return frame.loc[timestamps <= DEVELOPMENT_END].copy()


def lockbox_view(frame: pd.DataFrame) -> pd.DataFrame:
    timestamps = _timestamp_column(frame)
    return frame.loc[(timestamps >= LOCKBOX_START) & (timestamps <= SNAPSHOT_END)].copy()


@dataclass(frozen=True, slots=True)
class SelectionManifest:
    experiment_id: str
    selected_model: str
    selected_config: Mapping[str, Any]
    development_metrics: Mapping[str, Any]
    snapshot_digest: str
    code_digest: str
    created_at: str
    experiment_version: str = BASELINE_EXPERIMENT_VERSION
    development_end: str = DEVELOPMENT_END.isoformat()
    lockbox_start: str = LOCKBOX_START.isoformat()

    @classmethod
    def create(
        cls,
        *,
        experiment_id: str,
        selected_model: str,
        selected_config: Mapping[str, Any],
        development_metrics: Mapping[str, Any],
        snapshot_digest: str,
        code_digest: str,
        experiment_version: str = BASELINE_EXPERIMENT_VERSION,
    ) -> "SelectionManifest":
        if not experiment_id.strip() or not selected_model.strip() or not experiment_version.strip():
            raise ValueError("experiment_id, experiment_version, and selected_model are required")
        return cls(
            experiment_id=experiment_id,
            selected_model=selected_model,
            selected_config=dict(selected_config),
            development_metrics=dict(development_metrics),
            snapshot_digest=snapshot_digest,
            code_digest=code_digest,
            created_at=_utc_now(),
            experiment_version=experiment_version,
        )

    def digest(self) -> str:
        return sha256_bytes(canonical_json(asdict(self)).encode("utf-8"))


def freeze_selection(path: Path, selection: SelectionManifest) -> Path:
    """Write the pre-2026 choice once; never silently replace it."""

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"selection is already frozen: {path}")
    payload = {**asdict(selection), "selection_digest": selection.digest()}
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return path


def load_selection(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    recorded = payload.pop("selection_digest")
    actual = sha256_bytes(canonical_json(payload).encode("utf-8"))
    if recorded != actual:
        raise ValueError("selection manifest was modified after it was frozen")
    payload["selection_digest"] = recorded
    return payload


def record_lockbox_result(
    path: Path,
    *,
    selection_path: Path,
    snapshot_digest: str,
    metrics: Mapping[str, Any],
) -> Path:
    """Record one confirmation result and refuse repeated peeking."""

    if path.exists():
        raise FileExistsError(f"2026 lockbox was already opened: {path}")
    selection = load_selection(selection_path)
    if selection["snapshot_digest"] != snapshot_digest:
        raise ValueError("snapshot digest differs from the frozen selection")
    payload = {
        "opened_at": _utc_now(),
        "selection_digest": selection["selection_digest"],
        "snapshot_digest": snapshot_digest,
        "model": selection["selected_model"],
        "experiment_version": selection.get(
            "experiment_version", BASELINE_EXPERIMENT_VERSION
        ),
        "metrics": dict(metrics),
        "confirmation_start": LOCKBOX_START.isoformat(),
        "confirmation_end": SNAPSHOT_END.isoformat(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return path
