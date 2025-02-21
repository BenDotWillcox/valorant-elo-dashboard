"use server";

import { createEloRating } from "@/db/queries/elo-ratings-queries";
import { ActionResult } from "@/types/action-types";
import { revalidatePath } from "next/cache";
import { NewEloRating } from "@/db/schema";

export async function createEloRatingAction(
  rating: NewEloRating
): Promise<ActionResult> {
  try {
    await createEloRating(rating);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
} 