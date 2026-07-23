"""Leakage-safe extraction and preprocessing for ratings research.

This module intentionally reads only raw match, map, veto, player-stat and
identity tables.  Production Elo and VPM tables are never queried: every state
used by a validation fold must be rebuilt from the fold's prior observations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Iterable, Mapping, Sequence

import pandas as pd


SNAPSHOT_CUTOFF = pd.Timestamp("2026-06-21T23:59:59.999999Z")


CANONICAL_MAPS_SQL = """
SELECT
    mp.id::bigint AS map_id,
    mp.match_id::bigint AS match_id,
    mt.vlr_match_id,
    mp.game_number,
    mp.map_name,
    mp.winner_team_id::bigint,
    mp.loser_team_id::bigint,
    mp.winner_rounds,
    mp.loser_rounds,
    mt.team1_id::bigint,
    mt.team2_id::bigint,
    CASE WHEN mp.winner_team_id = mt.team1_id THEN 1 ELSE 0 END AS team1_win,
    mt.event_name,
    COALESCE(mt.region, mp.region) AS region,
    mt.stage,
    mt.best_of,
    mt.team1_score AS series_team1_score,
    mt.team2_score AS series_team2_score,
    mp.completed_at AS map_completed_at,
    mt.completed_at AS match_completed_at,
    COALESCE(mt.completed_at, mp.completed_at) AS series_anchor_at
FROM maps AS mp
JOIN matches AS mt ON mt.id = mp.match_id
WHERE COALESCE(mt.completed_at, mp.completed_at) IS NOT NULL
  AND COALESCE(mt.completed_at, mp.completed_at) <= %(cutoff)s
  AND mt.team1_id IS NOT NULL
  AND mt.team2_id IS NOT NULL
ORDER BY COALESCE(mt.completed_at, mp.completed_at), mp.match_id, mp.game_number, mp.id
""".strip()


PLAYER_MAPS_SQL = """
SELECT
    pms.id::bigint AS stat_id,
    pms.match_id::bigint,
    pms.map_id::bigint,
    pms.game_number,
    pms.team_id::bigint,
    pms.player_id::bigint,
    pms.agent,
    pms.kills,
    pms.deaths,
    pms.assists,
    pms.first_kills,
    pms.first_deaths,
    pms.acs,
    pms.adr,
    pms.kast,
    pms.rounds_played AS reported_rounds_played
FROM player_map_stats AS pms
JOIN maps AS mp ON mp.id = pms.map_id
JOIN matches AS mt ON mt.id = mp.match_id
WHERE COALESCE(mt.completed_at, mp.completed_at) IS NOT NULL
  AND COALESCE(mt.completed_at, mp.completed_at) <= %(cutoff)s
ORDER BY pms.match_id, pms.game_number, pms.team_id, pms.player_id
""".strip()


VETOES_SQL = """
SELECT
    mv.id::bigint AS veto_id,
    mv.match_id::bigint,
    mv.order_index,
    mv.action,
    mv.map_name,
    mv.team_id::bigint,
    mv.resulted_game_number
FROM match_vetoes AS mv
JOIN matches AS mt ON mt.id = mv.match_id
WHERE mt.completed_at IS NOT NULL
  AND mt.completed_at <= %(cutoff)s
ORDER BY mv.match_id, mv.order_index, mv.id
""".strip()


TEAMS_SQL = """
SELECT id::bigint AS team_id, vlr_slug, name, slug
FROM teams
ORDER BY id
""".strip()


PLAYERS_SQL = """
SELECT id::bigint AS player_id, vlr_player_id, slug, ign, name
FROM players
ORDER BY id
""".strip()


SOURCE_QUERIES: Mapping[str, str] = {
    "maps": CANONICAL_MAPS_SQL,
    "player_maps": PLAYER_MAPS_SQL,
    "vetoes": VETOES_SQL,
    "teams": TEAMS_SQL,
    "players": PLAYERS_SQL,
}


class DataValidationError(ValueError):
    """Raised when raw or engineered data violates a research invariant."""


def normalize_cutoff(value: datetime | pd.Timestamp | str) -> pd.Timestamp:
    cutoff = pd.Timestamp(value)
    if cutoff.tzinfo is None:
        cutoff = cutoff.tz_localize("UTC")
    else:
        cutoff = cutoff.tz_convert("UTC")
    if cutoff > SNAPSHOT_CUTOFF:
        raise DataValidationError(
            f"research snapshot cutoff {cutoff.isoformat()} exceeds frozen lockbox end "
            f"{SNAPSHOT_CUTOFF.isoformat()}"
        )
    return cutoff


def query_hashes() -> dict[str, str]:
    return {name: sha256(query.encode("utf-8")).hexdigest() for name, query in SOURCE_QUERIES.items()}


def _read_sql(connection: Any, query: str, cutoff: pd.Timestamp | None = None) -> pd.DataFrame:
    params = None if cutoff is None else {"cutoff": cutoff.to_pydatetime()}
    # Use the DB-API cursor directly so extraction has no SQLAlchemy dependency
    # and column names come from the exact read-only query result.
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        columns = [description.name for description in cursor.description or ()]
    return pd.DataFrame.from_records(rows, columns=columns)


def extract_source_frames(
    database_url: str,
    cutoff: datetime | pd.Timestamp | str = SNAPSHOT_CUTOFF,
) -> dict[str, pd.DataFrame]:
    """Read raw research inputs in one read-only repeatable-read transaction."""

    cutoff = normalize_cutoff(cutoff)
    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - integration environment concern
        raise RuntimeError("snapshot extraction requires psycopg 3") from exc

    frames: dict[str, pd.DataFrame] = {}
    # read_only protects the production database even if query strings are later
    # refactored.  Repeatable read gives every parquet file the same source view.
    with psycopg.connect(database_url, autocommit=False) as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        for name, query in SOURCE_QUERIES.items():
            frames[name] = _read_sql(
                connection,
                query,
                cutoff if name not in {"teams", "players"} else None,
            )
        connection.rollback()

    frames["maps"] = canonicalize_maps(frames["maps"], cutoff=cutoff)
    frames["player_maps"] = canonicalize_player_maps(frames["player_maps"], frames["maps"])
    validate_match_grouping(frames["maps"])
    validate_raw_source_columns(frames)
    return frames


def canonicalize_maps(
    maps: pd.DataFrame,
    cutoff: datetime | pd.Timestamp | str = SNAPSHOT_CUTOFF,
) -> pd.DataFrame:
    """Return exactly one result row per played map with a frozen series anchor."""

    required = {
        "map_id",
        "match_id",
        "game_number",
        "map_name",
        "winner_team_id",
        "loser_team_id",
        "winner_rounds",
        "loser_rounds",
        "series_anchor_at",
    }
    missing = required.difference(maps.columns)
    if missing:
        raise DataValidationError(f"maps missing required columns: {sorted(missing)}")
    result = maps.copy()
    for column in ("series_anchor_at", "map_completed_at", "match_completed_at"):
        if column in result:
            result[column] = pd.to_datetime(result[column], utc=True, errors="coerce")
    if result["series_anchor_at"].isna().any():
        raise DataValidationError("every map requires a series_anchor_at timestamp")
    cutoff = normalize_cutoff(cutoff)
    if (result["series_anchor_at"] > cutoff).any():
        raise DataValidationError("map results extend beyond the frozen cutoff")
    if result["map_id"].duplicated().any():
        duplicates = result.loc[result["map_id"].duplicated(False), "map_id"].unique().tolist()
        raise DataValidationError(f"canonical map ids are not unique: {duplicates[:10]}")
    if result.duplicated(["match_id", "game_number"]).any():
        raise DataValidationError("more than one map row exists for a match/game_number")
    if (result["winner_team_id"] == result["loser_team_id"]).any():
        raise DataValidationError("winner and loser must be different teams")
    numeric_rounds = result[["winner_rounds", "loser_rounds"]].apply(pd.to_numeric, errors="coerce")
    if numeric_rounds.isna().any(axis=None) or (numeric_rounds < 0).any(axis=None):
        raise DataValidationError("round scores must be non-negative integers")
    result[["winner_rounds", "loser_rounds"]] = numeric_rounds.astype("int64")
    result["total_rounds"] = result["winner_rounds"] + result["loser_rounds"]
    if (result["total_rounds"] <= 0).any():
        raise DataValidationError("total_rounds derived from the map score must be positive")
    result["winner_round_margin"] = result["winner_rounds"] - result["loser_rounds"]
    result["normalized_winner_round_margin"] = (
        result["winner_round_margin"] / result["total_rounds"]
    )
    result["prediction_group_id"] = result["match_id"]
    # All pre-series predictions use one cutoff.  No map-one result is allowed to
    # move state for map two; feature builders must use strictly earlier sources.
    result["prediction_cutoff"] = result.groupby("match_id")["series_anchor_at"].transform("min")
    result = result.sort_values(
        ["prediction_cutoff", "match_id", "game_number", "map_id"], kind="stable"
    ).reset_index(drop=True)
    validate_series_frozen(result)
    return result


def canonicalize_player_maps(player_maps: pd.DataFrame, maps: pd.DataFrame) -> pd.DataFrame:
    """Attach canonical score-derived exposure and explicit missingness flags."""

    required = {
        "map_id",
        "match_id",
        "team_id",
        "player_id",
        "agent",
        "kills",
        "deaths",
        "assists",
        "first_kills",
        "first_deaths",
    }
    missing = required.difference(player_maps.columns)
    if missing:
        raise DataValidationError(f"player maps missing required columns: {sorted(missing)}")
    result = player_maps.copy()
    if "stat_id" in result and result["stat_id"].duplicated().any():
        raise DataValidationError("player stat ids are not unique")
    if result.duplicated(["map_id", "player_id"]).any():
        raise DataValidationError("a player appears more than once on the same map")
    exposure_columns = [
        "map_id",
        "match_id",
        "total_rounds",
        "prediction_cutoff",
        "map_name",
        "region",
        "winner_team_id",
        "loser_team_id",
        "normalized_winner_round_margin",
    ]
    exposure_columns.extend(
        column for column in ("event_name", "stage", "best_of") if column in maps.columns
    )
    exposure = maps[exposure_columns].copy()
    result = result.merge(exposure, on=["map_id", "match_id"], how="inner", validate="many_to_one")
    if len(result) != len(player_maps):
        missing_map_ids = sorted(set(player_maps["map_id"]) - set(maps["map_id"]))
        raise DataValidationError(f"player rows reference maps outside the snapshot: {missing_map_ids[:10]}")
    for column in ("acs", "adr", "kast", "reported_rounds_played"):
        if column not in result:
            result[column] = pd.NA
        result[column] = pd.to_numeric(result[column], errors="coerce")
        result[f"{column}_missing"] = result[column].isna().astype("int8")
    result["rounds_played_mismatch"] = (
        result["reported_rounds_played"].notna()
        & (result["reported_rounds_played"] != result["total_rounds"])
    ).astype("int8")
    # This is the sole canonical exposure used for every per-round component.
    result["rounds_played"] = result["total_rounds"].astype("int64")
    if (result["rounds_played"] <= 0).any():
        raise DataValidationError("canonical player exposure must be positive")
    valid_team = result["team_id"].eq(result["winner_team_id"]) | result["team_id"].eq(
        result["loser_team_id"]
    )
    if (~valid_team).any():
        raise DataValidationError("player team is neither participant in its canonical map")
    result["team_win"] = result["team_id"].eq(result["winner_team_id"]).astype("int8")
    result["opponent_team_id"] = result["winner_team_id"].where(
        result["team_id"].eq(result["loser_team_id"]), result["loser_team_id"]
    )
    result["normalized_team_round_margin"] = result["normalized_winner_round_margin"].where(
        result["team_win"].eq(1), -result["normalized_winner_round_margin"]
    )
    return result.sort_values(
        ["prediction_cutoff", "match_id", "game_number", "team_id", "player_id"], kind="stable"
    ).reset_index(drop=True)


def validate_raw_source_columns(frames: Mapping[str, pd.DataFrame]) -> None:
    forbidden = {
        "elo_rating",
        "smooth_mean",
        "smooth_var",
        "filtered_mean",
        "filtered_var",
        "vpm",
        "vpm_mean",
    }
    found = {
        f"{name}.{column}"
        for name, frame in frames.items()
        for column in frame.columns
        if column.casefold() in forbidden
    }
    if found:
        raise DataValidationError(
            "raw snapshots must not contain serving Elo or production/future-aware VPM fields: "
            + ", ".join(sorted(found))
        )


def validate_feature_cutoffs(
    frame: pd.DataFrame,
    *,
    cutoff_column: str = "prediction_cutoff",
    source_time_columns: Sequence[str] = ("feature_source_at",),
) -> None:
    """Require every source timestamp to be strictly before its forecast cutoff."""

    if cutoff_column not in frame:
        raise DataValidationError(f"missing cutoff column {cutoff_column}")
    cutoff = pd.to_datetime(frame[cutoff_column], utc=True, errors="coerce")
    if cutoff.isna().any():
        raise DataValidationError("prediction cutoffs cannot be missing")
    for column in source_time_columns:
        if column not in frame:
            raise DataValidationError(f"missing source timestamp column {column}")
        source = pd.to_datetime(frame[column], utc=True, errors="coerce")
        invalid = source.isna() | (source >= cutoff)
        if invalid.any():
            examples = frame.loc[invalid, [cutoff_column, column]].head(5).to_dict("records")
            raise DataValidationError(
                f"{column} must be strictly earlier than {cutoff_column}; examples={examples}"
            )


def validate_series_frozen(
    frame: pd.DataFrame,
    *,
    match_column: str = "match_id",
    cutoff_column: str = "prediction_cutoff",
    state_columns: Sequence[str] = (),
) -> None:
    """Require a single cutoff/state value across every map in a series."""

    required = {match_column, cutoff_column}.union(state_columns)
    missing = required.difference(frame.columns)
    if missing:
        raise DataValidationError(f"series freeze validation missing columns: {sorted(missing)}")
    checked = [cutoff_column, *state_columns]
    counts = frame.groupby(match_column, dropna=False)[checked].nunique(dropna=False)
    invalid = counts.gt(1).any(axis=1)
    if invalid.any():
        ids = counts.index[invalid].tolist()[:10]
        raise DataValidationError(f"series state changes within matches: {ids}")


def validate_match_grouping(
    frame: pd.DataFrame,
    *,
    match_column: str = "match_id",
    split_column: str | None = None,
) -> None:
    if frame[match_column].isna().any():
        raise DataValidationError("match ids cannot be missing")
    if split_column is not None:
        if split_column not in frame:
            raise DataValidationError(f"missing split column {split_column}")
        counts = frame.groupby(match_column)[split_column].nunique(dropna=False)
        if (counts > 1).any():
            raise DataValidationError("complete matches must remain in the same fold")


def assign_temporal_split(
    frame: pd.DataFrame,
    *,
    timestamp_column: str = "prediction_cutoff",
    output_column: str = "temporal_split",
) -> pd.DataFrame:
    """Assign the frozen 2023/2024-25/2026 research protocol by match time."""

    result = frame.copy()
    timestamp = pd.to_datetime(result[timestamp_column], utc=True, errors="coerce")
    if timestamp.isna().any():
        raise DataValidationError("temporal split timestamps cannot be missing")
    year = timestamp.dt.year
    result[output_column] = "excluded"
    result.loc[year == 2023, output_column] = "warmup"
    result.loc[year.isin([2024, 2025]), output_column] = "development"
    result.loc[year == 2026, output_column] = "lockbox"
    validate_match_grouping(result, split_column=output_column)
    return result


@dataclass(slots=True)
class FoldSafeImputer:
    """A small auditable median imputer that can only be fit on named training rows."""

    columns: tuple[str, ...]
    statistics: dict[str, float] = field(default_factory=dict)
    fitted_at_cutoff: pd.Timestamp | None = None
    training_row_count: int = 0
    training_index_hash: str | None = None

    def fit(
        self,
        training: pd.DataFrame,
        *,
        training_cutoff: datetime | pd.Timestamp | str,
        timestamp_column: str = "prediction_cutoff",
    ) -> "FoldSafeImputer":
        cutoff = pd.Timestamp(training_cutoff)
        cutoff = cutoff.tz_localize("UTC") if cutoff.tzinfo is None else cutoff.tz_convert("UTC")
        timestamps = pd.to_datetime(training[timestamp_column], utc=True, errors="coerce")
        if timestamps.isna().any() or (timestamps >= cutoff).any():
            raise DataValidationError(
                "imputer training rows must be timestamped strictly before the fold cutoff"
            )
        statistics: dict[str, float] = {}
        for column in self.columns:
            values = pd.to_numeric(training[column], errors="coerce")
            median = values.median(skipna=True)
            if pd.isna(median):
                raise DataValidationError(f"cannot fit imputer: {column} is entirely missing")
            statistics[column] = float(median)
        self.statistics = statistics
        self.fitted_at_cutoff = cutoff
        self.training_row_count = len(training)
        stable_indices = "\n".join(map(str, training.index.tolist()))
        self.training_index_hash = sha256(stable_indices.encode("utf-8")).hexdigest()
        return self

    def transform(self, frame: pd.DataFrame) -> pd.DataFrame:
        if set(self.columns) != set(self.statistics):
            raise RuntimeError("FoldSafeImputer must be fit before transform")
        result = frame.copy()
        for column in self.columns:
            values = pd.to_numeric(result[column], errors="coerce")
            indicator = f"{column}_missing"
            if indicator not in result:
                result[indicator] = values.isna().astype("int8")
            result[column] = values.fillna(self.statistics[column])
        return result


def data_quality_summary(frames: Mapping[str, pd.DataFrame]) -> dict[str, Any]:
    maps = frames["maps"]
    player_maps = frames["player_maps"]
    summary: dict[str, Any] = {
        "rows": {name: int(len(frame)) for name, frame in frames.items()},
        "map_id_unique": bool(maps["map_id"].is_unique),
        "match_game_unique": bool(not maps.duplicated(["match_id", "game_number"]).any()),
        "first_prediction_cutoff": maps["prediction_cutoff"].min().isoformat() if len(maps) else None,
        "last_prediction_cutoff": maps["prediction_cutoff"].max().isoformat() if len(maps) else None,
        "missingness": {},
    }
    for column in ("adr", "kast", "acs", "reported_rounds_played"):
        summary["missingness"][column] = float(player_maps[column].isna().mean()) if len(player_maps) else 0.0
    counts = player_maps.groupby("map_id").size()
    summary["players_per_map_min"] = int(counts.min()) if len(counts) else 0
    summary["players_per_map_max"] = int(counts.max()) if len(counts) else 0
    summary["rounds_played_mismatch_rate"] = (
        float(player_maps["rounds_played_mismatch"].mean()) if len(player_maps) else 0.0
    )
    return summary
