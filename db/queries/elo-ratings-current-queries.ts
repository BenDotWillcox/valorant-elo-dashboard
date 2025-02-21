import { db } from "@/db/db";
import { eloRatingsCurrentTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NewEloRatingCurrent } from "@/db/schema";

export const getCurrentEloRating = async (teamId: number, mapName: string) => {
  return await db
    .select()
    .from(eloRatingsCurrentTable)
    .where(
      and(
        eq(eloRatingsCurrentTable.teamId, teamId),
        eq(eloRatingsCurrentTable.mapName, mapName)
      )
    )
    .limit(1);
};

export const upsertCurrentEloRating = async (rating: NewEloRatingCurrent) => {
  return await db
    .insert(eloRatingsCurrentTable)
    .values(rating)
    .onConflictDoUpdate({
      target: [eloRatingsCurrentTable.teamId, eloRatingsCurrentTable.mapName],
      set: {
        rating: rating.rating,
        updatedAt: new Date(),
      },
    })
    .returning();
}; 