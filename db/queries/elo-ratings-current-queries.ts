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
        eq(eloRatingsCurrentTable.team_id, teamId),
        eq(eloRatingsCurrentTable.map_name, mapName)
      )
    )
    .limit(1);
};

export const upsertCurrentEloRating = async (rating: NewEloRatingCurrent) => {
  return await db
    .insert(eloRatingsCurrentTable)
    .values(rating)
    .onConflictDoUpdate({
      target: [eloRatingsCurrentTable.team_id, eloRatingsCurrentTable.map_name],
      set: {
        effective_rating: rating.effective_rating,
        updated_at: new Date(),
      },
    })
    .returning();
}; 