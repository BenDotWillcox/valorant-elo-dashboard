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
    .where(eq(eloRatingsTable.teamId, teamId))
    .orderBy(desc(eloRatingsTable.ratingDate));
};

export const createEloRating = async (rating: NewEloRating) => {
  return await db.insert(eloRatingsTable).values({
    ...rating,
    rating: String(rating.rating),
    globalRating: String(rating.globalRating),
    mapOffset: String(rating.mapOffset),
    effectiveRating: String(rating.effectiveRating)
  }).returning();
};

export const getLatestEloRating = async (teamId: number, mapName: string) => {
  return await db
    .select()
    .from(eloRatingsTable)
    .where(
      and(
        eq(eloRatingsTable.teamId, teamId),
        eq(eloRatingsTable.mapName, mapName)
      )
    )
    .orderBy(desc(eloRatingsTable.ratingDate))
    .limit(1);
}; 