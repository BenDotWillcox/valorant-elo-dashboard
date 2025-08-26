import { db } from "@/db/db";
import { mapsTable, NewMap, Map } from "@/db/schema/maps-schema";
import { eq, and } from "drizzle-orm";

// CREATE
export async function createMap(data: NewMap): Promise<Map[]> {
  return await db.insert(mapsTable).values(data).returning();
}

// READ
export async function getMapById(id: number): Promise<Map[]> {
  return await db.select().from(mapsTable).where(eq(mapsTable.id, id));
}

export async function getMapsByMatchId(matchId: number): Promise<Map[]> {
  return await db.select().from(mapsTable).where(eq(mapsTable.match_id, matchId));
}

export async function getAllMaps(): Promise<Map[]> {
  return await db.select().from(mapsTable);
}

// UPDATE
export async function updateMap(id: number, data: Partial<NewMap>): Promise<Map[]> {
  return await db.update(mapsTable).set(data).where(eq(mapsTable.id, id)).returning();
}

// DELETE
export async function deleteMap(id: number): Promise<Map[]> {
  return await db.delete(mapsTable).where(eq(mapsTable.id, id)).returning();
} 