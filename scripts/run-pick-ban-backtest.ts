import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import {
  DEFAULT_BOOTSTRAP_ITERATIONS,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_DB_SPLIT,
  stableStringify,
  type TemporalSplitConfig,
} from "../lib/elo/backtest";
import {
  PICK_BAN_BACKTEST_IMPLEMENTATION_VERSION,
  runPickBanTemporalBacktest,
  type PickBanBacktestInput,
  type PickBanTemporalBacktestResult,
  type RawPickBanEloRating,
  type RawPickBanMatch,
  type RawPickBanPlayedMap,
  type RawPickBanVeto,
} from "../lib/elo/pick-ban-backtest";
import {
  assertSourceLessPickBanRatingsAreAuditable,
  classifySourceLessPickBanRatings,
} from "../lib/elo/pick-ban-rating-provenance";

const SNAPSHOT_SCHEMA_VERSION = "1.2.0";
const DB_QUERY_VERSION = "pick-ban-veto-maps-ratings-v2";
const RATING_HISTORY_MODEL_VERSION = "unknown-unversioned" as const;
const DEFAULT_SNAPSHOT_PATH = "data/pick-ban-backtest-db-snapshot.json";
const DEFAULT_OUTPUT_PATH = "public/data/pick-ban-backtest.json";
const SOURCE_FILES = [
  "lib/elo/backtest.ts",
  "lib/elo/pick-ban-backtest.ts",
  "lib/elo/pick-ban-policy.ts",
  "lib/predictions/calculations.ts",
  "lib/elo/pick-ban-rating-provenance.ts",
  "scripts/run-pick-ban-backtest.ts",
];

type BacktestSource = "snapshot" | "db";
type ArgumentValue = string | boolean;

interface PickBanSourceExtraction {
  scope: string;
  matchTimestampSource: "matches.completed_at";
  database: {
    transactionTimestampUtc: string;
    databaseName: string;
    serverVersion: string;
    transactionSnapshot: string;
    timezone: "UTC";
  };
  counts: {
    vetoMatches: number;
    vetoRows: number;
    playedMapRows: number;
    eloRatingRows: number;
  };
  sourceQuality: {
    matchesMissingId: number;
    matchesMissingCompletedAt: number;
    matchesMissingParticipants: number;
    matchesMissingScore: number;
    matchesOutsideSupportedBestOf: number;
    vetoesMissingRequiredFields: number;
    nonDeciderVetoesMissingActor: number;
    playedMapsMissingRequiredFields: number;
    ratingsMissingRequiredFields: number;
    ratingsWithoutSourceMatchId: number;
    sourceLessRatingsMatchingHardResetSignature: number;
    sourceLessRatingsOutsideHardResetSignature: number;
    matchTimestampsBeyondMillisecondPrecision: number;
    ratingTimestampsBeyondMillisecondPrecision: number;
  };
  caveats: string[];
}

interface PickBanSnapshotPayload {
  queryVersion: string;
  extraction: PickBanSourceExtraction;
  input: PickBanBacktestInput;
}

interface PickBanSnapshotFile extends PickBanSnapshotPayload {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  exportedAt: string;
  sha256: string;
}

interface PublishedConfiguration {
  split: TemporalSplitConfig;
  bootstrapIterations: number;
  bootstrapSeed: number;
}

interface PickBanBacktestManifest {
  generatedAt: string;
  source: BacktestSource;
  dataSha256: string;
  configSha256: string;
  sourceDescriptor: string;
  sourceSnapshotSha256: string;
  sourceSnapshotFileSha256: string | null;
  sourceSnapshotExportedAt: string | null;
  databaseQueryVersion: string;
  ratingHistoryModelVersion: typeof RATING_HISTORY_MODEL_VERSION;
  sourceCodeSha256: string;
  sourceFiles: string[];
  gitCommit: string | null;
  gitWorkingTree: "clean" | "dirty" | "unknown";
  provenanceCapturedAt: string;
  provenanceCapturePoint: "before input reads and artifact writes";
  sourceExtraction: PickBanSourceExtraction;
  configuration: PublishedConfiguration;
  inputCounts: { matches: number; eloRatings: number };
  inputObservedRange: {
    earliestMatchAt: string | null;
    latestMatchAt: string | null;
  };
  acceptedMatches: number;
}

type PublishedPickBanBacktest = PickBanTemporalBacktestResult & {
  manifest: PickBanBacktestManifest;
};

interface DbMatchRow {
  match_id: string;
  started_at_utc: string | null;
  event_name: string | null;
  region: string | null;
  best_of: number | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
}

interface DbVetoRow {
  match_id: string;
  order_index: number;
  action: string;
  map_name: string;
  team_id: string | null;
  resulted_game_number: number | null;
}

interface DbPlayedMapRow {
  match_id: string;
  game_number: number;
  map_name: string;
  winner_team_id: string;
}

interface DbRatingRow {
  rating_id: string;
  team_id: string;
  map_name: string;
  rating: string | number;
  rating_date_utc: string;
  source_match_id: string | null;
}

interface DbTransactionMetadataRow {
  transaction_timestamp_utc: string;
  database_name: string;
  server_version: string;
  transaction_snapshot: string;
  timezone: string;
}

function parseArguments(argv: string[]): Map<string, ArgumentValue> {
  const parsed = new Map<string, ArgumentValue>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    if (equals >= 0) {
      parsed.set(token.slice(2, equals), token.slice(equals + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(key, next);
      index += 1;
    } else {
      parsed.set(key, true);
    }
  }
  return parsed;
}

function stringArgument(
  args: Map<string, ArgumentValue>,
  key: string,
  fallback: string
): string {
  const value = args.get(key);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${key} requires a value.`);
  }
  return value;
}

function optionalStringArgument(
  args: Map<string, ArgumentValue>,
  key: string,
  fallback: string | null
): string | null {
  const value = args.get(key);
  if (value === undefined) return fallback;
  if (value === true || value === "none" || value === "null") return null;
  return typeof value === "string" ? value : null;
}

function integerArgument(
  args: Map<string, ArgumentValue>,
  key: string,
  fallback: number
): number {
  const raw = args.get(key);
  if (raw === undefined) return fallback;
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${key} must be a positive integer.`);
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function currentCommit(): string | null {
  try {
    const safeDirectory = process.cwd().replaceAll("\\", "/");
    return execFileSync(
      "git",
      ["-c", `safe.directory=${safeDirectory}`, "rev-parse", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    return process.env.GITHUB_SHA ?? null;
  }
}

function gitWorkingTree(): "clean" | "dirty" | "unknown" {
  try {
    const safeDirectory = process.cwd().replaceAll("\\", "/");
    const status = execFileSync(
      "git",
      [
        "-c",
        `safe.directory=${safeDirectory}`,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return status === "" ? "clean" : "dirty";
  } catch {
    return "unknown";
  }
}

async function sourceCodeSha256(): Promise<string> {
  const files = await Promise.all(
    SOURCE_FILES.map(async (file) => ({
      file,
      sha256: sha256(
        (await readFile(path.resolve(file), "utf8")).replaceAll("\r\n", "\n")
      ),
    }))
  );
  return sha256(stableStringify(files));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSnapshotFile(value: unknown, snapshotPath: string): PickBanSnapshotFile {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    typeof value.exportedAt !== "string" ||
    typeof value.sha256 !== "string" ||
    value.queryVersion !== DB_QUERY_VERSION ||
    !isRecord(value.extraction) ||
    !isRecord(value.extraction.database) ||
    !isRecord(value.extraction.counts) ||
    !isRecord(value.extraction.sourceQuality) ||
    !Array.isArray(value.extraction.caveats) ||
    !isRecord(value.input) ||
    !Array.isArray(value.input.matches) ||
    !Array.isArray(value.input.eloRatings)
  ) {
    throw new Error(`Invalid pick/ban backtest snapshot: ${snapshotPath}`);
  }
  return value as unknown as PickBanSnapshotFile;
}

const UTC_MICROSECOND_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function missingIdentifier(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function timestampText(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function timestampBeyondMillisecondPrecision(value: unknown): boolean {
  const match = /\.(\d{6})Z$/.exec(String(value ?? ""));
  return match !== null && match[1].slice(3) !== "000";
}

function derivedExtractionCounts(input: PickBanBacktestInput) {
  return {
    vetoMatches: input.matches.length,
    vetoRows: input.matches.reduce((sum, match) => sum + match.vetoes.length, 0),
    playedMapRows: input.matches.reduce(
      (sum, match) => sum + match.playedMaps.length,
      0
    ),
    eloRatingRows: input.eloRatings.length,
  };
}

function derivedSourceQuality(input: PickBanBacktestInput) {
  const sourceLessRatingQuality = classifySourceLessPickBanRatings(
    input.eloRatings
  );
  return {
    matchesMissingId: input.matches.filter((match) =>
      missingIdentifier(match.matchId)
    ).length,
    matchesMissingCompletedAt: input.matches.filter((match) =>
      missingIdentifier(match.startedAt)
    ).length,
    matchesMissingParticipants: input.matches.filter(
      (match) =>
        missingIdentifier(match.team1Id) || missingIdentifier(match.team2Id)
    ).length,
    matchesMissingScore: input.matches.filter((match) => {
      const team1Score = Number(match.team1Score);
      const team2Score = Number(match.team2Score);
      return (
        !Number.isFinite(team1Score) ||
        !Number.isFinite(team2Score) ||
        team1Score < 0 ||
        team2Score < 0
      );
    }).length,
    matchesOutsideSupportedBestOf: input.matches.filter(
      (match) => match.bestOf !== 3 && match.bestOf !== 5
    ).length,
    vetoesMissingRequiredFields: input.matches.reduce(
      (count, match) =>
        count +
        match.vetoes.filter(
          (veto) =>
            !Number.isSafeInteger(veto.orderIndex) ||
            missingIdentifier(veto.action) ||
            missingIdentifier(veto.mapName)
        ).length,
      0
    ),
    nonDeciderVetoesMissingActor: input.matches.reduce(
      (count, match) =>
        count +
        match.vetoes.filter(
          (veto) =>
            String(veto.action).toLocaleLowerCase("en-US") !== "decider" &&
            missingIdentifier(veto.teamId)
        ).length,
      0
    ),
    playedMapsMissingRequiredFields: input.matches.reduce(
      (count, match) =>
        count +
        match.playedMaps.filter(
          (map) =>
            !Number.isSafeInteger(map.gameNumber) ||
            missingIdentifier(map.mapName) ||
            missingIdentifier(map.winnerTeamId)
        ).length,
      0
    ),
    ratingsMissingRequiredFields: input.eloRatings.filter(
      (rating) =>
        missingIdentifier(rating.teamId) ||
        missingIdentifier(rating.mapName) ||
        missingIdentifier(rating.ratingDate) ||
        !Number.isFinite(Number(rating.rating))
    ).length,
    ...sourceLessRatingQuality,
    matchTimestampsBeyondMillisecondPrecision: input.matches.filter((match) =>
      timestampBeyondMillisecondPrecision(match.startedAt)
    ).length,
    ratingTimestampsBeyondMillisecondPrecision: input.eloRatings.filter((rating) =>
      timestampBeyondMillisecondPrecision(rating.ratingDate)
    ).length,
  };
}

function assertExtractionConsistency(
  extraction: PickBanSourceExtraction,
  input: PickBanBacktestInput,
  snapshotPath: string
): void {
  const expectedCounts = derivedExtractionCounts(input);
  const expectedQuality = derivedSourceQuality(input);
  if (stableStringify(extraction.counts) !== stableStringify(expectedCounts)) {
    throw new Error(
      `Snapshot extraction counts do not match its payload: ${snapshotPath}`
    );
  }
  if (
    stableStringify(extraction.sourceQuality) !== stableStringify(expectedQuality)
  ) {
    throw new Error(
      `Snapshot extraction quality audit does not match its payload: ${snapshotPath}`
    );
  }
  if (
    expectedQuality.matchTimestampsBeyondMillisecondPrecision > 0 ||
    expectedQuality.ratingTimestampsBeyondMillisecondPrecision > 0
  ) {
    throw new Error(
      `Snapshot contains analytical timestamps beyond JavaScript millisecond precision: ${snapshotPath}`
    );
  }
  assertSourceLessPickBanRatingsAreAuditable(
    input.eloRatings,
    `Snapshot ${snapshotPath}`
  );
  const malformedAnalyticalTimestamp =
    input.matches.some(
      (match) =>
        !missingIdentifier(match.startedAt) &&
        !UTC_MICROSECOND_TIMESTAMP.test(timestampText(match.startedAt))
    ) ||
    input.eloRatings.some(
      (rating) =>
        !missingIdentifier(rating.ratingDate) &&
        !UTC_MICROSECOND_TIMESTAMP.test(timestampText(rating.ratingDate))
    );
  if (malformedAnalyticalTimestamp) {
    throw new Error(
      `Snapshot analytical timestamps must use six-digit UTC text: ${snapshotPath}`
    );
  }
  if (
    extraction.matchTimestampSource !== "matches.completed_at" ||
    extraction.database.timezone !== "UTC" ||
    !UTC_MICROSECOND_TIMESTAMP.test(
      extraction.database.transactionTimestampUtc
    ) ||
    extraction.database.databaseName.trim() === "" ||
    extraction.database.serverVersion.trim() === "" ||
    extraction.database.transactionSnapshot.trim() === ""
  ) {
    throw new Error(`Snapshot database provenance is invalid: ${snapshotPath}`);
  }
}

function inputObservedRange(input: PickBanBacktestInput) {
  const timestamps = input.matches
    .map((match) => {
      const text = timestampText(match.startedAt);
      return { text, milliseconds: new Date(text).getTime() };
    })
    .filter((timestamp) => Number.isFinite(timestamp.milliseconds))
    .sort(
      (a, b) =>
        a.milliseconds - b.milliseconds || a.text.localeCompare(b.text, "en-US")
    );
  return {
    earliestMatchAt:
      timestamps.length === 0 ? null : timestamps[0].text,
    latestMatchAt:
      timestamps.length === 0
        ? null
        : timestamps[timestamps.length - 1].text,
  };
}

async function loadSnapshot(snapshotPath: string) {
  const file = await readFile(snapshotPath);
  const snapshot = assertSnapshotFile(
    JSON.parse(file.toString("utf8")) as unknown,
    snapshotPath
  );
  const payload: PickBanSnapshotPayload = {
    queryVersion: snapshot.queryVersion,
    extraction: snapshot.extraction,
    input: snapshot.input,
  };
  const calculatedSha = sha256(stableStringify(payload));
  if (calculatedSha !== snapshot.sha256) {
    throw new Error(
      `Pick/ban snapshot hash mismatch: expected ${snapshot.sha256}, calculated ${calculatedSha}.`
    );
  }
  assertExtractionConsistency(snapshot.extraction, snapshot.input, snapshotPath);
  if (
    snapshot.exportedAt !==
    snapshot.extraction.database.transactionTimestampUtc
  ) {
    throw new Error(
      `Snapshot exportedAt must equal the database transaction timestamp: ${snapshotPath}`
    );
  }
  return {
    payload,
    exportedAt: snapshot.exportedAt,
    sha256: calculatedSha,
    fileSha256: sha256(file),
  };
}

function groupByMatch<T extends { match_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.match_id) ?? [];
    values.push(row);
    grouped.set(row.match_id, values);
  }
  return grouped;
}

function databaseInput(
  matchRows: DbMatchRow[],
  vetoRows: DbVetoRow[],
  playedMapRows: DbPlayedMapRow[],
  ratingRows: DbRatingRow[]
): PickBanBacktestInput {
  const vetoesByMatch = groupByMatch(vetoRows);
  const playedMapsByMatch = groupByMatch(playedMapRows);
  const matches: RawPickBanMatch[] = matchRows.map((match) => ({
    matchId: match.match_id,
    startedAt: match.started_at_utc ?? "",
    event: match.event_name,
    region: match.region,
    bestOf: match.best_of ?? -1,
    team1Id: match.team1_id ?? "",
    team2Id: match.team2_id ?? "",
    team1Score: match.team1_score ?? -1,
    team2Score: match.team2_score ?? -1,
    vetoes: (vetoesByMatch.get(match.match_id) ?? []).map(
      (veto): RawPickBanVeto => ({
        orderIndex: veto.order_index,
        action: veto.action,
        mapName: veto.map_name,
        teamId: veto.team_id,
        resultedGameNumber: veto.resulted_game_number,
      })
    ),
    playedMaps: (playedMapsByMatch.get(match.match_id) ?? []).map(
      (map): RawPickBanPlayedMap => ({
        gameNumber: map.game_number,
        mapName: map.map_name,
        winnerTeamId: map.winner_team_id,
      })
    ),
  }));
  const eloRatings: RawPickBanEloRating[] = ratingRows.map((rating) => ({
    ratingId: rating.rating_id,
    teamId: rating.team_id,
    mapName: rating.map_name,
    rating: Number(rating.rating),
    ratingDate: rating.rating_date_utc,
    sourceMatchId: rating.source_match_id,
  }));
  return { matches, eloRatings };
}

function extractionSummary(
  input: PickBanBacktestInput,
  database: PickBanSourceExtraction["database"]
): PickBanSourceExtraction {
  return {
    scope:
      "Every matches row referenced by match_vetoes, all ordered vetoes and played maps for those matches, and the complete Elo rating history",
    matchTimestampSource: "matches.completed_at",
    database,
    counts: derivedExtractionCounts(input),
    sourceQuality: derivedSourceQuality(input),
    caveats: [
      "The schema has no match-start column, so matches.completed_at is the supplied timestamp proxy; ratings from the target match are additionally excluded by source_match_id.",
      "Database extraction counts describe stored rows and cannot measure matches or vetoes the upstream source never exposed or the scraper never discovered.",
      "Source-less rating rows are accepted only when they exactly match the hard-reset signature: rating 1000 at January 1 00:00:00 UTC. Generation and replay fail closed for every other source-less row because target-series exclusion cannot be proven.",
      "Historical Elo rows have no stored model-version field; their model version is explicitly reported as unknown-unversioned.",
      "Match and rating timestamps are serialized in UTC with six fractional digits. Extraction fails if any analytical timestamp has non-zero precision beyond milliseconds because the current analysis contract uses JavaScript Date.",
      "Played-map game numbers are normalized to contiguous series order using stored game_number then map id because the source column can be sparse.",
    ],
  };
}

async function loadDatabase(): Promise<{ payload: PickBanSnapshotPayload }> {
  loadEnv({ path: ".env.local" });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for --source=db.");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
  });
  try {
    const extracted = await sql.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        await transaction.unsafe("SET LOCAL TIME ZONE 'UTC'");
        const transactionMetadataRows =
          await transaction.unsafe<DbTransactionMetadataRow[]>(`
            SELECT
              to_char(
                transaction_timestamp(),
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              ) AS transaction_timestamp_utc,
              current_database()::text AS database_name,
              current_setting('server_version') AS server_version,
              txid_current_snapshot()::text AS transaction_snapshot,
              current_setting('TimeZone') AS timezone
          `);
        const matchRows = await transaction.unsafe<DbMatchRow[]>(`
          SELECT
            m.id::text AS match_id,
            CASE
              WHEN m.completed_at IS NULL THEN NULL
              ELSE to_char(
                m.completed_at,
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              )
            END AS started_at_utc,
            m.event_name,
            m.region,
            m.best_of,
            m.team1_id::text,
            m.team2_id::text,
            m.team1_score,
            m.team2_score
          FROM matches m
          WHERE EXISTS (
            SELECT 1 FROM match_vetoes veto WHERE veto.match_id = m.id
          )
          ORDER BY m.completed_at NULLS LAST, m.id
        `);
        const vetoRows = await transaction.unsafe<DbVetoRow[]>(`
          SELECT
            veto.match_id::text,
            veto.order_index,
            veto.action,
            veto.map_name,
            veto.team_id::text,
            veto.resulted_game_number
          FROM match_vetoes veto
          ORDER BY veto.match_id, veto.order_index, veto.id
        `);
        const playedMapRows = await transaction.unsafe<DbPlayedMapRow[]>(`
          SELECT
            map.match_id::text,
            row_number() OVER (
              PARTITION BY map.match_id
              ORDER BY map.game_number, map.id
            )::integer AS game_number,
            map.map_name,
            map.winner_team_id::text
          FROM maps map
          WHERE map.match_id IN (SELECT DISTINCT match_id FROM match_vetoes)
          ORDER BY map.match_id, map.game_number, map.id
        `);
        const ratingRows = await transaction.unsafe<DbRatingRow[]>(`
          SELECT
            rating.id::text AS rating_id,
            rating.team_id::text,
            rating.map_name,
            rating.rating,
            to_char(
              rating.rating_date,
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) AS rating_date_utc,
            source_map.match_id::text AS source_match_id
          FROM elo_ratings rating
          LEFT JOIN maps source_map ON source_map.id = rating.map_played_id
          ORDER BY rating.rating_date, rating.team_id, rating.map_name, rating.id
        `);
        return {
          transactionMetadataRows,
          matchRows,
          vetoRows,
          playedMapRows,
          ratingRows,
        };
      }
    );
    const transactionMetadataRows =
      extracted.transactionMetadataRows as unknown as DbTransactionMetadataRow[];
    const matchRows = extracted.matchRows as unknown as DbMatchRow[];
    const vetoRows = extracted.vetoRows as unknown as DbVetoRow[];
    const playedMapRows = extracted.playedMapRows as unknown as DbPlayedMapRow[];
    const ratingRows = extracted.ratingRows as unknown as DbRatingRow[];
    const transactionMetadata = transactionMetadataRows[0];
    if (!transactionMetadata) {
      throw new Error("Database transaction provenance query returned no row.");
    }
    if (transactionMetadata.timezone !== "UTC") {
      throw new Error(
        `Database transaction timezone must be UTC; received ${transactionMetadata.timezone}.`
      );
    }
    const input = databaseInput(matchRows, vetoRows, playedMapRows, ratingRows);
    assertSourceLessPickBanRatingsAreAuditable(
      input.eloRatings,
      "Database extraction"
    );
    const extraction = extractionSummary(input, {
      transactionTimestampUtc: transactionMetadata.transaction_timestamp_utc,
      databaseName: transactionMetadata.database_name,
      serverVersion: transactionMetadata.server_version,
      transactionSnapshot: transactionMetadata.transaction_snapshot,
      timezone: "UTC",
    });
    if (
      extraction.sourceQuality.matchTimestampsBeyondMillisecondPrecision > 0 ||
      extraction.sourceQuality.ratingTimestampsBeyondMillisecondPrecision > 0
    ) {
      throw new Error(
        "Pick/ban extraction contains analytical timestamps beyond JavaScript millisecond precision; refusing to generate a snapshot."
      );
    }
    return {
      payload: {
        queryVersion: DB_QUERY_VERSION,
        extraction,
        input,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/run-pick-ban-backtest.ts [options]

  --source snapshot|db        Input source (default: snapshot)
  --input PATH                Snapshot input (default: ${DEFAULT_SNAPSHOT_PATH})
  --output PATH               Published JSON output (default: ${DEFAULT_OUTPUT_PATH})
  --train-end ISO             Exclusive train boundary
  --validation-end ISO        Exclusive validation boundary / holdout start
  --test-end ISO|none         Optional exclusive holdout end
  --bootstrap-iterations N    Deterministic block-bootstrap draws (default: ${DEFAULT_BOOTSTRAP_ITERATIONS})
  --seed N                    Bootstrap seed (default: ${DEFAULT_BOOTSTRAP_SEED})
  --snapshot [PATH]           With DB, write a reproducible snapshot
  --help                      Show this message

Default split: train < ${DEFAULT_DB_SPLIT.trainEndExclusive}, validation < ${DEFAULT_DB_SPLIT.validationEndExclusive}, then holdout.
The DB path uses a repeatable-read, read-only transaction and performs no writes.`);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }
  const sourceValue = stringArgument(args, "source", "snapshot");
  if (sourceValue !== "snapshot" && sourceValue !== "db") {
    throw new Error("--source must be snapshot or db.");
  }
  const source: BacktestSource = sourceValue;
  const configuration: PublishedConfiguration = {
    split: {
      trainEndExclusive: stringArgument(
        args,
        "train-end",
        DEFAULT_DB_SPLIT.trainEndExclusive
      ),
      validationEndExclusive: stringArgument(
        args,
        "validation-end",
        DEFAULT_DB_SPLIT.validationEndExclusive
      ),
      testEndExclusive: optionalStringArgument(
        args,
        "test-end",
        DEFAULT_DB_SPLIT.testEndExclusive
      ),
    },
    bootstrapIterations: integerArgument(
      args,
      "bootstrap-iterations",
      DEFAULT_BOOTSTRAP_ITERATIONS
    ),
    bootstrapSeed: integerArgument(args, "seed", DEFAULT_BOOTSTRAP_SEED),
  };
  const outputPath = path.resolve(
    stringArgument(args, "output", DEFAULT_OUTPUT_PATH)
  );

  const generatedAt = new Date().toISOString();
  const provenanceCapturedAt = new Date().toISOString();
  const sourceCodeHashAtStart = await sourceCodeSha256();
  const gitCommitAtStart = currentCommit();
  const gitWorkingTreeAtStart = gitWorkingTree();

  let payload: PickBanSnapshotPayload;
  let dataSha256: string;
  let sourceSnapshotFileSha256: string | null = null;
  let sourceSnapshotExportedAt: string | null = null;
  let sourceDescriptor: string;

  if (source === "snapshot") {
    const inputPath = path.resolve(
      stringArgument(args, "input", DEFAULT_SNAPSHOT_PATH)
    );
    const snapshot = await loadSnapshot(inputPath);
    payload = snapshot.payload;
    dataSha256 = snapshot.sha256;
    sourceSnapshotFileSha256 = snapshot.fileSha256;
    sourceSnapshotExportedAt = snapshot.exportedAt;
    sourceDescriptor = `${path
      .relative(process.cwd(), inputPath)
      .replaceAll("\\", "/")} (${payload.queryVersion})`;
  } else {
    const database = await loadDatabase();
    payload = database.payload;
    dataSha256 = sha256(stableStringify(payload));
    sourceDescriptor =
      "PostgreSQL matches, match_vetoes, maps, and Elo history (repeatable-read read-only extraction)";
    if (args.has("snapshot")) {
      const configured = args.get("snapshot");
      const snapshotPath = path.resolve(
        typeof configured === "string" ? configured : DEFAULT_SNAPSHOT_PATH
      );
      const snapshotExportedAt =
        payload.extraction.database.transactionTimestampUtc;
      const snapshotContents = `${JSON.stringify(
        {
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          exportedAt: snapshotExportedAt,
          sha256: dataSha256,
          ...payload,
        } satisfies PickBanSnapshotFile,
        null,
        2
      )}\n`;
      const snapshotBuffer = Buffer.from(snapshotContents, "utf8");
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeFile(snapshotPath, snapshotBuffer);
      sourceSnapshotFileSha256 = sha256(snapshotBuffer);
      sourceSnapshotExportedAt = snapshotExportedAt;
    }
  }

  const configPayload = {
    implementationVersion: PICK_BAN_BACKTEST_IMPLEMENTATION_VERSION,
    ratingHistoryModelVersion: RATING_HISTORY_MODEL_VERSION,
    source,
    databaseQueryVersion: payload.queryVersion,
    ...configuration,
  };
  const result = runPickBanTemporalBacktest(payload.input, {
    split: configuration.split,
    bootstrapIterations: configuration.bootstrapIterations,
    bootstrapSeed: configuration.bootstrapSeed,
  });
  const published: PublishedPickBanBacktest = {
    ...result,
    manifest: {
      generatedAt,
      source,
      dataSha256,
      configSha256: sha256(stableStringify(configPayload)),
      sourceDescriptor,
      sourceSnapshotSha256: dataSha256,
      sourceSnapshotFileSha256,
      sourceSnapshotExportedAt,
      databaseQueryVersion: payload.queryVersion,
      ratingHistoryModelVersion: RATING_HISTORY_MODEL_VERSION,
      sourceCodeSha256: sourceCodeHashAtStart,
      sourceFiles: SOURCE_FILES,
      gitCommit: gitCommitAtStart,
      gitWorkingTree: gitWorkingTreeAtStart,
      provenanceCapturedAt,
      provenanceCapturePoint: "before input reads and artifact writes",
      sourceExtraction: payload.extraction,
      configuration,
      inputCounts: {
        matches: payload.input.matches.length,
        eloRatings: payload.input.eloRatings.length,
      },
      inputObservedRange: inputObservedRange(payload.input),
      acceptedMatches: result.dataQuality.acceptedMatches,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(published, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: outputPath,
        source,
        dataSha256,
        acceptedMatches: result.dataQuality.acceptedMatches,
        rejectedMatches: result.dataQuality.rejectedMatches,
        splitCounts: result.split.counts,
        coldStartRate: result.coldStartCoverage.coldStartRate,
        causalConclusion: result.conclusion.causal,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
