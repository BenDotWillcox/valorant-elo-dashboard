import { simulateSwissStage, SwissStageResult } from "./swiss-stage";
import { simulateFourTeamDoubleElimination} from "./four-team-double-elimination";
import type { TournamentSeeding } from "./tournament-formats";
import { TournamentBracket } from "./tournament-bracket";

type EloData = Record<string, Record<string, number>>;

export interface BangkokTournamentResult {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top3: string[];
  top4: string[];
  top6: string[];
  swissResults: SwissStageResult;
  eliminatedInSwiss: string[];
  finalBracket: TournamentBracket;
}

/**
 * Simulate full Bangkok tournament (Swiss stage → 4-team double elimination)
 * 
 * Format:
 * - 8 teams compete in Swiss stage
 * - Top 4 advance to playoffs (2-0 teams as seeds 1-2, 2-1 teams as seeds 3-4)
 * - 4-team double elimination playoff bracket
 * 
 * Playoff seeding:
 * - Seed 1 vs Seed 4 (UB-SEMI1)
 * - Seed 2 vs Seed 3 (UB-SEMI2)
 */
export function simulateBangkokTournament(
  eloData: EloData,
  completedWinners?: Record<string, string>,
  seeding?: TournamentSeeding,
  mapPool?: string[]
): BangkokTournamentResult {
  if (!seeding) {
    throw new Error("Bangkok tournament requires seeding configuration");
  }

  // Run Swiss stage
  const swissResults = simulateSwissStage(
    "swiss",
    seeding,
    eloData,
    completedWinners,
    mapPool
  );

  // Get Swiss qualifiers in order (2-0 teams first, then 2-1 teams)
  // The swiss stage already returns qualified teams in this order
  const playoffTeams = swissResults.qualified;

  // Run 4-team double elimination playoffs
  const playoffResults = simulateFourTeamDoubleElimination(
    playoffTeams,
    eloData,
    completedWinners,
    mapPool
  );

  // Top 6 = playoff teams (top 4) + Round 3 Swiss losers (1-2 record)
  // In Swiss elimination order: [0-2 losers (R2), 1-2 losers (R3)]
  // So positions [2] and [3] are the Round 3 losers
  const round3SwissLosers = swissResults.eliminated.slice(2, 4);
  const top6 = [...playoffResults.top4, ...round3SwissLosers];

  return {
    winner: playoffResults.winner,
    runnerUp: playoffResults.runnerUp,
    thirdPlace: playoffResults.thirdPlace,
    top3: playoffResults.top3,
    top4: playoffResults.top4,
    top6,
    swissResults,
    eliminatedInSwiss: swissResults.eliminated,
    finalBracket: playoffResults.finalBracket,
  };
}
