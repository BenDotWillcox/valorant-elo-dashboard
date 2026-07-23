import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import {
  BACKTEST_IMPLEMENTATION_VERSION,
  DEFAULT_BOOTSTRAP_ITERATIONS,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_CSV_SPLIT,
  DEFAULT_DB_SPLIT,
  normalizeBacktestRows,
  parseBacktestCsv,
  runTemporalBacktest,
  stableStringify,
  type BacktestMap,
  type BacktestSource,
  type RawBacktestRow,
  type SourceExtractionSummary,
  type TemporalSplitConfig,
} from "../lib/elo/backtest";
import { MAP_ELO_MODEL_VERSION } from "../lib/elo/elo-calculator";

const DB_QUERY_VERSION = "maps-with-last-observed-roster-v4";
const SOURCE_FILES = [
  "lib/elo/backtest.ts",
  "lib/elo/elo-calculator.ts",
  "scripts/run-elo-backtest.ts",
];

type ArgumentValue = string | boolean;

function parseArguments(argv: string[]): Map<string, ArgumentValue> {
  const argumentsMap = new Map<string, ArgumentValue>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    if (equals >= 0) {
      argumentsMap.set(token.slice(2, equals), token.slice(equals + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      argumentsMap.set(key, next);
      index += 1;
    } else {
      argumentsMap.set(key, true);
    }
  }
  return argumentsMap;
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
      [
        "-c",
        `safe.directory=${safeDirectory}`,
        "rev-parse",
        "HEAD",
      ],
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

interface DbSourceRow {
  source_row_id: string;
  series_id: string | null;
  completed_at_utc: string | null;
  game_number: number;
  map_name: string;
  winner_team_id: string;
  winner_team_name: string;
  loser_team_id: string;
  loser_team_name: string;
  winner_rounds: number;
  loser_rounds: number;
  region: string | null;
  event_name: string | null;
  winner_roster: unknown;
  loser_roster: unknown;
  source_url: string | null;
}

interface DbSnapshotPayload {
  queryVersion: string;
  extraction: SourceExtractionSummary;
  rows: DbSourceRow[];
  neutralRows: BacktestMap[];
}

interface DbSnapshotFile extends DbSnapshotPayload {
  schemaVersion: "1.1.0";
  exportedAt: string;
  sha256: string;
}

interface DbExtractionCountRow {
  total_maps: number | string;
  processed_maps: number | string;
  unprocessed_maps: number | string;
  maps_without_completed_at: number | string;
  processed_maps_without_completed_at: number | string;
}

async function loadDatabaseRows(): Promise<{
  parsed: ReturnType<typeof normalizeBacktestRows>;
  snapshotPayload: DbSnapshotPayload;
}> {
  loadEnv({ path: ".env.local" });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for --source=db.");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15, idle_timeout: 5 });
  try {
    const database = await sql.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
      const [counts] = await transaction.unsafe<DbExtractionCountRow[]>(`
        SELECT
          count(*) AS total_maps,
          count(*) FILTER (WHERE processed = TRUE) AS processed_maps,
          count(*) FILTER (WHERE processed IS NOT TRUE) AS unprocessed_maps,
          count(*) FILTER (WHERE completed_at IS NULL) AS maps_without_completed_at,
          count(*) FILTER (WHERE processed = TRUE AND completed_at IS NULL) AS processed_maps_without_completed_at
        FROM maps
      `);
      const rows = await transaction.unsafe<DbSourceRow[]>(`
        SELECT
          m.id::text AS source_row_id,
          CASE
            WHEN mt.vlr_match_id IS NOT NULL THEN 'vlr:' || mt.vlr_match_id::text
            WHEN m.match_id IS NOT NULL THEN 'match:' || m.match_id::text
            ELSE NULL
          END AS series_id,
          CASE
            WHEN m.completed_at IS NULL THEN NULL
            ELSE to_char(
              m.completed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          END AS completed_at_utc,
          m.game_number,
          m.map_name,
          m.winner_team_id::text,
          winner.name AS winner_team_name,
          m.loser_team_id::text,
          loser.name AS loser_team_name,
          m.winner_rounds,
          m.loser_rounds,
          m.region,
          m.event_name,
          COALESCE((
            SELECT jsonb_agg(roster.player_id ORDER BY roster.player_id)
            FROM (
              SELECT DISTINCT pms.player_id::text AS player_id
              FROM player_map_stats pms
              WHERE pms.map_id = m.id AND pms.team_id = m.winner_team_id
            ) roster
          ), '[]'::jsonb) AS winner_roster,
          COALESCE((
            SELECT jsonb_agg(roster.player_id ORDER BY roster.player_id)
            FROM (
              SELECT DISTINCT pms.player_id::text AS player_id
              FROM player_map_stats pms
              WHERE pms.map_id = m.id AND pms.team_id = m.loser_team_id
            ) roster
          ), '[]'::jsonb) AS loser_roster,
          CASE
            WHEN mt.vlr_match_id IS NULL THEN NULL
            ELSE 'https://www.vlr.gg/' || mt.vlr_match_id::text
          END AS source_url
        FROM maps m
        LEFT JOIN matches mt ON mt.id = m.match_id
        JOIN teams winner ON winner.id = m.winner_team_id
        JOIN teams loser ON loser.id = m.loser_team_id
        WHERE m.processed = TRUE
        ORDER BY m.completed_at NULLS LAST, m.match_id NULLS LAST, m.game_number, m.id
      `);
        return { counts, rows };
      }
    );
    const dbRows = database.rows as unknown as DbSourceRow[];
    const processedMaps = Number(database.counts.processed_maps);
    const extraction: SourceExtractionSummary = {
      scope:
        "maps where processed = true; required winner and loser team joins; completed_at and score validity are checked during normalization",
      totalMaps: Number(database.counts.total_maps),
      processedMaps,
      unprocessedMaps: Number(database.counts.unprocessed_maps),
      mapsWithoutCompletedAt: Number(database.counts.maps_without_completed_at),
      processedMapsWithoutCompletedAt: Number(
        database.counts.processed_maps_without_completed_at
      ),
      extractedProcessedRows: dbRows.length,
      processedRowsExcludedByRequiredTeamJoins: Math.max(0, processedMaps - dbRows.length),
    };
    const rawRows: RawBacktestRow[] = dbRows.map((row, index) => ({
      sourceRowNumber: index + 1,
      sourceRowId: row.source_row_id,
      seriesId: row.series_id,
      completedAt: row.completed_at_utc,
      gameNumber: row.game_number,
      mapName: row.map_name,
      winnerTeamId: row.winner_team_id,
      winnerTeamName: row.winner_team_name,
      loserTeamId: row.loser_team_id,
      loserTeamName: row.loser_team_name,
      winnerScore: row.winner_rounds,
      loserScore: row.loser_rounds,
      region: row.region,
      event: row.event_name,
      winnerRosterPlayerIds: row.winner_roster,
      loserRosterPlayerIds: row.loser_roster,
    }));
    const parsed = normalizeBacktestRows(rawRows, "db");
    return {
      parsed,
      snapshotPayload: {
        queryVersion: DB_QUERY_VERSION,
        extraction,
        rows: dbRows,
        neutralRows: parsed.rows,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loadSnapshotRows(snapshotPath: string): Promise<{
  parsed: ReturnType<typeof normalizeBacktestRows>;
  payload: DbSnapshotPayload;
  exportedAt: string;
  sha256: string;
  fileSha256: string;
}> {
  const snapshotFile = await readFile(snapshotPath);
  const snapshot = JSON.parse(snapshotFile.toString("utf8")) as DbSnapshotFile;
  if (
    snapshot.schemaVersion !== "1.1.0" ||
    typeof snapshot.extraction !== "object" ||
    snapshot.extraction === null ||
    !Array.isArray(snapshot.rows) ||
    !Array.isArray(snapshot.neutralRows) ||
    typeof snapshot.queryVersion !== "string" ||
    typeof snapshot.exportedAt !== "string" ||
    typeof snapshot.sha256 !== "string"
  ) {
    throw new Error(`Invalid backtest snapshot: ${snapshotPath}`);
  }

  const payload: DbSnapshotPayload = {
    queryVersion: snapshot.queryVersion,
    extraction: snapshot.extraction,
    rows: snapshot.rows,
    neutralRows: snapshot.neutralRows,
  };
  const calculatedSha = sha256(stableStringify(payload));
  if (calculatedSha !== snapshot.sha256) {
    throw new Error(
      `Backtest snapshot hash mismatch: expected ${snapshot.sha256}, calculated ${calculatedSha}.`
    );
  }

  const rawRows: RawBacktestRow[] = snapshot.rows.map((row, index) => ({
    sourceRowNumber: index + 1,
    sourceRowId: row.source_row_id,
    seriesId: row.series_id,
    completedAt: row.completed_at_utc,
    gameNumber: row.game_number,
    mapName: row.map_name,
    winnerTeamId: row.winner_team_id,
    winnerTeamName: row.winner_team_name,
    loserTeamId: row.loser_team_id,
    loserTeamName: row.loser_team_name,
    winnerScore: row.winner_rounds,
    loserScore: row.loser_rounds,
    region: row.region,
    event: row.event_name,
    winnerRosterPlayerIds: row.winner_roster,
    loserRosterPlayerIds: row.loser_roster,
  }));
  const parsed = normalizeBacktestRows(rawRows, "snapshot");
  if (stableStringify(parsed.rows) !== stableStringify(snapshot.neutralRows)) {
    throw new Error(
      "Snapshot neutral rows no longer match normalization output; review the parser or regenerate the snapshot."
    );
  }

  return {
    parsed,
    payload,
    exportedAt: snapshot.exportedAt,
    sha256: calculatedSha,
    fileSha256: sha256(snapshotFile.toString("utf8").replaceAll("\r\n", "\n")),
  };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/run-elo-backtest.ts [options]

  --source csv|snapshot|db    Input source (default: snapshot)
  --input PATH                CSV or snapshot path
  --output PATH               JSON output (default: public/data/elo-backtest.json)
  --train-end ISO             Exclusive train boundary
  --validation-end ISO        Exclusive validation boundary / test start
  --test-end ISO|none         Optional exclusive holdout end
  --bootstrap-iterations N    Deterministic block-bootstrap draws (default: 500)
  --seed N                    Bootstrap seed (default: 20250308)
  --snapshot [PATH]           With DB, save raw provenance plus neutral reproducible rows
  --help                      Show this message

DB defaults: train < 2025-01-01, validation < 2025-09-01, then holdout.
CSV defaults: train < 2024-06-01, validation < 2024-07-15, test < 2024-09-01.`);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }
  const sourceValue = stringArgument(args, "source", "snapshot");
  if (sourceValue !== "csv" && sourceValue !== "snapshot" && sourceValue !== "db") {
    throw new Error("--source must be csv, snapshot, or db.");
  }
  const source: BacktestSource = sourceValue;
  const defaults = source === "csv" ? DEFAULT_CSV_SPLIT : DEFAULT_DB_SPLIT;
  const split: TemporalSplitConfig = {
    trainEndExclusive: stringArgument(args, "train-end", defaults.trainEndExclusive),
    validationEndExclusive: stringArgument(
      args,
      "validation-end",
      defaults.validationEndExclusive
    ),
    testEndExclusive: optionalStringArgument(args, "test-end", defaults.testEndExclusive),
  };
  const bootstrapIterations = integerArgument(
    args,
    "bootstrap-iterations",
    DEFAULT_BOOTSTRAP_ITERATIONS
  );
  const bootstrapSeed = integerArgument(args, "seed", DEFAULT_BOOTSTRAP_SEED);
  const outputPath = path.resolve(
    stringArgument(args, "output", "public/data/elo-backtest.json")
  );
  const analysisGeneratedAt = new Date().toISOString();
  const provenanceCapturedAt = new Date().toISOString();
  const sourceCodeHashAtStart = await sourceCodeSha256();
  const gitCommitAtStart = currentCommit();
  const gitWorkingTreeAtStart = gitWorkingTree();

  let parsed: ReturnType<typeof parseBacktestCsv>;
  let dataSha256: string;
  let snapshotSha256: string | null = null;
  let snapshotFileSha256: string | null = null;
  let snapshotExportedAt: string | null = null;
  let sourceExtraction: SourceExtractionSummary | null = null;
  let sourceDescriptor: string;
  let databaseQueryVersion: string | null = null;

  if (source === "csv") {
    const inputPath = path.resolve(stringArgument(args, "input", "data/matches.csv"));
    const csv = await readFile(inputPath);
    dataSha256 = sha256(csv);
    parsed = parseBacktestCsv(csv.toString("utf8"));
    sourceDescriptor = path.relative(process.cwd(), inputPath).replaceAll("\\", "/");
  } else if (source === "snapshot") {
    const inputPath = path.resolve(
      stringArgument(args, "input", "data/elo-backtest-db-snapshot.json")
    );
    const snapshot = await loadSnapshotRows(inputPath);
    parsed = snapshot.parsed;
    dataSha256 = snapshot.sha256;
    snapshotSha256 = snapshot.sha256;
    snapshotFileSha256 = snapshot.fileSha256;
    snapshotExportedAt = snapshot.exportedAt;
    sourceExtraction = snapshot.payload.extraction;
    databaseQueryVersion = snapshot.payload.queryVersion;
    sourceDescriptor = `${path
      .relative(process.cwd(), inputPath)
      .replaceAll("\\", "/")} (${snapshot.payload.queryVersion})`;
  } else {
    const database = await loadDatabaseRows();
    databaseQueryVersion = database.snapshotPayload.queryVersion;
    sourceExtraction = database.snapshotPayload.extraction;
    parsed = database.parsed;
    const canonicalSnapshot = stableStringify(database.snapshotPayload);
    dataSha256 = sha256(canonicalSnapshot);
    snapshotSha256 = dataSha256;
    sourceDescriptor = "PostgreSQL maps joined to matches, teams, and player_map_stats (read-only)";
    if (args.has("snapshot")) {
      const configured = args.get("snapshot");
      const snapshotPath = path.resolve(
        typeof configured === "string" ? configured : "data/elo-backtest-db-snapshot.json"
      );
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      const snapshotContents = `${JSON.stringify(
        {
          schemaVersion: "1.1.0",
          exportedAt: analysisGeneratedAt,
          sha256: snapshotSha256,
          ...database.snapshotPayload,
        },
        null,
        2
      )}\n`;
      await writeFile(snapshotPath, snapshotContents, "utf8");
      snapshotFileSha256 = sha256(snapshotContents);
      snapshotExportedAt = analysisGeneratedAt;
    }
  }

  const configPayload = {
    implementationVersion: BACKTEST_IMPLEMENTATION_VERSION,
    evaluatedModelVersion: MAP_ELO_MODEL_VERSION,
    source,
    split,
    bootstrapIterations,
    bootstrapSeed,
    databaseQueryVersion,
  };
  const result = runTemporalBacktest(parsed, {
    split,
    bootstrapIterations,
    bootstrapSeed,
    manifest: {
      generatedAt: analysisGeneratedAt,
      dataSha256,
      configSha256: sha256(stableStringify(configPayload)),
      sourceDescriptor,
      sourceSnapshotSha256: snapshotSha256,
      sourceSnapshotFileSha256: snapshotFileSha256,
      sourceSnapshotExportedAt: snapshotExportedAt,
      evaluatedModelVersion: MAP_ELO_MODEL_VERSION,
      sourceCodeSha256: sourceCodeHashAtStart,
      sourceFiles: SOURCE_FILES,
      gitCommit: gitCommitAtStart,
      gitWorkingTree: gitWorkingTreeAtStart,
      provenanceCapturedAt,
      provenanceCapturePoint: "before input reads and artifact writes",
      sourceExtraction,
    },
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: outputPath,
        source,
        dataSha256,
        acceptedRows: result.dataQuality.acceptedRows,
        rejectedRows: result.dataQuality.rejectedRows,
        splitCounts: result.split.counts,
        selectedChallengerId: result.selection.selectedChallengerId,
        productionModelChanged: result.conclusion.productionModelChanged,
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
