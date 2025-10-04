"use server";

import { teamsTable } from "@/db/schema/teams-schema";
import { eloRatingsCurrentTable } from "@/db/schema/elo-ratings-current-schema";
import { eloRatingsTable } from "@/db/schema/elo-ratings-schema";
import { mapsTable } from "@/db/schema/maps-schema";
import { seasonsTable } from "@/db/schema/seasons-schema";
import { playersTable } from "@/db/schema/players-schema";
import { vpmPlayerLatestTable } from "@/db/schema/vpm-player-latest-schema";
import { playerMapStatsTable } from "@/db/schema/player-map-stats-schema";
import { tournamentWinnersTable } from "@/db/schema/tournament-winners-schema";
import { ActionState } from "@/types/actions/action-types";
import { asc, eq, sql, or, and, isNotNull, sum, count, gte, desc, max, inArray } from "drizzle-orm";
import { db } from "@/db/db";

export async function getTeamsAction(): Promise<ActionState> {
  try {
    const teams = await db.select({
      id: teamsTable.id,
      name: teamsTable.name,
      slug: teamsTable.slug,
    }).from(teamsTable).orderBy(asc(teamsTable.name));
    return { status: "success", message: "Teams retrieved successfully", data: teams };
  } catch (error) {
    console.error("Error getting teams:", error);
    return { status: "error", message: "Failed to get teams" };
  }
}

export async function getTeamBySlugAction(slug: string): Promise<ActionState> {
  try {
    console.log(`Looking for team with slug: ${slug}`);
    
    const team = await db.select({
      id: teamsTable.id,
      name: teamsTable.name,
      slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
    }).from(teamsTable).where(eq(teamsTable.slug, slug)).limit(1);
    
    console.log(`Found ${team.length} teams with slug ${slug}`);
    
    if (team.length === 0) {
      // Let's also check what teams exist to help debug
      const allTeams = await db.select({
        slug: teamsTable.slug,
        name: teamsTable.name,
      }).from(teamsTable).limit(10);
      console.log("Sample teams in database:", allTeams);
      return { status: "error", message: "Team not found" };
    }
    
    return { status: "success", message: "Team retrieved successfully", data: team[0] };
  } catch (error) {
    console.error("Error getting team:", error);
    return { status: "error", message: "Failed to get team" };
  }
} 

export async function getTeamMapStatsAction(teamId: number): Promise<ActionState> {
  try {
    // Validate teamId
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Step 1: Get current active season
    const currentSeason = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.is_active, true))
      .limit(1);

    let seasonStartDate: Date;
    if (currentSeason.length === 0) {
      // Fallback: if no active season, use a date far in the past to get all data
      console.warn("No active season found, using all-time data");
      seasonStartDate = new Date('2020-01-01');
    } else {
      seasonStartDate = currentSeason[0].start_date;
    }

    // Step 2: Get team's current ELO ratings for all maps from elo_ratings_current
    const eloRatings = await db
      .select({
        map_name: eloRatingsCurrentTable.map_name,
        rating: eloRatingsCurrentTable.rating,
      })
      .from(eloRatingsCurrentTable)
      .where(eq(eloRatingsCurrentTable.team_id, teamId));

    console.log(`Found ${eloRatings.length} ELO ratings for team ${teamId}`);

    // Step 3: Get team's match record by map for CURRENT SEASON only
    const winsQuery = db
      .select({
        map_name: mapsTable.map_name,
        wins: count().as("wins")
      })
      .from(mapsTable)
      .where(
        and(
          eq(mapsTable.winner_team_id, teamId),
          isNotNull(mapsTable.completed_at),
          gte(mapsTable.completed_at, seasonStartDate)
        )
      )
      .groupBy(mapsTable.map_name);

    const lossesQuery = db
      .select({
        map_name: mapsTable.map_name,
        losses: count().as("losses")
      })
      .from(mapsTable)
      .where(
        and(
          eq(mapsTable.loser_team_id, teamId),
          isNotNull(mapsTable.completed_at),
          gte(mapsTable.completed_at, seasonStartDate)
        )
      )
      .groupBy(mapsTable.map_name);

    const [winsData, lossesData] = await Promise.all([
      winsQuery,
      lossesQuery
    ]);

    console.log(`Found ${winsData.length} wins and ${lossesData.length} losses for team ${teamId}`);

    // Combine wins and losses data
    const matchRecords = new Map();
    
    winsData.forEach(row => {
      matchRecords.set(row.map_name, { wins: row.wins, losses: 0 });
    });
    
    lossesData.forEach(row => {
      const existing = matchRecords.get(row.map_name) || { wins: 0, losses: 0 };
      matchRecords.set(row.map_name, { ...existing, losses: row.losses });
    });

    // Combine ELO ratings with match records
    const mapStats = eloRatings.map(rating => {
      const record = matchRecords.get(rating.map_name);
      return {
        map_name: rating.map_name,
        elo_rating: parseFloat(rating.rating),
        wins: record ? record.wins : 0,
        losses: record ? record.losses : 0,
        total_matches: record ? record.wins + record.losses : 0,
      };
    });

    // Sort by ELO rating descending
    mapStats.sort((a, b) => b.elo_rating - a.elo_rating);

    return { status: "success", message: "Team map stats retrieved successfully", data: mapStats };
  } catch (error) {
    console.error("Error getting team map stats:", error);
    return { status: "error", message: "Failed to get team map stats" };
  }
}

export async function getTeamRecentRosterAction(teamId: number): Promise<ActionState> {
  try {
    // Validate teamId
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Parallelize initial queries
    const [recentPlayersResult, activeSeasonResult] = await Promise.all([
      // Get the 5 most recently played players for this team with their VPM data
      db
        .select({
          player_id: playersTable.id,
          ign: playersTable.ign,
          name: playersTable.name,
          vpm: vpmPlayerLatestTable.current_vpm_per24,
          last_game_date: vpmPlayerLatestTable.last_game_date,
          last_game_num: vpmPlayerLatestTable.last_game_num,
        })
        .from(playersTable)
        .innerJoin(vpmPlayerLatestTable, eq(playersTable.id, vpmPlayerLatestTable.player_id))
        .where(
          and(
            eq(playersTable.team_id, teamId),
            isNotNull(vpmPlayerLatestTable.current_vpm_per24)
          )
        )
        .orderBy(desc(vpmPlayerLatestTable.last_game_date))
        .limit(5),
      
      // Get active season start date
      db
        .select({ start_date: seasonsTable.start_date })
        .from(seasonsTable)
        .where(eq(seasonsTable.is_active, true))
        .limit(1),
    ]);

    if (activeSeasonResult.length === 0) {
      return { status: "error", message: "No active season found" };
    }

    if (recentPlayersResult.length === 0) {
      return { status: "success", message: "No players found", data: [] };
    }

    const seasonStartDate = activeSeasonResult[0].start_date;
    const playerIds = recentPlayersResult.map(p => p.player_id);

    // Fetch all agent usage and team games in 2 bulk queries instead of N+1
    const [agentUsageResults, teamGamesResults] = await Promise.all([
      // Get most played agent for all players in one query
      db
        .select({
          player_id: playerMapStatsTable.player_id,
          agent: playerMapStatsTable.agent,
          usage_count: count().as("usage_count")
        })
        .from(playerMapStatsTable)
        .innerJoin(mapsTable, eq(playerMapStatsTable.map_id, mapsTable.id))
        .where(
          and(
            inArray(playerMapStatsTable.player_id, playerIds),
            gte(mapsTable.completed_at, seasonStartDate)
          )
        )
        .groupBy(playerMapStatsTable.player_id, playerMapStatsTable.agent)
        .orderBy(desc(count())),
      
      // Get team games for all players in one query
      db
        .select({
          player_id: playerMapStatsTable.player_id,
          total_games: count().as("team_games")
        })
        .from(playerMapStatsTable)
        .innerJoin(mapsTable, eq(playerMapStatsTable.map_id, mapsTable.id))
        .where(
          and(
            inArray(playerMapStatsTable.player_id, playerIds),
            or(
              eq(mapsTable.winner_team_id, teamId),
              eq(mapsTable.loser_team_id, teamId)
            )
          )
        )
        .groupBy(playerMapStatsTable.player_id),
    ]);

    // Create lookup maps for O(1) access
    const agentByPlayerId = new Map<number, string>();
    agentUsageResults.forEach(result => {
      // Only store the first (most used) agent for each player
      if (!agentByPlayerId.has(result.player_id)) {
        agentByPlayerId.set(result.player_id, result.agent);
      }
    });

    const teamGamesByPlayerId = new Map<number, number>();
    teamGamesResults.forEach(result => {
      teamGamesByPlayerId.set(result.player_id, Number(result.total_games));
    });

    // Combine all data
    const playersWithAgents = recentPlayersResult.map(player => {
      const mostPlayedAgent = agentByPlayerId.get(player.player_id) || 'Unknown';
      const teamGamesCount = teamGamesByPlayerId.get(player.player_id) || 0;
      
      console.log(`Player ${player.ign} most played agent (current season): "${mostPlayedAgent}"`);
      
      return {
        ...player,
        most_played_agent: mostPlayedAgent,
        team_games: teamGamesCount
      };
    });

    return { status: "success", message: "Team roster retrieved successfully", data: playersWithAgents };
  } catch (error) {
    console.error("Error getting team roster:", error);
    return { status: "error", message: "Failed to get team roster" };
  }
}

export async function getTeamHistoricalEloAction(teamId: number): Promise<ActionState> {
  try {
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Get best ELO rating ever achieved
    const bestElo = await db
      .select({
        map_name: eloRatingsTable.map_name,
        elo_rating: eloRatingsTable.rating,
        date: eloRatingsTable.rating_date
      })
      .from(eloRatingsTable)
      .where(eq(eloRatingsTable.team_id, teamId))
      .orderBy(desc(eloRatingsTable.rating))
      .limit(1);

    // Get worst ELO rating ever achieved
    const worstElo = await db
      .select({
        map_name: eloRatingsTable.map_name,
        elo_rating: eloRatingsTable.rating,
        date: eloRatingsTable.rating_date
      })
      .from(eloRatingsTable)
      .where(eq(eloRatingsTable.team_id, teamId))
      .orderBy(asc(eloRatingsTable.rating))
      .limit(1);

    const historicalData = {
      best: bestElo.length > 0 ? bestElo[0] : null,
      worst: worstElo.length > 0 ? worstElo[0] : null
    };

    return { status: "success", message: "Historical ELO data retrieved successfully", data: historicalData };
  } catch (error) {
    console.error("Error getting historical ELO data:", error);
    return { status: "error", message: "Failed to get historical ELO data" };
  }
}

export async function getTeamTournamentWinsAction(teamId: number): Promise<ActionState> {
  try {
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Get tournament wins with details from the dedicated table
    const tournamentWins = await db
      .select({
        tournament_type: tournamentWinnersTable.tournament_type,
        count: count().as("win_count")
      })
      .from(tournamentWinnersTable)
      .where(eq(tournamentWinnersTable.winner_team_id, teamId))
      .groupBy(tournamentWinnersTable.tournament_type);

    // Get detailed tournament wins for trophy display
    const tournamentDetails = await db
      .select({
        tournament_name: tournamentWinnersTable.tournament_name,
        tournament_type: tournamentWinnersTable.tournament_type,
        region: tournamentWinnersTable.region,
        completed_at: tournamentWinnersTable.completed_at
      })
      .from(tournamentWinnersTable)
      .where(eq(tournamentWinnersTable.winner_team_id, teamId))
      .orderBy(desc(tournamentWinnersTable.completed_at));

    let championsWins = 0;
    let mastersWins = 0;
    let domesticWins = 0;

    // Process the results
    for (const win of tournamentWins) {
      if (win.tournament_type === 'Champions') {
        championsWins = Number(win.count);
      } else if (win.tournament_type === 'Masters') {
        mastersWins = Number(win.count);
      } else if (win.tournament_type === 'Domestic') {
        domesticWins = Number(win.count);
      }
    }

    const internationalWins = championsWins + mastersWins;

    const tournamentData = {
      international_wins: internationalWins,
      domestic_wins: domesticWins,
      total_wins: internationalWins + domesticWins,
      champions_wins: championsWins,
      masters_wins: mastersWins,
      tournament_details: tournamentDetails
    };

    return { status: "success", message: "Tournament wins retrieved successfully", data: tournamentData };
  } catch (error) {
    console.error("Error getting tournament wins:", error);
    return { status: "error", message: "Failed to get tournament wins" };
  }
}

export async function getTeamMapStreaksAction(teamId: number): Promise<ActionState> {
  try {
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Get active season start date to limit the query scope
    const currentSeason = await db
      .select({ start_date: seasonsTable.start_date })
      .from(seasonsTable)
      .where(eq(seasonsTable.is_active, true))
      .limit(1);

    let seasonStartDate: Date;
    if (currentSeason.length === 0) {
      console.warn("No active season found, using all-time data");
      seasonStartDate = new Date('2020-01-01');
    } else {
      seasonStartDate = currentSeason[0].start_date;
    }

    // Get maps for this team in current season only, ordered by date
    const teamMaps = await db
      .select({
        map_name: mapsTable.map_name,
        winner_team_id: mapsTable.winner_team_id,
        loser_team_id: mapsTable.loser_team_id,
        completed_at: mapsTable.completed_at
      })
      .from(mapsTable)
      .where(
        and(
          or(
            eq(mapsTable.winner_team_id, teamId),
            eq(mapsTable.loser_team_id, teamId)
          ),
          isNotNull(mapsTable.completed_at),
          gte(mapsTable.completed_at, seasonStartDate)
        )
      )
      .orderBy(asc(mapsTable.completed_at));

    // Group by map and calculate streaks
    const mapStreaks: Record<string, {
      longest_win_streak: number;
      longest_loss_streak: number;
      current_streak: number;
      current_streak_type: 'W' | 'L';
    }> = {};

    // Group maps by map name
    const mapsByMapName: Record<string, typeof teamMaps> = {};
    for (const map of teamMaps) {
      if (!mapsByMapName[map.map_name]) {
        mapsByMapName[map.map_name] = [];
      }
      mapsByMapName[map.map_name].push(map);
    }

    // Calculate streaks for each map
    for (const [mapName, maps] of Object.entries(mapsByMapName)) {
      let longestWinStreak = 0;
      let longestLossStreak = 0;
      let currentWinStreak = 0;
      let currentLossStreak = 0;
      let maxWinStreak = 0;
      let maxLossStreak = 0;

      for (const map of maps) {
        const isWin = map.winner_team_id === teamId;
        const isLoss = map.loser_team_id === teamId;

        if (isWin) {
          currentWinStreak++;
          currentLossStreak = 0;
          maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        } else if (isLoss) {
          currentLossStreak++;
          currentWinStreak = 0;
          maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        }
      }

      longestWinStreak = maxWinStreak;
      longestLossStreak = maxLossStreak;

      // Determine current streak
      let currentStreak = 0;
      let currentStreakType: 'W' | 'L' = 'W';

      if (maps.length > 0) {
        const lastMap = maps[maps.length - 1];
        const isLastWin = lastMap.winner_team_id === teamId;
        
        if (isLastWin) {
          currentStreak = currentWinStreak;
          currentStreakType = 'W';
        } else {
          currentStreak = currentLossStreak;
          currentStreakType = 'L';
        }
      }

      mapStreaks[mapName] = {
        longest_win_streak: longestWinStreak,
        longest_loss_streak: longestLossStreak,
        current_streak: currentStreak,
        current_streak_type: currentStreakType
      };
    }

    return { status: "success", message: "Map streaks retrieved successfully", data: mapStreaks };
  } catch (error) {
    console.error("Error getting map streaks:", error);
    return { status: "error", message: "Failed to get map streaks" };
  }
}

export async function getTeamLastPlayedCompsAction(teamId: number): Promise<ActionState> {
  try {
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Get all maps for this team ordered by date
    const teamMaps = await db
      .select({
        map_name: mapsTable.map_name,
        completed_at: mapsTable.completed_at,
        map_id: mapsTable.id
      })
      .from(mapsTable)
      .where(
        or(
          eq(mapsTable.winner_team_id, teamId),
          eq(mapsTable.loser_team_id, teamId)
        )
      )
      .orderBy(desc(mapsTable.completed_at));

    // Group by map and get the most recent game for each map
    const lastPlayedComps: Record<string, string[]> = {};

    for (const map of teamMaps) {
      if (!lastPlayedComps[map.map_name]) {
        // Get the agents from the most recent game on this map
        const agents = await db
          .select({
            agent: playerMapStatsTable.agent
          })
          .from(playerMapStatsTable)
          .where(eq(playerMapStatsTable.map_id, map.map_id))
          .limit(5);

        lastPlayedComps[map.map_name] = agents.map(a => a.agent);
      }
    }

    return { status: "success", message: "Last played compositions retrieved successfully", data: lastPlayedComps };
  } catch (error) {
    console.error("Error getting last played compositions:", error);
    return { status: "error", message: "Failed to get last played compositions" };
  }
}

export async function getTeamRecentMapResultsAction(teamId: number, mapName: string): Promise<ActionState> {
  try {
    if (!teamId || teamId <= 0) {
      return { status: "error", message: "Invalid team ID" };
    }

    // Get current active season start date
    const currentSeason = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.is_active, true))
      .limit(1);

    let seasonStartDate: Date;
    if (currentSeason.length === 0) {
      // Fallback: if no active season, use a date far in the past to get all data
      console.warn("No active season found, using all-time data");
      seasonStartDate = new Date('2020-01-01');
    } else {
      seasonStartDate = currentSeason[0].start_date;
    }

    // Get all match results for this team on this specific map for the current season
    const recentResults = await db
      .select({
        id: mapsTable.id,
        winner_team_id: mapsTable.winner_team_id,
        loser_team_id: mapsTable.loser_team_id,
        winner_rounds: mapsTable.winner_rounds,
        loser_rounds: mapsTable.loser_rounds,
        completed_at: mapsTable.completed_at,
        event_name: mapsTable.event_name,
        winner_team_name: sql<string>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN ${teamsTable.name} ELSE opponent_team.name END`.as("winner_team_name"),
        loser_team_name: sql<string>`CASE WHEN ${mapsTable.loser_team_id} = ${teamId} THEN ${teamsTable.name} ELSE opponent_team.name END`.as("loser_team_name"),
        opponent_team_name: sql<string>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN opponent_team.name ELSE ${teamsTable.name} END`.as("opponent_team_name"),
        opponent_team_slug: sql<string>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN opponent_team.slug ELSE ${teamsTable.slug} END`.as("opponent_team_slug"),
        opponent_team_logo: sql<string>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN opponent_team.logo_url ELSE ${teamsTable.logo_url} END`.as("opponent_team_logo"),
        team_score: sql<number>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN ${mapsTable.winner_rounds} ELSE ${mapsTable.loser_rounds} END`.as("team_score"),
        opponent_score: sql<number>`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN ${mapsTable.loser_rounds} ELSE ${mapsTable.winner_rounds} END`.as("opponent_score"),
        is_win: sql<boolean>`${mapsTable.winner_team_id} = ${teamId}`.as("is_win")
      })
      .from(mapsTable)
      .innerJoin(teamsTable, eq(mapsTable.winner_team_id, teamsTable.id))
      .leftJoin(
        sql`${teamsTable} as opponent_team`,
        sql`CASE WHEN ${mapsTable.winner_team_id} = ${teamId} THEN ${mapsTable.loser_team_id} = opponent_team.id ELSE ${mapsTable.winner_team_id} = opponent_team.id END`
      )
      .where(
        and(
          eq(mapsTable.map_name, mapName),
          or(
            eq(mapsTable.winner_team_id, teamId),
            eq(mapsTable.loser_team_id, teamId)
          ),
          isNotNull(mapsTable.completed_at),
          gte(mapsTable.completed_at, seasonStartDate)
        )
      )
      .orderBy(desc(mapsTable.completed_at));

    return { status: "success", message: "Recent map results retrieved successfully", data: recentResults };
  } catch (error) {
    console.error("Error getting recent map results:", error);
    return { status: "error", message: "Failed to get recent map results" };
  }
}
