import { db } from "@/db/db";
import { seasonsTable, NewSeason, Season } from "@/db/schema/seasons-schema";
import { eq } from "drizzle-orm";

// CREATE
export async function createSeason(data: NewSeason): Promise<Season[]> {
  return await db.insert(seasonsTable).values(data).returning();
}

// READ
export async function getSeasonById(id: number): Promise<Season[]> {
  return await db.select().from(seasonsTable).where(eq(seasonsTable.id, id));
}

export async function getActiveSeason() {
  const season = await db
    .select({
      startDate: seasonsTable.start_date,
      endDate: seasonsTable.end_date,
    })
    .from(seasonsTable)
    .where(eq(seasonsTable.is_active, true))
    .limit(1);

  return season[0] || null;
}

export async function getAllSeasons(): Promise<Season[]> {
  return await db.select().from(seasonsTable);
}

// UPDATE
export async function updateSeason(id: number, data: Partial<NewSeason>): Promise<Season[]> {
  return await db.update(seasonsTable).set(data).where(eq(seasonsTable.id, id)).returning();
}

// DELETE
export async function deleteSeason(id: number): Promise<Season[]> {
  return await db.delete(seasonsTable).where(eq(seasonsTable.id, id)).returning();
}
