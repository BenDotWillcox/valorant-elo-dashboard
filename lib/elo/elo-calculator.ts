export interface MapEloConfig {
  initialRating: number;
  ratingScale: number;
  kFactor: number;
  marginScale: number;
}

export const DEFAULT_MAP_CONFIG: MapEloConfig = {
  initialRating: 1000,
  ratingScale: 1000, // The divisor for Elo difference
  kFactor: 74, // Form = Higher, Class = Lower
  marginScale: 1, // Scales the margin-of-victory bonus
};

function assertFiniteNumber(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

export const MAP_ELO_MODEL_VERSION = "map-elo-v1.0.0";

export function validateMapEloConfig(config: MapEloConfig) {
  assertFiniteNumber(config.initialRating, "initialRating");
  assertFiniteNumber(config.ratingScale, "ratingScale");
  assertFiniteNumber(config.kFactor, "kFactor");
  assertFiniteNumber(config.marginScale, "marginScale");

  if (config.ratingScale <= 0) {
    throw new RangeError("ratingScale must be greater than zero.");
  }

  if (config.kFactor < 0) {
    throw new RangeError("kFactor must be zero or greater.");
  }

  if (config.marginScale < 0) {
    throw new RangeError("marginScale must be zero or greater.");
  }
}

export function calculateExpectedWinProbability(
  rating: number,
  opponentRating: number,
  ratingScale: number = DEFAULT_MAP_CONFIG.ratingScale
) {
  assertFiniteNumber(rating, "rating");
  assertFiniteNumber(opponentRating, "opponentRating");
  assertFiniteNumber(ratingScale, "ratingScale");

  if (ratingScale <= 0) {
    throw new RangeError("ratingScale must be greater than zero.");
  }

  return 1 / (1 + Math.pow(10, (opponentRating - rating) / ratingScale));
}

export function calculateMapEloUpdate(
  winnerRating: number,
  loserRating: number,
  winnerScore: number,
  loserScore: number,
  config: MapEloConfig = DEFAULT_MAP_CONFIG
) {
  assertFiniteNumber(winnerRating, "winnerRating");
  assertFiniteNumber(loserRating, "loserRating");
  assertFiniteNumber(winnerScore, "winnerScore");
  assertFiniteNumber(loserScore, "loserScore");
  validateMapEloConfig(config);

  if (!Number.isInteger(winnerScore) || !Number.isInteger(loserScore)) {
    throw new RangeError("winnerScore and loserScore must be integers.");
  }

  if (winnerScore < 0 || loserScore < 0) {
    throw new RangeError("winnerScore and loserScore must be zero or greater.");
  }

  if (winnerScore <= loserScore) {
    throw new RangeError("winnerScore must be greater than loserScore.");
  }

  const expectedProbability = calculateExpectedWinProbability(
    winnerRating,
    loserRating,
    config.ratingScale
  );

  const scoreDiff = winnerScore - loserScore;
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
