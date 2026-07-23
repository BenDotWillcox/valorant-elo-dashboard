/**
 * Research artifact contract only. The production API does not import this file.
 * Conditional estimates are predictive associations, not causal effects.
 */
export type PlayerRatingQuery = {
  asOf: Date;
  playerId: number;
  mapName?: string;
  agent?: string;
  teamId?: number;
  teammateAssignments?: Array<{
    playerId: number;
    agent: string;
  }>;
  opponentTeamId?: number;
  forecastMode: "standardized" | "pre-veto" | "post-veto" | "scenario";
};

export type ConditionalRating = {
  performanceMean: number;
  contributionMean: number;
  standardDeviation: number;
  interval80: [number, number];
  interval95: [number, number];
  support: "observed" | "partially-pooled" | "extrapolated";
  decomposition: Record<string, number>;
};

export type ScenarioComparison = {
  baseline: ConditionalRating;
  alternative: ConditionalRating;
  performanceDelta: number;
  contributionDelta: number;
  teamWinProbabilityDelta: number;
  uncertaintyOfDelta: number;
};
