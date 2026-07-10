import {
  DEFAULT_BOOTSTRAP_ITERATIONS,
  DEFAULT_BOOTSTRAP_SEED,
  bootstrapIntervals,
  calculateMetrics,
  pairedBootstrapDeltas,
  type BacktestPrediction,
  type ConfidenceInterval,
  type MetricName,
  type PointMetrics,
  type SplitName,
  type TemporalSplitConfig,
} from "./backtest";
import {
  calculateBo3MatchProbability,
  calculateBo5MatchProbability,
  calculateWinProbability,
} from "../predictions/calculations";
import { scorePickBanVetoSequence } from "./pick-ban-policy";

export const PICK_BAN_BACKTEST_SCHEMA_VERSION = "1.0.0";
export const PICK_BAN_BACKTEST_IMPLEMENTATION_VERSION = "pick-ban-outcome-v1";
export const PICK_BAN_COLD_START_RATING = 1000;
export const PICK_BAN_SUPPORTED_MAP_POOL_SIZE = 7;

const EPSILON = 1e-12;
const LOGISTIC_RIDGE = 1;
const LOGISTIC_ITERATIONS = 100;
const LOGISTIC_COEFFICIENT_LIMIT = 12;
const MIN_LOGISTIC_ROWS = 20;
const MIN_LOGISTIC_OUTCOMES_PER_CLASS = 5;
const ASSOCIATION_MIN_BLOCKS = 5;
const ASSOCIATION_METHOD =
  "deterministic-event-cluster-bootstrap-percentile" as const;

export type PickBanIssueCategory =
  | "missing_required"
  | "invalid_value"
  | "duplicate_match"
  | "duplicate_veto_order"
  | "gapped_veto_order"
  | "duplicate_veto_map"
  | "unsupported_best_of"
  | "unsupported_map_pool"
  | "invalid_veto_sequence"
  | "invalid_played_map";

export type PickBanOutcomeTrack =
  | "neutral"
  | "preVetoPoolElo"
  | "selectedMapSeriesElo"
  | "calibratedSelectedMap"
  | "calibratedSelectedMapPlusRegret";

export interface RawPickBanVeto {
  orderIndex: number;
  action: string;
  mapName: string;
  teamId?: string | number | null;
  resultedGameNumber?: number | null;
}

export interface RawPickBanPlayedMap {
  gameNumber: number;
  mapName: string;
  winnerTeamId: string | number;
}

export interface RawPickBanMatch {
  matchId: string | number;
  /** Feature cutoff; the DB runner supplies completed_at because start is not stored. */
  startedAt: string | Date;
  event?: string | null;
  region?: string | null;
  bestOf: number;
  team1Id: string | number;
  team2Id: string | number;
  team1Score: number;
  team2Score: number;
  vetoes: RawPickBanVeto[];
  playedMaps: RawPickBanPlayedMap[];
}

export interface RawPickBanEloRating {
  ratingId?: string | number | null;
  /** Stable extraction order used only after rating timestamp/id ties. */
  sourceOrdinal?: number;
  teamId: string | number;
  mapName: string;
  rating: number;
  ratingDate: string | Date;
  /** When present, ratings sourced from the target match are never eligible. */
  sourceMatchId?: string | number | null;
}

export interface PickBanBacktestInput {
  matches: RawPickBanMatch[];
  eloRatings: RawPickBanEloRating[];
}

export interface PickBanBacktestOptions {
  split: TemporalSplitConfig;
  bootstrapIterations?: number;
  bootstrapSeed?: number;
}

export interface PickBanDataIssue {
  matchId: string | null;
  category: PickBanIssueCategory;
  message: string;
}

export interface PickBanDataQuality {
  receivedMatches: number;
  acceptedMatches: number;
  rejectedMatches: number;
  issueCounts: Record<PickBanIssueCategory, number>;
  issues: PickBanDataIssue[];
  ratingRows: {
    received: number;
    accepted: number;
    invalid: number;
  };
}

export type LogisticFitFallbackReason =
  | "insufficient_rows"
  | "insufficient_outcome_variation"
  | "insufficient_feature_variation"
  | "singular_information"
  | "non_finite_update"
  | "coefficient_limit"
  | "not_converged";

export interface LogisticCoefficients {
  status: "fitted" | "identity-fallback" | "selected-map-fallback";
  fallbackReason: LogisticFitFallbackReason | null;
  intercept: number;
  selectedMapLogit: number;
  relativeRegretPer100: number | null;
  trainingRows: number;
  trainingWins: number;
  trainingLosses: number;
  converged: boolean;
  iterations: number;
  ridge: number;
}

export interface PickBanOutcomePrediction {
  matchId: string;
  split: "validation" | "test";
  startedAt: string;
  teamAId: string;
  teamBId: string;
  teamAWon: boolean;
  teamARegret: number;
  teamBRegret: number;
  relativeRegretTeamA: number;
  probabilities: Record<PickBanOutcomeTrack, number>;
}

export interface TrackEvaluation {
  metrics: PointMetrics;
  intervals95: Record<MetricName, ConfidenceInterval>;
  accuracyDecisionInformative: boolean;
  accuracyInterpretation: string;
}

export interface AssociationClusterInterval {
  estimate: number;
  lower95: number;
  upper95: number;
}

export interface AssociationUncertainty {
  method: typeof ASSOCIATION_METHOD;
  seed: number;
  iterations: number;
  blockCount: number;
  minimumBlocks: typeof ASSOCIATION_MIN_BLOCKS;
  interval95: AssociationClusterInterval | null;
}

export interface AssociationBand {
  lowerInclusive: number;
  upperExclusive: number | null;
  n: number;
  successes: number;
  rate: number | null;
  uncertainty: AssociationUncertainty;
}

export interface PickBanTemporalBacktestResult {
  schemaVersion: string;
  implementationVersion: string;
  dataQuality: PickBanDataQuality;
  split: {
    boundaries: TemporalSplitConfig;
    boundarySemantics: "[start, end) in UTC";
    counts: Record<SplitName, number>;
    excludedAtOrAfterTestEnd: number;
  };
  methodology: {
    unit: "completed match";
    orientation: string;
    ratingPolicy: string;
    seasonPolicy: string;
    fittingPolicy: string;
    regretPolicy: string;
    preVetoPoolEloDefinition: string;
    neutralAccuracyPolicy: {
      decisionInformative: false;
      displayPolicy: "suppress";
      reason: string;
    };
  };
  coldStartCoverage: {
    lookups: number;
    coldStartLookups: number;
    coldStartRate: number;
    matchesWithColdStart: number;
    bySplit: Record<SplitName, {
      lookups: number;
      coldStartLookups: number;
      matchesWithColdStart: number;
    }>;
  };
  coefficients: {
    validation: {
      trainedOn: "train";
      selectedMap: LogisticCoefficients;
      selectedMapPlusRegret: LogisticCoefficients;
    };
    test: {
      trainedOn: "train+validation";
      selectedMap: LogisticCoefficients;
      selectedMapPlusRegret: LogisticCoefficients;
    };
  };
  validation: Record<PickBanOutcomeTrack, TrackEvaluation>;
  holdout: Record<PickBanOutcomeTrack, TrackEvaluation>;
  pairedHoldoutDeltaRegretVsCalibratedSelectedMap: Record<MetricName, ConfidenceInterval>;
  associations: {
    lowerRegretTeamHoldout: {
      holdoutMatches: number;
      includedMatches: number;
      regretTiesExcluded: number;
      inclusionRate: number;
      holdoutMatchesWithColdStart: number;
      includedMatchesWithColdStart: number;
      n: number;
      wins: number;
      winRate: number | null;
      uncertainty: AssociationUncertainty;
    };
    regretGapBands: AssociationBand[];
    pickedMapOutcomeCoverage: {
      totalPickDecisions: number;
      eligibleGuaranteedPlayedBo3Picks: number;
      included: number;
      excluded: number;
      excludedNonBo3: number;
      excludedUnresolvedOutcome: number;
    };
    observedPickedMapWinRatesByRegretBand: AssociationBand[];
  };
  predictions: {
    validation: PickBanOutcomePrediction[];
    test: PickBanOutcomePrediction[];
  };
  limitations: string[];
  conclusion: {
    causal: false;
    statement: string;
  };
}

interface NormalizedVeto {
  orderIndex: number;
  action: "pick" | "ban" | "decider";
  mapName: string;
  mapKey: string;
  teamId: string | null;
  resultedGameNumber: number | null;
}

interface NormalizedPlayedMap {
  gameNumber: number;
  mapName: string;
  mapKey: string;
  winnerTeamId: string;
}

interface NormalizedMatch {
  matchId: string;
  startedAt: string;
  timestampMs: number;
  event: string | null;
  region: string | null;
  bestOf: 3 | 5;
  teamAId: string;
  teamBId: string;
  teamAWon: boolean;
  vetoes: NormalizedVeto[];
  playedMaps: NormalizedPlayedMap[];
  selectedMaps: NormalizedVeto[];
  initialMapPool: Array<{ mapName: string; mapKey: string }>;
}

interface NormalizedRating {
  ratingId: string | null;
  numericRatingId: bigint | null;
  sourceOrdinal: number;
  teamId: string;
  mapKey: string;
  rating: number;
  timestampMs: number;
  sourceMatchId: string | null;
}

interface VetoDecisionScore {
  veto: NormalizedVeto;
  regret: number;
}

interface MatchFeature {
  match: NormalizedMatch;
  split: SplitName;
  preVetoProbabilityTeamA: number;
  selectedMapProbabilityTeamA: number;
  teamARegret: number;
  teamBRegret: number;
  relativeRegretTeamA: number;
  vetoDecisionScores: VetoDecisionScore[];
  ratingLookups: number;
  coldStartLookups: number;
}

const ISSUE_CATEGORIES: PickBanIssueCategory[] = [
  "missing_required",
  "invalid_value",
  "duplicate_match",
  "duplicate_veto_order",
  "gapped_veto_order",
  "duplicate_veto_map",
  "unsupported_best_of",
  "unsupported_map_pool",
  "invalid_veto_sequence",
  "invalid_played_map",
];

const OUTCOME_TRACKS: PickBanOutcomeTrack[] = [
  "neutral",
  "preVetoPoolElo",
  "selectedMapSeriesElo",
  "calibratedSelectedMap",
  "calibratedSelectedMapPlusRegret",
];

const REGRET_BANDS = [
  { lowerInclusive: 0, upperExclusive: 25 },
  { lowerInclusive: 25, upperExclusive: 50 },
  { lowerInclusive: 50, upperExclusive: 100 },
  { lowerInclusive: 100, upperExclusive: null },
] as const;

function emptyIssueCounts(): Record<PickBanIssueCategory, number> {
  return Object.fromEntries(ISSUE_CATEGORIES.map((category) => [category, 0])) as Record<
    PickBanIssueCategory,
    number
  >;
}

function emptySplitCoverage() {
  return {
    train: { lookups: 0, coldStartLookups: 0, matchesWithColdStart: 0 },
    validation: { lookups: 0, coldStartLookups: 0, matchesWithColdStart: 0 },
    test: { lookups: 0, coldStartLookups: 0, matchesWithColdStart: 0 },
  } satisfies PickBanTemporalBacktestResult["coldStartCoverage"]["bySplit"];
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMap(value: unknown): { mapName: string; mapKey: string } {
  const mapName = String(value ?? "").trim();
  return { mapName, mapKey: mapName.toLocaleLowerCase("en-US") };
}

function parseTimestamp(value: string | Date): { ms: number; iso: string } | null {
  if (
    typeof value === "string" &&
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())
  ) {
    return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? { ms, iso: date.toISOString() } : null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseBoundary(value: string, name: string): number {
  const parsed = parseTimestamp(value);
  if (!parsed) throw new RangeError(`${name} must be a valid timestamp.`);
  return parsed.ms;
}

function validateSplit(split: TemporalSplitConfig) {
  const trainEndMs = parseBoundary(split.trainEndExclusive, "trainEndExclusive");
  const validationEndMs = parseBoundary(
    split.validationEndExclusive,
    "validationEndExclusive"
  );
  const testEndMs =
    split.testEndExclusive === null
      ? Number.POSITIVE_INFINITY
      : parseBoundary(split.testEndExclusive, "testEndExclusive");
  if (trainEndMs >= validationEndMs) {
    throw new RangeError("trainEndExclusive must be before validationEndExclusive.");
  }
  if (validationEndMs >= testEndMs) {
    throw new RangeError("validationEndExclusive must be before testEndExclusive.");
  }
  return { trainEndMs, validationEndMs, testEndMs };
}

function splitForTimestamp(
  timestampMs: number,
  boundaries: ReturnType<typeof validateSplit>
): SplitName | null {
  if (timestampMs < boundaries.trainEndMs) return "train";
  if (timestampMs < boundaries.validationEndMs) return "validation";
  if (timestampMs < boundaries.testEndMs) return "test";
  return null;
}

function expectedVetoActions(bestOf: 3 | 5): Array<NormalizedVeto["action"]> {
  return bestOf === 3
    ? ["ban", "ban", "pick", "pick", "ban", "ban", "decider"]
    : ["ban", "ban", "pick", "pick", "pick", "pick", "decider"];
}

function numericRatingId(value: string | null): bigint | null {
  return value !== null && /^\d+$/.test(value) ? BigInt(value) : null;
}

function compareRatingIds(a: NormalizedRating, b: NormalizedRating): number {
  const aKind = a.numericRatingId !== null ? 2 : a.ratingId !== null ? 1 : 0;
  const bKind = b.numericRatingId !== null ? 2 : b.ratingId !== null ? 1 : 0;
  if (aKind !== bKind) return aKind - bKind;
  if (a.numericRatingId !== null && b.numericRatingId !== null) {
    if (a.numericRatingId < b.numericRatingId) return -1;
    if (a.numericRatingId > b.numericRatingId) return 1;
  } else if (a.ratingId !== null && b.ratingId !== null) {
    const textOrder = compareText(a.ratingId, b.ratingId);
    if (textOrder !== 0) return textOrder;
  }
  return a.sourceOrdinal - b.sourceOrdinal;
}

function normalizeRatings(rows: RawPickBanEloRating[]): {
  rows: NormalizedRating[];
  received: number;
  invalid: number;
} {
  const normalized: NormalizedRating[] = [];
  let invalid = 0;
  rows.forEach((row, index) => {
    const teamId = normalizeIdentifier(row.teamId);
    const map = normalizeMap(row.mapName);
    const timestamp = parseTimestamp(row.ratingDate);
    const ratingId = normalizeIdentifier(row.ratingId) || null;
    const sourceOrdinal = row.sourceOrdinal ?? index + 1;
    if (
      !teamId ||
      !map.mapKey ||
      !timestamp ||
      !Number.isFinite(row.rating) ||
      !Number.isSafeInteger(sourceOrdinal) ||
      sourceOrdinal < 1
    ) {
      invalid += 1;
      return;
    }
    normalized.push({
      ratingId,
      numericRatingId: numericRatingId(ratingId),
      sourceOrdinal,
      teamId,
      mapKey: map.mapKey,
      rating: row.rating,
      timestampMs: timestamp.ms,
      sourceMatchId: normalizeIdentifier(row.sourceMatchId) || null,
    });
  });
  normalized.sort(
    (a, b) =>
      compareText(a.teamId, b.teamId) ||
      compareText(a.mapKey, b.mapKey) ||
      a.timestampMs - b.timestampMs ||
      compareRatingIds(a, b)
  );
  return { rows: normalized, received: rows.length, invalid };
}

function normalizeMatches(
  rows: RawPickBanMatch[],
  ratingAudit: ReturnType<typeof normalizeRatings>
): { matches: NormalizedMatch[]; quality: PickBanDataQuality } {
  const issueCounts = emptyIssueCounts();
  const issues: PickBanDataIssue[] = [];
  const normalizedMatches: NormalizedMatch[] = [];
  const idCounts = new Map<string, number>();

  for (const row of rows) {
    const matchId = normalizeIdentifier(row.matchId);
    if (matchId) idCounts.set(matchId, (idCounts.get(matchId) ?? 0) + 1);
  }

  const ordered = rows
    .map((row, sourceIndex) => ({ row, sourceIndex, matchId: normalizeIdentifier(row.matchId) }))
    .sort(
      (a, b) =>
        compareText(a.matchId, b.matchId) ||
        compareText(String(a.row.startedAt), String(b.row.startedAt)) ||
        a.sourceIndex - b.sourceIndex
    );

  for (const { row, matchId } of ordered) {
    const matchIssues = new Map<PickBanIssueCategory, string>();
    const addIssue = (category: PickBanIssueCategory, message: string) => {
      if (!matchIssues.has(category)) matchIssues.set(category, message);
    };

    const timestamp = parseTimestamp(row.startedAt);
    const sourceTeam1Id = normalizeIdentifier(row.team1Id);
    const sourceTeam2Id = normalizeIdentifier(row.team2Id);
    if (!matchId || !timestamp || !sourceTeam1Id || !sourceTeam2Id) {
      addIssue(
        "missing_required",
        "matchId, startedAt, team1Id, and team2Id are required."
      );
    }
    if (matchId && (idCounts.get(matchId) ?? 0) > 1) {
      addIssue("duplicate_match", "Every matchId must identify exactly one source match.");
    }
    if (sourceTeam1Id && sourceTeam1Id === sourceTeam2Id) {
      addIssue("invalid_value", "The two match participants must be different teams.");
    }

    const supportedBestOf = row.bestOf === 3 || row.bestOf === 5;
    if (!supportedBestOf) {
      addIssue("unsupported_best_of", "Only standard BO3 and BO5 matches are supported.");
    }
    const winsNeeded = supportedBestOf ? Math.floor(row.bestOf / 2) + 1 : 0;
    if (
      !Number.isSafeInteger(row.team1Score) ||
      !Number.isSafeInteger(row.team2Score) ||
      row.team1Score < 0 ||
      row.team2Score < 0 ||
      row.team1Score === row.team2Score ||
      (supportedBestOf &&
        (Math.max(row.team1Score, row.team2Score) !== winsNeeded ||
          Math.min(row.team1Score, row.team2Score) >= winsNeeded))
    ) {
      addIssue("invalid_value", "Match scores must describe a completed, untied series.");
    }

    const vetoRows = Array.isArray(row.vetoes) ? row.vetoes : [];
    if (vetoRows.length === 0) {
      addIssue("missing_required", "At least one ordered veto is required.");
    }
    const normalizedVetoes: NormalizedVeto[] = [];
    let invalidVetoValue = false;
    for (const veto of vetoRows) {
      const map = normalizeMap(veto.mapName);
      const action = String(veto.action ?? "").trim().toLocaleLowerCase("en-US");
      const teamId = normalizeIdentifier(veto.teamId) || null;
      const resultedGameNumber =
        veto.resultedGameNumber === null || veto.resultedGameNumber === undefined
          ? null
          : veto.resultedGameNumber;
      if (
        !Number.isSafeInteger(veto.orderIndex) ||
        veto.orderIndex < 1 ||
        !map.mapKey ||
        (action !== "pick" && action !== "ban" && action !== "decider") ||
        (resultedGameNumber !== null &&
          (!Number.isSafeInteger(resultedGameNumber) || resultedGameNumber < 1))
      ) {
        invalidVetoValue = true;
        continue;
      }
      normalizedVetoes.push({
        orderIndex: veto.orderIndex,
        action,
        mapName: map.mapName,
        mapKey: map.mapKey,
        teamId,
        resultedGameNumber,
      });
    }
    if (invalidVetoValue || normalizedVetoes.length !== vetoRows.length) {
      addIssue("invalid_value", "Veto values must have a positive order, known action, and map.");
    }
    normalizedVetoes.sort(
      (a, b) => a.orderIndex - b.orderIndex || compareText(a.mapKey, b.mapKey)
    );

    const orderCounts = new Map<number, number>();
    const mapCounts = new Map<string, number>();
    for (const veto of normalizedVetoes) {
      orderCounts.set(veto.orderIndex, (orderCounts.get(veto.orderIndex) ?? 0) + 1);
      mapCounts.set(veto.mapKey, (mapCounts.get(veto.mapKey) ?? 0) + 1);
    }
    if (Array.from(orderCounts.values()).some((count) => count > 1)) {
      addIssue("duplicate_veto_order", "A veto order may occur only once per match.");
    }
    if (
      normalizedVetoes.some((veto, index) => veto.orderIndex !== index + 1)
    ) {
      addIssue("gapped_veto_order", "Veto orders must be the contiguous sequence 1..N.");
    }
    if (Array.from(mapCounts.values()).some((count) => count > 1)) {
      addIssue("duplicate_veto_map", "A map may be removed from the pool only once.");
    }
    if (
      normalizedVetoes.length !== PICK_BAN_SUPPORTED_MAP_POOL_SIZE ||
      mapCounts.size !== PICK_BAN_SUPPORTED_MAP_POOL_SIZE
    ) {
      addIssue(
        "unsupported_map_pool",
        `A supported match must expose exactly ${PICK_BAN_SUPPORTED_MAP_POOL_SIZE} distinct veto maps.`
      );
    }

    if (supportedBestOf) {
      const bestOf = row.bestOf as 3 | 5;
      const expectedActions = expectedVetoActions(bestOf);
      const wrongActions =
        normalizedVetoes.length !== expectedActions.length ||
        normalizedVetoes.some((veto, index) => veto.action !== expectedActions[index]);
      const invalidActors = normalizedVetoes.some((veto) =>
        veto.action === "decider"
          ? veto.teamId !== null
          : veto.teamId !== sourceTeam1Id && veto.teamId !== sourceTeam2Id
      );
      const actionableVetoes = normalizedVetoes.filter(
        (veto) => veto.action !== "decider"
      );
      const actorsDoNotAlternate = actionableVetoes.some(
        (veto, index) =>
          index > 0 && veto.teamId === actionableVetoes[index - 1].teamId
      );
      if (wrongActions || invalidActors || actorsDoNotAlternate) {
        addIssue(
          "invalid_veto_sequence",
          "The action sequence must match the standard series format and non-decider actors must alternate."
        );
      }
      const selected = normalizedVetoes.filter(
        (veto) => veto.action === "pick" || veto.action === "decider"
      );
      if (selected.length !== bestOf) {
        addIssue(
          "invalid_veto_sequence",
          "The veto sequence must select exactly bestOf maps."
        );
      }
      const suppliedGameNumbers = selected
        .map((veto) => veto.resultedGameNumber)
        .filter((value): value is number => value !== null);
      if (
        suppliedGameNumbers.some((value) => value > bestOf) ||
        new Set(suppliedGameNumbers).size !== suppliedGameNumbers.length
      ) {
        addIssue(
          "invalid_veto_sequence",
          "Selected-map game numbers must be unique and within the series length."
        );
      }
    }

    const playedRows = Array.isArray(row.playedMaps) ? row.playedMaps : [];
    if (playedRows.length === 0) {
      addIssue("missing_required", "At least one played map is required.");
    }
    const normalizedPlayedMaps: NormalizedPlayedMap[] = [];
    for (const played of playedRows) {
      const map = normalizeMap(played.mapName);
      const winnerTeamId = normalizeIdentifier(played.winnerTeamId);
      if (
        !Number.isSafeInteger(played.gameNumber) ||
        played.gameNumber < 1 ||
        !map.mapKey ||
        (winnerTeamId !== sourceTeam1Id && winnerTeamId !== sourceTeam2Id)
      ) {
        addIssue("invalid_played_map", "Played-map values are invalid.");
        continue;
      }
      normalizedPlayedMaps.push({
        gameNumber: played.gameNumber,
        mapName: map.mapName,
        mapKey: map.mapKey,
        winnerTeamId,
      });
    }
    normalizedPlayedMaps.sort(
      (a, b) => a.gameNumber - b.gameNumber || compareText(a.mapKey, b.mapKey)
    );
    const playedGameNumbers = normalizedPlayedMaps.map((map) => map.gameNumber);
    const playedMapKeys = normalizedPlayedMaps.map((map) => map.mapKey);
    const selectedMapKeys = new Set(
      normalizedVetoes
        .filter((veto) => veto.action === "pick" || veto.action === "decider")
        .map((veto) => veto.mapKey)
    );
    if (
      normalizedPlayedMaps.length !== row.team1Score + row.team2Score ||
      normalizedPlayedMaps.filter((map) => map.winnerTeamId === sourceTeam1Id)
        .length !== row.team1Score ||
      normalizedPlayedMaps.filter((map) => map.winnerTeamId === sourceTeam2Id)
        .length !== row.team2Score ||
      playedGameNumbers.some((gameNumber, index) => gameNumber !== index + 1) ||
      new Set(playedMapKeys).size !== playedMapKeys.length ||
      playedMapKeys.some((mapKey) => !selectedMapKeys.has(mapKey))
    ) {
      addIssue(
        "invalid_played_map",
        "Played maps must be contiguous, unique, selected by the veto, and match the series score."
      );
    }
    for (const selected of normalizedVetoes.filter(
      (veto) => veto.resultedGameNumber !== null
    )) {
      const played = normalizedPlayedMaps.find(
        (map) => map.gameNumber === selected.resultedGameNumber
      );
      if (!played || played.mapKey !== selected.mapKey) {
        addIssue(
          "invalid_played_map",
          "Every non-null resultedGameNumber must resolve to the same played map."
        );
      }
    }

    if (matchIssues.size > 0) {
      for (const category of ISSUE_CATEGORIES) {
        const message = matchIssues.get(category);
        if (!message) continue;
        issueCounts[category] += 1;
        issues.push({ matchId: matchId || null, category, message });
      }
      continue;
    }

    const teamAId = [sourceTeam1Id, sourceTeam2Id].sort(compareText)[0];
    const teamBId = teamAId === sourceTeam1Id ? sourceTeam2Id : sourceTeam1Id;
    const teamAWon =
      teamAId === sourceTeam1Id
        ? row.team1Score > row.team2Score
        : row.team2Score > row.team1Score;
    const selectedMaps = normalizedVetoes.filter(
      (veto) => veto.action === "pick" || veto.action === "decider"
    );
    const hasCompleteGameOrder = selectedMaps.every(
      (veto) => veto.resultedGameNumber !== null
    );
    selectedMaps.sort((a, b) =>
      hasCompleteGameOrder
        ? a.resultedGameNumber! - b.resultedGameNumber!
        : a.orderIndex - b.orderIndex
    );
    normalizedMatches.push({
      matchId,
      startedAt: timestamp!.iso,
      timestampMs: timestamp!.ms,
      event: String(row.event ?? "").trim() || null,
      region: String(row.region ?? "").trim() || null,
      bestOf: row.bestOf as 3 | 5,
      teamAId,
      teamBId,
      teamAWon,
      vetoes: normalizedVetoes,
      playedMaps: normalizedPlayedMaps,
      selectedMaps,
      initialMapPool: normalizedVetoes
        .map((veto) => ({ mapName: veto.mapName, mapKey: veto.mapKey }))
        .sort((a, b) => compareText(a.mapKey, b.mapKey)),
    });
  }

  normalizedMatches.sort(
    (a, b) => a.timestampMs - b.timestampMs || compareText(a.matchId, b.matchId)
  );
  return {
    matches: normalizedMatches,
    quality: {
      receivedMatches: rows.length,
      acceptedMatches: normalizedMatches.length,
      rejectedMatches: rows.length - normalizedMatches.length,
      issueCounts,
      issues,
      ratingRows: {
        received: ratingAudit.received,
        accepted: ratingAudit.rows.length,
        invalid: ratingAudit.invalid,
      },
    },
  };
}

class StrictRatingIndex {
  private readonly ratings = new Map<string, NormalizedRating[]>();

  constructor(rows: NormalizedRating[]) {
    for (const row of rows) {
      const key = `${row.teamId}\u0000${row.mapKey}`;
      const ratings = this.ratings.get(key) ?? [];
      ratings.push(row);
      this.ratings.set(key, ratings);
    }
  }

  lookup(
    teamId: string,
    mapKey: string,
    matchId: string,
    matchTimestampMs: number
  ): { rating: number; coldStart: boolean } {
    const matchYear = new Date(matchTimestampMs).getUTCFullYear();
    const candidates = this.ratings.get(`${teamId}\u0000${mapKey}`) ?? [];
    let selected: NormalizedRating | null = null;
    for (const candidate of candidates) {
      if (candidate.timestampMs >= matchTimestampMs) continue;
      if (new Date(candidate.timestampMs).getUTCFullYear() !== matchYear) continue;
      if (candidate.sourceMatchId === matchId) continue;
      selected = candidate;
    }
    return selected
      ? { rating: selected.rating, coldStart: false }
      : { rating: PICK_BAN_COLD_START_RATING, coldStart: true };
  }
}

interface MapRatingPair {
  mapName: string;
  mapKey: string;
  teamARating: number;
  teamBRating: number;
  probabilityTeamA: number;
  teamAColdStart: boolean;
  teamBColdStart: boolean;
}

function scoreVetoDecisions(
  match: NormalizedMatch,
  ratingsByMap: Map<string, MapRatingPair>
): {
  teamARegret: number;
  teamBRegret: number;
  decisions: VetoDecisionScore[];
} {
  // The shared production policy accepts numeric ids. Stable local ids retain
  // lexical team orientation without coercing source identifiers.
  const TEAM_A_POLICY_ID = 1;
  const TEAM_B_POLICY_ID = 2;
  const score = scorePickBanVetoSequence({
    team1Id: TEAM_A_POLICY_ID,
    team2Id: TEAM_B_POLICY_ID,
    vetoes: match.vetoes.map((veto) => ({
      orderIndex: veto.orderIndex,
      action: veto.action,
      mapName: veto.mapKey,
      teamId:
        veto.teamId === null
          ? null
          : veto.teamId === match.teamAId
            ? TEAM_A_POLICY_ID
            : TEAM_B_POLICY_ID,
    })),
    team1Ratings: Array.from(ratingsByMap.values()).map((ratings) => ({
      mapName: ratings.mapKey,
      rating: ratings.teamARating,
    })),
    team2Ratings: Array.from(ratingsByMap.values()).map((ratings) => ({
      mapName: ratings.mapKey,
      rating: ratings.teamBRating,
    })),
  });
  const vetoByOrder = new Map(match.vetoes.map((veto) => [veto.orderIndex, veto]));
  return {
    teamARegret: score.team1CumulativeEloLost,
    teamBRegret: score.team2CumulativeEloLost,
    decisions: score.steps.map((step) => ({
      veto: vetoByOrder.get(step.vetoOrder)!,
      regret: Math.max(0, Math.abs(step.eloLost) < EPSILON ? 0 : step.eloLost),
    })),
  };
}

function seriesProbability(probabilities: number[], bestOf: 3 | 5): number {
  if (probabilities.length !== bestOf) {
    throw new Error(`A BO${bestOf} series requires exactly ${bestOf} map probabilities.`);
  }
  const mapProbabilities = probabilities.map(
    (probability) => [probability, 1 - probability] as [number, number]
  );
  return bestOf === 3
    ? calculateBo3MatchProbability(mapProbabilities)[0]
    : calculateBo5MatchProbability(mapProbabilities)[0];
}

function buildFeature(
  match: NormalizedMatch,
  split: SplitName,
  ratingIndex: StrictRatingIndex
): MatchFeature {
  const ratingsByMap = new Map<string, MapRatingPair>();
  let coldStartLookups = 0;
  for (const map of match.initialMapPool) {
    const teamA = ratingIndex.lookup(
      match.teamAId,
      map.mapKey,
      match.matchId,
      match.timestampMs
    );
    const teamB = ratingIndex.lookup(
      match.teamBId,
      map.mapKey,
      match.matchId,
      match.timestampMs
    );
    coldStartLookups += Number(teamA.coldStart) + Number(teamB.coldStart);
    ratingsByMap.set(map.mapKey, {
      ...map,
      teamARating: teamA.rating,
      teamBRating: teamB.rating,
      probabilityTeamA: calculateWinProbability(teamA.rating, teamB.rating)[0],
      teamAColdStart: teamA.coldStart,
      teamBColdStart: teamB.coldStart,
    });
  }

  const meanPoolProbability =
    Array.from(ratingsByMap.values()).reduce(
      (sum, ratings) => sum + ratings.probabilityTeamA,
      0
    ) / ratingsByMap.size;
  const selectedProbabilities = match.selectedMaps.map(
    (map) => ratingsByMap.get(map.mapKey)!.probabilityTeamA
  );
  const regret = scoreVetoDecisions(match, ratingsByMap);
  return {
    match,
    split,
    preVetoProbabilityTeamA: seriesProbability(
      Array.from({ length: match.bestOf }, () => meanPoolProbability),
      match.bestOf
    ),
    selectedMapProbabilityTeamA: seriesProbability(
      selectedProbabilities,
      match.bestOf
    ),
    teamARegret: regret.teamARegret,
    teamBRegret: regret.teamBRegret,
    relativeRegretTeamA: regret.teamBRegret - regret.teamARegret,
    vetoDecisionScores: regret.decisions,
    ratingLookups: ratingsByMap.size * 2,
    coldStartLookups,
  };
}

function clippedProbability(value: number): number {
  return Math.min(1 - 1e-12, Math.max(1e-12, value));
}

function logit(value: number): number {
  const probability = clippedProbability(value);
  return Math.log(probability / (1 - probability));
}

function logistic(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-Math.min(value, 40));
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(Math.max(value, -40));
  return exponential / (1 + exponential);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function fitLogisticCalibration(
  rows: MatchFeature[],
  includeRegret: boolean
): LogisticCoefficients {
  const prior = includeRegret ? [0, 1, 0] : [0, 1];
  const trainingWins = rows.filter((row) => row.match.teamAWon).length;
  const trainingLosses = rows.length - trainingWins;
  const fallback = (
    fallbackReason: LogisticFitFallbackReason,
    iterations = 0
  ): LogisticCoefficients => ({
    status: "identity-fallback",
    fallbackReason,
    intercept: 0,
    selectedMapLogit: 1,
    relativeRegretPer100: includeRegret ? 0 : null,
    trainingRows: rows.length,
    trainingWins,
    trainingLosses,
    converged: false,
    iterations,
    ridge: LOGISTIC_RIDGE,
  });
  if (rows.length < MIN_LOGISTIC_ROWS) return fallback("insufficient_rows");
  if (
    trainingWins < MIN_LOGISTIC_OUTCOMES_PER_CLASS ||
    trainingLosses < MIN_LOGISTIC_OUTCOMES_PER_CLASS
  ) {
    return fallback("insufficient_outcome_variation");
  }
  if (includeRegret) {
    const regretValues = rows.map((row) => row.relativeRegretTeamA);
    if (Math.max(...regretValues) - Math.min(...regretValues) < EPSILON) {
      return fallback("insufficient_feature_variation");
    }
  }

  let coefficients = [...prior];
  let completedIterations = 0;

  for (let iteration = 0; iteration < LOGISTIC_ITERATIONS; iteration += 1) {
    completedIterations = iteration + 1;
    const gradient = coefficients.map(
      (coefficient, index) => -LOGISTIC_RIDGE * (coefficient - prior[index])
    );
    const information = coefficients.map((_, row) =>
      coefficients.map((__, column) => (row === column ? LOGISTIC_RIDGE : 0))
    );
    for (const row of rows) {
      const features = includeRegret
        ? [1, logit(row.selectedMapProbabilityTeamA), row.relativeRegretTeamA / 100]
        : [1, logit(row.selectedMapProbabilityTeamA)];
      const probability = logistic(
        features.reduce((sum, feature, index) => sum + feature * coefficients[index], 0)
      );
      const outcome = row.match.teamAWon ? 1 : 0;
      const weight = Math.max(1e-9, probability * (1 - probability));
      for (let first = 0; first < coefficients.length; first += 1) {
        gradient[first] += features[first] * (outcome - probability);
        for (let second = 0; second < coefficients.length; second += 1) {
          information[first][second] += weight * features[first] * features[second];
        }
      }
    }
    const update = solveLinearSystem(information, gradient);
    if (!update) return fallback("singular_information", completedIterations);
    if (update.some((value) => !Number.isFinite(value))) {
      return fallback("non_finite_update", completedIterations);
    }
    const candidate = coefficients.map(
      (coefficient, index) => coefficient + update[index]
    );
    if (
      candidate.some(
        (coefficient) =>
          !Number.isFinite(coefficient) ||
          Math.abs(coefficient) >= LOGISTIC_COEFFICIENT_LIMIT
      )
    ) {
      return fallback("coefficient_limit", completedIterations);
    }
    coefficients = candidate;
    if (Math.max(...update.map(Math.abs)) < 1e-10) {
      return {
        status: "fitted",
        fallbackReason: null,
        intercept: coefficients[0],
        selectedMapLogit: coefficients[1],
        relativeRegretPer100: includeRegret ? coefficients[2] : null,
        trainingRows: rows.length,
        trainingWins,
        trainingLosses,
        converged: true,
        iterations: completedIterations,
        ridge: LOGISTIC_RIDGE,
      };
    }
  }
  return fallback("not_converged", completedIterations);
}

function calibratedProbability(
  row: MatchFeature,
  coefficients: LogisticCoefficients
): number {
  if (coefficients.status === "identity-fallback") {
    return clippedProbability(row.selectedMapProbabilityTeamA);
  }
  return logistic(
    coefficients.intercept +
      coefficients.selectedMapLogit * logit(row.selectedMapProbabilityTeamA) +
      (coefficients.relativeRegretPer100 ?? 0) * (row.relativeRegretTeamA / 100)
  );
}

function alignRegretFallbackWithSelectedMap(
  regretFit: LogisticCoefficients,
  selectedMapFit: LogisticCoefficients
): LogisticCoefficients {
  if (selectedMapFit.status !== "fitted") {
    return {
      ...regretFit,
      status: "identity-fallback",
      fallbackReason: selectedMapFit.fallbackReason,
      intercept: 0,
      selectedMapLogit: 1,
      relativeRegretPer100: 0,
      converged: false,
    };
  }
  if (regretFit.status === "fitted") return regretFit;
  return {
    ...regretFit,
    status:
      selectedMapFit.status === "fitted"
        ? "selected-map-fallback"
        : "identity-fallback",
    intercept: selectedMapFit.intercept,
    selectedMapLogit: selectedMapFit.selectedMapLogit,
    relativeRegretPer100: 0,
  };
}

function deriveSeed(seed: number, label: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function probabilitiesForFeature(
  feature: MatchFeature,
  selectedMapCoefficients: LogisticCoefficients,
  regretCoefficients: LogisticCoefficients
): Record<PickBanOutcomeTrack, number> {
  return {
    neutral: 0.5,
    preVetoPoolElo: feature.preVetoProbabilityTeamA,
    selectedMapSeriesElo: feature.selectedMapProbabilityTeamA,
    calibratedSelectedMap: calibratedProbability(feature, selectedMapCoefficients),
    calibratedSelectedMapPlusRegret: calibratedProbability(feature, regretCoefficients),
  };
}

function publicPrediction(
  feature: MatchFeature,
  split: "validation" | "test",
  selectedMapCoefficients: LogisticCoefficients,
  regretCoefficients: LogisticCoefficients
): PickBanOutcomePrediction {
  return {
    matchId: feature.match.matchId,
    split,
    startedAt: feature.match.startedAt,
    teamAId: feature.match.teamAId,
    teamBId: feature.match.teamBId,
    teamAWon: feature.match.teamAWon,
    teamARegret: feature.teamARegret,
    teamBRegret: feature.teamBRegret,
    relativeRegretTeamA: feature.relativeRegretTeamA,
    probabilities: probabilitiesForFeature(
      feature,
      selectedMapCoefficients,
      regretCoefficients
    ),
  };
}

function metricPrediction(
  feature: MatchFeature,
  probabilityTeamA: number
): BacktestPrediction {
  return {
    rowId: feature.match.matchId,
    split: feature.split,
    completedAt: feature.match.startedAt,
    predictionBatchId: feature.match.startedAt,
    bootstrapBlockId:
      feature.match.event === null
        ? `match:${feature.match.matchId}`
        : `event:${feature.match.event.toLocaleLowerCase("en-US")}`,
    mapName: "series",
    teamAWon: feature.match.teamAWon,
    probabilityTeamA,
    rawProbabilityTeamA: probabilityTeamA,
    ratingTeamA: null,
    ratingTeamB: null,
  };
}

function predictionsByTrack(
  features: MatchFeature[],
  predictions: PickBanOutcomePrediction[]
): Record<PickBanOutcomeTrack, BacktestPrediction[]> {
  if (features.length !== predictions.length) {
    throw new Error("Features and public predictions must have the same length.");
  }
  return Object.fromEntries(
    OUTCOME_TRACKS.map((track) => [
      track,
      features.map((feature, index) =>
        metricPrediction(feature, predictions[index].probabilities[track])
      ),
    ])
  ) as Record<PickBanOutcomeTrack, BacktestPrediction[]>;
}

function evaluateTracks(
  predictions: Record<PickBanOutcomeTrack, BacktestPrediction[]>,
  iterations: number,
  seed: number,
  label: string
): Record<PickBanOutcomeTrack, TrackEvaluation> {
  return Object.fromEntries(
    OUTCOME_TRACKS.map((track) => [
      track,
      {
        metrics: calculateMetrics(predictions[track]),
        intervals95: bootstrapIntervals(
          predictions[track],
          iterations,
          deriveSeed(seed, `${label}:${track}`)
        ),
        accuracyDecisionInformative: track !== "neutral",
        accuracyInterpretation:
          track === "neutral"
            ? "Suppress: p=0.5 is deterministically classified as lexical team A by the shared metric helper, so this accuracy is team-A prevalence rather than coin-flip performance."
            : "Accuracy uses probabilityTeamA >= 0.5 as the deterministic decision threshold.",
      },
    ])
  ) as Record<PickBanOutcomeTrack, TrackEvaluation>;
}

interface AssociationObservation {
  value: number;
  success: boolean;
  blockId: string;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(sorted: number[], probability: number): number {
  if (sorted.length === 0) throw new RangeError("No bootstrap values available.");
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function associationUncertainty(
  observations: AssociationObservation[],
  iterations: number,
  seed: number
): AssociationUncertainty {
  const blocks = new Map<string, AssociationObservation[]>();
  for (const observation of observations) {
    const rows = blocks.get(observation.blockId) ?? [];
    rows.push(observation);
    blocks.set(observation.blockId, rows);
  }
  const blockIds = Array.from(blocks.keys()).sort(compareText);
  const base = {
    method: ASSOCIATION_METHOD,
    seed,
    iterations,
    blockCount: blockIds.length,
    minimumBlocks: ASSOCIATION_MIN_BLOCKS,
  } as const;
  if (blockIds.length < ASSOCIATION_MIN_BLOCKS) {
    return { ...base, interval95: null };
  }

  const random = mulberry32(seed);
  const draws: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let successes = 0;
    let n = 0;
    for (let block = 0; block < blockIds.length; block += 1) {
      const selected = blockIds[Math.floor(random() * blockIds.length)];
      for (const observation of blocks.get(selected)!) {
        n += 1;
        successes += Number(observation.success);
      }
    }
    draws.push(successes / n);
  }
  draws.sort((a, b) => a - b);
  const successes = observations.filter((row) => row.success).length;
  return {
    ...base,
    interval95: {
      estimate: successes / observations.length,
      lower95: percentile(draws, 0.025),
      upper95: percentile(draws, 0.975),
    },
  };
}

function summarizeAssociationBands(
  observations: AssociationObservation[],
  iterations: number,
  seed: number,
  label: string
): AssociationBand[] {
  return REGRET_BANDS.map((band) => {
    const rows = observations.filter(
      (row) =>
        row.value >= band.lowerInclusive &&
        (band.upperExclusive === null || row.value < band.upperExclusive)
    );
    const successes = rows.filter((row) => row.success).length;
    return {
      lowerInclusive: band.lowerInclusive,
      upperExclusive: band.upperExclusive,
      n: rows.length,
      successes,
      rate: rows.length === 0 ? null : successes / rows.length,
      uncertainty: associationUncertainty(
        rows,
        iterations,
        deriveSeed(seed, `${label}:${band.lowerInclusive}`)
      ),
    };
  });
}

function associationSummaries(
  holdoutFeatures: MatchFeature[],
  iterations: number,
  seed: number
): PickBanTemporalBacktestResult["associations"] {
  const lowerRegretObservations: AssociationObservation[] = [];
  const pickedMapObservations: AssociationObservation[] = [];
  let totalPickDecisions = 0;
  let eligibleGuaranteedPlayedBo3Picks = 0;
  let includedPickedMaps = 0;
  let excludedNonBo3 = 0;
  let excludedUnresolvedOutcome = 0;

  for (const feature of holdoutFeatures) {
    const eventKey = feature.match.event?.trim().toLocaleLowerCase("en-US");
    const blockId = eventKey
      ? `event:${eventKey}`
      : `match:${feature.match.matchId}`;
    const gap = Math.abs(feature.teamARegret - feature.teamBRegret);
    if (gap > EPSILON) {
      const teamALower = feature.teamARegret < feature.teamBRegret;
      lowerRegretObservations.push({
        value: gap,
        success: teamALower === feature.match.teamAWon,
        blockId,
      });
    }

    for (const decision of feature.vetoDecisionScores) {
      if (decision.veto.action !== "pick") continue;
      totalPickDecisions += 1;
      if (feature.match.bestOf !== 3) {
        excludedNonBo3 += 1;
        continue;
      }
      eligibleGuaranteedPlayedBo3Picks += 1;
      const played =
        decision.veto.resultedGameNumber === null
          ? feature.match.playedMaps.find(
              (map) => map.mapKey === decision.veto.mapKey
            )
          : feature.match.playedMaps.find(
              (map) => map.gameNumber === decision.veto.resultedGameNumber
            );
      if (!played || !decision.veto.teamId) {
        excludedUnresolvedOutcome += 1;
        continue;
      }
      includedPickedMaps += 1;
      pickedMapObservations.push({
        value: decision.regret,
        success: played.winnerTeamId === decision.veto.teamId,
        blockId,
      });
    }
  }

  const lowerRegretWins = lowerRegretObservations.filter((row) => row.success).length;
  return {
    lowerRegretTeamHoldout: {
      holdoutMatches: holdoutFeatures.length,
      includedMatches: lowerRegretObservations.length,
      regretTiesExcluded: holdoutFeatures.length - lowerRegretObservations.length,
      inclusionRate:
        holdoutFeatures.length === 0
          ? 0
          : lowerRegretObservations.length / holdoutFeatures.length,
      holdoutMatchesWithColdStart: holdoutFeatures.filter(
        (feature) => feature.coldStartLookups > 0
      ).length,
      includedMatchesWithColdStart: holdoutFeatures.filter(
        (feature) =>
          feature.coldStartLookups > 0 &&
          Math.abs(feature.teamARegret - feature.teamBRegret) > EPSILON
      ).length,
      n: lowerRegretObservations.length,
      wins: lowerRegretWins,
      winRate:
        lowerRegretObservations.length === 0
          ? null
          : lowerRegretWins / lowerRegretObservations.length,
      uncertainty: associationUncertainty(
        lowerRegretObservations,
        iterations,
        deriveSeed(seed, "association:lower-regret")
      ),
    },
    regretGapBands: summarizeAssociationBands(
      lowerRegretObservations,
      iterations,
      seed,
      "association:regret-gap"
    ),
    pickedMapOutcomeCoverage: {
      totalPickDecisions,
      eligibleGuaranteedPlayedBo3Picks,
      included: includedPickedMaps,
      excluded: totalPickDecisions - includedPickedMaps,
      excludedNonBo3,
      excludedUnresolvedOutcome,
    },
    observedPickedMapWinRatesByRegretBand:
      summarizeAssociationBands(
        pickedMapObservations,
        iterations,
        seed,
        "association:picked-map-regret"
      ),
  };
}

export function runPickBanTemporalBacktest(
  input: PickBanBacktestInput,
  options: PickBanBacktestOptions
): PickBanTemporalBacktestResult {
  const boundaries = validateSplit(options.split);
  const iterations = options.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const seed = options.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED;
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError("bootstrapIterations must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("bootstrapSeed must be a safe integer.");
  }

  const ratingAudit = normalizeRatings(input.eloRatings);
  const normalized = normalizeMatches(input.matches, ratingAudit);
  if (normalized.matches.length === 0) {
    throw new Error("No valid pick/ban matches are available for backtesting.");
  }
  const ratingIndex = new StrictRatingIndex(ratingAudit.rows);
  const features: MatchFeature[] = [];
  let excludedAtOrAfterTestEnd = 0;
  for (const match of normalized.matches) {
    const split = splitForTimestamp(match.timestampMs, boundaries);
    if (split === null) {
      excludedAtOrAfterTestEnd += 1;
      continue;
    }
    features.push(buildFeature(match, split, ratingIndex));
  }

  const trainFeatures = features.filter((feature) => feature.split === "train");
  const validationFeatures = features.filter(
    (feature) => feature.split === "validation"
  );
  const holdoutFeatures = features.filter((feature) => feature.split === "test");
  if (
    trainFeatures.length === 0 ||
    validationFeatures.length === 0 ||
    holdoutFeatures.length === 0
  ) {
    throw new Error(
      `Temporal split must contain train, validation, and test matches; received ${trainFeatures.length}/${validationFeatures.length}/${holdoutFeatures.length}.`
    );
  }

  // Validation calibration is fitted using train labels only. The final
  // holdout calibration is fitted from train+validation; no test outcome is
  // consulted before test probabilities are frozen.
  const validationSelectedCoefficients = fitLogisticCalibration(
    trainFeatures,
    false
  );
  const validationRegretCoefficients = alignRegretFallbackWithSelectedMap(
    fitLogisticCalibration(trainFeatures, true),
    validationSelectedCoefficients
  );
  const developmentFeatures = [...trainFeatures, ...validationFeatures];
  const testSelectedCoefficients = fitLogisticCalibration(
    developmentFeatures,
    false
  );
  const testRegretCoefficients = alignRegretFallbackWithSelectedMap(
    fitLogisticCalibration(developmentFeatures, true),
    testSelectedCoefficients
  );

  const validationPredictions = validationFeatures.map((feature) =>
    publicPrediction(
      feature,
      "validation",
      validationSelectedCoefficients,
      validationRegretCoefficients
    )
  );
  const holdoutPredictions = holdoutFeatures.map((feature) =>
    publicPrediction(
      feature,
      "test",
      testSelectedCoefficients,
      testRegretCoefficients
    )
  );
  const validationMetricPredictions = predictionsByTrack(
    validationFeatures,
    validationPredictions
  );
  const holdoutMetricPredictions = predictionsByTrack(
    holdoutFeatures,
    holdoutPredictions
  );

  const splitCoverage = emptySplitCoverage();
  for (const feature of features) {
    const coverage = splitCoverage[feature.split];
    coverage.lookups += feature.ratingLookups;
    coverage.coldStartLookups += feature.coldStartLookups;
    if (feature.coldStartLookups > 0) coverage.matchesWithColdStart += 1;
  }
  const totalLookups = features.reduce((sum, feature) => sum + feature.ratingLookups, 0);
  const totalColdStarts = features.reduce(
    (sum, feature) => sum + feature.coldStartLookups,
    0
  );
  const matchesWithColdStart = features.filter(
    (feature) => feature.coldStartLookups > 0
  ).length;

  return {
    schemaVersion: PICK_BAN_BACKTEST_SCHEMA_VERSION,
    implementationVersion: PICK_BAN_BACKTEST_IMPLEMENTATION_VERSION,
    dataQuality: normalized.quality,
    split: {
      boundaries: options.split,
      boundarySemantics: "[start, end) in UTC",
      counts: {
        train: trainFeatures.length,
        validation: validationFeatures.length,
        test: holdoutFeatures.length,
      },
      excludedAtOrAfterTestEnd,
    },
    methodology: {
      unit: "completed match",
      orientation:
        "team A is the lexical minimum normalized team id; source order and winner identity do not set orientation",
      ratingPolicy:
        "latest finite map rating with rating_date strictly before the supplied match cutoff (the database snapshot uses matches.completed_at as a proxy because start time is not stored), excluding rows sourced from the target match; missing ratings are explicit 1000 cold starts",
      seasonPolicy:
        "only ratings in the supplied cutoff's UTC calendar year are eligible",
      fittingPolicy:
        "validation coefficients use train labels only; final holdout coefficients use train+validation labels only; fixed ridge=1 requires at least 20 rows and 5 outcomes per class; unsafe, clipped, singular, or non-converged fits fall back to preregistered identity calibration; test labels never fit probabilities",
      regretPolicy:
        "greedy Elo pick maximizes acting-team map advantage and greedy Elo ban minimizes it; regret is the non-negative gap from that deterministic choice",
      preVetoPoolEloDefinition:
        "Mean-map plug-in baseline: average the seven pre-veto map probabilities, then plug that mean into the BO3/BO5 formula. It is not the full expected value of a pre-veto policy or an average over legal veto sequences.",
      neutralAccuracyPolicy: {
        decisionInformative: false,
        displayPolicy: "suppress",
        reason:
          "At p=0.5 the shared threshold chooses lexical team A, so neutral accuracy is team-A outcome prevalence rather than simulated coin-flip accuracy; use neutral Brier/log loss instead.",
      },
    },
    coldStartCoverage: {
      lookups: totalLookups,
      coldStartLookups: totalColdStarts,
      coldStartRate: totalLookups === 0 ? 0 : totalColdStarts / totalLookups,
      matchesWithColdStart,
      bySplit: splitCoverage,
    },
    coefficients: {
      validation: {
        trainedOn: "train",
        selectedMap: validationSelectedCoefficients,
        selectedMapPlusRegret: validationRegretCoefficients,
      },
      test: {
        trainedOn: "train+validation",
        selectedMap: testSelectedCoefficients,
        selectedMapPlusRegret: testRegretCoefficients,
      },
    },
    validation: evaluateTracks(
      validationMetricPredictions,
      iterations,
      seed,
      "validation"
    ),
    holdout: evaluateTracks(holdoutMetricPredictions, iterations, seed, "test"),
    pairedHoldoutDeltaRegretVsCalibratedSelectedMap: pairedBootstrapDeltas(
      holdoutMetricPredictions.calibratedSelectedMapPlusRegret,
      holdoutMetricPredictions.calibratedSelectedMap,
      iterations,
      deriveSeed(seed, "test:regret-vs-calibrated-selected")
    ),
    associations: associationSummaries(holdoutFeatures, iterations, seed),
    predictions: {
      validation: validationPredictions,
      test: holdoutPredictions,
    },
    limitations: [
      "This retrospective analysis is associational. It cannot observe match outcomes under maps that were banned or under an unchosen veto sequence.",
      "The database replay uses recorded match completion time as its cutoff proxy because start time is not stored, and excludes target-match rating rows; uncertainty does not cover remaining timestamp error, scrape omissions, patch drift, or source bias.",
      "Greedy regret uses map Elo alone and does not represent side choice, preparation, agent composition, roster announcements, or strategic concealment.",
      "A 1000 cold start is explicit but still a modeling assumption; cold-start coverage must accompany every reported result.",
      "Bootstrap intervals resample observed event blocks and do not include model-selection or counterfactual uncertainty.",
      "Neutral-track accuracy must be suppressed: the shared >=0.5 threshold classifies every p=0.5 row as lexical team A, so it is not coin-flip accuracy.",
    ],
    conclusion: {
      causal: false,
      statement:
        "Holdout forecast and association results describe predictive evidence only; they do not establish that lower-regret veto choices cause match or map wins.",
    },
  };
}

export const runPickBanBacktest = runPickBanTemporalBacktest;
