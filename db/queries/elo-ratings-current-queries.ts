import { db } from "@/db/db";
import { eloRatingsCurrentTable, teamsTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NewEloRatingCurrent, EloRatingCurrent } from "@/db/schema";

// CREATE
export async function createCurrentEloRating(data: NewEloRatingCurrent): Promise<EloRatingCurrent[]> {
  return await db.insert(eloRatingsCurrentTable).values(data).returning();
}

// READ
export async function getTeamMapRatings(teamId: number, seasonId: number): Promise<EloRatingCurrent[]> {
  return await db
    .select()
    .from(eloRatingsCurrentTable)
    .where(
      and(
        eq(eloRatingsCurrentTable.team_id, teamId),
        eq(eloRatingsCurrentTable.season_id, seasonId)
      )
    )
    .orderBy(desc(eloRatingsCurrentTable.rating));
}

export async function getTopTeamsByMap(mapName: string, seasonId: number, limit: number = 10) {
  return await db
    .select({
      team_id: teamsTable.id,
      team_name: teamsTable.name,
      team_logo: teamsTable.logo_url,
      rating: eloRatingsCurrentTable.rating,
    })
    .from(eloRatingsCurrentTable)
    .innerJoin(teamsTable, eq(eloRatingsCurrentTable.team_id, teamsTable.id))
    .where(
        and(
            eq(eloRatingsCurrentTable.map_name, mapName),
            eq(eloRatingsCurrentTable.season_id, seasonId)
        )
    )
    .orderBy(desc(eloRatingsCurrentTable.rating))
    .limit(limit);
}

// UPDATE
export async function updateCurrentEloRating(id: number, data: Partial<NewEloRatingCurrent>): Promise<EloRatingCurrent[]> {
  return await db.update(eloRatingsCurrentTable).set(data).where(eq(eloRatingsCurrentTable.id, id)).returning();
}

// DELETE
export async function deleteCurrentEloRating(id: number): Promise<EloRatingCurrent[]> {
  return await db.delete(eloRatingsCurrentTable).where(eq(eloRatingsCurrentTable.id, id)).returning();
} 