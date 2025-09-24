import { db } from "@/db/db";
import { playersTable, NewPlayer, Player } from "@/db/schema/players-schema";
import { eq } from "drizzle-orm";
import { ilike } from "drizzle-orm";

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

export async function searchPlayersByIgn(searchTerm: string) {
  if (!searchTerm) {
    return [];
  }

  const players = await db
    .select({
      id: playersTable.id,
      ign: playersTable.ign,
    })
    .from(playersTable)
    .where(ilike(playersTable.ign, `%${searchTerm}%`))
    .limit(10);

  return players;
}

export async function getPlayerByIgn(ign: string) {
  const player = await db
    .select({
      id: playersTable.id,
      ign: playersTable.ign,
    })
    .from(playersTable)
    .where(ilike(playersTable.ign, ign))
    .limit(1);

  return player[0] || null;
}
