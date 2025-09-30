// db/queries/pick-ban-analysis-queries.ts
"use server";

import "server-only";

import { db } from "@/db/db";
import { matchPickBanAnalysisTable } from "@/db/schema/match-pick-ban-analysis-schema";
import { teamsTable } from "../schema/teams-schema";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const getPickBanAnalysis = async () => {
  const team = alias(teamsTable, "team");
  
  const data = await db
    .select({
      teamName: team.name,
      teamSlug: team.slug,
      averageEloLost: matchPickBanAnalysisTable.elo_lost,
    })
    .from(matchPickBanAnalysisTable)
    .innerJoin(team, eq(matchPickBanAnalysisTable.team_id, team.id))
    .orderBy(asc(matchPickBanAnalysisTable.elo_lost));

  return data;
};
