"use server";

import { createTeam, getTeams, getTeamBySlug } from "@/db/queries/teams-queries";
import { ActionResult } from "@/types/action-types";
import { revalidatePath } from "next/cache";

export async function createTeamAction(
  team: { name: string; slug: string; region?: string; logoUrl?: string }
): Promise<ActionResult> {
  try {
    await createTeam(team);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
} 