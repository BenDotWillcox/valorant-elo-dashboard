export function calculateEloUpdate(
  winElo: number,
  loseElo: number,
  winScore: number,
  loseScore: number,
  k: number = 1000,
  isWinner: boolean = true
): number {
  const scoreDiff = winScore - loseScore;
  
  if (isWinner) {
    return winElo + k * 0.15 * Math.log(5.95 * Math.sqrt(scoreDiff + 1)) * 
      (1 - (1 / (1 + Math.pow(10, (loseElo - winElo) / 1000))));
  } else {
    return loseElo + k * 0.15 * Math.log(5.95 * Math.sqrt(scoreDiff + 1)) * 
      (0 - (1 / (1 + Math.pow(10, (winElo - loseElo) / 1000))));
  }
}

export interface HybridEloConfig {
  initialGlobal: number;
  initialOffset: number;
  ratingScale: number;
  kGlobal: number;
  kOffset: number;
  marginScale: number;
}

export const DEFAULT_CONFIG: HybridEloConfig = {
  initialGlobal: 1000,
  initialOffset: 0,
  ratingScale: 1000,
  kGlobal: 48,
  kOffset: 8,
  marginScale: 1
};

export function calculateHybridEloUpdate(
  winnerGlobalRating: number,
  winnerMapOffset: number,
  loserGlobalRating: number,
  loserMapOffset: number,
  winnerScore: number,
  loserScore: number,
  mapName: string,
  config: HybridEloConfig = DEFAULT_CONFIG
) {
  const winnerEffective = winnerGlobalRating + winnerMapOffset;
  const loserEffective = loserGlobalRating + loserMapOffset;
  
  const expectedProbability = 1 / (1 + Math.pow(10, (loserEffective - winnerEffective) / config.ratingScale));
  
  let marginFactor = 1;
  if (config.marginScale > 0) {
    const scoreDiff = Math.max(winnerScore - loserScore, 0);
    marginFactor = config.marginScale * Math.log(5.95 * Math.sqrt(scoreDiff + 1));
  }

  const updateFactor = marginFactor * (1 - expectedProbability);

  const newWinnerGlobal = winnerGlobalRating + config.kGlobal * updateFactor;
  const newWinnerOffset = winnerMapOffset + config.kOffset * updateFactor;
  const newLoserGlobal = loserGlobalRating - config.kGlobal * updateFactor;
  const newLoserOffset = loserMapOffset - config.kOffset * updateFactor;

  return {
    winner: {
      global_rating: newWinnerGlobal,
      map_offset: newWinnerOffset
    },
    loser: {
      global_rating: newLoserGlobal,
      map_offset: newLoserOffset
    }
  };
} 