"use server";

import { createMap, getAllMaps, getMapById, updateMap, deleteMap, getMapsByMatchId } from "@/db/queries/maps-queries";
import { NewMap } from "@/db/schema/maps-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

export async function createMapAction(map: NewMap): Promise<ActionState> {
  try {
    const newMap = await createMap(map);
    revalidatePath("/maps");
    if (map.match_id) {
      revalidatePath(`/matches/${map.match_id}`);
    }
    return { status: "success", message: "Map created successfully", data: newMap };
  } catch (error) {
    console.error("Error creating map:", error);
    return { status: "error", message: "Failed to create map" };
  }
}

export async function getMapsAction(): Promise<ActionState> {
  try {
    const maps = await getAllMaps();
    return { status: "success", message: "Maps retrieved successfully", data: maps };
  } catch (error) {
    console.error("Error getting maps:", error);
    return { status: "error", message: "Failed to get maps" };
  }
}

export async function getMapByIdAction(id: number): Promise<ActionState> {
  try {
    const map = await getMapById(id);
    return { status: "success", message: "Map retrieved successfully", data: map };
  } catch (error) {
    console.error("Error getting map by ID:", error);
    return { status: "error", message: "Failed to get map" };
  }
}

export async function getMapsByMatchIdAction(matchId: number): Promise<ActionState> {
    try {
      const maps = await getMapsByMatchId(matchId);
      return { status: "success", message: "Maps retrieved successfully", data: maps };
    } catch (error) {
      console.error("Error getting maps by match ID:", error);
      return { status: "error", message: "Failed to get maps" };
    }
}

export async function updateMapAction(id: number, data: Partial<NewMap>): Promise<ActionState> {
  try {
    const updatedMap = await updateMap(id, data);
    revalidatePath(`/maps/${id}`);
    if (updatedMap.length > 0 && updatedMap[0].match_id) {
      revalidatePath(`/matches/${updatedMap[0].match_id}`);
    }
    return { status: "success", message: "Map updated successfully", data: updatedMap };
  } catch (error) {
    console.error("Error updating map:", error);
    return { status: "error", message: "Failed to update map" };
  }
}

export async function deleteMapAction(id: number, matchId: number | null): Promise<ActionState> {
  try {
    await deleteMap(id);
    revalidatePath("/maps");
    if (matchId) {
      revalidatePath(`/matches/${matchId}`);
    }
    return { status: "success", message: "Map deleted successfully" };
  } catch (error) {
    console.error("Error deleting map:", error);
    return { status: "error", message: "Failed to delete map" };
  }
} 