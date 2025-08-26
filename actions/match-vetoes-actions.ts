"use server";

import { createMatchVeto, getVetoesByMatchId, updateMatchVeto, deleteMatchVeto } from "@/db/queries/match-vetoes-queries";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { ActionState } from "@/types/actions/action-types";
import { revalidatePath } from "next/cache";

type NewMatchVeto = typeof matchVetoesTable.$inferInsert;

export async function createMatchVetoAction(veto: NewMatchVeto): Promise<ActionState> {
  try {
    const newVeto = await createMatchVeto(veto);
    revalidatePath(`/matches/${veto.match_id}`); // Revalidate the parent match page
    return { status: "success", message: "Veto created successfully", data: newVeto };
  } catch (error) {
    console.error("Error creating veto:", error);
    return { status: "error", message: "Failed to create veto" };
  }
}

export async function getVetoesByMatchIdAction(matchId: number): Promise<ActionState> {
  try {
    const vetoes = await getVetoesByMatchId(matchId);
    return { status: "success", message: "Vetoes retrieved successfully", data: vetoes };
  } catch (error) {
    console.error("Error getting vetoes:", error);
    return { status: "error", message: "Failed to get vetoes" };
  }
}

export async function updateMatchVetoAction(id: number, data: Partial<NewMatchVeto>): Promise<ActionState> {
  try {
    const updatedVeto = await updateMatchVeto(id, data);
    if (updatedVeto.length > 0) {
      revalidatePath(`/matches/${updatedVeto[0].match_id}`);
    }
    return { status: "success", message: "Veto updated successfully", data: updatedVeto };
  } catch (error) {
    console.error("Error updating veto:", error);
    return { status: "error", message: "Failed to update veto" };
  }
}

export async function deleteMatchVetoAction(id: number, matchId: number): Promise<ActionState> {
  try {
    await deleteMatchVeto(id);
    revalidatePath(`/matches/${matchId}`);
    return { status: "success", message: "Veto deleted successfully" };
  } catch (error) {
    console.error("Error deleting veto:", error);
    return { status: "error", message: "Failed to delete veto" };
  }
}
