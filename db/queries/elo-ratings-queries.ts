import { db } from "@/db/db";
import { eloRatingsTable, NewEloRating, EloRating } from "@/db/schema/elo-ratings-schema";
import { eq, desc, and, lte, sql } from "drizzle-orm";

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

export async function getEloRatingsAtTime(teamId: number, time: Date): Promise<{ map_name: string, elo_rating: string }[]> {
  const sq = db
    .select({
      map_name: eloRatingsTable.map_name,
      max_rating_date: sql<Date>`max(${eloRatingsTable.rating_date})`.as("max_rating_date"),
    })
    .from(eloRatingsTable)
    .where(and(eq(eloRatingsTable.team_id, teamId), lte(eloRatingsTable.rating_date, time)))
    .groupBy(eloRatingsTable.map_name)
    .as("sq");

  return await db
    .select({
      map_name: eloRatingsTable.map_name,
      elo_rating: eloRatingsTable.rating,
    })
    .from(eloRatingsTable)
    .innerJoin(
      sq,
      and(
        eq(eloRatingsTable.map_name, sq.map_name),
        eq(eloRatingsTable.rating_date, sq.max_rating_date)
      )
    )
    .where(eq(eloRatingsTable.team_id, teamId));
} 

