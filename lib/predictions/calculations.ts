export function calculateWinProbability(elo1: number, elo2: number): [number, number] {
  const prob1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 1000));
  const prob2 = 1 / (1 + Math.pow(10, (elo1 - elo2) / 1000));
  return [prob1, prob2];
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