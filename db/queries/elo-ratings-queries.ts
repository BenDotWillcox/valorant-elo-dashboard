import { db } from "@/db/db";
import { eloRatingsTable } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { NewEloRating } from "@/db/schema";

export const getEloRatings = async () => {
  return await db.select().from(eloRatingsTable);
};

export const getTeamEloRatings = async (teamId: number) => {
  return await db
    .select()
    .from(eloRatingsTable)
    .where(eq(eloRatingsTable.team_id, teamId))
    .orderBy(desc(eloRatingsTable.rating_date));
};

export const createEloRating = async (rating: NewEloRating) => {
  return await db.insert(eloRatingsTable).values({
    ...rating,
    global_rating: String(rating.global_rating),
    map_offset: String(rating.map_offset),
    effective_rating: String(rating.effective_rating)
  }).returning();
};

export const getLatestEloRating = async (teamId: number, mapName: string) => {
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
}; 