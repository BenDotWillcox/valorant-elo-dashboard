// actions/pick-ban-analysis-actions.ts
"use server";

import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { teamsTable } from "@/db/schema/teams-schema";
import { matchVetoAnalysisTable } from "@/db/schema/match-veto-analysis-schema";
import { ActionState } from "@/types/actions/action-types";
import { and, eq, sql, inArray, desc } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import { alias } from "drizzle-orm/pg-core";
import { getEloRatingsAtTime } from "@/db/queries/elo-ratings-queries";

type VetoStep = {
    vetoOrder: number;
    action: 'pick' | 'ban' | 'decider';
    mapName: string;
    eloLost: number;
    teamId: number;
    teamName: string | null;
    teamSlug: string | null;
    optimalChoice: string | null;
    availableMaps: string[] | null;
};

type PickBanAnalysisFilters = {
  eventName?: string;
};

export async function getPickBanAnalysisAction(
  filters: PickBanAnalysisFilters
): Promise<ActionState> {
  noStore();
  try {
    let subquery;

    if (filters.eventName) {
      const matchIdsForEvent = db.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.event_name, filters.eventName));
      
      subquery = db
        .select({
          team_id: matchVetoAnalysisTable.teamId,
          match_id: matchVetoAnalysisTable.matchId,
          max_elo_lost: sql<number>`MAX(${matchVetoAnalysisTable.cumulativeEloLost})`.as("max_elo_lost"),
        })
        .from(matchVetoAnalysisTable)
        .where(inArray(matchVetoAnalysisTable.matchId, matchIdsForEvent))
        .groupBy(matchVetoAnalysisTable.teamId, matchVetoAnalysisTable.matchId)
        .as("subquery");
    } else {
      subquery = db
        .select({
          team_id: matchVetoAnalysisTable.teamId,
          match_id: matchVetoAnalysisTable.matchId,
          max_elo_lost: sql<number>`MAX(${matchVetoAnalysisTable.cumulativeEloLost})`.as("max_elo_lost"),
        })
        .from(matchVetoAnalysisTable)
        .groupBy(matchVetoAnalysisTable.teamId, matchVetoAnalysisTable.matchId)
        .as("subquery");
    }

    const query = db
      .select({
        team_id: subquery.team_id,
        average_elo_lost: sql<number>`AVG(subquery.max_elo_lost)`.as("average_elo_lost"),
        matches_analyzed: sql<number>`COUNT(subquery.match_id)`.as("matches_analyzed"),
        team_name: teamsTable.name,
        team_logo: teamsTable.logo_url,
        team_slug: teamsTable.slug,
      })
      .from(subquery)
      .leftJoin(teamsTable, eq(subquery.team_id, teamsTable.id))
      .groupBy(subquery.team_id, teamsTable.name, teamsTable.logo_url, teamsTable.slug)
      .orderBy(sql`average_elo_lost ASC`);

    const data = await query;

    return { status: "success", message: "Pick/ban analysis retrieved", data };
  } catch (error) {
    console.error("Error getting pick/ban analysis:", error);
    return { status: "error", message: "Failed to get pick/ban analysis" };
  }
}

export async function getTeamPickBanHistoryAction(teamId: number, eventName?: string): Promise<ActionState> {
    noStore();
    try {
        const conditions = [eq(matchVetoAnalysisTable.teamId, teamId)];
        if (eventName) {
            const matchIdsForEvent = db.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.event_name, eventName));
            conditions.push(inArray(matchVetoAnalysisTable.matchId, matchIdsForEvent));
        }

        const eloLostPerMatch = db
            .select({
                match_id: matchVetoAnalysisTable.matchId,
                elo_lost: sql<number>`MAX(${matchVetoAnalysisTable.cumulativeEloLost})`.as("elo_lost"),
            })
            .from(matchVetoAnalysisTable)
            .where(and(...conditions))
            .groupBy(matchVetoAnalysisTable.matchId)
            .as("elo_lost_per_match");

        const opponentTeam = alias(teamsTable, "opponent_team");

        const history = await db
            .select({
                match_id: eloLostPerMatch.match_id,
                elo_lost: eloLostPerMatch.elo_lost,
                event_name: matchesTable.event_name,
                opponent_name: opponentTeam.name,
                opponent_logo: opponentTeam.logo_url,
            })
            .from(eloLostPerMatch)
            .innerJoin(matchesTable, eq(eloLostPerMatch.match_id, matchesTable.id))
            .leftJoin(
                opponentTeam, 
                sql`CASE WHEN ${matchesTable.team1_id} = ${teamId} THEN ${matchesTable.team2_id} ELSE ${matchesTable.team1_id} END = ${opponentTeam.id}`
            )
            .orderBy(desc(matchesTable.completed_at));

        return { status: "success", message: "Team pick/ban history retrieved", data: history };

    } catch (error) {
        console.error("Error getting team pick/ban history:", error);
        return { status: "error", message: "Failed to get team pick/ban history" };
    }
}

export async function getMatchEloDataAction(matchId: number): Promise<ActionState> {
    noStore();
    try {
        const matchData = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
        if (matchData.length === 0) {
            return { status: "error", message: "Match not found" };
        }

        const match = matchData[0];
        const team1Id = match.team1_id;
        const team2Id = match.team2_id;
        const completedAt = match.completed_at;

        if (!team1Id || !team2Id || !completedAt) {
            return { status: "error", message: "Match data is incomplete" };
        }

        const [team1Elos, team2Elos] = await Promise.all([
            getEloRatingsAtTime(team1Id, completedAt),
            getEloRatingsAtTime(team2Id, completedAt)
        ]);
        
        const data = {
            team1Id,
            team2Id,
            team1Elos: team1Elos.map(e => ({ map_name: e.map_name, elo: parseFloat(e.elo_rating) })),
            team2Elos: team2Elos.map(e => ({ map_name: e.map_name, elo: parseFloat(e.elo_rating) })),
        };

        return { status: "success", message: "Match Elo data retrieved", data };

    } catch (error) {
        console.error("Error getting match elo data:", error);
        return { status: "error", message: "Failed to get match elo data" };
    }
}

async function getDeciderMap(matchId: number): Promise<string | null> {
    noStore();
    try {
        const lastVetoStep = await db
            .select({ 
                availableMaps: matchVetoAnalysisTable.availableMaps,
                mapName: matchVetoAnalysisTable.mapName 
            })
            .from(matchVetoAnalysisTable)
            .where(eq(matchVetoAnalysisTable.matchId, matchId))
            .orderBy(desc(matchVetoAnalysisTable.vetoOrder))
            .limit(1);

        if (lastVetoStep.length > 0) {
            const { availableMaps, mapName } = lastVetoStep[0];
            if (availableMaps && availableMaps.length > 0) {
                const decider = availableMaps.filter(map => map !== mapName);
                if (decider.length > 0) return decider[0];
            }
        }
        return null;
    } catch (error) {
        console.error("Error getting decider map:", error);
        return null;
    }
}

export async function getMatchVetoAnalysisAction(matchId: number): Promise<ActionState> {
    noStore();
    try {
        const actingTeam = alias(teamsTable, "acting_team");

        const vetoAnalysis = await db
            .select({
                vetoOrder: matchVetoAnalysisTable.vetoOrder,
                action: matchVetoAnalysisTable.action,
                mapName: matchVetoAnalysisTable.mapName,
                eloLost: matchVetoAnalysisTable.eloLost,
                teamId: matchVetoAnalysisTable.teamId,
                teamName: actingTeam.name,
                teamSlug: actingTeam.slug,
                optimalChoice: matchVetoAnalysisTable.optimalChoice,
                availableMaps: matchVetoAnalysisTable.availableMaps,
            })
            .from(matchVetoAnalysisTable)
            .where(eq(matchVetoAnalysisTable.matchId, matchId))
            .leftJoin(actingTeam, eq(matchVetoAnalysisTable.teamId, actingTeam.id))
            .orderBy(matchVetoAnalysisTable.vetoOrder);
        
        const deciderMap = await getDeciderMap(matchId);
        const vetoSteps: VetoStep[] = [...vetoAnalysis];

        if (deciderMap) {
            vetoSteps.push({
                vetoOrder: vetoSteps.length + 1,
                action: 'decider',
                mapName: deciderMap,
                eloLost: 0,
                teamId: 0, 
                teamName: 'Decider',
                teamSlug: null,
                optimalChoice: null,
                availableMaps: null,
            });
        }
            
        return { status: "success", message: "Match veto analysis retrieved", data: vetoSteps };

    } catch (error) {
        console.error("Error getting match veto analysis:", error);
        return { status: "error", message: "Failed to get match veto analysis" };
    }
}
