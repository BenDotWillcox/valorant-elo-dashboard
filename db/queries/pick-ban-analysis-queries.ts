// db/queries/pick-ban-analysis-queries.ts
"use server";

import "server-only";

import { db } from "@/db/db";
import { teamsTable } from "../schema/teams-schema";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { matchVetoAnalysisTable } from "../schema/match-veto-analysis-schema";

export const getPickBanAnalysis = async () => {
  const team = alias(teamsTable, "team");
  
  const data = await db
    .select({
      team_name: team.name,
      team_logo: team.logo_url,
      elo_lost: matchVetoAnalysisTable.eloLost,
    })
    .from(matchVetoAnalysisTable)
    .innerJoin(team, eq(matchVetoAnalysisTable.teamId, team.id))
    .orderBy(asc(matchVetoAnalysisTable.eloLost));

  return data;
};
