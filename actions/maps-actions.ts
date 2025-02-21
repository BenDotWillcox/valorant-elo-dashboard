"use server";

import { createMap, updateMap, deleteMap } from "@/db/queries/maps-queries";
import { ActionResult } from "@/types/action-types";
import { revalidatePath } from "next/cache";
import { NewMap } from "@/db/schema";

export async function createMapAction(map: NewMap): Promise<ActionResult> {
  try {
    await createMap(map);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updateMapAction(
  id: number,
  map: Partial<NewMap>
): Promise<ActionResult> {
  try {
    await updateMap(id, map);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteMapAction(id: number): Promise<ActionResult> {
  try {
    await deleteMap(id);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
} 