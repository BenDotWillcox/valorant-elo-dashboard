"""Immutable, hashed Parquet snapshots for ratings experiments."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from .data import (
    SNAPSHOT_CUTOFF,
    DataValidationError,
    data_quality_summary,
    extract_source_frames,
    normalize_cutoff,
    query_hashes,
    validate_match_grouping,
    validate_raw_source_columns,
    validate_series_frozen,
)
from .metadata import annotate_agent_roles, annotate_map_pool, annotate_patch, metadata_artifact
from .rosters import build_observed_roster_history


CANONICAL_FILES: Mapping[str, str] = {
    "maps": "maps.parquet",
    "player_maps": "player_maps.parquet",
    "vetoes": "vetoes.parquet",
    "rosters": "rosters.parquet",
    "teams": "teams.parquet",
    "players": "players.parquet",
    "metadata": "metadata.parquet",
}


@dataclass(frozen=True)
class SnapshotData(Mapping[str, pd.DataFrame]):
    path: Path
    manifest: Mapping[str, Any]
    frames: Mapping[str, pd.DataFrame]

    def __getitem__(self, key: str) -> pd.DataFrame:
        return self.frames[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self.frames)

    def __len__(self) -> int:
        return len(self.frames)


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")


def _schema_description(frame: pd.DataFrame) -> list[dict[str, str]]:
    return [{"name": str(column), "dtype": str(dtype)} for column, dtype in frame.dtypes.items()]


def _load_config(config_path: Path | str | None) -> tuple[dict[str, Any], Path]:
    if config_path is None:
        path = Path(__file__).resolve().parents[2] / "config" / "snapshot.json"
    else:
        path = Path(config_path)
    config = json.loads(path.read_text(encoding="utf-8"))
    return config, path


def _alternate_path(target: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return target.with_name(f"{target.name}__{stamp}_{uuid4().hex[:8]}")


def write_immutable_snapshot(
    frames: Mapping[str, pd.DataFrame],
    output_dir: Path | str,
    *,
    cutoff: datetime | pd.Timestamp | str,
    extraction_time: datetime | None = None,
    schema_version: str = "ratings-snapshot-v1",
    config: Mapping[str, Any] | None = None,
    config_source: str | None = None,
    force_alternate: bool = False,
) -> Path:
    """Atomically write a snapshot, never overwriting an existing directory.

    ``force_alternate=True`` does not weaken immutability: it creates a new,
    explicitly versioned sibling path and leaves the existing snapshot intact.
    """

    target = Path(output_dir).resolve()
    if target.exists():
        if not force_alternate:
            raise FileExistsError(f"immutable snapshot already exists: {target}")
        target = _alternate_path(target)
    required = set(CANONICAL_FILES)
    missing = required.difference(frames)
    if missing:
        raise DataValidationError(f"snapshot missing canonical frames: {sorted(missing)}")
    cutoff_timestamp = normalize_cutoff(cutoff)
    extraction_time = extraction_time or datetime.now(timezone.utc)
    if extraction_time.tzinfo is None:
        extraction_time = extraction_time.replace(tzinfo=timezone.utc)
    config = dict(config or {})
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.staging-", dir=target.parent))
    try:
        files: dict[str, dict[str, Any]] = {}
        for name, filename in CANONICAL_FILES.items():
            frame = frames[name]
            path = staging / filename
            frame.to_parquet(path, engine="pyarrow", compression="zstd", index=False)
            schema = _schema_description(frame)
            files[name] = {
                "path": filename,
                "sha256": _sha256_file(path),
                "rows": int(len(frame)),
                "columns": list(map(str, frame.columns)),
                "schema": schema,
                "schema_sha256": sha256(_canonical_json(schema)).hexdigest(),
            }
        data_hash = sha256(
            _canonical_json({name: info["sha256"] for name, info in sorted(files.items())})
        ).hexdigest()
        manifest: dict[str, Any] = {
            "snapshot_format": "valorant-ratings-parquet-v1",
            "schema_version": schema_version,
            "cutoff": cutoff_timestamp.isoformat(),
            "extraction_time": extraction_time.astimezone(timezone.utc).isoformat(),
            "config_source": config_source,
            "config": config,
            "config_sha256": sha256(_canonical_json(config)).hexdigest(),
            "source_query_sha256": query_hashes(),
            "files": files,
            "data_sha256": data_hash,
            "quality": data_quality_summary(frames),
            "immutability": {
                "overwrite": "forbidden",
                "verification": "sha256 of every parquet plus manifest payload",
            },
        }
        manifest["manifest_payload_sha256"] = sha256(_canonical_json(manifest)).hexdigest()
        (staging / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8"
        )
        if target.exists():  # race guard
            raise FileExistsError(f"snapshot target appeared during write: {target}")
        staging.replace(target)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return target


def create_snapshot(
    output_dir: Path | str,
    database_url: str,
    cutoff: datetime | pd.Timestamp | str = SNAPSHOT_CUTOFF,
    config_path: Path | str | None = None,
    *,
    force_alternate: bool = False,
) -> Path:
    """Extract, enrich and freeze the database into canonical Parquet files."""

    target = Path(output_dir).resolve()
    if target.exists() and not force_alternate:
        # Fail before opening a database transaction.
        raise FileExistsError(f"immutable snapshot already exists: {target}")
    cutoff_timestamp = normalize_cutoff(cutoff)
    config, source_path = _load_config(config_path)
    frames = extract_source_frames(database_url, cutoff=cutoff_timestamp)
    config_dir = source_path.parent
    metadata_configs = {
        filename: json.loads((config_dir / filename).read_text(encoding="utf-8"))
        for filename in ("agents.json", "patches.json", "map_pools.json")
    }
    complete_config = {"snapshot": config, "metadata": metadata_configs}

    maps = annotate_patch(frames["maps"], config_dir=config_dir)
    maps = annotate_map_pool(maps, config_dir=config_dir)
    # Preserve team-specific context and metadata on the player artifact.
    metadata_columns = [
        "map_id",
        "patch",
        "patch_metadata_known",
        "map_pool_id",
        "map_pool_metadata_known",
    ]
    player_maps = frames["player_maps"].merge(
        maps[[column for column in metadata_columns if column in maps]],
        on="map_id",
        how="left",
        validate="many_to_one",
    )
    player_maps = annotate_agent_roles(player_maps, config_dir=config_dir)
    rosters = build_observed_roster_history(player_maps)
    metadata = metadata_artifact(maps, player_maps, config_dir=config_dir)
    canonical_frames = {
        "maps": maps,
        "player_maps": player_maps,
        "vetoes": frames["vetoes"],
        "rosters": rosters,
        "teams": frames["teams"],
        "players": frames["players"],
        "metadata": metadata,
    }
    validate_raw_source_columns(canonical_frames)
    validate_series_frozen(maps)
    validate_match_grouping(maps)
    return write_immutable_snapshot(
        canonical_frames,
        target,
        cutoff=cutoff_timestamp,
        schema_version=str(config.get("schema_version", "ratings-snapshot-v1")),
        config=complete_config,
        config_source=str(source_path.resolve()),
        force_alternate=force_alternate,
    )


def _read_manifest(path: Path) -> dict[str, Any]:
    manifest_path = path / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"snapshot manifest is missing: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def audit_snapshot(path: Path | str) -> dict[str, Any]:
    """Verify hashes, row counts, schemas and core leakage invariants."""

    root = Path(path).resolve()
    manifest = _read_manifest(root)
    errors: list[str] = []
    file_results: dict[str, Any] = {}
    frames: dict[str, pd.DataFrame] = {}
    for name, filename in CANONICAL_FILES.items():
        expected = manifest.get("files", {}).get(name, {})
        file_path = root / filename
        if not file_path.is_file():
            errors.append(f"missing {filename}")
            continue
        actual_hash = _sha256_file(file_path)
        hash_ok = actual_hash == expected.get("sha256")
        if not hash_ok:
            errors.append(f"hash mismatch for {filename}")
        try:
            frame = pd.read_parquet(file_path, engine="pyarrow")
            frames[name] = frame
            rows_ok = len(frame) == expected.get("rows")
            columns_ok = list(frame.columns) == expected.get("columns")
            if not rows_ok:
                errors.append(f"row-count mismatch for {filename}")
            if not columns_ok:
                errors.append(f"column mismatch for {filename}")
            file_results[name] = {
                "hash_ok": hash_ok,
                "rows_ok": rows_ok,
                "columns_ok": columns_ok,
                "rows": int(len(frame)),
            }
        except Exception as exc:
            errors.append(f"cannot read {filename}: {exc}")
    if {"maps", "player_maps"}.issubset(frames):
        try:
            validate_series_frozen(frames["maps"])
            validate_match_grouping(frames["maps"])
            validate_raw_source_columns(frames)
        except Exception as exc:
            errors.append(f"data invariant failure: {exc}")
    expected_data_hash = manifest.get("data_sha256")
    actual_file_hashes = {
        name: _sha256_file(root / filename)
        for name, filename in CANONICAL_FILES.items()
        if (root / filename).is_file()
    }
    actual_data_hash = sha256(_canonical_json(dict(sorted(actual_file_hashes.items())))).hexdigest()
    data_hash_ok = actual_data_hash == expected_data_hash
    if not data_hash_ok:
        errors.append("composite data hash mismatch")
    manifest_payload = dict(manifest)
    expected_manifest_hash = manifest_payload.pop("manifest_payload_sha256", None)
    manifest_hash_ok = sha256(_canonical_json(manifest_payload)).hexdigest() == expected_manifest_hash
    if not manifest_hash_ok:
        errors.append("manifest payload hash mismatch")
    return {
        "path": str(root),
        "ok": not errors,
        "errors": errors,
        "files": file_results,
        "data_hash_ok": data_hash_ok,
        "manifest_hash_ok": manifest_hash_ok,
        "cutoff": manifest.get("cutoff"),
        "schema_version": manifest.get("schema_version"),
    }


def load_snapshot(path: Path | str, *, verify: bool = True) -> SnapshotData:
    root = Path(path).resolve()
    if verify:
        audit = audit_snapshot(root)
        if not audit["ok"]:
            raise DataValidationError(f"snapshot audit failed: {audit['errors']}")
    manifest = _read_manifest(root)
    frames = {
        name: pd.read_parquet(root / filename, engine="pyarrow")
        for name, filename in CANONICAL_FILES.items()
    }
    return SnapshotData(path=root, manifest=manifest, frames=frames)
