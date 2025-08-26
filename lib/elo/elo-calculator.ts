export interface MapEloConfig {
  initialRating: number;
  ratingScale: number;
  kFactor: number;
  marginScale: number;
}

export const DEFAULT_MAP_CONFIG: MapEloConfig = {
  initialRating: 1000,
  ratingScale: 2000, // The divisor for Elo difference
  kFactor: 74, // Max Elo change for a single match
  marginScale: 1, // Scales the margin-of-victory bonus
};

export function calculateMapEloUpdate(
  winnerRating: number,
  loserRating: number,
  winnerScore: number,
  loserScore: number,
  config: MapEloConfig = DEFAULT_MAP_CONFIG
) {
  const expectedProbability = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / config.ratingScale));
  
  const scoreDiff = Math.max(winnerScore - loserScore, 0);
  const marginFactor = config.marginScale > 0 
    ? config.marginScale * Math.log(5.95 * Math.sqrt(scoreDiff + 1))
    : 1;

  const eloChange = config.kFactor * marginFactor * (1 - expectedProbability);

  const newWinnerRating = winnerRating + eloChange;
  const newLoserRating = loserRating - eloChange;

  return {
    winnerRating: newWinnerRating,
    loserRating: newLoserRating,
  };
} 