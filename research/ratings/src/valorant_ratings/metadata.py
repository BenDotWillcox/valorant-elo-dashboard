"""Effective-dated patch, map-pool and agent metadata.

Metadata is only eligible for a prediction when its announcement/knowledge time
precedes that prediction.  The bundled catalog is deliberately conservative:
unverified historical intervals remain ``unknown`` rather than being inferred
from maps that were eventually played.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Mapping

import pandas as pd

from .data import DataValidationError
from .contracts import canonical_agent_key


DEFAULT_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"


_agent_key = canonical_agent_key


def _read_records(path: Path, record_key: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get(record_key)
    if not isinstance(records, list):
        raise DataValidationError(f"{path} must contain a {record_key!r} list")
    return records, {key: value for key, value in payload.items() if key != record_key}


def _timestamps(frame: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    result = frame.copy()
    for column in columns:
        if column in result:
            result[column] = pd.to_datetime(result[column], utc=True, errors="coerce")
    return result


def load_agent_metadata(config_dir: Path | str | None = None) -> pd.DataFrame:
    directory = Path(config_dir) if config_dir is not None else DEFAULT_CONFIG_DIR
    records, catalog = _read_records(directory / "agents.json", "agents")
    frame = pd.DataFrame.from_records(records)
    required = {"agent", "role", "source", "confidence"}
    missing = required.difference(frame.columns)
    if missing:
        raise DataValidationError(f"agent metadata missing fields: {sorted(missing)}")
    frame = _timestamps(frame, ("announced_at", "release_effective_at"))
    if frame["agent"].map(_agent_key).duplicated().any():
        raise DataValidationError("agent names must be unique ignoring case")
    allowed_roles = {"controller", "duelist", "initiator", "sentinel"}
    invalid = ~frame["role"].str.casefold().isin(allowed_roles)
    if invalid.any():
        raise DataValidationError(f"invalid agent roles: {frame.loc[invalid, 'role'].tolist()}")
    frame["catalog_status"] = catalog.get("status", "unknown")
    frame["entity_type"] = "agent"
    return frame.sort_values("agent", key=lambda values: values.str.casefold()).reset_index(drop=True)


def _load_intervals(
    filename: str,
    record_key: str,
    identity_column: str,
    config_dir: Path | str | None,
) -> pd.DataFrame:
    directory = Path(config_dir) if config_dir is not None else DEFAULT_CONFIG_DIR
    records, catalog = _read_records(directory / filename, record_key)
    frame = pd.DataFrame.from_records(records)
    required = {identity_column, "effective_from", "announced_at", "source", "confidence"}
    missing = required.difference(frame.columns)
    if missing:
        raise DataValidationError(f"{filename} missing fields: {sorted(missing)}")
    frame = _timestamps(frame, ("announced_at", "effective_from", "effective_to"))
    if frame["effective_from"].isna().any() or frame["announced_at"].isna().any():
        raise DataValidationError(f"{filename} requires valid announcement and effective timestamps")
    if "effective_to" not in frame:
        frame["effective_to"] = pd.NaT
    if (frame["effective_to"].notna() & (frame["effective_to"] <= frame["effective_from"])).any():
        raise DataValidationError(f"{filename} effective_to must be after effective_from")
    if (frame["announced_at"] > frame["effective_from"]).any():
        raise DataValidationError(f"{filename} cannot be known after it becomes effective")
    ordered = frame.sort_values("effective_from", kind="stable").reset_index(drop=True)
    previous_end = ordered["effective_to"].shift(1)
    overlap = previous_end.notna() & (ordered["effective_from"] < previous_end)
    if overlap.any():
        raise DataValidationError(f"{filename} contains overlapping global intervals")
    ordered["catalog_status"] = catalog.get("status", "unknown")
    return ordered


def load_patch_metadata(config_dir: Path | str | None = None) -> pd.DataFrame:
    frame = _load_intervals("patches.json", "patches", "patch", config_dir)
    frame["entity_type"] = "patch"
    return frame


def load_map_pool_metadata(config_dir: Path | str | None = None) -> pd.DataFrame:
    frame = _load_intervals("map_pools.json", "map_pools", "pool_id", config_dir)
    if "maps" not in frame:
        raise DataValidationError("map pool metadata requires a maps list")
    if frame["maps"].map(lambda value: len(value) != len(set(value))).any():
        raise DataValidationError("map pools cannot contain duplicate map names")
    frame["entity_type"] = "map_pool"
    return frame


def annotate_effective_intervals(
    observations: pd.DataFrame,
    intervals: pd.DataFrame,
    *,
    timestamp_column: str,
    value_columns: Iterable[str],
    prefix: str,
) -> pd.DataFrame:
    """As-of join intervals using both effective and knowledge timestamps."""

    result = observations.copy()
    result[timestamp_column] = pd.to_datetime(result[timestamp_column], utc=True, errors="coerce")
    if result[timestamp_column].isna().any():
        raise DataValidationError(f"{timestamp_column} cannot be missing")
    left = result.reset_index(names="__original_index").sort_values(timestamp_column)
    right = intervals.sort_values("effective_from")
    value_columns = tuple(value_columns)
    internal_values = {column: f"__metadata_{column}" for column in value_columns}
    selected = ["effective_from", "effective_to", "announced_at", *value_columns]
    right = right[selected].rename(columns=internal_values)
    joined = pd.merge_asof(
        left,
        right,
        left_on=timestamp_column,
        right_on="effective_from",
        direction="backward",
        allow_exact_matches=True,
    )
    eligible = (
        joined["announced_at"].notna()
        & (joined["announced_at"] < joined[timestamp_column])
        & (joined["effective_to"].isna() | (joined[timestamp_column] < joined["effective_to"]))
    )
    for column in value_columns:
        joined[f"{prefix}{column}"] = joined[internal_values[column]].where(eligible)
    joined[f"{prefix}metadata_known"] = eligible.astype("int8")
    drop = [*internal_values.values(), "effective_from", "effective_to", "announced_at"]
    joined = joined.drop(columns=drop).sort_values("__original_index").drop(columns="__original_index")
    return joined.reset_index(drop=True)


def annotate_patch(
    observations: pd.DataFrame,
    *,
    timestamp_column: str = "prediction_cutoff",
    config_dir: Path | str | None = None,
) -> pd.DataFrame:
    result = annotate_effective_intervals(
        observations,
        load_patch_metadata(config_dir),
        timestamp_column=timestamp_column,
        value_columns=("patch",),
        prefix="",
    )
    return result.rename(columns={"metadata_known": "patch_metadata_known"})


def annotate_map_pool(
    observations: pd.DataFrame,
    *,
    timestamp_column: str = "prediction_cutoff",
    config_dir: Path | str | None = None,
) -> pd.DataFrame:
    result = annotate_effective_intervals(
        observations,
        load_map_pool_metadata(config_dir),
        timestamp_column=timestamp_column,
        value_columns=("pool_id", "maps"),
        prefix="map_pool_",
    )
    return result.rename(
        columns={
            "map_pool_pool_id": "map_pool_id",
            "map_pool_maps": "active_maps",
        }
    )


def annotate_agent_roles(
    player_maps: pd.DataFrame,
    *,
    agent_column: str = "agent",
    timestamp_column: str = "prediction_cutoff",
    config_dir: Path | str | None = None,
) -> pd.DataFrame:
    agents = load_agent_metadata(config_dir)
    result = player_maps.copy()
    result["__agent_key"] = result[agent_column].map(_agent_key)
    agents["__agent_key"] = agents["agent"].map(_agent_key)
    result = result.merge(
        agents[["__agent_key", "role", "release_effective_at", "announced_at"]],
        on="__agent_key",
        how="left",
        validate="many_to_one",
    ).drop(columns="__agent_key")
    observed_at = pd.to_datetime(result[timestamp_column], utc=True, errors="coerce")
    known = result["announced_at"].notna() & (result["announced_at"] < observed_at)
    released = result["release_effective_at"].isna() | (result["release_effective_at"] <= observed_at)
    result["agent_metadata_known"] = (known & released & result["role"].notna()).astype("int8")
    result.loc[result["agent_metadata_known"] == 0, "role"] = pd.NA
    return result


def infer_observed_agent_releases(player_maps: pd.DataFrame) -> pd.DataFrame:
    """Create a conservative fallback: first observed use, not claimed release."""

    required = {"agent", "prediction_cutoff"}
    if not required.issubset(player_maps.columns):
        raise DataValidationError("observed release inference requires agent and prediction_cutoff")
    observed = (
        player_maps.assign(
            prediction_cutoff=pd.to_datetime(player_maps["prediction_cutoff"], utc=True, errors="coerce")
        )
        .groupby("agent", as_index=False)["prediction_cutoff"]
        .min()
        .rename(columns={"prediction_cutoff": "first_observed_at"})
    )
    observed["source"] = "observed_competitive_use"
    observed["confidence"] = 0.70
    observed["is_release_date"] = False
    return observed


def metadata_artifact(
    maps: pd.DataFrame,
    player_maps: pd.DataFrame,
    *,
    config_dir: Path | str | None = None,
) -> pd.DataFrame:
    """Build a long, parquet-friendly manifest of all metadata and fallbacks."""

    records: list[dict[str, Any]] = []
    for row in load_agent_metadata(config_dir).to_dict("records"):
        records.append(
            {
                "entity_type": "agent",
                "entity_id": row["agent"],
                "effective_from": row.get("release_effective_at"),
                "effective_to": pd.NaT,
                "announced_at": row.get("announced_at"),
                "source": row["source"],
                "confidence": row["confidence"],
                "payload_json": json.dumps({"role": row["role"]}, sort_keys=True),
            }
        )
    for row in load_patch_metadata(config_dir).to_dict("records"):
        records.append(
            {
                "entity_type": "patch",
                "entity_id": row["patch"],
                "effective_from": row["effective_from"],
                "effective_to": row.get("effective_to"),
                "announced_at": row["announced_at"],
                "source": row["source"],
                "confidence": row["confidence"],
                "payload_json": "{}",
            }
        )
    for row in load_map_pool_metadata(config_dir).to_dict("records"):
        records.append(
            {
                "entity_type": "map_pool",
                "entity_id": row["pool_id"],
                "effective_from": row["effective_from"],
                "effective_to": row.get("effective_to"),
                "announced_at": row["announced_at"],
                "source": row["source"],
                "confidence": row["confidence"],
                "payload_json": json.dumps({"maps": row["maps"]}, sort_keys=True),
            }
        )
    configured_agents = {
        _agent_key(record["entity_id"])
        for record in records
        if record["entity_type"] == "agent"
    }
    for row in infer_observed_agent_releases(player_maps).to_dict("records"):
        if _agent_key(row["agent"]) not in configured_agents:
            records.append(
                {
                    "entity_type": "agent_observed_fallback",
                    "entity_id": row["agent"],
                    "effective_from": row["first_observed_at"],
                    "effective_to": pd.NaT,
                    "announced_at": row["first_observed_at"],
                    "source": row["source"],
                    "confidence": row["confidence"],
                    "payload_json": json.dumps({"is_release_date": False}, sort_keys=True),
                }
            )
    artifact = pd.DataFrame.from_records(records)
    return _timestamps(artifact, ("effective_from", "effective_to", "announced_at")).sort_values(
        ["entity_type", "effective_from", "entity_id"], na_position="last", kind="stable"
    ).reset_index(drop=True)
