"use server";

import { createTeam, getAllTeams, getTeamById, getTeamBySlug, updateTeam, deleteTeam } from "@/db/queries/teams-queries";
import { NewTeam } from "@/db/schema/teams-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createTeamAction(team: NewTeam): Promise<ActionState> {
  try {
    const newTeam = await createTeam(team);
    revalidatePath("/teams");
    return { status: "success", message: "Team created successfully", data: newTeam };
  } catch (error) {
    console.error("Error creating team:", error);
    return { status: "error", message: "Failed to create team" };
  }
}

export async function getTeamsAction(): Promise<ActionState> {
  try {
    const teams = await getAllTeams();
    return { status: "success", message: "Teams retrieved successfully", data: teams };
  } catch (error) {
    console.error("Error getting teams:", error);
    return { status: "error", message: "Failed to get teams" };
  }
}

export async function getTeamByIdAction(id: number): Promise<ActionState> {
  try {
    const team = await getTeamById(id);
    return { status: "success", message: "Team retrieved successfully", data: team };
  } catch (error) {
    console.error("Error getting team by ID:", error);
    return { status: "error", message: "Failed to get team" };
  }
}

export async function getTeamBySlugAction(slug: string): Promise<ActionState> {
    try {
      const team = await getTeamBySlug(slug);
      return { status: "success", message: "Team retrieved successfully", data: team };
    } catch (error) {
      console.error("Error getting team by slug:", error);
      return { status: "error", message: "Failed to get team" };
    }
}

export async function updateTeamAction(id: number, data: Partial<NewTeam>): Promise<ActionState> {
  try {
    const updatedTeam = await updateTeam(id, data);
    revalidatePath(`/teams/${id}`);
    revalidatePath("/teams");
    return { status: "success", message: "Team updated successfully", data: updatedTeam };
  } catch (error) {
    console.error("Error updating team:", error);
    return { status: "error", message: "Failed to update team" };
  }
}

export async function deleteTeamAction(id: number): Promise<ActionState> {
  try {
    await deleteTeam(id);
    revalidatePath("/teams");
    return { status: "success", message: "Team deleted successfully" };
  } catch (error) {
    console.error("Error deleting team:", error);
    return { status: "error", message: "Failed to delete team" };
  }
} 