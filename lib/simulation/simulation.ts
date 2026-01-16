import { getCurrentMapRankings } from "@/db/queries/rankings-queries";
import { MAP_POOL } from "@/lib/constants/maps";
import {
  getOptimalMapSelection,
  MapProbabilities,
} from "../predictions/map-selection";
import { calculateWinProbability } from "../predictions/calculations";
import { simulateFullTournament } from "@/lib/simulation/tournament-simulation";
import { VCT_CHAMPIONS_2025_TEAMS } from "@/lib/constants/tournaments";
import type { TournamentConfig } from "./tournament-formats";



export async function getSimulationData() {
  const maps = MAP_POOL.active;

  const allRankings = await Promise.all(
    maps.map(async (map) => {
      const rankings = await getCurrentMapRankings(map);
      return rankings.map((r) => ({
        ...r,
        mapName: map,
      }));
    })
  );

  const flattenedRankings = allRankings.flat();

  const eloDataByTeam = flattenedRankings.reduce((acc, ranking) => {
    if (ranking.teamSlug) {
      if (!acc[ranking.teamSlug]) {
        acc[ranking.teamSlug] = {};
      }
      acc[ranking.teamSlug][ranking.mapName] = parseFloat(ranking.rating);
    }
    return acc;
  }, {} as Record<string, Record<string, number>>);

  return eloDataByTeam;
}

export type EloData = Record<string, Record<string, number>>;

export function simulateMatch(
  team1Slug: string,
  team2Slug: string,
  matchType: "BO3" | "BO5" | "BO5_ADV",
  eloData: EloData,
  mapPool?: string[]
) {
  const maps = mapPool ?? MAP_POOL.active;

  const team1Elo = eloData[team1Slug];
  const team2Elo = eloData[team2Slug];

  if (!team1Elo || !team2Elo) {
    // One of the teams might not have data, assume 50/50
    const winner = Math.random() < 0.5 ? team1Slug : team2Slug;
    return {
      winner,
      team1Score:
        matchType === "BO3"
          ? winner === team1Slug
            ? 2
            : Math.floor(Math.random() * 2)
          : winner === team1Slug
          ? 3
          : Math.floor(Math.random() * 3),
      team2Score:
        matchType === "BO3"
          ? winner === team2Slug
            ? 2
            : Math.floor(Math.random() * 2)
          : winner === team2Slug
          ? 3
          : Math.floor(Math.random() * 3),
    };
  }

  const team1Probs = maps.reduce((acc, map) => {
    const elo1 = team1Elo[map] ?? 1000;
    const elo2 = team2Elo[map] ?? 1000;
    const [prob1] = calculateWinProbability(elo1, elo2);
    acc[map] = { probability: prob1, map };
    return acc;
  }, {} as MapProbabilities);

  const team2Probs = maps.reduce((acc, map) => {
    const elo1 = team1Elo[map] ?? 1000;
    const elo2 = team2Elo[map] ?? 1000;
    const [, prob2] = calculateWinProbability(elo1, elo2);
    acc[map] = { probability: prob2, map };
    return acc;
  }, {} as MapProbabilities);

  const { selectedMaps } = getOptimalMapSelection(
    maps,
    team1Probs,
    team2Probs,
    matchType
  );

  let team1Score = 0;
  let team2Score = 0;
  const mapsToWin = matchType === "BO3" ? 2 : 3;

  for (const map of selectedMaps) {
    const elo1 = team1Elo[map] ?? 1000;
    const elo2 = team2Elo[map] ?? 1000;
    const [winProbTeam1] = calculateWinProbability(elo1, elo2);

    if (Math.random() < winProbTeam1) {
      team1Score++;
    } else {
      team2Score++;
    }

    if (team1Score === mapsToWin || team2Score === mapsToWin) {
      break;
    }
  }

  return {
    winner: team1Score > team2Score ? team1Slug : team2Slug,
    team1Score,
    team2Score,
  };
}

export interface MonteCarloOptions {
  numSimulations?: number;
  completedWinners?: Record<string, string>;
  config?: TournamentConfig;
  eloData?: EloData;
}

/**
 * Run Monte Carlo simulation for a tournament.
 * 
 * For live simulations: Call with no config/eloData to use current data
 * For historical simulations: Provide config and pre-fetched eloData
 */
export async function runMonteCarloSimulation(
  numSimulations: number = 10000,
  completedWinners?: Record<string, string>,
  config?: TournamentConfig,
  providedEloData?: EloData
) {
  // Use provided config or default to VCT Champions 2025
  const tournamentTeams = config?.teams ?? VCT_CHAMPIONS_2025_TEAMS;
  const tournamentSeeding = config?.seeding;
  const tournamentMapPool = config?.mapPool ?? MAP_POOL.active;
  
  const eloData = providedEloData ?? await getSimulationData();
  const allTeams = tournamentTeams.map((t) => t.slug);
  const maps = tournamentMapPool;

  const teamsWithIncompleteElo = allTeams.filter(team => {
    if (!eloData[team]) {
        return true;
    }
    const teamMapRatings = Object.keys(eloData[team]);
    const hasAnyMapRating = maps.some(map => teamMapRatings.includes(map) && eloData[team][map]);
    return !hasAnyMapRating;
  });

  if (teamsWithIncompleteElo.length > 0) {
    console.warn(`Warning: Map-specific Elo data is missing for the following teams: ${teamsWithIncompleteElo.join(', ')}. Matches will default to 50/50 odds.`);
  }

  const results = allTeams.reduce((acc, teamSlug) => {
    acc[teamSlug] = {
      championships: 0,
      finalist: 0,
      top3: 0,
      top4: 0,
      top6: 0,
      top8: 0,
      top12: 0,
    };
    return acc;
  }, {} as Record<string, { championships: number; finalist: number; top3: number; top4: number; top6: number; top8: number; top12: number; }>);

  for (let i = 0; i < numSimulations; i++) {
    const tournamentResults = simulateFullTournament(eloData, completedWinners, tournamentSeeding, tournamentMapPool, config?.format);

    if (tournamentResults.winner) {
      results[tournamentResults.winner].championships++;
    }
    if (tournamentResults.runnerUp) {
      results[tournamentResults.runnerUp].finalist++;
    }
    if (tournamentResults.winner) {
      results[tournamentResults.winner].finalist++;
    }
    tournamentResults.top3.forEach((team: string) => {
      if (results[team]) results[team].top3++;
    });
    tournamentResults.top4.forEach((team: string) => {
      if (results[team]) results[team].top4++;
    });
    if ('top6' in tournamentResults && tournamentResults.top6) {
      tournamentResults.top6.forEach((team: string) => {
        if (results[team]) results[team].top6++;
      });
    }
    if ('top8' in tournamentResults && tournamentResults.top8) {
      tournamentResults.top8.forEach((team: string) => {
        if (results[team]) results[team].top8++;
      });
    }
    // Top 12 = made it out of groups (all teams not eliminated in groups)
    if ('top8' in tournamentResults && tournamentResults.top8) {
      tournamentResults.top8.forEach((team: string) => {
        if (results[team]) results[team].top12++;
      });
    }
  }

  const finalProbabilities = Object.entries(results).map(
    ([teamSlug, data]) => {
      const team = tournamentTeams.find((t) => t.slug === teamSlug);
      return {
        team: teamSlug,
        teamName: team ? team.name : teamSlug,
        championships: (data.championships / numSimulations) * 100,
        finalist: (data.finalist / numSimulations) * 100,
        top3: (data.top3 / numSimulations) * 100,
        top4: (data.top4 / numSimulations) * 100,
        top6: (data.top6 / numSimulations) * 100,
        top8: (data.top8 / numSimulations) * 100,
        top12: (data.top12 / numSimulations) * 100,
      };
    }
  );

  return finalProbabilities.sort((a, b) => b.championships - a.championships);
}
