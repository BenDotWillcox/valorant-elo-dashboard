"use server";

import { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } from "@/db/queries/matches-queries";
import { NewMatch } from "@/db/schema/matches-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createMatchAction(match: NewMatch): Promise<ActionState> {
  try {
    const newMatch = await createMatch(match);
    revalidatePath("/matches"); // Or whatever path you display matches on
    return { status: "success", message: "Match created successfully", data: newMatch };
  } catch (error) {
    console.error("Error creating match:", error);
    return { status: "error", message: "Failed to create match" };
  }
}

export async function getMatchesAction(): Promise<ActionState> {
  try {
    const matches = await getAllMatches();
    return { status: "success", message: "Matches retrieved successfully", data: matches };
  } catch (error) {
    console.error("Error getting matches:", error);
    return { status: "error", message: "Failed to get matches" };
  }
}

export async function getMatchByIdAction(id: number): Promise<ActionState> {
  try {
    const match = await getMatchById(id);
    return { status: "success", message: "Match retrieved successfully", data: match };
  } catch (error) {
    console.error("Error getting match by ID:", error);
    return { status: "error", message: "Failed to get match" };
  }
}

export async function updateMatchAction(id: number, data: Partial<NewMatch>): Promise<ActionState> {
  try {
    const updatedMatch = await updateMatch(id, data);
    revalidatePath(`/matches/${id}`);
    revalidatePath("/matches");
    return { status: "success", message: "Match updated successfully", data: updatedMatch };
  } catch (error) {
    console.error("Error updating match:", error);
    return { status: "error", message: "Failed to update match" };
  }
}

export async function deleteMatchAction(id: number): Promise<ActionState> {
  try {
    await deleteMatch(id);
    revalidatePath("/matches");
    return { status: "success", message: "Match deleted successfully" };
  } catch (error) {
    console.error("Error deleting match:", error);
    return { status: "error", message: "Failed to delete match" };
  }
}
