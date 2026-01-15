import { simulateGSLGroup } from "./gsl-group-stage";
import { simulateDoubleEliminationBracket } from "./double-elimination";
import { VCT_CHAMPIONS_2025_SEEDING } from "./tournament-formats/vct-champions-2025";
import type { TournamentSeeding } from "./tournament-formats";
import { MAP_POOL } from "@/lib/constants/maps";

type EloData = Record<string, Record<string, number>>;

export function simulateFullTournament(
  eloData: EloData, 
  completedWinners?: Record<string, string>,
  seeding?: TournamentSeeding,
  mapPool?: string[]
) {
  // Use provided seeding or default to VCT Champions 2025
  const tournamentSeeding = seeding ?? VCT_CHAMPIONS_2025_SEEDING;
  const tournamentMapPool = mapPool ?? MAP_POOL.active;
  
  const groupA_results = simulateGSLGroup("groupA", tournamentSeeding, eloData, completedWinners, tournamentMapPool);
  const groupB_results = simulateGSLGroup("groupB", tournamentSeeding, eloData, completedWinners, tournamentMapPool);
  const groupC_results = simulateGSLGroup("groupC", tournamentSeeding, eloData, completedWinners, tournamentMapPool);
  const groupD_results = simulateGSLGroup("groupD", tournamentSeeding, eloData, completedWinners, tournamentMapPool);

  const qualifiedTeams = {
    groupA_winner: groupA_results.winner,
    groupA_runnerUp: groupA_results.runnerUp,
    groupB_winner: groupB_results.winner,
    groupB_runnerUp: groupB_results.runnerUp,
    groupC_winner: groupC_results.winner,
    groupC_runnerUp: groupC_results.runnerUp,
    groupD_winner: groupD_results.winner,
    groupD_runnerUp: groupD_results.runnerUp,
  };

  const finalBracketResults = simulateDoubleEliminationBracket(
    qualifiedTeams,
    eloData,
    tournamentMapPool
  );

  return finalBracketResults;
}

