import { Match, TournamentBracket } from "./tournament-bracket";
import { simulateMatch } from "./simulation";

type EloData = Record<string, Record<string, number>>;

export function simulateDoubleEliminationBracket(
  qualifiedTeams: {
    groupA_winner: string;
    groupA_runnerUp: string;
    groupB_winner: string;
    groupB_runnerUp: string;
    groupC_winner: string;
    groupC_runnerUp: string;
    groupD_winner: string;
    groupD_runnerUp: string;
  },
  eloData: EloData
) {
  const bracket: TournamentBracket = {
    // Upper Bracket Round 1
    "UB-R1M1": { team1: qualifiedTeams.groupA_winner, team2: qualifiedTeams.groupB_runnerUp, winner: null, round: 1, matchNumber: 1, id: "UB-R1M1", type: "BO3" },
    "UB-R1M2": { team1: qualifiedTeams.groupC_winner, team2: qualifiedTeams.groupD_runnerUp, winner: null, round: 1, matchNumber: 2, id: "UB-R1M2", type: "BO3" },
    "UB-R1M3": { team1: qualifiedTeams.groupB_winner, team2: qualifiedTeams.groupA_runnerUp, winner: null, round: 1, matchNumber: 3, id: "UB-R1M3", type: "BO3" },
    "UB-R1M4": { team1: qualifiedTeams.groupD_winner, team2: qualifiedTeams.groupC_runnerUp, winner: null, round: 1, matchNumber: 4, id: "UB-R1M4", type: "BO3" },

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
    "LB-FINAL": { team1: "loser-UB-FINAL", team2: "winner-LB-R3M1", winner: null, round: 4, matchNumber: 1, id: "LB-FINAL", type: "BO3" },

    // Grand Final
    "GRAND-FINAL": { team1: "winner-UB-FINAL", team2: "winner-LB-FINAL", winner: null, round: 5, matchNumber: 1, id: "GRAND-FINAL", type: "BO5" },
  };

  const resolveTeam = (
    teamPlaceholder: string | null
  ): string | null => {
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
        match.winner = simulateMatch(
          team1Slug,
          team2Slug,
          match.type,
          eloData
        ).winner;
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
    top3: [winner, runnerUp, thirdPlace].filter(Boolean) as string[],
    top4: top4Teams,
    top6: top6Teams,
    top8: top8Teams,
    finalBracket: bracket,
  };
}
