"use server";

import { upsertCurrentEloRating } from "@/db/queries/elo-ratings-current-queries";
import { ActionResult } from "@/types/action-types";
import { revalidatePath } from "next/cache";
import { NewEloRatingCurrent } from "@/db/schema";

export async function upsertCurrentEloRatingAction(
  rating: NewEloRatingCurrent
): Promise<ActionResult> {
  try {
    await upsertCurrentEloRating(rating);
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
} 