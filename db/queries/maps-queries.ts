import { db } from "@/db/db";
import { mapsTable, teamsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NewMap } from "@/db/schema";

export const getMaps = async () => {
  return await db.select().from(mapsTable);
};

export const getMapById = async (id: number) => {
  return await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.id, id))
    .limit(1);
};

export const createMap = async (map: NewMap) => {
  return await db.insert(mapsTable).values(map).returning();
};

export const updateMap = async (id: number, map: Partial<NewMap>) => {
  return await db
    .update(mapsTable)
    .set(map)
    .where(eq(mapsTable.id, id))
    .returning();
};

export const deleteMap = async (id: number) => {
  return await db.delete(mapsTable).where(eq(mapsTable.id, id)).returning();
};

export const getUnprocessedMaps = async () => {
  return await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.processed, false));
}; 