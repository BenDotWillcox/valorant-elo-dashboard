// actions/pick-ban-analysis-actions.ts
"use server";

import "server-only";
import { getPickBanAnalysis } from "@/db/queries/pick-ban-analysis-queries";

export async function getPickBanAnalysisAction() {
  return await getPickBanAnalysis();
}
