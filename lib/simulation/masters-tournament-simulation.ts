import { simulateSwissStage } from "./swiss-stage";
import { simulateMatch } from "./simulation";
import { TournamentBracket } from "./tournament-bracket";
import type { TournamentSeeding } from "./tournament-formats";
import { 
  VCT_MASTERS_TORONTO_2025_SWISS_SEEDING,
  VCT_MASTERS_TORONTO_2025_AUTO_QUALIFIED 
} from "./tournament-formats/vct-masters-toronto-2025";

type EloData = Record<string, Record<string, number>>;

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Simulate double elimination bracket for Masters format (8 teams)
 * 
 * Pairing: Auto-qualified teams are randomly paired with Swiss qualifiers
 * Each UB-R1 match has one auto-qualified team vs one Swiss qualifier
 */
function simulateMastersDoubleElimination(
  autoQualified: string[],
  swissQualified: string[],
  eloData: EloData,
  completedWinners?: Record<string, string>,
  mapPool?: string[]
) {
  // Randomly shuffle both pools and pair them
  const shuffledAuto = shuffleArray(autoQualified);
  const shuffledSwiss = shuffleArray(swissQualified);
  
  const [auto1, auto2, auto3, auto4] = shuffledAuto;
  const [swiss1, swiss2, swiss3, swiss4] = shuffledSwiss;

  const bracket: TournamentBracket = {
    // Upper Bracket Round 1 - Cross matchups
    "UB-R1M1": { team1: auto1, team2: swiss4, winner: null, round: 1, matchNumber: 1, id: "UB-R1M1", type: "BO3" },
    "UB-R1M2": { team1: auto4, team2: swiss1, winner: null, round: 1, matchNumber: 2, id: "UB-R1M2", type: "BO3" },
    "UB-R1M3": { team1: auto2, team2: swiss3, winner: null, round: 1, matchNumber: 3, id: "UB-R1M3", type: "BO3" },
    "UB-R1M4": { team1: auto3, team2: swiss2, winner: null, round: 1, matchNumber: 4, id: "UB-R1M4", type: "BO3" },

    // Upper Bracket Round 2
    "UB-R2M1": { team1: "winner-UB-R1M1", team2: "winner-UB-R1M2", winner: null, round: 2, matchNumber: 1, id: "UB-R2M1", type: "BO3" },
    "UB-R2M2": { team1: "winner-UB-R1M3", team2: "winner-UB-R1M4", winner: null, round: 2, matchNumber: 2, id: "UB-R2M2", type: "BO3" },

    // Upper Bracket Final
    "UB-FINAL": { team1: "winner-UB-R2M1", team2: "winner-UB-R2M2", winner: null, round: 3, matchNumber: 1, id: "UB-FINAL", type: "BO3" },

    // Lower Bracket Round 1
    "LB-R1M1": { team1: "loser-UB-R1M1", team2: "loser-UB-R1M2", winner: null, round: 1, matchNumber: 1, id: "LB-R1M1", type: "BO3" },
    "LB-R1M2": { team1: "loser-UB-R1M3", team2: "loser-UB-R1M4", winner: null, round: 1, matchNumber: 2, id: "LB-R1M2", type: "BO3" },

    // Lower Bracket Round 2
    "LB-R2M1": { team1: "loser-UB-R2M2", team2: "winner-LB-R1M1", winner: null, round: 2, matchNumber: 1, id: "LB-R2M1", type: "BO3" },
    "LB-R2M2": { team1: "loser-UB-R2M1", team2: "winner-LB-R1M2", winner: null, round: 2, matchNumber: 2, id: "LB-R2M2", type: "BO3" },

    // Lower Bracket Round 3
    "LB-R3M1": { team1: "winner-LB-R2M1", team2: "winner-LB-R2M2", winner: null, round: 3, matchNumber: 1, id: "LB-R3M1", type: "BO3" },

    // Lower Bracket Final
    "LB-FINAL": { team1: "loser-UB-FINAL", team2: "winner-LB-R3M1", winner: null, round: 4, matchNumber: 1, id: "LB-FINAL", type: "BO5" },

    // Grand Final
    "GRAND-FINAL": { team1: "winner-UB-FINAL", team2: "winner-LB-FINAL", winner: null, round: 5, matchNumber: 1, id: "GRAND-FINAL", type: "BO5" },
  };

  const resolveTeam = (teamPlaceholder: string | null): string | null => {
    if (!teamPlaceholder) return null;
    if (teamPlaceholder.startsWith("winner-")) {
      const matchId = teamPlaceholder.replace("winner-", "");
      return bracket[matchId]?.winner ?? null;
    }
    if (teamPlaceholder.startsWith("loser-")) {
      const matchId = teamPlaceholder.replace("loser-", "");
      const match = bracket[matchId];
      if (!match || !match.winner) return null;
      const team1 = resolveTeam(match.team1);
      const team2 = resolveTeam(match.team2);
      return match.winner === team1 ? team2 : team1;
    }
    return teamPlaceholder;
  };

  const matchIds = Object.keys(bracket);
  let completedMatchesCount = 0;
  let iterations = 0;

  while (completedMatchesCount < matchIds.length && iterations < 15) {
    let changedInIteration = false;
    for (const matchId of matchIds) {
      const match = bracket[matchId];
      if (match.winner) continue;

      const team1Slug = resolveTeam(match.team1);
      const team2Slug = resolveTeam(match.team2);

      if (team1Slug && team2Slug) {
        // Check for pre-completed matches
        if (completedWinners && completedWinners[matchId]) {
          match.winner = completedWinners[matchId];
        } else {
          match.winner = simulateMatch(
            team1Slug,
            team2Slug,
            match.type,
            eloData,
            mapPool
          ).winner;
        }
        changedInIteration = true;
      }
    }

    completedMatchesCount = Object.values(bracket).filter((m) => m.winner).length;
    if (!changedInIteration) {
      break;
    }
    iterations++;
  }

  const winner = resolveTeam("winner-GRAND-FINAL");
  const runnerUp = resolveTeam("loser-GRAND-FINAL");
  const thirdPlace = resolveTeam("loser-LB-FINAL");

  const top4Teams = [
    winner,
    runnerUp,
    thirdPlace,
    resolveTeam("loser-LB-R3M1"),
  ].filter(Boolean) as string[];

  const top6Teams = [
    ...top4Teams,
    resolveTeam("loser-LB-R2M1"),
    resolveTeam("loser-LB-R2M2"),
  ].filter(Boolean) as string[];

  const top8Teams = [
    ...top6Teams,
    resolveTeam("loser-LB-R1M1"),
    resolveTeam("loser-LB-R1M2"),
  ].filter(Boolean) as string[];

  return {
    winner: winner!,
    runnerUp: runnerUp!,
    thirdPlace: thirdPlace!,
    top3: [winner, runnerUp, thirdPlace].filter(Boolean) as string[],
    top4: top4Teams,
    top6: top6Teams,
    top8: top8Teams,
    finalBracket: bracket,
  };
}

/**
 * Simulate full Masters tournament (Swiss stage + Double Elimination playoffs)
 */
export function simulateMastersTournament(
  eloData: EloData,
  completedWinners?: Record<string, string>,
  seeding?: TournamentSeeding,
  mapPool?: string[]
) {
  // Use provided seeding or default to Masters Toronto 2025
  const swissSeeding = seeding ?? VCT_MASTERS_TORONTO_2025_SWISS_SEEDING;
  const autoQualified = seeding 
    ? [
        seeding["playoff-auto1"],
        seeding["playoff-auto2"],
        seeding["playoff-auto3"],
        seeding["playoff-auto4"],
      ]
    : VCT_MASTERS_TORONTO_2025_AUTO_QUALIFIED;

  // Run Swiss stage
  const swissResults = simulateSwissStage(
    "swiss",
    swissSeeding,
    eloData,
    completedWinners,
    mapPool
  );

  // Get Swiss qualifiers in order (2-0 teams first, then 2-1 teams)
  const swissQualified = swissResults.qualified;

  // Run double elimination playoffs
  const playoffResults = simulateMastersDoubleElimination(
    autoQualified,
    swissQualified,
    eloData,
    completedWinners,
    mapPool
  );

  return {
    ...playoffResults,
    swissResults,
    // Teams eliminated in Swiss (didn't make playoffs)
    eliminatedInSwiss: swissResults.eliminated,
  };
}

export interface MastersTournamentResult {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top3: string[];
  top4: string[];
  top6: string[];
  top8: string[];
  swissResults: ReturnType<typeof simulateSwissStage>;
  eliminatedInSwiss: string[];
  finalBracket: TournamentBracket;
}
