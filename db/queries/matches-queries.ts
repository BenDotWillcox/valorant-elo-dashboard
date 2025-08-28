import { db } from "@/db/db";
import { matchesTable, NewMatch, Match } from "@/db/schema/matches-schema";
import { eq } from "drizzle-orm";

// CREATE
export async function createMatch(data: NewMatch): Promise<Match[]> {
  return await db.insert(matchesTable).values(data).returning();
}

// READ
export async function getMatchById(id: number): Promise<Match[]> {
  return await db.select().from(matchesTable).where(eq(matchesTable.id, id));
}

export async function getAllMatches(): Promise<Match[]> {
  return await db.select().from(matchesTable);
}

// UPDATE
export async function updateMatch(id: number, data: Partial<NewMatch>): Promise<Match[]> {
  return await db.update(matchesTable).set(data).where(eq(matchesTable.id, id)).returning();
}

// DELETE
export async function deleteMatch(id: number): Promise<Match[]> {
  return await db.delete(matchesTable).where(eq(matchesTable.id, id)).returning();
}








