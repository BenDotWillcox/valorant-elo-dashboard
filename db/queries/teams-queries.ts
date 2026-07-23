import { db } from "@/db/db";
import { teamsTable, NewTeam, Team } from "@/db/schema/teams-schema";
import { eq } from "drizzle-orm";

// CREATE
export async function createTeam(data: NewTeam): Promise<Team[]> {
  return await db.insert(teamsTable).values(data).returning();
}

// READ
export async function getTeamById(id: number): Promise<Team[]> {
  return await db.select().from(teamsTable).where(eq(teamsTable.id, id));
}

export async function getTeamBySlug(slug: string): Promise<Team[]> {
  return await db.select().from(teamsTable).where(eq(teamsTable.slug, slug));
}

export async function getAllTeams(): Promise<Team[]> {
  return await db.select().from(teamsTable);
}

// UPDATE
export async function updateTeam(id: number, data: Partial<NewTeam>): Promise<Team[]> {
  return await db.update(teamsTable).set(data).where(eq(teamsTable.id, id)).returning();
}

// DELETE
export async function deleteTeam(id: number): Promise<Team[]> {
  return await db.delete(teamsTable).where(eq(teamsTable.id, id)).returning();
} 