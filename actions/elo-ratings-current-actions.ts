"use server";

import { 
  createCurrentEloRating,
  getTeamMapRatings, 
  getTopTeamsByMap,
  updateCurrentEloRating,
  deleteCurrentEloRating
} from "@/db/queries/elo-ratings-current-queries";
import { NewEloRatingCurrent } from "@/db/schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createCurrentEloRatingAction(rating: NewEloRatingCurrent): Promise<ActionState> {
  try {
    const newRating = await createCurrentEloRating(rating);
    revalidatePath("/rankings");
    return { status: "success", message: "Current elo rating created successfully", data: newRating };
  } catch (error) {
    console.error("Error creating current elo rating:", error);
    return { status: "error", message: "Failed to create current elo rating" };
  }
}

export async function getTeamMapRatingsAction(teamId: number, seasonId: number): Promise<ActionState> {
  try {
    const ratings = await getTeamMapRatings(teamId, seasonId);
    return { status: "success", message: "Team map ratings retrieved successfully", data: ratings };
  } catch (error) {
    console.error("Error fetching team map ratings:", error);
    return { status: "error", message: "Failed to fetch team map ratings" };
  }
}

export async function getTopTeamsByMapAction(mapName: string, seasonId: number, limit: number = 10): Promise<ActionState> {
  try {
    const teams = await getTopTeamsByMap(mapName, seasonId, limit);
    return { status: "success", message: `Top teams for ${mapName} retrieved successfully`, data: teams };
  } catch (error) {
    console.error(`Error fetching top teams for ${mapName}:`, error);
    return { status: "error", message: `Failed to fetch top teams for ${mapName}` };
  }
}

export async function updateCurrentEloRatingAction(id: number, data: Partial<NewEloRatingCurrent>): Promise<ActionState> {
  try {
    const updatedRating = await updateCurrentEloRating(id, data);
    revalidatePath("/rankings");
    return { status: "success", message: "Current elo rating updated successfully", data: updatedRating };
  } catch (error) {
    console.error("Error updating current elo rating:", error);
    return { status: "error", message: "Failed to update current elo rating" };
  }
}

export async function deleteCurrentEloRatingAction(id: number): Promise<ActionState> {
  try {
    await deleteCurrentEloRating(id);
    revalidatePath("/rankings");
    return { status: "success", message: "Current elo rating deleted successfully" };
  } catch (error) {
    console.error("Error deleting current elo rating:", error);
    return { status: "error", message: "Failed to delete current elo rating" };
  }
} 