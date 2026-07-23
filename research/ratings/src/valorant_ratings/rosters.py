"""Effective-dated roster history with explicit information availability.

An eventual played lineup is evidence only after its match is complete.  The
observed-history builder therefore never backdates a player's team membership;
pre-match roster knowledge must come from a separately sourced announcement.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Iterable

import pandas as pd

from .data import DataValidationError


ROSTER_COLUMNS = (
    "player_id",
    "team_id",
    "status",
    "announced_at",
    "effective_from",
    "effective_to",
    "observed_at",
    "last_observed_at",
    "availability_at",
    "source",
    "confidence",
)


def _utc_column(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame:
        return pd.Series(pd.NaT, index=frame.index, dtype="datetime64[ns, UTC]")
    return pd.to_datetime(frame[column], utc=True, errors="coerce")


def build_observed_roster_history(
    player_maps: pd.DataFrame,
    *,
    timestamp_column: str = "prediction_cutoff",
    inactivity_days: int = 120,
) -> pd.DataFrame:
    """Build non-backdated stints from completed-match lineup observations."""

    required = {"player_id", "team_id", "match_id", timestamp_column}
    missing = required.difference(player_maps.columns)
    if missing:
        raise DataValidationError(f"roster history missing columns: {sorted(missing)}")
    observations = player_maps[["player_id", "team_id", "match_id", timestamp_column]].copy()
    observations["observed_at"] = pd.to_datetime(
        observations[timestamp_column], utc=True, errors="coerce"
    )
    if observations["observed_at"].isna().any():
        raise DataValidationError("roster observations require timestamps")
    observations = observations.drop(columns=timestamp_column).drop_duplicates(
        ["player_id", "team_id", "match_id"]
    )
    same_match_teams = observations.groupby(["player_id", "match_id"])["team_id"].nunique()
    if (same_match_teams > 1).any():
        raise DataValidationError("a player cannot represent two teams in one match")
    observations = observations.sort_values(
        ["player_id", "observed_at", "match_id"], kind="stable"
    ).reset_index(drop=True)
    prior_player = observations["player_id"].shift()
    prior_team = observations["team_id"].shift()
    prior_time = observations["observed_at"].shift()
    gap = observations["observed_at"] - prior_time
    new_stint = (
        observations["player_id"].ne(prior_player)
        | observations["team_id"].ne(prior_team)
        | gap.gt(pd.to_timedelta(int(inactivity_days), unit="D"))
    )
    observations["stint_number"] = new_stint.groupby(observations["player_id"]).cumsum()
    stints = (
        observations.groupby(["player_id", "stint_number", "team_id"], as_index=False)
        .agg(
            observed_at=("observed_at", "min"),
            last_observed_at=("observed_at", "max"),
            observed_matches=("match_id", "nunique"),
        )
        .sort_values(["player_id", "observed_at"], kind="stable")
        .reset_index(drop=True)
    )
    stints["next_stint_at"] = stints.groupby("player_id")["observed_at"].shift(-1)
    expiry = stints["last_observed_at"] + pd.to_timedelta(int(inactivity_days), unit="D")
    stints["effective_to"] = expiry
    has_next = stints["next_stint_at"].notna()
    stints.loc[has_next, "effective_to"] = pd.concat(
        [expiry[has_next], stints.loc[has_next, "next_stint_at"]], axis=1
    ).min(axis=1)
    stints["status"] = "active"
    stints["announced_at"] = pd.NaT
    stints["effective_from"] = stints["observed_at"]
    # Crucial invariant: a played lineup becomes usable only after completion.
    stints["availability_at"] = stints["observed_at"]
    stints["source"] = "observed_match_lineup"
    # High confidence that the player appeared; lower confidence that the stint
    # remains current when it is not backed by an announcement.
    stints["confidence"] = 0.85
    stints = stints.drop(columns=["stint_number", "next_stint_at"])
    validate_roster_history(stints)
    return stints[[*ROSTER_COLUMNS, "observed_matches"]]


def normalize_roster_announcements(announcements: pd.DataFrame) -> pd.DataFrame:
    """Validate externally curated roster announcements without inventing dates."""

    required = {
        "player_id",
        "team_id",
        "status",
        "announced_at",
        "effective_from",
        "source",
        "confidence",
    }
    missing = required.difference(announcements.columns)
    if missing:
        raise DataValidationError(f"roster announcements missing fields: {sorted(missing)}")
    result = announcements.copy()
    result["announced_at"] = _utc_column(result, "announced_at")
    result["effective_from"] = _utc_column(result, "effective_from")
    result["effective_to"] = _utc_column(result, "effective_to")
    if result[["announced_at", "effective_from"]].isna().any(axis=None):
        raise DataValidationError("announcement and effective timestamps are required")
    if (result["announced_at"] > result["effective_from"]).any():
        # A late report can still be included, but cannot be backdated.  Its
        # effective interval begins when the information became available.
        result["effective_from"] = result[["announced_at", "effective_from"]].max(axis=1)
    if (result["effective_to"].notna() & (result["effective_to"] <= result["effective_from"])).any():
        raise DataValidationError("roster effective_to must be after effective_from")
    allowed_status = {"active", "substitute", "inactive", "released", "trial"}
    if (~result["status"].isin(allowed_status)).any():
        raise DataValidationError("unsupported roster status")
    confidence = pd.to_numeric(result["confidence"], errors="coerce")
    if confidence.isna().any() or (~confidence.between(0, 1)).any():
        raise DataValidationError("roster confidence must be between 0 and 1")
    result["confidence"] = confidence.astype(float)
    result["observed_at"] = pd.NaT
    result["last_observed_at"] = pd.NaT
    result["availability_at"] = result["announced_at"]
    result["observed_matches"] = pd.NA
    validate_roster_history(result)
    return result[[*ROSTER_COLUMNS, "observed_matches"]]


def combine_roster_history(
    observed: pd.DataFrame,
    announcements: pd.DataFrame | None = None,
) -> pd.DataFrame:
    frames = [observed]
    if announcements is not None and len(announcements):
        frames.append(normalize_roster_announcements(announcements))
    history = pd.concat(frames, ignore_index=True, sort=False)
    validate_roster_history(history)
    return history.sort_values(
        ["availability_at", "effective_from", "player_id", "team_id"], kind="stable"
    ).reset_index(drop=True)


def validate_roster_history(history: pd.DataFrame) -> None:
    missing = set(ROSTER_COLUMNS).difference(history.columns)
    if missing:
        raise DataValidationError(f"roster history missing fields: {sorted(missing)}")
    for column in ("announced_at", "effective_from", "effective_to", "observed_at", "availability_at"):
        history[column] = _utc_column(history, column)
    if history[["player_id", "team_id", "effective_from", "availability_at"]].isna().any(axis=None):
        raise DataValidationError("roster ids, effective_from and availability_at are required")
    invalid_interval = history["effective_to"].notna() & (
        history["effective_to"] <= history["effective_from"]
    )
    if invalid_interval.any():
        raise DataValidationError("roster effective intervals must have positive duration")
    retrospective_observed = history["source"].eq("observed_match_lineup") & (
        history["availability_at"] < history["observed_at"]
    )
    if retrospective_observed.any():
        raise DataValidationError("observed lineups cannot be available before observation")
    confidence = pd.to_numeric(history["confidence"], errors="coerce")
    if confidence.isna().any() or (~confidence.between(0, 1)).any():
        raise DataValidationError("roster confidence must be between 0 and 1")


def roster_as_of(
    history: pd.DataFrame,
    as_of: str | pd.Timestamp,
    *,
    team_id: int | None = None,
    active_statuses: Iterable[str] = ("active", "substitute", "trial"),
) -> pd.DataFrame:
    """Return only roster facts documented strictly before ``as_of``."""

    validate_roster_history(history)
    cutoff = pd.Timestamp(as_of)
    cutoff = cutoff.tz_localize("UTC") if cutoff.tzinfo is None else cutoff.tz_convert("UTC")
    eligible = history.loc[
        (history["availability_at"] < cutoff)
        & (history["effective_from"] <= cutoff)
        & (history["effective_to"].isna() | (cutoff < history["effective_to"]))
    ].copy()
    if team_id is not None:
        eligible = eligible.loc[eligible["team_id"] == team_id]
    # Later knowledge supersedes older records for the same player.
    eligible = eligible.sort_values(["player_id", "availability_at", "effective_from"], kind="stable")
    eligible = eligible.drop_duplicates("player_id", keep="last")
    eligible = eligible.loc[eligible["status"].isin(set(active_statuses))]
    return eligible.sort_values(["team_id", "player_id"], kind="stable").reset_index(drop=True)


def validate_roster_features_as_of(
    features: pd.DataFrame,
    *,
    prediction_cutoff_column: str = "prediction_cutoff",
    availability_column: str = "roster_availability_at",
) -> None:
    prediction = pd.to_datetime(features[prediction_cutoff_column], utc=True, errors="coerce")
    available = pd.to_datetime(features[availability_column], utc=True, errors="coerce")
    invalid = prediction.isna() | available.isna() | (available >= prediction)
    if invalid.any():
        raise DataValidationError("roster features must be documented before prediction cutoff")


def roster_continuity(
    prior_player_ids: Iterable[int],
    current_player_ids: Iterable[int],
    *,
    lineup_size: int = 5,
) -> dict[str, float | int]:
    prior = set(prior_player_ids)
    current = set(current_player_ids)
    shared = len(prior.intersection(current))
    denominator = max(1, min(lineup_size, len(current)))
    return {
        "shared_players": shared,
        "continuity_fraction": shared / denominator,
        "new_players": len(current.difference(prior)),
        "departed_players": len(prior.difference(current)),
    }
