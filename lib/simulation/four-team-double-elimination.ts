import { TournamentBracket } from "./tournament-bracket";
import { simulateMatch } from "./simulation";

type EloData = Record<string, Record<string, number>>;

export interface FourTeamDoubleElimResult {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top3: string[];
  top4: string[];
  top6: string[];
  finalBracket: TournamentBracket;
}

/**
 * Simulate a 4-team double elimination bracket.
 * 
 * Bracket structure (6 matches total):
 * - UB-SEMI1: seed1 vs seed4
 * - UB-SEMI2: seed2 vs seed3
 * - UB-FINAL: winner UB-SEMI1 vs winner UB-SEMI2
 * - LB-R1: loser UB-SEMI1 vs loser UB-SEMI2
 * - LB-FINAL: loser UB-FINAL vs winner LB-R1
 * - GRAND-FINAL: winner UB-FINAL vs winner LB-FINAL
 * 
 * @param teams Array of 4 teams ordered by seeding [seed1, seed2, seed3, seed4]
 * @param eloData Elo ratings by team and map
 * @param completedWinners Pre-determined match winners (for historical simulation)
 * @param mapPool Available maps for the tournament
 */
export function simulateFourTeamDoubleElimination(
  teams: string[],
  eloData: EloData,
  completedWinners?: Record<string, string>,
  mapPool?: string[]
): FourTeamDoubleElimResult {
  const [seed1, seed2, seed3, seed4] = teams;

  const bracket: TournamentBracket = {
    // Upper Bracket Semifinals
    "UB-SEMI1": { team1: seed1, team2: seed4, winner: null, round: 1, matchNumber: 1, id: "UB-SEMI1", type: "BO3" },
    "UB-SEMI2": { team1: seed2, team2: seed3, winner: null, round: 1, matchNumber: 2, id: "UB-SEMI2", type: "BO3" },

    // Upper Bracket Final
    "UB-FINAL": { team1: "winner-UB-SEMI1", team2: "winner-UB-SEMI2", winner: null, round: 2, matchNumber: 1, id: "UB-FINAL", type: "BO3" },

    // Lower Bracket Round 1
    "LB-R1": { team1: "loser-UB-SEMI1", team2: "loser-UB-SEMI2", winner: null, round: 2, matchNumber: 2, id: "LB-R1", type: "BO3" },

    // Lower Bracket Final
    "LB-FINAL": { team1: "loser-UB-FINAL", team2: "winner-LB-R1", winner: null, round: 3, matchNumber: 1, id: "LB-FINAL", type: "BO5" },

    // Grand Final
    "GRAND-FINAL": { team1: "winner-UB-FINAL", team2: "winner-LB-FINAL", winner: null, round: 4, matchNumber: 1, id: "GRAND-FINAL", type: "BO5" },
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

  while (completedMatchesCount < matchIds.length && iterations < 10) {
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
  const fourthPlace = resolveTeam("loser-LB-R1");

  const top4 = [winner, runnerUp, thirdPlace, fourthPlace].filter(Boolean) as string[];

  return {
    winner: winner!,
    runnerUp: runnerUp!,
    thirdPlace: thirdPlace!,
    top3: [winner, runnerUp, thirdPlace].filter(Boolean) as string[],
    top4,
    top6: top4, // In 4-team bracket, top6 = top4 (extra slots filled by Bangkok sim)
    finalBracket: bracket,
  };
}
