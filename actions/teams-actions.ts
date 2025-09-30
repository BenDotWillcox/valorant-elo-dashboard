"use server";

import { db } from "@/db/db";
import { teamsTable } from "@/db/schema/teams-schema";
import { ActionState } from "@/types/actions/action-types";
import { asc } from "drizzle-orm";

export async function getTeamsAction(): Promise<ActionState> {
  try {
    const teams = await db.select({
      id: teamsTable.id,
      name: teamsTable.name,
    }).from(teamsTable).orderBy(asc(teamsTable.name));
    return { status: "success", message: "Teams retrieved successfully", data: teams };
  } catch (error) {
    console.error("Error getting teams:", error);
    return { status: "error", message: "Failed to get teams" };
  }
} 