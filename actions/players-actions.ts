"use server";

import { createPlayer, getAllPlayers, getPlayerById, getPlayerBySlug, updatePlayer, deletePlayer } from "@/db/queries/players-queries";
import { NewPlayer } from "@/db/schema/players-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createPlayerAction(player: NewPlayer): Promise<ActionState> {
  try {
    const newPlayer = await createPlayer(player);
    revalidatePath("/players");
    return { status: "success", message: "Player created successfully", data: newPlayer };
  } catch (error) {
    console.error("Error creating player:", error);
    return { status: "error", message: "Failed to create player" };
  }
}

export async function getPlayersAction(): Promise<ActionState> {
  try {
    const players = await getAllPlayers();
    return { status: "success", message: "Players retrieved successfully", data: players };
  } catch (error) {
    console.error("Error getting players:", error);
    return { status: "error", message: "Failed to get players" };
  }
}

export async function getPlayerByIdAction(id: number): Promise<ActionState> {
  try {
    const player = await getPlayerById(id);
    return { status: "success", message: "Player retrieved successfully", data: player };
  } catch (error) {
    console.error("Error getting player by ID:", error);
    return { status: "error", message: "Failed to get player" };
  }
}

export async function getPlayerBySlugAction(slug: string): Promise<ActionState> {
    try {
      const player = await getPlayerBySlug(slug);
      return { status: "success", message: "Player retrieved successfully", data: player };
    } catch (error) {
      console.error("Error getting player by slug:", error);
      return { status: "error", message: "Failed to get player" };
    }
}

export async function updatePlayerAction(id: number, data: Partial<NewPlayer>): Promise<ActionState> {
  try {
    const updatedPlayer = await updatePlayer(id, data);
    revalidatePath(`/players/${id}`);
    revalidatePath("/players");
    return { status: "success", message: "Player updated successfully", data: updatedPlayer };
  } catch (error) {
    console.error("Error updating player:", error);
    return { status: "error", message: "Failed to update player" };
  }
}

export async function deletePlayerAction(id: number): Promise<ActionState> {
  try {
    await deletePlayer(id);
    revalidatePath("/players");
    return { status: "success", message: "Player deleted successfully" };
  } catch (error) {
    console.error("Error deleting player:", error);
    return { status: "error", message: "Failed to delete player" };
  }
}
