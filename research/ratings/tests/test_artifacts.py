from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from valorant_ratings.artifacts import ArtifactStore, verify_artifact_store


def test_versioned_artifacts_are_hash_verified_and_not_overwritten(tmp_path: Path) -> None:
    store = ArtifactStore(tmp_path, "experiment-1", "snapshot", "v1").initialize()
    store.write_parquet("predictions/maps.parquet", pd.DataFrame({"p": [0.4, 0.6]}))
    store.write_json("metrics.json", {"log_loss": 0.68})
    store.finalize()
    verified = verify_artifact_store(store.directory)
    assert verified["snapshot_digest"] == "snapshot"
    with pytest.raises(FileExistsError):
        ArtifactStore(tmp_path, "experiment-1", "snapshot", "v1").initialize()


def test_artifact_hash_detects_tampering(tmp_path: Path) -> None:
    store = ArtifactStore(tmp_path, "experiment-2", "snapshot", "v1").initialize()
    path = store.write_text("report.md", "original")
    store.finalize()
    path.write_text("changed", encoding="utf-8")
    with pytest.raises(ValueError, match="hash verification"):
        verify_artifact_store(store.directory)
