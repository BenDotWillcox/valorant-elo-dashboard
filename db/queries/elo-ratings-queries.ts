import { db } from "@/db/db";
import { eloRatingsTable, NewEloRating, EloRating } from "@/db/schema/elo-ratings-schema";
import { mapsTable } from "@/db/schema/maps-schema";
import { PICK_BAN_HARD_RESET_RATING } from "@/lib/elo/pick-ban-rating-provenance";
import { eq, desc, and, gte, lt, ne, or, isNull, isNotNull } from "drizzle-orm";

// CREATE
export async function createEloRating(data: NewEloRating): Promise<EloRating[]> {
  return await db.insert(eloRatingsTable).values(data).returning();
}

// READ
export async function getEloRatingById(id: number): Promise<EloRating[]> {
    return await db.select().from(eloRatingsTable).where(eq(eloRatingsTable.id, id));
}

export async function getTeamEloRatings(teamId: number): Promise<EloRating[]> {
  return await db
    .select()
    .from(eloRatingsTable)
    .where(eq(eloRatingsTable.team_id, teamId))
    .orderBy(desc(eloRatingsTable.rating_date));
}

export async function getLatestEloRating(teamId: number, mapName: string): Promise<EloRating[]> {
  return await db
    .select()
    .from(eloRatingsTable)
    .where(
      and(
        eq(eloRatingsTable.team_id, teamId),
        eq(eloRatingsTable.map_name, mapName)
      )
    )
    .orderBy(desc(eloRatingsTable.rating_date))
    .limit(1);
}

export async function getAllEloRatings(): Promise<EloRating[]> {
  return await db.select().from(eloRatingsTable);
}

// UPDATE
export async function updateEloRating(id: number, data: Partial<NewEloRating>): Promise<EloRating[]> {
    return await db.update(eloRatingsTable).set(data).where(eq(eloRatingsTable.id, id)).returning();
}

// DELETE
export async function deleteEloRating(id: number): Promise<EloRating[]> {
    return await db.delete(eloRatingsTable).where(eq(eloRatingsTable.id, id)).returning();
}

/**
 * Returns one deterministic rating per map using rows strictly before the
 * supplied cutoff, excluding every rating sourced from the target match.
 * Rows without a source match are admitted only when they exactly match the
 * synthetic season-reset signature.
 * Current match callers use matches.completed_at as the cutoff proxy because
 * the schema does not store match start time. Ratings from prior calendar
 * years are intentionally excluded to match the season reset policy.
 */
export async function getPreMatchEloRatings(
  teamId: number,
  cutoffAt: Date,
  targetMatchId: number
): Promise<{ map_name: string; elo_rating: string }[]> {
  if (!Number.isFinite(cutoffAt.getTime())) {
    throw new Error("cutoffAt must be a valid date.");
  }
  if (!Number.isSafeInteger(targetMatchId) || targetMatchId <= 0) {
    throw new Error("targetMatchId must be a positive integer.");
  }

  const seasonStart = new Date(Date.UTC(cutoffAt.getUTCFullYear(), 0, 1));

  return await db
    .selectDistinctOn([eloRatingsTable.map_name], {
      map_name: eloRatingsTable.map_name,
      elo_rating: eloRatingsTable.rating,
    })
    .from(eloRatingsTable)
    .leftJoin(mapsTable, eq(eloRatingsTable.map_played_id, mapsTable.id))
    .where(
      and(
        eq(eloRatingsTable.team_id, teamId),
        gte(eloRatingsTable.rating_date, seasonStart),
        lt(eloRatingsTable.rating_date, cutoffAt),
        or(
          and(
            isNotNull(mapsTable.match_id),
            ne(mapsTable.match_id, targetMatchId)
          ),
          and(
            isNull(mapsTable.match_id),
            eq(
              eloRatingsTable.rating,
              PICK_BAN_HARD_RESET_RATING.toString()
            ),
            eq(eloRatingsTable.rating_date, seasonStart)
          )
        )
      )
    )
    .orderBy(
      eloRatingsTable.map_name,
      desc(eloRatingsTable.rating_date),
      desc(eloRatingsTable.id)
    );
}
