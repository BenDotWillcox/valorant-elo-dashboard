import { db } from "@/db/db";
import { playersTable, NewPlayer, Player } from "@/db/schema/players-schema";
import { eq } from "drizzle-orm";

// CREATE
export async function createPlayer(data: NewPlayer): Promise<Player[]> {
  return await db.insert(playersTable).values(data).returning();
}

// READ
export async function getPlayerById(id: number): Promise<Player[]> {
  return await db.select().from(playersTable).where(eq(playersTable.id, id));
}

export async function getPlayerBySlug(slug: string): Promise<Player[]> {
  return await db.select().from(playersTable).where(eq(playersTable.slug, slug));
}

export async function getAllPlayers(): Promise<Player[]> {
  return await db.select().from(playersTable);
}

// UPDATE
export async function updatePlayer(id: number, data: Partial<NewPlayer>): Promise<Player[]> {
  return await db.update(playersTable).set(data).where(eq(playersTable.id, id)).returning();
}

// DELETE
export async function deletePlayer(id: number): Promise<Player[]> {
  return await db.delete(playersTable).where(eq(playersTable.id, id)).returning();
}
