from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from valorant_ratings.contracts import (
    ConditionalRating,
    ForecastMode,
    PlayerRatingQuery,
    ScenarioComparison,
    Support,
    TeammateAssignment,
)
from valorant_ratings.data import (
    DataValidationError,
    FoldSafeImputer,
    canonicalize_maps,
    canonicalize_player_maps,
    validate_feature_cutoffs,
    validate_series_frozen,
)
from valorant_ratings.metadata import annotate_agent_roles, load_agent_metadata, load_patch_metadata
from valorant_ratings.rosters import build_observed_roster_history, roster_as_of
from valorant_ratings.snapshot import (
    audit_snapshot,
    load_snapshot,
    write_immutable_snapshot,
)


def _maps() -> pd.DataFrame:
    raw = pd.DataFrame(
        {
            "map_id": [11, 12],
            "match_id": [7, 7],
            "game_number": [1, 2],
            "map_name": ["Ascent", "Haven"],
            "winner_team_id": [101, 202],
            "loser_team_id": [202, 101],
            "winner_rounds": [13, 14],
            "loser_rounds": [9, 12],
            "team1_id": [101, 101],
            "team2_id": [202, 202],
            "series_anchor_at": ["2025-05-01T18:00:00Z", "2025-05-01T18:05:00Z"],
            "match_completed_at": ["2025-05-01T18:00:00Z"] * 2,
            "map_completed_at": ["2025-05-01T17:00:00Z", "2025-05-01T18:00:00Z"],
            "event_name": ["Test Cup"] * 2,
            "region": ["NA"] * 2,
            "stage": ["Playoffs"] * 2,
            "best_of": [3] * 2,
        }
    )
    return canonicalize_maps(raw)


def _player_maps(maps: pd.DataFrame) -> pd.DataFrame:
    raw = pd.DataFrame(
        {
            "stat_id": [1, 2],
            "map_id": [11, 11],
            "match_id": [7, 7],
            "game_number": [1, 1],
            "team_id": [101, 202],
            "player_id": [1001, 2001],
            "agent": ["Jett", "Sova"],
            "kills": [20, 15],
            "deaths": [15, 20],
            "assists": [4, 9],
            "first_kills": [5, 2],
            "first_deaths": [2, 5],
            "acs": [250, 190],
            "adr": [160, None],
            "kast": [75.0, None],
            "reported_rounds_played": [999, None],
        }
    )
    return canonicalize_player_maps(raw, maps)


def test_canonical_map_and_player_context_use_score_derived_rounds() -> None:
    maps = _maps()
    players = _player_maps(maps)
    assert maps["map_id"].is_unique
    assert maps["prediction_cutoff"].nunique() == 1
    assert players["rounds_played"].tolist() == [22, 22]
    assert players["rounds_played_mismatch"].tolist() == [1, 0]
    winner = players.loc[players["team_id"] == 101].iloc[0]
    loser = players.loc[players["team_id"] == 202].iloc[0]
    assert winner["team_win"] == 1
    assert winner["opponent_team_id"] == 202
    assert winner["normalized_team_round_margin"] == pytest.approx(4 / 22)
    assert loser["normalized_team_round_margin"] == pytest.approx(-4 / 22)
    assert loser["adr_missing"] == 1


def test_every_feature_source_must_strictly_predate_cutoff() -> None:
    valid = pd.DataFrame(
        {
            "prediction_cutoff": ["2025-01-02T00:00:00Z"],
            "feature_source_at": ["2025-01-01T00:00:00Z"],
        }
    )
    validate_feature_cutoffs(valid)
    invalid = valid.assign(feature_source_at="2025-01-02T00:00:00Z")
    with pytest.raises(DataValidationError, match="strictly earlier"):
        validate_feature_cutoffs(invalid)


def test_series_freeze_detects_between_map_state_updates() -> None:
    maps = _maps().assign(pre_team_rating=[1000.0, 1012.0])
    with pytest.raises(DataValidationError, match="changes within"):
        validate_series_frozen(maps, state_columns=("pre_team_rating",))


def test_fold_imputer_fits_training_only_and_keeps_indicators() -> None:
    training = pd.DataFrame(
        {
            "prediction_cutoff": pd.to_datetime(["2024-01-01", "2024-02-01"], utc=True),
            "adr": [100.0, 200.0],
        },
        index=[8, 9],
    )
    imputer = FoldSafeImputer(("adr",)).fit(training, training_cutoff="2024-03-01")
    transformed = imputer.transform(pd.DataFrame({"adr": [None, 900.0]}))
    assert transformed["adr"].tolist() == [150.0, 900.0]
    assert transformed["adr_missing"].tolist() == [1, 0]
    assert imputer.training_row_count == 2
    too_late = training.assign(prediction_cutoff=pd.Timestamp("2024-03-01", tz="UTC"))
    with pytest.raises(DataValidationError, match="strictly before"):
        FoldSafeImputer(("adr",)).fit(too_late, training_cutoff="2024-03-01")


def test_observed_lineup_is_not_available_for_its_own_match() -> None:
    players = _player_maps(_maps())
    history = build_observed_roster_history(players)
    observed_at = history.loc[history["player_id"] == 1001, "observed_at"].iloc[0]
    assert roster_as_of(history, observed_at, team_id=101).empty
    later = roster_as_of(history, observed_at + timedelta(seconds=1), team_id=101)
    assert later["player_id"].tolist() == [1001]
    assert later["source"].tolist() == ["observed_match_lineup"]


def test_bundled_agent_and_patch_metadata_cover_known_context() -> None:
    agents = load_agent_metadata()
    assert agents.set_index("agent").loc["Veto", "role"] == "sentinel"
    assert agents.set_index("agent").loc["Miks", "role"] == "controller"
    patches = load_patch_metadata()
    assert patches.iloc[0]["patch"] == "6.00-era"
    assert patches.iloc[-1]["patch"] == "12.11-era"
    alias = annotate_agent_roles(
        pd.DataFrame(
            {"agent": ["kayo"], "prediction_cutoff": ["2025-01-01T00:00:00Z"]}
        )
    )
    assert alias.loc[0, "role"] == "initiator"
    assert alias.loc[0, "agent_metadata_known"] == 1


def test_contracts_round_trip_and_validate_legal_compositions() -> None:
    query = PlayerRatingQuery(
        as_of=datetime(2026, 6, 1, tzinfo=timezone.utc),
        player_id=10,
        map_name="Ascent",
        teammate_assignments=(TeammateAssignment(11, "Sova"), TeammateAssignment(12, "Omen")),
        forecast_mode=ForecastMode.SCENARIO,
    )
    assert PlayerRatingQuery.from_mapping(query.to_dict()) == query
    with pytest.raises(ValueError, match="duplicate agents"):
        PlayerRatingQuery(
            as_of=datetime.now(timezone.utc),
            player_id=10,
            teammate_assignments=(TeammateAssignment(11, "Sova"), TeammateAssignment(12, "sova")),
        )
    rating = ConditionalRating(1.0, 0.5, 0.2, (0.7, 1.3), (0.5, 1.5), Support.OBSERVED)
    comparison = ScenarioComparison(rating, rating, 0.0, 0.0, 0.0, 0.0)
    assert comparison.to_dict()["performanceDelta"] == 0.0


def _snapshot_frames() -> dict[str, pd.DataFrame]:
    maps = _maps().iloc[[0]].copy()
    player_maps = _player_maps(_maps())
    return {
        "maps": maps,
        "player_maps": player_maps,
        "vetoes": pd.DataFrame({"veto_id": pd.Series(dtype="int64")}),
        "rosters": build_observed_roster_history(player_maps),
        "teams": pd.DataFrame({"team_id": [101, 202], "name": ["A", "B"]}),
        "players": pd.DataFrame({"player_id": [1001, 2001], "ign": ["a", "b"]}),
        "metadata": pd.DataFrame({"entity_type": ["test"], "entity_id": ["test"]}),
    }


def test_snapshot_is_hashed_auditable_and_never_overwritten(tmp_path) -> None:
    target = tmp_path / "snapshot"
    path = write_immutable_snapshot(
        _snapshot_frames(), target, cutoff="2026-06-21T23:59:59Z", config={"test": True}
    )
    assert audit_snapshot(path)["ok"]
    loaded = load_snapshot(path)
    assert len(loaded["maps"]) == 1
    with pytest.raises(FileExistsError):
        write_immutable_snapshot(_snapshot_frames(), target, cutoff="2026-06-21")
    alternate = write_immutable_snapshot(
        _snapshot_frames(), target, cutoff="2026-06-21", force_alternate=True
    )
    assert alternate != target
    assert target.exists() and alternate.exists()
    with (target / "maps.parquet").open("ab") as handle:
        handle.write(b"tamper")
    audit = audit_snapshot(target)
    assert not audit["ok"]
    assert any("hash mismatch" in error for error in audit["errors"])
