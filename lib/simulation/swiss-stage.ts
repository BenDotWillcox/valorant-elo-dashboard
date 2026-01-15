import { simulateMatch } from "./simulation";

type EloData = Record<string, Record<string, number>>;
type Seeding = Record<string, string>;

interface TeamRecord {
  team: string;
  wins: number;
  losses: number;
  seed: number;
}

export interface SwissMatch {
  team1: string;
  team2: string;
  winner: string | null;
  round: number;
  matchNumber: number;
  id: string;
  type: "BO3" | "BO5";
  bracket: string; // e.g., "0-0", "1-0", "0-1", "1-1"
}

export interface SwissStageResult {
  qualified: string[];
  eliminated: string[];
  matches: SwissMatch[];
  finalStandings: TeamRecord[];
}

/**
 * Simulate an 8-team Swiss stage where top 4 advance and bottom 4 are eliminated.
 * - 2 wins = qualify
 * - 2 losses = eliminated
 * 
 * Round 1: 4 matches (0-0 bracket)
 * Round 2: 2 matches (1-0 bracket) + 2 matches (0-1 bracket)
 *   - 2-0 winners qualify, 0-2 losers eliminated
 * Round 3: 2 matches (1-1 bracket)
 *   - 2-1 winners qualify, 1-2 losers eliminated
 */
export function simulateSwissStage(
  stageName: string,
  seeding: Seeding,
  eloData: EloData,
  completedWinners?: Record<string, string>,
  mapPool?: string[]
): SwissStageResult {
  // Get teams from seeding
  const teams: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const seedKey = `${stageName}-seed${i}`;
    const teamSlug = seeding[seedKey];
    if (teamSlug) {
      teams.push(teamSlug);
    }
  }

  const records = new Map<string, TeamRecord>();
  teams.forEach((team, index) => {
    records.set(team, { team, wins: 0, losses: 0, seed: index + 1 });
  });

  const allMatches: SwissMatch[] = [];
  const qualified: string[] = [];
  const eliminated: string[] = [];

  const runMatch = (
    team1: string,
    team2: string,
    round: number,
    matchNumber: number,
    bracket: string,
    type: "BO3" | "BO5" = "BO3"
  ): string => {
    const matchId = `${stageName}-R${round}M${matchNumber}`;
    
    let winner: string;
    if (completedWinners && completedWinners[matchId]) {
      winner = completedWinners[matchId];
    } else {
      winner = simulateMatch(team1, team2, type, eloData, mapPool).winner;
    }

    allMatches.push({
      team1,
      team2,
      winner,
      round,
      matchNumber,
      id: matchId,
      type,
      bracket,
    });

    // Update records
    const r1 = records.get(team1)!;
    const r2 = records.get(team2)!;
    if (winner === team1) {
      r1.wins++;
      r2.losses++;
    } else {
      r2.wins++;
      r1.losses++;
    }

    return winner;
  };

  const getLoser = (team1: string, team2: string, winner: string): string => {
    return winner === team1 ? team2 : team1;
  };

  // === ROUND 1: 0-0 Bracket (4 matches) ===
  // Standard seeding: 1v8, 2v7, 3v6, 4v5
  const r1m1Winner = runMatch(teams[0], teams[7], 1, 1, "0-0");
  const r1m1Loser = getLoser(teams[0], teams[7], r1m1Winner);

  const r1m2Winner = runMatch(teams[1], teams[6], 1, 2, "0-0");
  const r1m2Loser = getLoser(teams[1], teams[6], r1m2Winner);

  const r1m3Winner = runMatch(teams[2], teams[5], 1, 3, "0-0");
  const r1m3Loser = getLoser(teams[2], teams[5], r1m3Winner);

  const r1m4Winner = runMatch(teams[3], teams[4], 1, 4, "0-0");
  const r1m4Loser = getLoser(teams[3], teams[4], r1m4Winner);

  // === ROUND 2: 1-0 Bracket (2 matches) ===
  // Winners play winners
  const r2m1Winner = runMatch(r1m1Winner, r1m2Winner, 2, 1, "1-0");
  const r2m1Loser = getLoser(r1m1Winner, r1m2Winner, r2m1Winner);

  const r2m2Winner = runMatch(r1m3Winner, r1m4Winner, 2, 2, "1-0");
  const r2m2Loser = getLoser(r1m3Winner, r1m4Winner, r2m2Winner);

  // 2-0 teams qualify
  qualified.push(r2m1Winner, r2m2Winner);

  // === ROUND 2: 0-1 Bracket (2 matches) ===
  // Losers play losers
  const r2m3Winner = runMatch(r1m1Loser, r1m2Loser, 2, 3, "0-1");
  const r2m3Loser = getLoser(r1m1Loser, r1m2Loser, r2m3Winner);

  const r2m4Winner = runMatch(r1m3Loser, r1m4Loser, 2, 4, "0-1");
  const r2m4Loser = getLoser(r1m3Loser, r1m4Loser, r2m4Winner);

  // 0-2 teams eliminated
  eliminated.push(r2m3Loser, r2m4Loser);

  // === ROUND 3: 1-1 Bracket (2 matches) ===
  // 1-0 losers vs 0-1 winners
  const r3m1Winner = runMatch(r2m1Loser, r2m3Winner, 3, 1, "1-1");
  const r3m1Loser = getLoser(r2m1Loser, r2m3Winner, r3m1Winner);

  const r3m2Winner = runMatch(r2m2Loser, r2m4Winner, 3, 2, "1-1");
  const r3m2Loser = getLoser(r2m2Loser, r2m4Winner, r3m2Winner);

  // 2-1 teams qualify, 1-2 teams eliminated
  qualified.push(r3m1Winner, r3m2Winner);
  eliminated.push(r3m1Loser, r3m2Loser);

  // Build final standings sorted by: qualified first, then by wins, then by seed
  const finalStandings = Array.from(records.values()).sort((a, b) => {
    const aQualified = qualified.includes(a.team);
    const bQualified = qualified.includes(b.team);
    if (aQualified && !bQualified) return -1;
    if (!aQualified && bQualified) return 1;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.seed - b.seed;
  });

  return {
    qualified,
    eliminated,
    matches: allMatches,
    finalStandings,
  };
}

/**
 * Get the seeding positions from Swiss results for use in playoffs
 */
export function getSwissPlayoffSeeding(result: SwissStageResult): {
  seed1: string;
  seed2: string;
  seed3: string;
  seed4: string;
} {
  return {
    seed1: result.qualified[0] ?? "",
    seed2: result.qualified[1] ?? "",
    seed3: result.qualified[2] ?? "",
    seed4: result.qualified[3] ?? "",
  };
}
