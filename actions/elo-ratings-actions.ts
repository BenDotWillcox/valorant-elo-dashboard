"use server";

import { 
  createEloRating, 
  getAllEloRatings, 
  getEloRatingById, 
  getTeamEloRatings, 
  updateEloRating, 
  deleteEloRating 
} from "@/db/queries/elo-ratings-queries";
import { NewEloRating } from "@/db/schema/elo-ratings-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createEloRatingAction(rating: NewEloRating): Promise<ActionState> {
  try {
    const newRating = await createEloRating(rating);
    revalidatePath("/rankings"); // Revalidate pages where ratings are shown
    return { status: "success", message: "Elo rating created successfully", data: newRating };
  } catch (error) {
    console.error("Error creating elo rating:", error);
    return { status: "error", message: "Failed to create elo rating" };
  }
}

export async function getEloRatingsAction(): Promise<ActionState> {
  try {
    const ratings = await getAllEloRatings();
    return { status: "success", message: "Elo ratings retrieved successfully", data: ratings };
  } catch (error) {
    console.error("Error getting elo ratings:", error);
    return { status: "error", message: "Failed to get elo ratings" };
  }
}

export async function getEloRatingByIdAction(id: number): Promise<ActionState> {
  try {
    const rating = await getEloRatingById(id);
    return { status: "success", message: "Elo rating retrieved successfully", data: rating };
  } catch (error) {
    console.error("Error getting elo rating by ID:", error);
    return { status: "error", message: "Failed to get elo rating" };
  }
}

export async function getTeamEloRatingsAction(teamId: number): Promise<ActionState> {
    try {
      const ratings = await getTeamEloRatings(teamId);
      return { status: "success", message: "Team elo ratings retrieved successfully", data: ratings };
    } catch (error) {
      console.error("Error getting team elo ratings:", error);
      return { status: "error", message: "Failed to get team elo ratings" };
    }
}

export async function updateEloRatingAction(id: number, data: Partial<NewEloRating>): Promise<ActionState> {
  try {
    const updatedRating = await updateEloRating(id, data);
    revalidatePath("/rankings");
    return { status: "success", message: "Elo rating updated successfully", data: updatedRating };
  } catch (error) {
    console.error("Error updating elo rating:", error);
    return { status: "error", message: "Failed to update elo rating" };
  }
}

export async function deleteEloRatingAction(id: number): Promise<ActionState> {
  try {
    await deleteEloRating(id);
    revalidatePath("/rankings");
    return { status: "success", message: "Elo rating deleted successfully" };
  } catch (error) {
    console.error("Error deleting elo rating:", error);
    return { status: "error", message: "Failed to delete elo rating" };
  }
} 