"use server";

import { createPlayerMapStat, getStatsByMapId, getStatsByPlayerId, updatePlayerMapStat, deletePlayerMapStat } from "@/db/queries/player-map-stats-queries";
import { playerMapStatsTable } from "@/db/schema/player-map-stats-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

type NewPlayerMapStat = typeof playerMapStatsTable.$inferInsert;

export async function createPlayerMapStatAction(stat: NewPlayerMapStat): Promise<ActionState> {
  try {
    const newStat = await createPlayerMapStat(stat);
    revalidatePath(`/maps/${stat.map_id}`);
    revalidatePath(`/players/${stat.player_id}`);
    return { status: "success", message: "Stat created successfully", data: newStat };
  } catch (error) {
    console.error("Error creating stat:", error);
    return { status: "error", message: "Failed to create stat" };
  }
}

export async function getStatsByMapIdAction(mapId: number): Promise<ActionState> {
  try {
    const stats = await getStatsByMapId(mapId);
    return { status: "success", message: "Stats retrieved successfully", data: stats };
  } catch (error) {
    console.error("Error getting stats by map ID:", error);
    return { status: "error", message: "Failed to get stats" };
  }
}

export async function getStatsByPlayerIdAction(playerId: number): Promise<ActionState> {
    try {
      const stats = await getStatsByPlayerId(playerId);
      return { status: "success", message: "Stats retrieved successfully", data: stats };
    } catch (error) {
      console.error("Error getting stats by player ID:", error);
      return { status: "error", message: "Failed to get stats" };
    }
}

export async function updatePlayerMapStatAction(id: number, data: Partial<NewPlayerMapStat>): Promise<ActionState> {
  try {
    const updatedStat = await updatePlayerMapStat(id, data);
    if (updatedStat.length > 0) {
        revalidatePath(`/maps/${updatedStat[0].map_id}`);
        revalidatePath(`/players/${updatedStat[0].player_id}`);
    }
    return { status: "success", message: "Stat updated successfully", data: updatedStat };
  } catch (error) {
    console.error("Error updating stat:", error);
    return { status: "error", message: "Failed to update stat" };
  }
}

export async function deletePlayerMapStatAction(id: number, mapId: number, playerId: number): Promise<ActionState> {
  try {
    await deletePlayerMapStat(id);
    revalidatePath(`/maps/${mapId}`);
    revalidatePath(`/players/${playerId}`);
    return { status: "success", message: "Stat deleted successfully" };
  } catch (error) {
    console.error("Error deleting stat:", error);
    return { status: "error", message: "Failed to delete stat" };
  }
}
