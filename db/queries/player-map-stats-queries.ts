import { db } from "@/db/db";
import { playerMapStatsTable } from "@/db/schema/player-map-stats-schema";
import { eq, and } from "drizzle-orm";

type NewPlayerMapStat = typeof playerMapStatsTable.$inferInsert;
type PlayerMapStat = typeof playerMapStatsTable.$inferSelect;

// CREATE
export async function createPlayerMapStat(data: NewPlayerMapStat): Promise<PlayerMapStat[]> {
  return await db.insert(playerMapStatsTable).values(data).returning();
}

// READ
export async function getStatsByMapId(mapId: number): Promise<PlayerMapStat[]> {
  return await db.select().from(playerMapStatsTable).where(eq(playerMapStatsTable.map_id, mapId));
}

export async function getStatsByPlayerId(playerId: number): Promise<PlayerMapStat[]> {
    return await db.select().from(playerMapStatsTable).where(eq(playerMapStatsTable.player_id, playerId));
}

// UPDATE
export async function updatePlayerMapStat(id: number, data: Partial<NewPlayerMapStat>): Promise<PlayerMapStat[]> {
  return await db.update(playerMapStatsTable).set(data).where(eq(playerMapStatsTable.id, id)).returning();
}

// DELETE
export async function deletePlayerMapStat(id: number): Promise<PlayerMapStat[]> {
  return await db.delete(playerMapStatsTable).where(eq(playerMapStatsTable.id, id)).returning();
}
