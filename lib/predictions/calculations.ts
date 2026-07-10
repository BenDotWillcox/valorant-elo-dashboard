import { calculateExpectedWinProbability } from "../elo/elo-calculator";

export function calculateWinProbability(elo1: number, elo2: number): [number, number] {
  const prob1 = calculateExpectedWinProbability(elo1, elo2);
  return [prob1, 1 - prob1];
}

export function calculateBo3MatchProbability(mapProbs: [number, number][]): [number, number] {
  const probTeam1 = (
    (mapProbs[0][0] * mapProbs[1][0]) +
    (mapProbs[0][0] * mapProbs[1][1] * mapProbs[2][0]) +
    (mapProbs[0][1] * mapProbs[1][0] * mapProbs[2][0])
  );
  return [probTeam1, 1 - probTeam1];
}

export function calculateBo5MatchProbability(mapProbs: [number, number][]): [number, number] {
  const probTeam1 = (
    (mapProbs[0][0] * mapProbs[1][0] * mapProbs[2][0]) +
    (mapProbs[0][0] * mapProbs[1][0] * mapProbs[2][1] * mapProbs[3][0]) +
    (mapProbs[0][0] * mapProbs[1][0] * mapProbs[2][1] * mapProbs[3][1] * mapProbs[4][0]) +
    (mapProbs[0][0] * mapProbs[1][1] * mapProbs[2][0] * mapProbs[3][0]) +
    (mapProbs[0][0] * mapProbs[1][1] * mapProbs[2][0] * mapProbs[3][1] * mapProbs[4][0]) +
    (mapProbs[0][0] * mapProbs[1][1] * mapProbs[2][1] * mapProbs[3][0] * mapProbs[4][0]) +
    (mapProbs[0][1] * mapProbs[1][0] * mapProbs[2][0] * mapProbs[3][0]) +
    (mapProbs[0][1] * mapProbs[1][0] * mapProbs[2][0] * mapProbs[3][1] * mapProbs[4][0]) +
    (mapProbs[0][1] * mapProbs[1][0] * mapProbs[2][1] * mapProbs[3][0] * mapProbs[4][0]) +
    (mapProbs[0][1] * mapProbs[1][1] * mapProbs[2][0] * mapProbs[3][0] * mapProbs[4][0])
  );
  return [probTeam1, 1 - probTeam1];
}
