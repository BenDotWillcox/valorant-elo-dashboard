"""Content-addressed, versioned research artifact writing."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from .experiment import canonical_json, sha256_bytes, sha256_file


@dataclass(slots=True)
class ArtifactStore:
    root: Path
    experiment_id: str
    snapshot_digest: str
    model_version: str
    _files: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def directory(self) -> Path:
        return (self.root / self.experiment_id).resolve()

    def initialize(self) -> "ArtifactStore":
        self.directory.mkdir(parents=True, exist_ok=False)
        return self

    def _target(self, relative_path: str) -> Path:
        target = (self.directory / relative_path).resolve()
        if self.directory.resolve() not in target.parents:
            raise ValueError("artifact path escapes its experiment directory")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise FileExistsError(f"artifact already exists: {target}")
        return target

    def write_parquet(self, relative_path: str, frame: pd.DataFrame) -> Path:
        target = self._target(relative_path)
        frame.to_parquet(target, index=False)
        self._record(target, rows=len(frame), columns=list(frame.columns))
        return target

    def write_json(self, relative_path: str, payload: Mapping[str, Any]) -> Path:
        target = self._target(relative_path)
        target.write_text(json.dumps(payload, indent=2, sort_keys=True, default=str), encoding="utf-8")
        self._record(target)
        return target

    def write_text(self, relative_path: str, value: str) -> Path:
        target = self._target(relative_path)
        target.write_text(value, encoding="utf-8")
        self._record(target)
        return target

    def register_existing(self, relative_path: str, **metadata: Any) -> Path:
        """Register a file written by a stricter one-shot protocol."""

        target = (self.directory / relative_path).resolve()
        if self.directory.resolve() not in target.parents or not target.is_file():
            raise ValueError(f"cannot register artifact outside the store: {target}")
        if target.relative_to(self.directory).as_posix() in self._files:
            raise ValueError(f"artifact is already registered: {target}")
        self._record(target, **metadata)
        return target

    def _record(self, path: Path, **metadata: Any) -> None:
        self._files[path.relative_to(self.directory).as_posix()] = {
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
            **metadata,
        }

    def finalize(self, extra: Mapping[str, Any] | None = None) -> Path:
        if not self.directory.exists():
            raise RuntimeError("initialize the artifact store first")
        manifest = {
            "experiment_id": self.experiment_id,
            "model_version": self.model_version,
            "snapshot_digest": self.snapshot_digest,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "files": dict(sorted(self._files.items())),
            "metadata": dict(extra or {}),
        }
        manifest["manifest_digest"] = sha256_bytes(canonical_json(manifest).encode("utf-8"))
        target = self._target("manifest.json")
        target.write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str), encoding="utf-8")
        return target


def verify_artifact_store(directory: Path) -> dict[str, Any]:
    manifest_path = directory / "manifest.json"
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    recorded_manifest_digest = payload.pop("manifest_digest")
    actual_manifest_digest = sha256_bytes(canonical_json(payload).encode("utf-8"))
    if recorded_manifest_digest != actual_manifest_digest:
        raise ValueError("artifact manifest digest does not match")
    for relative, metadata in payload["files"].items():
        path = directory / relative
        if not path.exists() or sha256_file(path) != metadata["sha256"]:
            raise ValueError(f"artifact failed hash verification: {relative}")
    payload["manifest_digest"] = recorded_manifest_digest
    return payload
