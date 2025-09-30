"use server";

import { createMatch, getAllMatches, getMatchById, updateMatch, deleteMatch } from "@/db/queries/matches-queries";
import { NewMatch } from "@/db/schema/matches-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";
import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { tournaments } from "@/lib/constants/tournaments";
import { eq, or } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";

export async function createMatchAction(match: NewMatch): Promise<ActionState> {
  try {
    const newMatch = await createMatch(match);
    revalidatePath("/matches"); // Or whatever path you display matches on
    return { status: "success", message: "Match created successfully", data: newMatch };
  } catch (error) {
    console.error("Error creating match:", error);
    return { status: "error", message: "Failed to create match" };
  }
}

export async function getMatchesAction(
): Promise<ActionState> {
  try {
    const matches = await getAllMatches();
    return { status: "success", message: "Matches retrieved successfully", data: matches };
  } catch (error) {
    console.error("Error getting matches:", error);
    return { status: "error", message: "Failed to get matches" };
  }
}

export async function getMatchByIdAction(id: number): Promise<ActionState> {
  try {
    const match = await getMatchById(id);
    return { status: "success", message: "Match retrieved successfully", data: match };
  } catch (error) {
    console.error("Error getting match by ID:", error);
    return { status: "error", message: "Failed to get match" };
  }
}

export async function updateMatchAction(id: number, data: Partial<NewMatch>): Promise<ActionState> {
  try {
    const updatedMatch = await updateMatch(id, data);
    revalidatePath(`/matches/${id}`);
    revalidatePath("/matches");
    return { status: "success", message: "Match updated successfully", data: updatedMatch };
  } catch (error) {
    console.error("Error updating match:", error);
    return { status: "error", message: "Failed to update match" };
  }
}

export async function deleteMatchAction(id: number): Promise<ActionState> {
  try {
    await deleteMatch(id);
    revalidatePath("/matches");
    return { status: "success", message: "Match deleted successfully" };
  } catch (error) {
    console.error("Error deleting match:", error);
    return { status: "error", message: "Failed to delete match" };
  }
}

export async function getEventNamesAction(teamId?: number): Promise<ActionState> {
  noStore();
  try {
    let eventNames: string[];

    if (teamId) {
      const teamMatches = db.$with("team_matches").as(
        db.select({ event_name: matchesTable.event_name })
          .from(matchesTable)
          .where(
            or(
              eq(matchesTable.team1_id, teamId),
              eq(matchesTable.team2_id, teamId)
            )
          )
      );
      const events = await db.with(teamMatches).selectDistinct({ eventName: teamMatches.event_name }).from(teamMatches);
      eventNames = events.map((e) => e.eventName);
    } else {
      const events = await db
        .selectDistinct({ eventName: matchesTable.event_name })
        .from(matchesTable)
      eventNames = events.map((e) => e.eventName);
    }

    const tournamentOrder = Object.keys(tournaments);
    eventNames.sort((a, b) => {
      const indexA = tournamentOrder.indexOf(a);
      const indexB = tournamentOrder.indexOf(b);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) {
        return -1;
      }
      if (indexB !== -1) {
        return 1;
      }
      return a.localeCompare(b);
    });

    return { status: "success", message: "Event names retrieved successfully", data: eventNames.reverse() };
  } catch (error) {
    console.error("Error getting event names:", error);
    return { status: "error", message: "Failed to get event names" };
  }
}
