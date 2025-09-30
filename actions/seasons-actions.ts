"use server";

import { db } from "@/db/db";
import { seasonsTable } from "@/db/schema/seasons-schema";
import { ActionState } from "@/types/actions/action-types";
import { asc } from "drizzle-orm";
import { unstable_noStore as noStore } from 'next/cache';

export async function getSeasonsAction(): Promise<ActionState> {
  noStore();
  try {
    const seasons = await db.select().from(seasonsTable).orderBy(asc(seasonsTable.id));
    return { status: "success", data: seasons };
  } catch (error) {
    console.error("Error getting seasons:", error);
    return { status: "error", message: "Failed to get seasons" };
  }
}
