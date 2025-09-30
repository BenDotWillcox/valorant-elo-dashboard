// actions/pick-ban-analysis-actions.ts
"use server";

import { db } from "@/db/db";
import { matchPickBanAnalysisTable } from "@/db/schema/match-pick-ban-analysis-schema";
import { teamsTable } from "@/db/schema/teams-schema";
import { matchesTable } from "@/db/schema/matches-schema";
import { ActionState } from "@/types/actions/action-types";
import { asc, eq, sql, and } from "drizzle-orm";

type PickBanAnalysisFilters = {
  eventName?: string;
};

export async function getPickBanAnalysisAction(filters: PickBanAnalysisFilters): Promise<ActionState> {
  try {
    const conditions = [];
    if (filters.eventName) {
      conditions.push(eq(matchesTable.event_name, filters.eventName));
    }

    const subquery = db
      .select({
        team_id: matchPickBanAnalysisTable.team_id,
        elo_lost: matchPickBanAnalysisTable.elo_lost,
      })
      .from(matchPickBanAnalysisTable)
      .innerJoin(matchesTable, eq(matchPickBanAnalysisTable.match_id, matchesTable.id))
      .where(and(...conditions))
      .as("subquery");

    const analysisData = await db
      .select({
        team_id: teamsTable.id,
        team_name: teamsTable.name,
        team_logo: teamsTable.logo_url,
        average_elo_lost: sql<number>`avg(${subquery.elo_lost})`.as("average_elo_lost"),
        matches_analyzed: sql<number>`count(${subquery.team_id})`.as("matches_analyzed"),
      })
      .from(teamsTable)
      .innerJoin(subquery, eq(teamsTable.id, subquery.team_id))
      .groupBy(teamsTable.id, teamsTable.name, teamsTable.logo_url)
      .orderBy(asc(sql`avg(${subquery.elo_lost})`));

    return { status: "success", message: "Pick/ban analysis retrieved successfully", data: analysisData };
  } catch (error) {
    console.error("Error getting pick/ban analysis:", error);
    return { status: "error", message: "Failed to get pick/ban analysis" };
  }
}

export async function getTeamPickBanHistoryAction(teamId: number): Promise<ActionState> {
  try {
    const history = await db
      .select({
        match_id: matchesTable.id,
        event_name: matchesTable.event_name,
        completed_at: matchesTable.completed_at,
        elo_lost: matchPickBanAnalysisTable.elo_lost,
      })
      .from(matchPickBanAnalysisTable)
      .where(eq(matchPickBanAnalysisTable.team_id, teamId))
      .innerJoin(matchesTable, eq(matchPickBanAnalysisTable.match_id, matchesTable.id))
      .orderBy(asc(matchesTable.completed_at));

    return { status: "success", message: "Team pick/ban history retrieved successfully", data: history };
  } catch (error) {
    console.error("Error getting team pick/ban history:", error);
    return { status: "error", message: "Failed to get team pick/ban history" };
  }
}
