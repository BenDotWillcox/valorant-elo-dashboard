import { TournamentBracket } from "./tournament-bracket";
import { simulateMatch } from "./simulation";

type EloData = Record<string, Record<string, number>>;
type Seeding = Record<string, string>;

export function simulateGSLGroup(
  groupName: string,
  groupSeeding: Seeding,
  eloData: EloData,
  completedWinners?: Record<string, string>,
  mapPool?: string[]
): { winner: string; runnerUp: string } {
  const bracket: TournamentBracket = {
    [`${groupName}-M1`]: {
      team1: `${groupName}-seed1`,
      team2: `${groupName}-seed4`,
      winner: null,
      round: 1,
      matchNumber: 1,
      id: `${groupName}-M1`,
      type: "BO3",
    },
    [`${groupName}-M2`]: {
      team1: `${groupName}-seed2`,
      team2: `${groupName}-seed3`,
      winner: null,
      round: 1,
      matchNumber: 2,
      id: `${groupName}-M2`,
      type: "BO3",
    },
    [`${groupName}-WM`]: {
      team1: `winner-${groupName}-M1`,
      team2: `winner-${groupName}-M2`,
      winner: null,
      round: 2,
      matchNumber: 1,
      id: `${groupName}-WM`,
      type: "BO3",
    },
    [`${groupName}-EM`]: {
      team1: `loser-${groupName}-M1`,
      team2: `loser-${groupName}-M2`,
      winner: null,
      round: 2,
      matchNumber: 2,
      id: `${groupName}-EM`,
      type: "BO3",
    },
    [`${groupName}-DM`]: {
      team1: `loser-${groupName}-WM`,
      team2: `winner-${groupName}-EM`,
      winner: null,
      round: 3,
      matchNumber: 1,
      id: `${groupName}-DM`,
      type: "BO3",
    },
  };

  const resolveTeam = (
    teamPlaceholder: string | null
  ): string | null => {
    if (!teamPlaceholder) return null;
    if (teamPlaceholder.includes("seed")) {
      return groupSeeding[teamPlaceholder] ?? null;
    }
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

  const winner = resolveTeam(`winner-${groupName}-WM`);
  const runnerUp = resolveTeam(`winner-${groupName}-DM`);

  return { winner: winner!, runnerUp: runnerUp! };
}
