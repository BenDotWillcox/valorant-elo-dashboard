"use server";

import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { ActionState } from "@/types/actions/action-types";
import { and, eq, inArray, or, asc } from "drizzle-orm";
import { unstable_noStore as noStore } from 'next/cache';

type VetoStatsFilters = {
    teamId?: number;
    eventName?: string;
};

type VetoStat = { map_name: string; count: number };
type VetoStatsData = {
    firstBanRate: VetoStat[];
    firstPickRate: VetoStat[];
    opponentFirstBanRate: VetoStat[];
    opponentFirstPickRate: VetoStat[];
};

export async function getVetoStatsAction(filters: VetoStatsFilters): Promise<ActionState> {
    noStore();
    try {
        if (!filters.teamId) {
            return { status: "success", message: "Veto stats retrieved", data: { firstBanRate: [], firstPickRate: [], opponentFirstBanRate: [], opponentFirstPickRate: [] } };
        }

        // 1. Find all relevant matches
        const matchConditions = [or(eq(matchesTable.team1_id, filters.teamId), eq(matchesTable.team2_id, filters.teamId))];
        if (filters.eventName) {
            matchConditions.push(eq(matchesTable.event_name, filters.eventName));
        }
        
        const relevantMatches = await db.select({ id: matchesTable.id, team1_id: matchesTable.team1_id, team2_id: matchesTable.team2_id }).from(matchesTable).where(and(...matchConditions));
        if (relevantMatches.length === 0) {
            return { status: "success", message: "Veto stats retrieved", data: { firstBanRate: [], firstPickRate: [], opponentFirstBanRate: [], opponentFirstPickRate: [] } };
        }

        const matchIds = relevantMatches.map(m => m.id);

        // 2. Get all vetoes for those matches
        const allVetoes = await db.select().from(matchVetoesTable).where(inArray(matchVetoesTable.match_id, matchIds)).orderBy(asc(matchVetoesTable.order_index));

        const stats: VetoStatsData = {
            firstBanRate: [],
            firstPickRate: [],
            opponentFirstBanRate: [],
            opponentFirstPickRate: [],
        };

        const firstPicks: Record<string, number> = {};
        const firstBans: Record<string, number> = {};
        const oppFirstPicks: Record<string, number> = {};
        const oppFirstBans: Record<string, number> = {};
        
        const processedMatchesTeam1Picks = new Set<number>();
        const processedMatchesTeam2Picks = new Set<number>();
        const processedMatchesTeam1Bans = new Set<number>();
        const processedMatchesTeam2Bans = new Set<number>();

        // 3. Process vetoes to find the first pick/ban for each team in each match
        for (const veto of allVetoes) {
            if (!veto.match_id || !veto.team_id) continue;

            const match = relevantMatches.find(m => m.id === veto.match_id);
            if (!match) continue;

            const isTeam1 = veto.team_id === match.team1_id;
            const isTeam2 = veto.team_id === match.team2_id;

            if (veto.action === 'pick') {
                if (isTeam1 && !processedMatchesTeam1Picks.has(veto.match_id)) {
                    if (veto.team_id === filters.teamId) {
                        firstPicks[veto.map_name] = (firstPicks[veto.map_name] || 0) + 1;
                    } else {
                        oppFirstPicks[veto.map_name] = (oppFirstPicks[veto.map_name] || 0) + 1;
                    }
                    processedMatchesTeam1Picks.add(veto.match_id);
                } else if (isTeam2 && !processedMatchesTeam2Picks.has(veto.match_id)) {
                    if (veto.team_id === filters.teamId) {
                        firstPicks[veto.map_name] = (firstPicks[veto.map_name] || 0) + 1;
                    } else {
                        oppFirstPicks[veto.map_name] = (oppFirstPicks[veto.map_name] || 0) + 1;
                    }
                    processedMatchesTeam2Picks.add(veto.match_id);
                }
            } else if (veto.action === 'ban') {
                if (isTeam1 && !processedMatchesTeam1Bans.has(veto.match_id)) {
                    if (veto.team_id === filters.teamId) {
                        firstBans[veto.map_name] = (firstBans[veto.map_name] || 0) + 1;
                    } else {
                        oppFirstBans[veto.map_name] = (oppFirstBans[veto.map_name] || 0) + 1;
                    }
                    processedMatchesTeam1Bans.add(veto.match_id);
                } else if (isTeam2 && !processedMatchesTeam2Bans.has(veto.match_id)) {
                    if (veto.team_id === filters.teamId) {
                        firstBans[veto.map_name] = (firstBans[veto.map_name] || 0) + 1;
                    } else {
                        oppFirstBans[veto.map_name] = (oppFirstBans[veto.map_name] || 0) + 1;
                    }
                    processedMatchesTeam2Bans.add(veto.match_id);
                }
            }
        }
        
        // 4. Convert aggregated data into the final format
        stats.firstPickRate = Object.entries(firstPicks).map(([map_name, count]) => ({ map_name, count }));
        stats.firstBanRate = Object.entries(firstBans).map(([map_name, count]) => ({ map_name, count }));
        stats.opponentFirstPickRate = Object.entries(oppFirstPicks).map(([map_name, count]) => ({ map_name, count }));
        stats.opponentFirstBanRate = Object.entries(oppFirstBans).map(([map_name, count]) => ({ map_name, count }));
        
        return { status: "success", message: "Veto stats retrieved", data: stats };
    } catch (error) {
        console.error("Error getting veto stats:", error);
        return { status: "error", message: "Failed to get veto stats" };
    }
}
