"use server";

import { createSeason, getAllSeasons, getSeasonById, updateSeason, deleteSeason, getActiveSeason } from "@/db/queries/seasons-queries";
import { NewSeason } from "@/db/schema/seasons-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createSeasonAction(season: NewSeason): Promise<ActionState> {
  try {
    const newSeason = await createSeason(season);
    revalidatePath("/seasons");
    return { status: "success", message: "Season created successfully", data: newSeason };
  } catch (error) {
    console.error("Error creating season:", error);
    return { status: "error", message: "Failed to create season" };
  }
}

export async function getSeasonsAction(): Promise<ActionState> {
  try {
    const seasons = await getAllSeasons();
    return { status: "success", message: "Seasons retrieved successfully", data: seasons };
  } catch (error) {
    console.error("Error getting seasons:", error);
    return { status: "error", message: "Failed to get seasons" };
  }
}

export async function getSeasonByIdAction(id: number): Promise<ActionState> {
  try {
    const season = await getSeasonById(id);
    return { status: "success", message: "Season retrieved successfully", data: season };
  } catch (error) {
    console.error("Error getting season by ID:", error);
    return { status: "error", message: "Failed to get season" };
  }
}

export async function getActiveSeasonAction(): Promise<ActionState> {
    try {
      const season = await getActiveSeason();
      return { status: "success", message: "Active season retrieved successfully", data: season };
    } catch (error) {
      console.error("Error getting active season:", error);
      return { status: "error", message: "Failed to get active season" };
    }
}

export async function updateSeasonAction(id: number, data: Partial<NewSeason>): Promise<ActionState> {
  try {
    const updatedSeason = await updateSeason(id, data);
    revalidatePath(`/seasons`);
    return { status: "success", message: "Season updated successfully", data: updatedSeason };
  } catch (error) {
    console.error("Error updating season:", error);
    return { status: "error", message: "Failed to update season" };
  }
}

export async function deleteSeasonAction(id: number): Promise<ActionState> {
  try {
    await deleteSeason(id);
    revalidatePath("/seasons");
    return { status: "success", message: "Season deleted successfully" };
  } catch (error) {
    console.error("Error deleting season:", error);
    return { status: "error", message: "Failed to delete season" };
  }
}
