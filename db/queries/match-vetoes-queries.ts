import { db } from "@/db/db";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { eq, and } from "drizzle-orm";

type NewMatchVeto = typeof matchVetoesTable.$inferInsert;
type MatchVeto = typeof matchVetoesTable.$inferSelect;


// CREATE
export async function createMatchVeto(data: NewMatchVeto): Promise<MatchVeto[]> {
  return await db.insert(matchVetoesTable).values(data).returning();
}

// READ
export async function getVetoesByMatchId(matchId: number): Promise<MatchVeto[]> {
  return await db.select().from(matchVetoesTable).where(eq(matchVetoesTable.match_id, matchId));
}

// UPDATE
export async function updateMatchVeto(id: number, data: Partial<NewMatchVeto>): Promise<MatchVeto[]> {
  return await db.update(matchVetoesTable).set(data).where(eq(matchVetoesTable.id, id)).returning();
}

// DELETE
export async function deleteMatchVeto(id: number): Promise<MatchVeto[]> {
  return await db.delete(matchVetoesTable).where(eq(matchVetoesTable.id, id)).returning();
}
