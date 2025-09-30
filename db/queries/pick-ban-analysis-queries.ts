// db/queries/pick-ban-analysis-queries.ts
"use server";

import "server-only";

import { db } from "@/db/db";
import { pickBanAnalysisTable } from "@/db/schema/match-pick-ban-analysis-schema";
import { teamsTable } from "../schema/teams-schema";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const getPickBanAnalysis = async () => {
  const team = alias(teamsTable, "team");
  
  const data = await db
    .select({
      teamName: team.name,
      teamSlug: team.slug,
      teamRegion: team.region,
      averageEloLost: pickBanAnalysisTable.average_elo_lost,
      matchesAnalyzed: pickBanAnalysisTable.matches_analyzed,
    })
    .from(pickBanAnalysisTable)
    .innerJoin(team, eq(pickBanAnalysisTable.team_id, team.id))
    .orderBy(asc(pickBanAnalysisTable.average_elo_lost));

  return data;
};
