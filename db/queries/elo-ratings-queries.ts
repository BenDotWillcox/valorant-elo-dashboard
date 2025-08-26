import { db } from "@/db/db";
import { eloRatingsTable, NewEloRating, EloRating } from "@/db/schema/elo-ratings-schema";
import { eq, desc, and } from "drizzle-orm";

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