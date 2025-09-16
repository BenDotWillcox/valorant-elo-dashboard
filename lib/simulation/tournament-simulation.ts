import { simulateGSLGroup } from "./gsl-group-stage";
import { simulateDoubleEliminationBracket } from "./double-elimination";
import { VCT_CHAMPIONS_2025_SEEDING } from "./tournament-formats/vct-champions-2025";

type EloData = Record<string, Record<string, number>>;

export function simulateFullTournament(eloData: EloData) {
  const groupA_results = simulateGSLGroup("groupA", VCT_CHAMPIONS_2025_SEEDING, eloData);
  const groupB_results = simulateGSLGroup("groupB", VCT_CHAMPIONS_2025_SEEDING, eloData);
  const groupC_results = simulateGSLGroup("groupC", VCT_CHAMPIONS_2025_SEEDING, eloData);
  const groupD_results = simulateGSLGroup("groupD", VCT_CHAMPIONS_2025_SEEDING, eloData);

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
    eloData
  );

  return finalBracketResults;
}

