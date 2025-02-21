import { db } from "@/db/db";
import { teamsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NewTeam } from "@/db/schema";

export const getTeams = async () => {
  return await db.select().from(teamsTable);
};

export const getTeamBySlug = async (slug: string) => {
  return await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.slug, slug))
    .limit(1);
};

export const createTeam = async (team: NewTeam) => {
  return await db.insert(teamsTable).values(team).returning();
}; 