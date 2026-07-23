from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from valorant_ratings.experiment import (
    MAP_READINESS_EXPERIMENT_VERSION,
    SelectionManifest,
    development_view,
    freeze_selection,
    load_selection,
    lockbox_view,
    record_lockbox_result,
)


def test_development_and_lockbox_are_disjoint() -> None:
    frame = pd.DataFrame(
        {
            "completed_at": pd.to_datetime(
                ["2025-12-31T20:00:00Z", "2026-01-01T01:00:00Z", "2026-06-22T00:00:00Z"]
            ),
            "outcome": [0, 1, 0],
        }
    )
    assert development_view(frame)["outcome"].tolist() == [0]
    assert lockbox_view(frame)["outcome"].tolist() == [1]


def test_selection_is_immutable_and_tamper_evident(tmp_path: Path) -> None:
    path = tmp_path / "selection.json"
    selection = SelectionManifest.create(
        experiment_id="test",
        selected_model="carryover_elo",
        selected_config={"k": 50},
        development_metrics={"log_loss": 0.64},
        snapshot_digest="data-hash",
        code_digest="code-hash",
    )
    freeze_selection(path, selection)
    with pytest.raises(FileExistsError):
        freeze_selection(path, selection)
    assert load_selection(path)["selected_model"] == "carryover_elo"

    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["selected_model"] = "peeked-model"
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="modified"):
        load_selection(path)


def test_map_readiness_selection_records_a_distinct_experiment_version(
    tmp_path: Path,
) -> None:
    path = tmp_path / "selection.json"
    freeze_selection(
        path,
        SelectionManifest.create(
            experiment_id="map-readiness-test",
            experiment_version=MAP_READINESS_EXPERIMENT_VERSION,
            selected_model="map_readiness",
            selected_config={},
            development_metrics={},
            snapshot_digest="snapshot",
            code_digest="code",
        ),
    )
    assert load_selection(path)["experiment_version"] == MAP_READINESS_EXPERIMENT_VERSION


def test_lockbox_can_only_be_recorded_once(tmp_path: Path) -> None:
    selection_path = tmp_path / "selection.json"
    result_path = tmp_path / "lockbox.json"
    freeze_selection(
        selection_path,
        SelectionManifest.create(
            experiment_id="test",
            selected_model="backbone",
            selected_config={},
            development_metrics={},
            snapshot_digest="snapshot",
            code_digest="code",
        ),
    )
    record_lockbox_result(
        result_path,
        selection_path=selection_path,
        snapshot_digest="snapshot",
        metrics={"log_loss": 0.63},
    )
    with pytest.raises(FileExistsError, match="already opened"):
        record_lockbox_result(
            result_path,
            selection_path=selection_path,
            snapshot_digest="snapshot",
            metrics={"log_loss": 0.62},
        )
