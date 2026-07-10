import { parse } from "csv-parse/sync";

import { DEFAULT_MAP_CONFIG } from "./elo-calculator";

export const BACKTEST_SCHEMA_VERSION = "1.3.0";
export const BACKTEST_IMPLEMENTATION_VERSION = "vm-01-vm-07.5";

export const DEFAULT_CSV_SPLIT: TemporalSplitConfig = {
  trainEndExclusive: "2024-06-01T00:00:00.000Z",
  validationEndExclusive: "2024-07-15T00:00:00.000Z",
  testEndExclusive: "2024-09-01T00:00:00.000Z",
};

export const DEFAULT_DB_SPLIT: TemporalSplitConfig = {
  trainEndExclusive: "2025-01-01T00:00:00.000Z",
  validationEndExclusive: "2025-09-01T00:00:00.000Z",
  testEndExclusive: null,
};

export const DEFAULT_BOOTSTRAP_ITERATIONS = 500;
export const DEFAULT_BOOTSTRAP_SEED = 20_250_308;

export type BacktestSource = "csv" | "db" | "snapshot";
export type SplitName = "train" | "validation" | "test";
export type DataIssueCategory =
  | "missing_required"
  | "invalid_value"
  | "duplicate_source_id"
  | "duplicate_map"
  | "source_sequence_gap";
export type ModelFamily =
  | "plain-elo"
  | "production-map-elo"
  | "naive"
  | "season-carry"
  | "roster-regression"
  | "cold-start-uncertainty"
  | "margin-of-victory";
export type RatingScope = "overall" | "map";
export type MarginFormula =
  | "none"
  | "production"
  | "log1p"
  | "sqrt"
  | "linear-capped";
export type MetricName = "brier" | "logLoss" | "accuracy" | "ece";

export interface TemporalSplitConfig {
  /** Rows before this instant warm the model but never select a candidate. */
  trainEndExclusive: string;
  /** Rows from trainEndExclusive until this instant select one challenger. */
  validationEndExclusive: string;
  /** Rows from validationEndExclusive until this instant form the final holdout. */
  testEndExclusive: string | null;
}

export interface RawBacktestRow {
  sourceRowNumber: number;
  sourceRowId?: unknown;
  seriesId?: unknown;
  completedAt?: unknown;
  gameNumber?: unknown;
  mapName?: unknown;
  winnerTeamId?: unknown;
  winnerTeamName?: unknown;
  loserTeamId?: unknown;
  loserTeamName?: unknown;
  winnerScore?: unknown;
  loserScore?: unknown;
  region?: unknown;
  event?: unknown;
  winnerRosterPlayerIds?: unknown;
  loserRosterPlayerIds?: unknown;
  sourceValidationErrors?: string[];
}

export interface BacktestMap {
  rowId: string;
  sourceRowNumber: number;
  sourceRowId: string;
  seriesId: string | null;
  predictionBatchId: string;
  bootstrapBlockId: string;
  completedAt: string;
  timestampMs: number;
  gameNumber: number;
  mapName: string;
  region: string | null;
  event: string | null;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  teamAWon: boolean;
  teamARounds: number;
  teamBRounds: number;
  /** Appearances on this map; models may observe these only after predicting it. */
  observedTeamARoster: string[];
  observedTeamBRoster: string[];
}

export interface DataIssue {
  category: DataIssueCategory;
  rowNumber: number | null;
  sourceRowId: string | null;
  fields: string[];
  message: string;
  rejected: boolean;
}

export interface DataQualityReport {
  receivedRows: number;
  acceptedRows: number;
  rejectedRows: number;
  issueCounts: Record<DataIssueCategory, number>;
  issues: DataIssue[];
  schemaMissingColumns: string[];
  missingRequiredRows: number;
  duplicateRows: number;
  sourceSequenceGapCount: number;
  sourceSequenceGaps: string[];
  seriesIdCoverage: {
    rows: number;
    rate: number;
    status: "complete" | "partial" | "unavailable";
  };
  rosterCoverage: {
    rowsWithBothRosters: number;
    rate: number;
    minimumPlayersPerTeam: number;
  };
}

export interface ParsedBacktestData {
  source: BacktestSource;
  rows: BacktestMap[];
  quality: DataQualityReport;
}

export interface ModelConfig {
  id: string;
  label: string;
  family: ModelFamily;
  ratingScope: RatingScope;
  initialRating: number;
  /** Divisor used to calculate the expected result applied to rating updates. */
  ratingScale: number;
  /** Divisor used to turn pre-match ratings into the published forecast. */
  predictionScale: number;
  kFactor: number;
  marginFormula: MarginFormula;
  marginScale: number;
  /** null means no season boundary adjustment; 0 means a full reset. */
  seasonCarry: number | null;
  /** Shrinks forecast probability toward 0.5; underlying rating updates stay Elo. */
  coldStartPriorGames: number;
  /** Regresses rating after a changed roster has been observed on a prior map. */
  rosterRegressionStrength: number;
}

export interface BacktestPrediction {
  rowId: string;
  split: SplitName;
  completedAt: string;
  predictionBatchId: string;
  bootstrapBlockId: string;
  mapName: string;
  teamAWon: boolean;
  probabilityTeamA: number;
  rawProbabilityTeamA: number;
  ratingTeamA: number | null;
  ratingTeamB: number | null;
}

export interface WilsonInterval {
  lower95: number;
  upper95: number;
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  upperInclusive: boolean;
  n: number;
  meanPredictedProbability: number | null;
  observedTeamAWinRate: number | null;
  observedRateWilson95: WilsonInterval | null;
}

export interface ConfidenceBand {
  lower: number;
  upper: number;
  upperInclusive: boolean;
  n: number;
  meanConfidence: number | null;
  accuracy: number | null;
  accuracyWilson95: WilsonInterval | null;
}

export interface PointMetrics {
  n: number;
  brier: number;
  logLoss: number;
  accuracy: number;
  ece: number;
  reliabilityBins: ReliabilityBin[];
  accuracyByConfidenceBand: ConfidenceBand[];
  sampleSizeByMap: Array<{ mapName: string; n: number }>;
}

export interface ConfidenceInterval {
  estimate: number;
  lower95: number;
  upper95: number;
  method: "deterministic-block-bootstrap-percentile";
  iterations: number;
  seed: number;
}

export interface EvaluationSummary {
  metrics: PointMetrics;
  intervals95: Record<MetricName, ConfidenceInterval>;
  pairedDeltaVsPlainElo: Record<MetricName, ConfidenceInterval> | null;
}

export interface CandidateValidationResult {
  model: ModelConfig;
  validation: EvaluationSummary;
  /** Candidate tables expose validation only; within-run selection never reads test metrics. */
}

export interface ExperimentReport {
  family: Exclude<ModelFamily, "plain-elo" | "production-map-elo" | "naive">;
  status: "available" | "unavailable";
  reason: string;
  evidence: Record<string, string | number | boolean | null>;
  candidates: CandidateValidationResult[];
  bestOnValidationModelId: string | null;
}

export interface FinalModelEvaluation {
  role:
    | "plain-elo-baseline"
    | "pre-holdout-frozen-production"
    | "fixed-production"
    | "naive-0.5-reference"
    | "validation-selected-challenger";
  model: ModelConfig;
  selectionRule: string;
  provenance: {
    basis:
      | "runner-fixed-reference"
      | "pre-holdout-repository-snapshot"
      | "analysis-time-deployment"
      | "validation-selected-experimental-candidate";
    repositoryCommit: string | null;
    repositoryCommitAt: string | null;
    sourceFiles: string[];
    sourceBlobs: Array<{ path: string; gitBlob: string }>;
    note: string;
  };
  validation: EvaluationSummary;
  test: EvaluationSummary;
}

export interface BacktestManifestInput {
  generatedAt: string;
  dataSha256: string;
  configSha256: string;
  sourceDescriptor: string;
  /** Hash of the canonical query payload (query version, raw rows, neutral rows). */
  sourceSnapshotSha256: string | null;
  /** Hash of the complete snapshot file after canonicalizing text line endings to LF. */
  sourceSnapshotFileSha256: string | null;
  sourceSnapshotExportedAt: string | null;
  evaluatedModelVersion: string;
  sourceCodeSha256: string;
  sourceFiles: string[];
  gitCommit: string | null;
  gitWorkingTree: "clean" | "dirty" | "unknown";
  provenanceCapturedAt: string;
  provenanceCapturePoint: "before input reads and artifact writes";
  sourceExtraction: SourceExtractionSummary | null;
}

export interface SourceExtractionSummary {
  scope: string;
  totalMaps: number;
  processedMaps: number;
  unprocessedMaps: number;
  mapsWithoutCompletedAt: number;
  processedMapsWithoutCompletedAt: number;
  extractedProcessedRows: number;
  processedRowsExcludedByRequiredTeamJoins: number;
}

export interface BacktestRunOptions {
  split: TemporalSplitConfig;
  bootstrapIterations?: number;
  bootstrapSeed?: number;
  manifest: BacktestManifestInput;
}

export interface TemporalBacktestResult {
  schemaVersion: string;
  implementationVersion: string;
  manifest: BacktestManifestInput & {
    source: BacktestSource;
    acceptedRows: number;
    earliestCompletedAt: string;
    latestCompletedAt: string;
  };
  dataQuality: DataQualityReport;
  split: {
    boundaries: TemporalSplitConfig;
    boundarySemantics: "[start, end) in UTC";
    counts: Record<SplitName, number>;
    seriesCounts: Record<SplitName, number>;
    observedRanges: Record<
      SplitName,
      { firstCompletedAt: string | null; lastCompletedAt: string | null }
    >;
    excludedAtOrAfterTestEnd: number;
  };
  methodology: {
    unit: "map";
    timezone: "UTC";
    ordering: string;
    orientation: string;
    predictionTiming: string;
    splitPolicy: string;
    selectionMetric: "validation log loss";
    holdoutPolicy: string;
    bootstrap: {
      method: "deterministic block bootstrap";
      blockDefinition: string;
      iterations: number;
      seed: number;
    };
    rosterPolicy: string;
    metricDefinitions: Record<MetricName, string>;
  };
  evaluationContext: {
    studyDesign: "retrospective chronological replay";
    prospectivelyRegistered: false;
    candidateGridStatus: string;
    productionConfiguration: {
      status: "deployed at analysis time";
      knownRepositoryChangeAt: string;
      knownRepositoryChangeCommit: string;
      changePredatesTestStart: boolean;
      note: string;
    };
    preHoldoutFrozenProductionConfiguration: {
      status:
        | "repository snapshot predating chronological test start"
        | "repository snapshot not predating chronological test start";
      repositoryCommit: string;
      repositoryCommitAt: string;
      predatesTestStart: boolean;
      sourceFiles: string[];
      sourceBlobs: Array<{ path: string; gitBlob: string }>;
      reconstruction: string;
      interpretation: string;
    };
  };
  references: {
    plainElo: ModelConfig;
    preHoldoutFrozenProductionMapElo: ModelConfig;
    productionMapElo: ModelConfig;
    naiveProbability: 0.5;
  };
  evaluatedModelExamples: {
    modelId: string;
    equalRating: number;
    updates: Array<{
      winnerScore: number;
      loserScore: number;
      winnerChange: number;
      loserChange: number;
    }>;
  };
  experiments: ExperimentReport[];
  selection: {
    eligibleCandidateIds: string[];
    selectedChallengerId: string | null;
    rule: string;
    candidateTestMetricsPublished: false;
    testEvaluationPassesWithinRun: 1;
  };
  finalModels: FinalModelEvaluation[];
  conclusion: {
    productionModelChanged: false;
    statement: string;
  };
  limitations: string[];
}

const CSV_REQUIRED_COLUMNS = [
  "match_id",
  "match_timestamp",
  "winning_team",
  "losing_team",
  "winning_team_score",
  "losing_team_score",
  "map",
] as const;

const ISSUE_CATEGORIES: DataIssueCategory[] = [
  "missing_required",
  "invalid_value",
  "duplicate_source_id",
  "duplicate_map",
  "source_sequence_gap",
];

const EPSILON = 1e-15;

function emptyIssueCounts(): Record<DataIssueCategory, number> {
  return Object.fromEntries(
    ISSUE_CATEGORIES.map((category) => [category, 0])
  ) as Record<DataIssueCategory, number>;
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeIdentifier(value: unknown): string {
  return String(value).normalize("NFKC").trim().toLowerCase();
}

function displayText(value: unknown, fallback: string): string {
  if (isMissing(value)) return fallback;
  return String(value).normalize("NFKC").trim();
}

function compareIdentifiers(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const aBig = BigInt(a);
    const bBig = BigInt(b);
    if (aBig < bBig) return -1;
    if (aBig > bBig) return 1;
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseTimestamp(value: unknown): { iso: string; ms: number } | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    trimmed
  )
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : null;
}

function parseRoster(value: unknown): string[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      values = Array.isArray(parsed) ? parsed : value.split(",");
    } catch {
      values = value.split(",");
    }
  }
  return Array.from(
    new Set(values.filter((item) => !isMissing(item)).map(normalizeIdentifier))
  ).sort(compareIdentifiers);
}

function compareMaps(a: BacktestMap, b: BacktestMap): number {
  if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
  const series = compareIdentifiers(
    a.seriesId ?? a.sourceRowId,
    b.seriesId ?? b.sourceRowId
  );
  if (series !== 0) return series;
  if (a.gameNumber !== b.gameNumber) return a.gameNumber - b.gameNumber;
  const source = compareIdentifiers(a.sourceRowId, b.sourceRowId);
  return source !== 0 ? source : a.sourceRowNumber - b.sourceRowNumber;
}

export function parseBacktestCsv(csvText: string): ParsedBacktestData {
  let matrix: string[][];
  try {
    matrix = parse(csvText, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
  } catch (error) {
    throw new Error(
      `Unable to parse CSV: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const headers = (matrix[0] ?? []).map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missingColumns = CSV_REQUIRED_COLUMNS.filter(
    (column) => !headerIndex.has(column)
  );

  const valueAt = (row: string[], column: string): string | undefined => {
    const index = headerIndex.get(column);
    return index === undefined ? undefined : row[index];
  };

  const rawRows: RawBacktestRow[] = matrix.slice(1).map((row, index) => ({
    sourceRowNumber: index + 2,
    sourceRowId: valueAt(row, "match_id"),
    completedAt: valueAt(row, "match_timestamp"),
    gameNumber: valueAt(row, "match_id"),
    mapName: valueAt(row, "map"),
    winnerTeamId: valueAt(row, "winning_team"),
    winnerTeamName: valueAt(row, "winning_team"),
    loserTeamId: valueAt(row, "losing_team"),
    loserTeamName: valueAt(row, "losing_team"),
    winnerScore: valueAt(row, "winning_team_score"),
    loserScore: valueAt(row, "losing_team_score"),
    region: valueAt(row, "region"),
    event: valueAt(row, "event"),
    sourceValidationErrors:
      row.length === headers.length
        ? []
        : [`expected ${headers.length} columns but found ${row.length}`],
  }));

  return normalizeBacktestRows(rawRows, "csv", missingColumns);
}

export function normalizeBacktestRows(
  rawRows: RawBacktestRow[],
  source: BacktestSource,
  schemaMissingColumns: string[] = []
): ParsedBacktestData {
  const issues: DataIssue[] = [];
  const issueCounts = emptyIssueCounts();
  const candidates: BacktestMap[] = [];

  const addIssue = (issue: DataIssue) => {
    issues.push(issue);
    issueCounts[issue.category] += 1;
  };

  for (const raw of rawRows) {
    const rawId = isMissing(raw.sourceRowId) ? null : String(raw.sourceRowId).trim();
    const required: Array<[string, unknown]> = [
      ["sourceRowId", raw.sourceRowId],
      ["completedAt", raw.completedAt],
      ["mapName", raw.mapName],
      ["winnerTeamId", raw.winnerTeamId],
      ["loserTeamId", raw.loserTeamId],
      ["winnerScore", raw.winnerScore],
      ["loserScore", raw.loserScore],
    ];
    const missingFields = required.filter(([, value]) => isMissing(value)).map(([name]) => name);
    if (missingFields.length > 0) {
      addIssue({
        category: "missing_required",
        rowNumber: raw.sourceRowNumber,
        sourceRowId: rawId,
        fields: missingFields,
        message: `Missing required value(s): ${missingFields.join(", ")}.`,
        rejected: true,
      });
      continue;
    }

    if ((raw.sourceValidationErrors?.length ?? 0) > 0) {
      addIssue({
        category: "invalid_value",
        rowNumber: raw.sourceRowNumber,
        sourceRowId: rawId,
        fields: ["row"],
        message: raw.sourceValidationErrors!.join("; "),
        rejected: true,
      });
      continue;
    }

    const timestamp = parseTimestamp(raw.completedAt);
    const winnerScore = parseInteger(raw.winnerScore);
    const loserScore = parseInteger(raw.loserScore);
    const winnerId = normalizeIdentifier(raw.winnerTeamId);
    const loserId = normalizeIdentifier(raw.loserTeamId);
    const invalidMessages: string[] = [];

    if (!timestamp) invalidMessages.push("completedAt is not a valid UTC timestamp");
    if (winnerScore === null || loserScore === null) {
      invalidMessages.push("scores must be safe integers");
    } else if (winnerScore < 0 || loserScore < 0) {
      invalidMessages.push("scores must be non-negative");
    } else if (winnerScore <= loserScore) {
      invalidMessages.push("winnerScore must be greater than loserScore");
    }
    if (winnerId === loserId) invalidMessages.push("winner and loser must be different teams");

    if (invalidMessages.length > 0 || !timestamp || winnerScore === null || loserScore === null) {
      addIssue({
        category: "invalid_value",
        rowNumber: raw.sourceRowNumber,
        sourceRowId: rawId,
        fields: ["completedAt", "winnerScore", "loserScore", "teams"],
        message: invalidMessages.join("; "),
        rejected: true,
      });
      continue;
    }

    const sourceRowId = rawId!;
    const seriesId = isMissing(raw.seriesId) ? null : String(raw.seriesId).trim();
    const parsedGameNumber = parseInteger(raw.gameNumber);
    const gameNumber = parsedGameNumber !== null && parsedGameNumber >= 0 ? parsedGameNumber : 0;
    const winnerIsTeamA = compareIdentifiers(winnerId, loserId) < 0;
    const teamAId = winnerIsTeamA ? winnerId : loserId;
    const teamBId = winnerIsTeamA ? loserId : winnerId;
    const teamAName = winnerIsTeamA
      ? displayText(raw.winnerTeamName, winnerId)
      : displayText(raw.loserTeamName, loserId);
    const teamBName = winnerIsTeamA
      ? displayText(raw.loserTeamName, loserId)
      : displayText(raw.winnerTeamName, winnerId);
    const observedTeamARoster = winnerIsTeamA
      ? parseRoster(raw.winnerRosterPlayerIds)
      : parseRoster(raw.loserRosterPlayerIds);
    const observedTeamBRoster = winnerIsTeamA
      ? parseRoster(raw.loserRosterPlayerIds)
      : parseRoster(raw.winnerRosterPlayerIds);

    candidates.push({
      rowId: `row:${sourceRowId}`,
      sourceRowNumber: raw.sourceRowNumber,
      sourceRowId,
      seriesId,
      predictionBatchId: `timestamp:${timestamp.iso}`,
      bootstrapBlockId:
        seriesId === null ? `timestamp:${timestamp.iso}` : `series:${seriesId}`,
      completedAt: timestamp.iso,
      timestampMs: timestamp.ms,
      gameNumber,
      mapName: displayText(raw.mapName, "unknown"),
      region: isMissing(raw.region) ? null : displayText(raw.region, ""),
      event: isMissing(raw.event) ? null : displayText(raw.event, ""),
      teamAId,
      teamAName,
      teamBId,
      teamBName,
      teamAWon: winnerIsTeamA,
      teamARounds: winnerIsTeamA ? winnerScore : loserScore,
      teamBRounds: winnerIsTeamA ? loserScore : winnerScore,
      observedTeamARoster,
      observedTeamBRoster,
    });
  }

  candidates.sort(compareMaps);
  const accepted: BacktestMap[] = [];
  const seenSourceIds = new Set<string>();
  const seenNaturalKeys = new Set<string>();

  for (const row of candidates) {
    if (seenSourceIds.has(row.sourceRowId)) {
      addIssue({
        category: "duplicate_source_id",
        rowNumber: row.sourceRowNumber,
        sourceRowId: row.sourceRowId,
        fields: ["sourceRowId"],
        message: `Duplicate source row id ${row.sourceRowId}.`,
        rejected: true,
      });
      continue;
    }
    seenSourceIds.add(row.sourceRowId);

    const naturalKey = [
      row.completedAt,
      row.mapName.toLowerCase(),
      row.teamAId,
      row.teamBId,
      row.teamARounds,
      row.teamBRounds,
    ].join("\u001f");
    if (seenNaturalKeys.has(naturalKey)) {
      addIssue({
        category: "duplicate_map",
        rowNumber: row.sourceRowNumber,
        sourceRowId: row.sourceRowId,
        fields: ["completedAt", "mapName", "teams", "scores"],
        message: "Duplicate map at the analytical grain.",
        rejected: true,
      });
      continue;
    }
    seenNaturalKeys.add(naturalKey);
    accepted.push(row);
  }

  const sequenceGaps: string[] = [];
  let sequenceGapCount = 0;
  if (source === "csv") {
    const ids = accepted
      .map((row) => (/^\d+$/.test(row.sourceRowId) ? Number(row.sourceRowId) : null))
      .filter((value): value is number => value !== null && Number.isSafeInteger(value));
    if (ids.length === accepted.length && ids.length > 1) {
      const min = Math.min(...ids);
      const max = Math.max(...ids);
      if (max - min <= 100_000) {
        const present = new Set(ids);
        for (let id = min; id <= max; id += 1) {
          if (!present.has(id)) {
            sequenceGapCount += 1;
            if (sequenceGaps.length < 1_000) sequenceGaps.push(String(id));
          }
        }
      }
    }
  }
  if (sequenceGapCount > 0) {
    issueCounts.source_sequence_gap = sequenceGapCount;
    issues.push({
      category: "source_sequence_gap",
      rowNumber: null,
      sourceRowId: null,
      fields: ["sourceRowId"],
      message: `${sequenceGapCount} id(s) are absent inside the observed numeric source-id range.`,
      rejected: false,
    });
  }

  const seriesRows = accepted.filter((row) => row.seriesId !== null).length;
  const rosterRows = accepted.filter(
    (row) => row.observedTeamARoster.length >= 3 && row.observedTeamBRoster.length >= 3
  ).length;
  const rejectedRows = issues.filter((issue) => issue.rejected).length;
  const duplicateRows =
    issueCounts.duplicate_map + issueCounts.duplicate_source_id;

  return {
    source,
    rows: accepted,
    quality: {
      receivedRows: rawRows.length,
      acceptedRows: accepted.length,
      rejectedRows,
      issueCounts,
      issues,
      schemaMissingColumns,
      missingRequiredRows: issueCounts.missing_required,
      duplicateRows,
      sourceSequenceGapCount: sequenceGapCount,
      sourceSequenceGaps: sequenceGaps,
      seriesIdCoverage: {
        rows: seriesRows,
        rate: accepted.length === 0 ? 0 : seriesRows / accepted.length,
        status:
          seriesRows === accepted.length && accepted.length > 0
            ? "complete"
            : seriesRows === 0
              ? "unavailable"
              : "partial",
      },
      rosterCoverage: {
        rowsWithBothRosters: rosterRows,
        rate: accepted.length === 0 ? 0 : rosterRows / accepted.length,
        minimumPlayersPerTeam: 3,
      },
    },
  };
}

function parseBoundary(value: string, name: string): number {
  const parsed = parseTimestamp(value);
  if (!parsed) throw new RangeError(`${name} must be a valid timestamp.`);
  return parsed.ms;
}

function validateSplit(split: TemporalSplitConfig): {
  trainEndMs: number;
  validationEndMs: number;
  testEndMs: number;
} {
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

function assertModelConfig(config: ModelConfig): void {
  const finite: Array<[string, number]> = [
    ["initialRating", config.initialRating],
    ["ratingScale", config.ratingScale],
    ["predictionScale", config.predictionScale],
    ["kFactor", config.kFactor],
    ["marginScale", config.marginScale],
    ["coldStartPriorGames", config.coldStartPriorGames],
    ["rosterRegressionStrength", config.rosterRegressionStrength],
  ];
  for (const [name, value] of finite) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  }
  if (config.ratingScale <= 0) throw new RangeError("ratingScale must be positive.");
  if (config.predictionScale <= 0) {
    throw new RangeError("predictionScale must be positive.");
  }
  if (config.kFactor < 0) throw new RangeError("kFactor cannot be negative.");
  if (config.marginScale < 0) throw new RangeError("marginScale cannot be negative.");
  if (config.coldStartPriorGames < 0) {
    throw new RangeError("coldStartPriorGames cannot be negative.");
  }
  if (
    config.rosterRegressionStrength < 0 ||
    config.rosterRegressionStrength > 1
  ) {
    throw new RangeError("rosterRegressionStrength must be between zero and one.");
  }
  if (
    config.seasonCarry !== null &&
    (!Number.isFinite(config.seasonCarry) ||
      config.seasonCarry < 0 ||
      config.seasonCarry > 1)
  ) {
    throw new RangeError("seasonCarry must be null or a finite value between zero and one.");
  }
}

export const PLAIN_ELO_BASELINE: ModelConfig = {
  id: "plain-overall-elo",
  label: "Plain overall-team Elo",
  family: "plain-elo",
  ratingScope: "overall",
  initialRating: 1000,
  ratingScale: 400,
  predictionScale: 400,
  kFactor: 32,
  marginFormula: "none",
  marginScale: 0,
  seasonCarry: null,
  coldStartPriorGames: 0,
  rosterRegressionStrength: 0,
};

export const FIXED_PRODUCTION_MAP_ELO: ModelConfig = {
  id: "production-map-elo-fixed",
  label: "Production map Elo at analysis time",
  family: "production-map-elo",
  ratingScope: "map",
  initialRating: DEFAULT_MAP_CONFIG.initialRating,
  ratingScale: DEFAULT_MAP_CONFIG.ratingScale,
  predictionScale: DEFAULT_MAP_CONFIG.ratingScale,
  kFactor: DEFAULT_MAP_CONFIG.kFactor,
  marginFormula: "production",
  marginScale: DEFAULT_MAP_CONFIG.marginScale,
  seasonCarry: 0,
  coldStartPriorGames: 0,
  rosterRegressionStrength: 0,
};

const PRODUCTION_RATING_SCALE_CHANGE = {
  at: "2025-10-04T02:22:24.000Z",
  commit: "99a0a87a240f47d1aa0c894ffb730fe9ea4ddd23",
};

const PRE_HOLDOUT_PRODUCTION_SNAPSHOT = {
  commit: "2f134f187c0717dbfcf18b1a07c4eccbef94dcdb",
  commitAt: "2025-08-26T15:49:51-05:00",
  sourceFiles: [
    "lib/elo/elo-calculator.ts",
    "lib/predictions/calculations.ts",
    "db/elo/elo-processor.ts",
  ],
  sourceBlobs: [
    {
      path: "lib/elo/elo-calculator.ts",
      gitBlob: "cdf7c5361a88a1099049058181e986fde4cc8f29",
    },
    {
      path: "lib/predictions/calculations.ts",
      gitBlob: "11343604323dcf6ea414d2215e75be7327d9e533",
    },
    {
      path: "db/elo/elo-processor.ts",
      gitBlob: "0c3d10548e2ef966dd831dcafaa9636378562d14",
    },
  ],
} as const;

/**
 * Exact production behavior visible in the repository before the chronological
 * test period: updates used a 2000 divisor, while forecasts used a 1000 divisor.
 */
export const PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO: ModelConfig = {
  id: "production-map-elo-pre-holdout-frozen",
  label: "Pre-holdout frozen production map Elo",
  family: "production-map-elo",
  ratingScope: "map",
  initialRating: 1000,
  ratingScale: 2000,
  predictionScale: 1000,
  kFactor: 74,
  marginFormula: "production",
  marginScale: 1,
  seasonCarry: 0,
  coldStartPriorGames: 0,
  rosterRegressionStrength: 0,
};

export const NAIVE_HALF_REFERENCE: ModelConfig = {
  id: "naive-half",
  label: "Uninformative 0.5 probability",
  family: "naive",
  ratingScope: "overall",
  initialRating: 1000,
  ratingScale: 400,
  predictionScale: 400,
  kFactor: 0,
  marginFormula: "none",
  marginScale: 0,
  seasonCarry: null,
  coldStartPriorGames: 0,
  rosterRegressionStrength: 0,
};

interface RatingState {
  rating: number;
  games: number;
  seasonYear: number;
}

interface RosterState {
  players: string[];
  revision: number;
  /** Retention for revision 1 is stored at index 0, revision 2 at index 1, etc. */
  retentionByRevision: number[];
}

class PrequentialEloModel {
  private readonly ratings = new Map<string, RatingState>();
  private readonly rosters = new Map<string, RosterState>();
  private readonly appliedRosterRevision = new Map<string, number>();

  constructor(private readonly config: ModelConfig) {
    assertModelConfig(config);
  }

  private key(teamId: string, mapName: string): string {
    return this.config.ratingScope === "map"
      ? `${teamId}\u0000${mapName.toLowerCase()}`
      : teamId;
  }

  private state(teamId: string, mapName: string, timestampMs: number): RatingState {
    const key = this.key(teamId, mapName);
    const year = new Date(timestampMs).getUTCFullYear();
    let state = this.ratings.get(key);
    if (!state) {
      state = { rating: this.config.initialRating, games: 0, seasonYear: year };
      this.ratings.set(key, state);
    } else if (state.seasonYear !== year && this.config.seasonCarry !== null) {
      const elapsedSeasonBoundaries = year - state.seasonYear;
      if (elapsedSeasonBoundaries <= 0) {
        throw new Error("Ratings must be replayed in chronological season order.");
      }
      const cumulativeCarry = this.config.seasonCarry ** elapsedSeasonBoundaries;
      state.rating =
        this.config.initialRating +
        (state.rating - this.config.initialRating) * cumulativeCarry;
      state.games = Math.floor(state.games * cumulativeCarry);
      state.seasonYear = year;
    } else {
      state.seasonYear = year;
    }

    if (this.config.rosterRegressionStrength > 0) {
      const roster = this.rosters.get(teamId);
      if (roster) {
        const appliedRevision = this.appliedRosterRevision.get(key) ?? 0;
        if (roster.revision > appliedRevision) {
          for (let revision = appliedRevision + 1; revision <= roster.revision; revision += 1) {
            const retention = roster.retentionByRevision[revision - 1];
            const regression =
              this.config.rosterRegressionStrength * (1 - retention);
            state.rating =
              this.config.initialRating +
              (state.rating - this.config.initialRating) * (1 - regression);
          }
          this.appliedRosterRevision.set(key, roster.revision);
        }
      }
    }
    return state;
  }

  predict(row: BacktestMap, split: SplitName): BacktestPrediction {
    const teamA = this.state(row.teamAId, row.mapName, row.timestampMs);
    const teamB = this.state(row.teamBId, row.mapName, row.timestampMs);
    const rawProbability =
      1 /
      (1 +
        Math.pow(
          10,
          (teamB.rating - teamA.rating) / this.config.predictionScale
        ));
    const evidenceGames = Math.min(teamA.games, teamB.games);
    const evidenceWeight =
      this.config.coldStartPriorGames === 0
        ? 1
        : evidenceGames / (evidenceGames + this.config.coldStartPriorGames);
    const probability = 0.5 + (rawProbability - 0.5) * evidenceWeight;
    return {
      rowId: row.rowId,
      split,
      completedAt: row.completedAt,
      predictionBatchId: row.predictionBatchId,
      bootstrapBlockId: row.bootstrapBlockId,
      mapName: row.mapName,
      teamAWon: row.teamAWon,
      probabilityTeamA: probability,
      rawProbabilityTeamA: rawProbability,
      ratingTeamA: teamA.rating,
      ratingTeamB: teamB.rating,
    };
  }

  update(row: BacktestMap, prediction: BacktestPrediction): void {
    const teamA = this.state(row.teamAId, row.mapName, row.timestampMs);
    const teamB = this.state(row.teamBId, row.mapName, row.timestampMs);
    const observed = row.teamAWon ? 1 : 0;
    const margin = marginMultiplier(
      Math.abs(row.teamARounds - row.teamBRounds),
      this.config.marginFormula,
      this.config.marginScale
    );
    if (prediction.ratingTeamA === null || prediction.ratingTeamB === null) {
      throw new Error("Elo updates require pre-match ratings for both teams.");
    }
    const updateExpectedProbability =
      1 /
      (1 +
        Math.pow(
          10,
          (prediction.ratingTeamB - prediction.ratingTeamA) /
            this.config.ratingScale
        ));
    const change =
      this.config.kFactor *
      margin *
      (observed - updateExpectedProbability);
    teamA.rating += change;
    teamB.rating -= change;
    teamA.games += 1;
    teamB.games += 1;
  }

  observeRoster(teamId: string, players: string[]): void {
    if (players.length < 3) return;
    const previous = this.rosters.get(teamId);
    if (!previous) {
      this.rosters.set(teamId, {
        players,
        revision: 0,
        retentionByRevision: [],
      });
      return;
    }
    if (sameArray(previous.players, players)) return;
    const previousSet = new Set(previous.players);
    const overlap = players.filter((player) => previousSet.has(player)).length;
    const retention = overlap / Math.max(previous.players.length, players.length);
    this.rosters.set(teamId, {
      players,
      revision: previous.revision + 1,
      retentionByRevision: [...previous.retentionByRevision, retention],
    });
  }
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function marginMultiplier(
  scoreDifference: number,
  formula: MarginFormula,
  scale: number
): number {
  if (!Number.isFinite(scoreDifference) || scoreDifference <= 0) {
    throw new RangeError("scoreDifference must be a positive finite number.");
  }
  if (!Number.isFinite(scale) || scale < 0) {
    throw new RangeError("margin scale must be a non-negative finite number.");
  }
  switch (formula) {
    case "none":
      return 1;
    case "production":
      return scale > 0 ? scale * Math.log(5.95 * Math.sqrt(scoreDifference + 1)) : 1;
    case "log1p":
      return 1 + scale * Math.log1p(scoreDifference);
    case "sqrt":
      return 1 + scale * (Math.sqrt(scoreDifference) - 1);
    case "linear-capped":
      return 1 + scale * (Math.min(scoreDifference, 12) / 4);
  }
}

export function generatePrequentialPredictions(
  rows: BacktestMap[],
  config: ModelConfig,
  split: TemporalSplitConfig,
  throughExclusiveMs = Number.POSITIVE_INFINITY
): BacktestPrediction[] {
  const boundaries = validateSplit(split);
  const model = new PrequentialEloModel(config);
  const orderedRows = [...rows].sort(compareMaps);
  const predictions: BacktestPrediction[] = [];

  for (let start = 0; start < orderedRows.length; ) {
    const timestampMs = orderedRows[start].timestampMs;
    let end = start + 1;
    while (end < orderedRows.length && orderedRows[end].timestampMs === timestampMs) end += 1;
    if (timestampMs >= throughExclusiveMs) break;
    const batch = orderedRows.slice(start, end);
    const batchPredictions = new Map<string, BacktestPrediction>();

    // Every prediction at this timestamp is emitted before any result at the
    // timestamp is applied. This mirrors the production strict-< lookup and
    // prevents map 1 of a series from leaking into map 2.
    for (const row of batch) {
      const splitName = splitForTimestamp(row.timestampMs, boundaries);
      if (splitName === null) continue;
      const prediction = model.predict(row, splitName);
      predictions.push(prediction);
      batchPredictions.set(row.rowId, prediction);
    }

    for (const row of batch) {
      const prediction = batchPredictions.get(row.rowId);
      if (prediction) model.update(row, prediction);
    }
    // These lineups are post-map observations. They can affect only strictly
    // later timestamps, never the map on which they were observed.
    for (const row of batch) {
      model.observeRoster(row.teamAId, row.observedTeamARoster);
      model.observeRoster(row.teamBId, row.observedTeamBRoster);
    }
    start = end;
  }
  return predictions;
}

function naivePredictions(
  rows: BacktestMap[],
  split: TemporalSplitConfig,
  throughExclusiveMs = Number.POSITIVE_INFINITY
): BacktestPrediction[] {
  const boundaries = validateSplit(split);
  const predictions: BacktestPrediction[] = [];
  for (const row of rows) {
    if (row.timestampMs >= throughExclusiveMs) continue;
    const splitName = splitForTimestamp(row.timestampMs, boundaries);
    if (splitName === null) continue;
    predictions.push({
      rowId: row.rowId,
      split: splitName,
      completedAt: row.completedAt,
      predictionBatchId: row.predictionBatchId,
      bootstrapBlockId: row.bootstrapBlockId,
      mapName: row.mapName,
      teamAWon: row.teamAWon,
      probabilityTeamA: 0.5,
      rawProbabilityTeamA: 0.5,
      ratingTeamA: null,
      ratingTeamB: null,
    });
  }
  return predictions;
}

function clippedProbability(value: number): number {
  return Math.min(1 - EPSILON, Math.max(EPSILON, value));
}

function predictionCorrect(prediction: BacktestPrediction): number {
  return (prediction.probabilityTeamA >= 0.5) === prediction.teamAWon ? 1 : 0;
}

export function wilsonInterval(successes: number, n: number): WilsonInterval | null {
  if (n <= 0) return null;
  const z = 1.959963984540054;
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const half =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    lower95: Math.max(0, center - half),
    upper95: Math.min(1, center + half),
  };
}

function scalarMetrics(
  predictions: BacktestPrediction[]
): Record<MetricName, number> {
  if (predictions.length === 0) {
    throw new RangeError("Cannot calculate metrics for an empty prediction set.");
  }
  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  const calibration = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const prediction of predictions) {
    const y = prediction.teamAWon ? 1 : 0;
    const p = clippedProbability(prediction.probabilityTeamA);
    brier += (p - y) ** 2;
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    correct += predictionCorrect(prediction);
    const bin = Math.min(9, Math.floor(p * 10));
    calibration[bin].n += 1;
    calibration[bin].p += p;
    calibration[bin].y += y;
  }
  const n = predictions.length;
  const ece = calibration.reduce((sum, bin) => {
    if (bin.n === 0) return sum;
    return sum + (bin.n / n) * Math.abs(bin.p / bin.n - bin.y / bin.n);
  }, 0);
  return {
    brier: brier / n,
    logLoss: logLoss / n,
    accuracy: correct / n,
    ece,
  };
}

export function calculateMetrics(predictions: BacktestPrediction[]): PointMetrics {
  const scalars = scalarMetrics(predictions);
  const reliability = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  const confidence = Array.from({ length: 5 }, () => ({ n: 0, c: 0, correct: 0 }));
  const maps = new Map<string, number>();

  for (const prediction of predictions) {
    const p = clippedProbability(prediction.probabilityTeamA);
    const y = prediction.teamAWon ? 1 : 0;
    const reliabilityIndex = Math.min(9, Math.floor(p * 10));
    reliability[reliabilityIndex].n += 1;
    reliability[reliabilityIndex].p += p;
    reliability[reliabilityIndex].y += y;

    const modelConfidence = Math.max(p, 1 - p);
    const confidenceIndex = Math.min(4, Math.floor((modelConfidence - 0.5) / 0.1));
    confidence[confidenceIndex].n += 1;
    confidence[confidenceIndex].c += modelConfidence;
    confidence[confidenceIndex].correct += predictionCorrect(prediction);
    maps.set(prediction.mapName, (maps.get(prediction.mapName) ?? 0) + 1);
  }

  return {
    n: predictions.length,
    ...scalars,
    reliabilityBins: reliability.map((bin, index) => ({
      lower: index / 10,
      upper: (index + 1) / 10,
      upperInclusive: index === 9,
      n: bin.n,
      meanPredictedProbability: bin.n === 0 ? null : bin.p / bin.n,
      observedTeamAWinRate: bin.n === 0 ? null : bin.y / bin.n,
      observedRateWilson95: wilsonInterval(bin.y, bin.n),
    })),
    accuracyByConfidenceBand: confidence.map((band, index) => ({
      lower: 0.5 + index / 10,
      upper: 0.6 + index / 10,
      upperInclusive: index === 4,
      n: band.n,
      meanConfidence: band.n === 0 ? null : band.c / band.n,
      accuracy: band.n === 0 ? null : band.correct / band.n,
      accuracyWilson95: wilsonInterval(band.correct, band.n),
    })),
    sampleSizeByMap: Array.from(maps.entries())
      .sort(([a], [b]) => compareIdentifiers(a.toLowerCase(), b.toLowerCase()))
      .map(([mapName, n]) => ({ mapName, n })),
  };
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

function deriveSeed(seed: number, label: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
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

function blockMap(predictions: BacktestPrediction[]): Map<string, BacktestPrediction[]> {
  const blocks = new Map<string, BacktestPrediction[]>();
  for (const prediction of predictions) {
    const rows = blocks.get(prediction.bootstrapBlockId) ?? [];
    rows.push(prediction);
    blocks.set(prediction.bootstrapBlockId, rows);
  }
  return blocks;
}

export function bootstrapIntervals(
  predictions: BacktestPrediction[],
  iterations: number,
  seed: number
): Record<MetricName, ConfidenceInterval> {
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError("bootstrap iterations must be a positive safe integer.");
  }
  const point = scalarMetrics(predictions);
  const blocks = blockMap(predictions);
  const blockIds = Array.from(blocks.keys()).sort(compareIdentifiers);
  const random = mulberry32(seed);
  const draws: Record<MetricName, number[]> = {
    brier: [],
    logLoss: [],
    accuracy: [],
    ece: [],
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: BacktestPrediction[] = [];
    for (let block = 0; block < blockIds.length; block += 1) {
      const selected = blockIds[Math.floor(random() * blockIds.length)];
      sample.push(...blocks.get(selected)!);
    }
    const metrics = scalarMetrics(sample);
    for (const metric of Object.keys(draws) as MetricName[]) draws[metric].push(metrics[metric]);
  }
  return Object.fromEntries(
    (Object.keys(draws) as MetricName[]).map((metric) => {
      const values = draws[metric].sort((a, b) => a - b);
      return [
        metric,
        {
          estimate: point[metric],
          lower95: percentile(values, 0.025),
          upper95: percentile(values, 0.975),
          method: "deterministic-block-bootstrap-percentile",
          iterations,
          seed,
        } satisfies ConfidenceInterval,
      ];
    })
  ) as Record<MetricName, ConfidenceInterval>;
}

export function pairedBootstrapDeltas(
  candidate: BacktestPrediction[],
  baseline: BacktestPrediction[],
  iterations: number,
  seed: number
): Record<MetricName, ConfidenceInterval> {
  const candidateByRow = new Map(candidate.map((prediction) => [prediction.rowId, prediction]));
  const pairedBaseline = baseline.filter((prediction) => candidateByRow.has(prediction.rowId));
  if (pairedBaseline.length !== baseline.length || candidate.length !== baseline.length) {
    throw new Error("Paired bootstrap requires identical prediction rows.");
  }
  const candidatePoint = scalarMetrics(candidate);
  const baselinePoint = scalarMetrics(baseline);
  const baselineBlocks = blockMap(pairedBaseline);
  const blockIds = Array.from(baselineBlocks.keys()).sort(compareIdentifiers);
  const random = mulberry32(seed);
  const draws: Record<MetricName, number[]> = {
    brier: [],
    logLoss: [],
    accuracy: [],
    ece: [],
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampledBaseline: BacktestPrediction[] = [];
    const sampledCandidate: BacktestPrediction[] = [];
    for (let block = 0; block < blockIds.length; block += 1) {
      const selected = blockIds[Math.floor(random() * blockIds.length)];
      for (const baselinePrediction of baselineBlocks.get(selected)!) {
        sampledBaseline.push(baselinePrediction);
        sampledCandidate.push(candidateByRow.get(baselinePrediction.rowId)!);
      }
    }
    const baselineMetrics = scalarMetrics(sampledBaseline);
    const candidateMetrics = scalarMetrics(sampledCandidate);
    for (const metric of Object.keys(draws) as MetricName[]) {
      draws[metric].push(candidateMetrics[metric] - baselineMetrics[metric]);
    }
  }

  return Object.fromEntries(
    (Object.keys(draws) as MetricName[]).map((metric) => {
      const values = draws[metric].sort((a, b) => a - b);
      return [
        metric,
        {
          estimate: candidatePoint[metric] - baselinePoint[metric],
          lower95: percentile(values, 0.025),
          upper95: percentile(values, 0.975),
          method: "deterministic-block-bootstrap-percentile",
          iterations,
          seed,
        } satisfies ConfidenceInterval,
      ];
    })
  ) as Record<MetricName, ConfidenceInterval>;
}

function evaluation(
  predictions: BacktestPrediction[],
  iterations: number,
  seed: number,
  baseline: BacktestPrediction[] | null
): EvaluationSummary {
  return {
    metrics: calculateMetrics(predictions),
    intervals95: bootstrapIntervals(predictions, iterations, seed),
    pairedDeltaVsPlainElo:
      baseline === null
        ? null
        : pairedBootstrapDeltas(
            predictions,
            baseline,
            iterations,
            deriveSeed(seed, "paired")
          ),
  };
}

function withOverrides(
  id: string,
  label: string,
  family: ModelConfig["family"],
  overrides: Partial<ModelConfig>
): ModelConfig {
  return {
    ...FIXED_PRODUCTION_MAP_ELO,
    ...overrides,
    id,
    label,
    family,
  };
}

function assessRosterEvidence(rows: BacktestMap[], throughExclusiveMs: number) {
  const eligibleRows = rows.filter((row) => row.timestampMs < throughExclusiveMs);
  const completeRows = eligibleRows.filter(
    (row) => row.observedTeamARoster.length >= 3 && row.observedTeamBRoster.length >= 3
  );
  const lastRoster = new Map<string, string[]>();
  let changes = 0;
  for (const row of completeRows) {
    for (const [team, roster] of [
      [row.teamAId, row.observedTeamARoster],
      [row.teamBId, row.observedTeamBRoster],
    ] as const) {
      const previous = lastRoster.get(team);
      if (previous && !sameArray(previous, roster)) changes += 1;
      lastRoster.set(team, roster);
    }
  }
  const coverage = eligibleRows.length === 0 ? 0 : completeRows.length / eligibleRows.length;
  return {
    eligibleRows: eligibleRows.length,
    completeRows: completeRows.length,
    coverage,
    observedRosterChanges: changes,
    available: completeRows.length >= 30 && coverage >= 0.6 && changes > 0,
  };
}

function experimentDefinitions(
  rows: BacktestMap[],
  validationEndMs: number
): Array<{
  family: ExperimentReport["family"];
  status: ExperimentReport["status"];
  reason: string;
  evidence: ExperimentReport["evidence"];
  models: ModelConfig[];
}> {
  const developmentRows = rows.filter((row) => row.timestampMs < validationEndMs);
  const seasons = Array.from(
    new Set(developmentRows.map((row) => new Date(row.timestampMs).getUTCFullYear()))
  );
  const roster = assessRosterEvidence(rows, validationEndMs);

  return [
    {
      family: "season-carry",
      status: seasons.length >= 2 ? "available" : "unavailable",
      reason:
        seasons.length >= 2
          ? "At least one season boundary exists before the holdout."
          : "No season boundary exists in train plus validation, so carry cannot be selected without holdout leakage.",
      evidence: { seasonsBeforeHoldout: seasons.length, seasonYears: seasons.join(",") },
      models:
        seasons.length >= 2
          ? [0.25, 0.5, 0.75, 1].map((carry) =>
              withOverrides(
                `season-carry-${Math.round(carry * 100)}`,
                `Production map Elo with ${Math.round(carry * 100)}% season carry`,
                "season-carry",
                { seasonCarry: carry }
              )
            )
          : [],
    },
    {
      family: "roster-regression",
      status: roster.available ? "available" : "unavailable",
      reason: roster.available
        ? "Prior-map player appearances provide adequate last-observed roster coverage and observed changes."
        : "Roster coverage or observed-change evidence is insufficient before the holdout; current-map appearances are never used to predict that map.",
      evidence: {
        developmentRows: roster.eligibleRows,
        rowsWithBothRosters: roster.completeRows,
        coverageRate: roster.coverage,
        observedRosterChanges: roster.observedRosterChanges,
        minimumCoverageRate: 0.6,
        minimumCompleteRows: 30,
      },
      models: roster.available
        ? [0.25, 0.5, 0.75].map((strength) =>
            withOverrides(
              `roster-regression-${Math.round(strength * 100)}`,
              `Last-observed roster proxy (${Math.round(strength * 100)}% strength)`,
              "roster-regression",
              { rosterRegressionStrength: strength }
            )
          )
        : [],
    },
    {
      family: "cold-start-uncertainty",
      status: "available",
      reason: "Every row has observable prior map counts; shrinkage uses only counts strictly before prediction.",
      evidence: { candidatePriorGameCounts: "3,8,15" },
      models: [3, 8, 15].map((priorGames) =>
        withOverrides(
          `cold-start-prior-${priorGames}`,
          `Production map Elo with ${priorGames}-game uncertainty prior`,
          "cold-start-uncertainty",
          { coldStartPriorGames: priorGames }
        )
      ),
    },
    {
      family: "margin-of-victory",
      status: "available",
      reason: "Valid score margins are present before the holdout.",
      evidence: { formulas: "none,log1p,sqrt,linear-capped" },
      models: [
        withOverrides("mov-none", "Map Elo without MOV", "margin-of-victory", {
          marginFormula: "none",
          marginScale: 0,
        }),
        withOverrides("mov-log1p", "Map Elo with log1p MOV", "margin-of-victory", {
          marginFormula: "log1p",
          marginScale: 0.75,
        }),
        withOverrides("mov-sqrt", "Map Elo with square-root MOV", "margin-of-victory", {
          marginFormula: "sqrt",
          marginScale: 0.75,
        }),
        withOverrides(
          "mov-linear-capped",
          "Map Elo with capped-linear MOV",
          "margin-of-victory",
          { marginFormula: "linear-capped", marginScale: 0.25 }
        ),
      ],
    },
  ];
}

function observedRange(rows: BacktestMap[]) {
  return {
    firstCompletedAt: rows[0]?.completedAt ?? null,
    lastCompletedAt: rows.at(-1)?.completedAt ?? null,
  };
}

function countSeries(rows: BacktestMap[]): number {
  return new Set(rows.map((row) => row.seriesId ?? row.bootstrapBlockId)).size;
}

function selectSplit(
  predictions: BacktestPrediction[],
  split: SplitName
): BacktestPrediction[] {
  return predictions.filter((prediction) => prediction.split === split);
}

export function runTemporalBacktest(
  input: ParsedBacktestData,
  options: BacktestRunOptions
): TemporalBacktestResult {
  if (input.rows.length === 0) throw new Error("No valid maps are available for backtesting.");
  const boundaries = validateSplit(options.split);
  const preHoldoutSnapshotPredatesTestStart =
    Date.parse(PRE_HOLDOUT_PRODUCTION_SNAPSHOT.commitAt) <
    boundaries.validationEndMs;
  const iterations = options.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const seed = options.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED;
  if (!Number.isSafeInteger(seed)) throw new RangeError("bootstrap seed must be a safe integer.");

  const rowsInWindow = input.rows.filter((row) => row.timestampMs < boundaries.testEndMs);
  const trainRows = rowsInWindow.filter((row) => row.timestampMs < boundaries.trainEndMs);
  const validationRows = rowsInWindow.filter(
    (row) => row.timestampMs >= boundaries.trainEndMs && row.timestampMs < boundaries.validationEndMs
  );
  const testRows = rowsInWindow.filter((row) => row.timestampMs >= boundaries.validationEndMs);
  if (trainRows.length === 0 || validationRows.length === 0 || testRows.length === 0) {
    throw new Error(
      `Temporal split must contain train, validation, and test maps; received ${trainRows.length}/${validationRows.length}/${testRows.length}.`
    );
  }

  // Development pass: no candidate is allowed past validationEndExclusive.
  const baselineDevelopment = generatePrequentialPredictions(
    rowsInWindow,
    PLAIN_ELO_BASELINE,
    options.split,
    boundaries.validationEndMs
  );
  const baselineValidationPredictions = selectSplit(baselineDevelopment, "validation");
  const productionDevelopment = generatePrequentialPredictions(
    rowsInWindow,
    FIXED_PRODUCTION_MAP_ELO,
    options.split,
    boundaries.validationEndMs
  );
  const productionValidationPredictions = selectSplit(productionDevelopment, "validation");
  const preHoldoutProductionDevelopment = generatePrequentialPredictions(
    rowsInWindow,
    PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
    options.split,
    boundaries.validationEndMs
  );
  const preHoldoutProductionValidationPredictions = selectSplit(
    preHoldoutProductionDevelopment,
    "validation"
  );
  const naiveDevelopment = naivePredictions(
    rowsInWindow,
    options.split,
    boundaries.validationEndMs
  );
  const naiveValidationPredictions = selectSplit(naiveDevelopment, "validation");

  const baselineValidation = evaluation(
    baselineValidationPredictions,
    iterations,
    deriveSeed(seed, "baseline-validation"),
    null
  );
  const productionValidation = evaluation(
    productionValidationPredictions,
    iterations,
    deriveSeed(seed, "production-validation"),
    baselineValidationPredictions
  );
  const preHoldoutProductionValidation = evaluation(
    preHoldoutProductionValidationPredictions,
    iterations,
    deriveSeed(seed, "pre-holdout-production-validation"),
    baselineValidationPredictions
  );
  const naiveValidation = evaluation(
    naiveValidationPredictions,
    iterations,
    deriveSeed(seed, "naive-validation"),
    baselineValidationPredictions
  );

  const definitions = experimentDefinitions(rowsInWindow, boundaries.validationEndMs);
  const candidatePredictions = new Map<string, BacktestPrediction[]>();
  const candidateValidation = new Map<string, EvaluationSummary>();
  const experiments: ExperimentReport[] = definitions.map((definition) => {
    const candidates = definition.models.map((model) => {
      const predictions = selectSplit(
        generatePrequentialPredictions(
          rowsInWindow,
          model,
          options.split,
          boundaries.validationEndMs
        ),
        "validation"
      );
      candidatePredictions.set(model.id, predictions);
      const result = evaluation(
        predictions,
        iterations,
        deriveSeed(seed, `${model.id}-validation`),
        baselineValidationPredictions
      );
      candidateValidation.set(model.id, result);
      return { model, validation: result };
    });
    const best = [...candidates].sort(
      (a, b) =>
        a.validation.metrics.logLoss - b.validation.metrics.logLoss ||
        compareIdentifiers(a.model.id, b.model.id)
    )[0];
    return {
      family: definition.family,
      status: definition.status,
      reason: definition.reason,
      evidence: definition.evidence,
      candidates,
      bestOnValidationModelId: best?.model.id ?? null,
    };
  });

  const allCandidates = experiments.flatMap((experiment) => experiment.candidates);
  const selectedCandidate = [...allCandidates].sort(
    (a, b) =>
      a.validation.metrics.logLoss - b.validation.metrics.logLoss ||
      compareIdentifiers(a.model.id, b.model.id)
  )[0] ?? null;

  // Final pass: this is the only point at which holdout metrics are computed.
  const baselineTestPredictions = selectSplit(
    generatePrequentialPredictions(rowsInWindow, PLAIN_ELO_BASELINE, options.split),
    "test"
  );
  const productionTestPredictions = selectSplit(
    generatePrequentialPredictions(rowsInWindow, FIXED_PRODUCTION_MAP_ELO, options.split),
    "test"
  );
  const preHoldoutProductionTestPredictions = selectSplit(
    generatePrequentialPredictions(
      rowsInWindow,
      PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
      options.split
    ),
    "test"
  );
  const naiveTestPredictions = selectSplit(
    naivePredictions(rowsInWindow, options.split),
    "test"
  );
  const baselineTest = evaluation(
    baselineTestPredictions,
    iterations,
    deriveSeed(seed, "baseline-test"),
    null
  );
  const productionTest = evaluation(
    productionTestPredictions,
    iterations,
    deriveSeed(seed, "production-test"),
    baselineTestPredictions
  );
  const preHoldoutProductionTest = evaluation(
    preHoldoutProductionTestPredictions,
    iterations,
    deriveSeed(seed, "pre-holdout-production-test"),
    baselineTestPredictions
  );
  const naiveTest = evaluation(
    naiveTestPredictions,
    iterations,
    deriveSeed(seed, "naive-test"),
    baselineTestPredictions
  );

  const finalModels: FinalModelEvaluation[] = [
    {
      role: "plain-elo-baseline",
      model: PLAIN_ELO_BASELINE,
      selectionRule: "Comparator fixed in code for this run; no parameter search inside the runner.",
      provenance: {
        basis: "runner-fixed-reference",
        repositoryCommit: null,
        repositoryCommitAt: null,
        sourceFiles: ["lib/elo/backtest.ts"],
        sourceBlobs: [],
        note: "A conventional overall-team Elo reference fixed by the backtest implementation.",
      },
      validation: baselineValidation,
      test: baselineTest,
    },
    {
      role: "pre-holdout-frozen-production",
      model: PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
      selectionRule: preHoldoutSnapshotPredatesTestStart
        ? "Externally frozen by repository history before the chronological test start; not selected or tuned by this backtest run."
        : "Fixed by repository history, but the snapshot does not predate this run's chronological test start; it is not a pre-holdout comparator for this split.",
      provenance: {
        basis: "pre-holdout-repository-snapshot",
        repositoryCommit: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.commit,
        repositoryCommitAt: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.commitAt,
        sourceFiles: [...PRE_HOLDOUT_PRODUCTION_SNAPSHOT.sourceFiles],
        sourceBlobs: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.sourceBlobs.map(
          (source) => ({ ...source })
        ),
        note:
          "The historical update path used ratingScale=2000, K=74, production MOV scale=1, and annual reset; the historical forecast path separately used a 1000 divisor.",
      },
      validation: preHoldoutProductionValidation,
      test: preHoldoutProductionTest,
    },
    {
      role: "fixed-production",
      model: FIXED_PRODUCTION_MAP_ELO,
      selectionRule: "Configuration deployed at analysis time; evaluated retrospectively and not frozen before the test period.",
      provenance: {
        basis: "analysis-time-deployment",
        repositoryCommit: PRODUCTION_RATING_SCALE_CHANGE.commit,
        repositoryCommitAt: PRODUCTION_RATING_SCALE_CHANGE.at,
        sourceFiles: ["lib/elo/elo-calculator.ts"],
        sourceBlobs: [],
        note:
          "The analysis-time implementation uses a 1000 divisor for both rating updates and forecasts.",
      },
      validation: productionValidation,
      test: productionTest,
    },
    {
      role: "naive-0.5-reference",
      model: NAIVE_HALF_REFERENCE,
      selectionRule: "Uninformative comparator fixed in code for this run.",
      provenance: {
        basis: "runner-fixed-reference",
        repositoryCommit: null,
        repositoryCommitAt: null,
        sourceFiles: ["lib/elo/backtest.ts"],
        sourceBlobs: [],
        note: "A constant probability reference carrying no team-strength information.",
      },
      validation: naiveValidation,
      test: naiveTest,
    },
  ];

  if (selectedCandidate) {
    const selectedTestPredictions = selectSplit(
      generatePrequentialPredictions(rowsInWindow, selectedCandidate.model, options.split),
      "test"
    );
    finalModels.push({
      role: "validation-selected-challenger",
      model: selectedCandidate.model,
      selectionRule:
        "Lowest validation log loss among the experimental map-Elo candidate grid only; fixed references were not eligible and may score better. Ties break by model id. The grid was not prospectively preregistered.",
      provenance: {
        basis: "validation-selected-experimental-candidate",
        repositoryCommit: null,
        repositoryCommitAt: null,
        sourceFiles: ["lib/elo/backtest.ts"],
        sourceBlobs: [],
        note:
          "Selected inside this run from experimental candidates using validation log loss; it is not the best model across fixed references and candidates.",
      },
      validation: candidateValidation.get(selectedCandidate.model.id)!,
      test: evaluation(
        selectedTestPredictions,
        iterations,
        deriveSeed(seed, `${selectedCandidate.model.id}-test`),
        baselineTestPredictions
      ),
    });
  }

  const blockDefinition =
    input.quality.seriesIdCoverage.status === "complete"
      ? "source series/match id"
      : "shared completed_at timestamp proxy because reliable series ids are unavailable";
  const limitations = [
    "This is an observational temporal backtest, not evidence of causal model improvement.",
    "The reported chronological test period is retrospective and can be rerun; it is not a prospectively untouched holdout, and future event mixes and patches may differ.",
    preHoldoutSnapshotPredatesTestStart
      ? "The pre-holdout production comparator is externally frozen by repository history before the chronological test start, making its later rows retrospectively out of sample; this does not prove its original parameter selection was leakage-free or restore an untouched holdout after these results have been viewed."
      : "The historical production repository snapshot does not predate this run's chronological test start, so it must not be described as a pre-holdout comparator for this split.",
    input.source === "csv"
      ? "The legacy CSV has map-row ids rather than reliable series ids and no roster appearances; timestamp blocks prevent within-timestamp leakage, but series-specific uncertainty and roster experiments are unavailable."
      : "Roster change is a last-observed appearance proxy, not a confirmed pre-match roster announcement.",
    options.manifest.sourceExtraction
      ? "Data-quality rejection counts start from maps marked processed that survive required team joins; they do not measure events never scraped, source-universe completeness, or all upstream ETL failures."
      : "The input artifact does not include upstream source-universe counts, so rejection totals do not measure scrape omissions or source completeness.",
    "Confidence intervals quantify resampling uncertainty for the observed series blocks and do not cover source bias or model-selection uncertainty.",
    "Validation-only selection and one test evaluation are enforced within each run; there is no persistent access ledger that can detect reruns after holdout results have been viewed.",
    "No experimental result automatically changes the production model; adoption requires an explicit review and calibration decision.",
  ];
  const evaluatedModelExamples = {
    modelId: FIXED_PRODUCTION_MAP_ELO.id,
    equalRating: FIXED_PRODUCTION_MAP_ELO.initialRating,
    updates: [
      { winnerScore: 13, loserScore: 11 },
      { winnerScore: 13, loserScore: 0 },
    ].map(({ winnerScore, loserScore }) => {
      const winnerChange =
        FIXED_PRODUCTION_MAP_ELO.kFactor *
        marginMultiplier(
          winnerScore - loserScore,
          FIXED_PRODUCTION_MAP_ELO.marginFormula,
          FIXED_PRODUCTION_MAP_ELO.marginScale
        ) *
        0.5;
      return {
        winnerScore,
        loserScore,
        winnerChange,
        loserChange: -winnerChange,
      };
    }),
  };

  return {
    schemaVersion: BACKTEST_SCHEMA_VERSION,
    implementationVersion: BACKTEST_IMPLEMENTATION_VERSION,
    manifest: {
      ...options.manifest,
      source: input.source,
      acceptedRows: input.rows.length,
      earliestCompletedAt: input.rows[0].completedAt,
      latestCompletedAt: input.rows.at(-1)!.completedAt,
    },
    dataQuality: input.quality,
    split: {
      boundaries: options.split,
      boundarySemantics: "[start, end) in UTC",
      counts: {
        train: trainRows.length,
        validation: validationRows.length,
        test: testRows.length,
      },
      seriesCounts: {
        train: countSeries(trainRows),
        validation: countSeries(validationRows),
        test: countSeries(testRows),
      },
      observedRanges: {
        train: observedRange(trainRows),
        validation: observedRange(validationRows),
        test: observedRange(testRows),
      },
      excludedAtOrAfterTestEnd: input.rows.length - rowsInWindow.length,
    },
    methodology: {
      unit: "map",
      timezone: "UTC",
      ordering:
        "completed_at, then source series/match id, game_number, source row id; all tie breaks are deterministic",
      orientation:
        "team A is the lexical minimum normalized team id; the winner field sets only the binary outcome after orientation",
      predictionTiming:
        "all maps sharing completed_at are predicted from state strictly before that timestamp, then outcomes update in deterministic series/game order",
      splitPolicy:
        "within each run, training only warms state; validation alone selects one experimental challenger from the candidate grid; fixed references are not selection candidates; test is not evaluated until selection is frozen",
      selectionMetric: "validation log loss",
      holdoutPolicy:
        "within-run fixed plain Elo, pre-holdout frozen production, analysis-time production, 0.5 reference, and the one validation-selected experimental challenger are evaluated after selection; candidate tables contain validation metrics only; no persistent ledger prevents later reruns",
      bootstrap: {
        method: "deterministic block bootstrap",
        blockDefinition,
        iterations,
        seed,
      },
      rosterPolicy:
        "player appearances become observable only after every prediction at their map timestamp; regression is labeled a last-observed roster proxy and applies only at strictly later timestamps",
      metricDefinitions: {
        brier: "mean squared error of team-A win probability; lower is better",
        logLoss: "mean negative Bernoulli log likelihood with probabilities clipped to [1e-15, 1-1e-15]; lower is better",
        accuracy: "share correct using probabilityTeamA >= 0.5 as the deterministic team-A decision; higher is better",
        ece: "10-bin expected calibration error weighted by bin sample size; lower is better",
      },
    },
    evaluationContext: {
      studyDesign: "retrospective chronological replay",
      prospectivelyRegistered: false,
      candidateGridStatus:
        "The candidate grid was implemented at analysis time and was not prospectively preregistered before the test period.",
      productionConfiguration: {
        status: "deployed at analysis time",
        knownRepositoryChangeAt: PRODUCTION_RATING_SCALE_CHANGE.at,
        knownRepositoryChangeCommit: PRODUCTION_RATING_SCALE_CHANGE.commit,
        changePredatesTestStart:
          Date.parse(PRODUCTION_RATING_SCALE_CHANGE.at) < boundaries.validationEndMs,
        note:
          "The repository changed ratingScale from 2000 to 1000 at the recorded commit. The evaluated configuration is an analysis-time retrospective comparator, not a configuration asserted to predate the test period.",
      },
      preHoldoutFrozenProductionConfiguration: {
        status: preHoldoutSnapshotPredatesTestStart
          ? "repository snapshot predating chronological test start"
          : "repository snapshot not predating chronological test start",
        repositoryCommit: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.commit,
        repositoryCommitAt: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.commitAt,
        predatesTestStart: preHoldoutSnapshotPredatesTestStart,
        sourceFiles: [...PRE_HOLDOUT_PRODUCTION_SNAPSHOT.sourceFiles],
        sourceBlobs: PRE_HOLDOUT_PRODUCTION_SNAPSHOT.sourceBlobs.map(
          (source) => ({ ...source })
        ),
        reconstruction:
          "Map rating updates use initial=1000, ratingScale=2000, K=74, production MOV scale=1, and hard annual reset; forecast probabilities separately use predictionScale=1000.",
        interpretation: preHoldoutSnapshotPredatesTestStart
          ? "This repository-frozen comparator is retrospectively out of sample after the chronological test start. It does not prove the original parameter choice was leakage-free and does not restore an untouched holdout."
          : "This repository snapshot does not predate the configured test start and therefore is not a pre-holdout comparator for this split.",
      },
    },
    references: {
      plainElo: PLAIN_ELO_BASELINE,
      preHoldoutFrozenProductionMapElo:
        PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
      productionMapElo: FIXED_PRODUCTION_MAP_ELO,
      naiveProbability: 0.5,
    },
    evaluatedModelExamples,
    experiments,
    selection: {
      eligibleCandidateIds: allCandidates.map((candidate) => candidate.model.id),
      selectedChallengerId: selectedCandidate?.model.id ?? null,
      rule:
        "Choose the lowest validation log loss among experimental map-Elo candidates only; fixed references are not eligible and can score better. Ties break lexically by model id. Test labels are inaccessible to this choice within the execution.",
      candidateTestMetricsPublished: false,
      testEvaluationPassesWithinRun: 1,
    },
    finalModels,
    conclusion: {
      productionModelChanged: false,
      statement:
        "Backtest results are evidence for review only. The runner never writes Elo configuration or adopts a challenger.",
    },
    limitations,
  };
}

/** Stable JSON text for hashing snapshots/configuration and deterministic fixtures. */
export function stableStringify(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .filter(([, nested]) => nested !== undefined)
          .sort(([a], [b]) => compareIdentifiers(a, b))
          .map(([key, nested]) => [key, sort(nested)])
      );
    }
    return item;
  };
  return JSON.stringify(sort(value));
}
