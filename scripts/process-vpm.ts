// Full VPM rebuild matching the player_rating_2 notebook pipeline.

import crypto from "node:crypto";
import { db } from "@/db/db";
import {
  eloRatingsTable,
  mapsTable,
  playerMapStatsTable as pmsTable,
  vpmModelMetaTable,
  vpmPlayerKfTable,
  vpmPlayerLatestTable,
  vpmPlayerMapTable,
  type NewVpmPlayerKf,
  type NewVpmPlayerLatest,
  type NewVpmPlayerMap,
} from "@/db/schema";
import { sql } from "drizzle-orm";

const COMPONENTS = [
  "kpr",
  "dpr",
  "apr",
  "fk_att_rate",
  "fk_win_rate",
  "adr_pr",
  "kast01",
] as const;

type Component = (typeof COMPONENTS)[number];
type PreKey = `pre_${Component}`;

const BETAS: Record<Component, number> = {
  kpr: 0.992,
  dpr: 0.992,
  apr: 0.992,
  fk_att_rate: 0.99,
  fk_win_rate: 0.985,
  adr_pr: 0.993,
  kast01: 0.991,
};

const ROW_BETA = 0.998;
const KF_DEFAULT = { a: 0.995, q: 0.05, r0: 1.0, use_days: true };
const OPP_ELO_BONUS_PER_100 = 0.15;
const WIN_BONUS = 0.2;
const LOSS_PENALTY = 0.2;
const DRY_RUN = process.argv.includes("--dry-run");

type SourceRow = {
  id: number;
  matchId: number;
  mapId: number;
  gameNumber: number;
  teamId: number;
  playerId: number;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
  fk: number;
  fd: number;
  adr: number | null;
  kast: string | number | null;
  roundsPlayed: number | null;
  gameDate: Date;
  winnerTeamId: number;
  loserTeamId: number;
  winnerRounds: number;
  loserRounds: number;
  totalRounds: number;
};

type ModelRow = SourceRow & Record<PreKey, number | null>;

type TeamMapTrainingRow = {
  date: Date;
  features: number[];
  y24: number;
  sampleWeight: number;
};

type PlayerDpmRow = {
  playerId: number;
  teamId: number;
  matchId: number;
  mapId: number;
  gameDate: Date;
  dpm: number;
  totalRounds: number;
};

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDiv(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return Number.NaN;
  return a / b;
}

function normalizeDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date: Date) {
  return normalizeDate(date).toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((normalizeDate(a).getTime() - normalizeDate(b).getTime()) / 86400000);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function loadSourceRows() {
  const rows = await db
    .select({
      id: pmsTable.id,
      matchId: pmsTable.match_id,
      mapId: pmsTable.map_id,
      gameNumber: pmsTable.game_number,
      teamId: pmsTable.team_id,
      playerId: pmsTable.player_id,
      agent: pmsTable.agent,
      kills: pmsTable.kills,
      deaths: pmsTable.deaths,
      assists: pmsTable.assists,
      fk: pmsTable.fk,
      fd: pmsTable.fd,
      adr: pmsTable.adr,
      kast: pmsTable.kast,
      roundsPlayed: pmsTable.rounds_played,
      completedAt: mapsTable.completed_at,
      winnerTeamId: mapsTable.winner_team_id,
      loserTeamId: mapsTable.loser_team_id,
      winnerRounds: mapsTable.winner_rounds,
      loserRounds: mapsTable.loser_rounds,
    })
    .from(pmsTable)
    .innerJoin(mapsTable, sql`${pmsTable.map_id} = ${mapsTable.id}`)
    .orderBy(mapsTable.completed_at, pmsTable.player_id, pmsTable.id);

  const missingDate = rows.filter((row) => !row.completedAt);
  if (missingDate.length > 0) {
    throw new Error(`VPM source has ${missingDate.length} player_map_stats rows with missing maps.completed_at.`);
  }

  return rows.map((row) => {
    const totalRounds = toNumber(row.winnerRounds) + toNumber(row.loserRounds);
    return {
      id: row.id,
      matchId: row.matchId,
      mapId: row.mapId,
      gameNumber: row.gameNumber,
      teamId: row.teamId,
      playerId: row.playerId,
      agent: row.agent,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      fk: row.fk,
      fd: row.fd,
      adr: row.adr,
      kast: row.kast,
      roundsPlayed: row.roundsPlayed,
      gameDate: normalizeDate(new Date(row.completedAt!)),
      winnerTeamId: row.winnerTeamId,
      loserTeamId: row.loserTeamId,
      winnerRounds: row.winnerRounds,
      loserRounds: row.loserRounds,
      totalRounds: Math.max(1, totalRounds || toNumber(row.roundsPlayed, 24) || 24),
    } satisfies SourceRow;
  });
}

function componentsForRow(row: SourceRow): Record<Component, number> {
  const fkAtt = toNumber(row.fk) + toNumber(row.fd);
  const rounds = row.totalRounds;
  const kast = row.kast == null ? Number.NaN : toNumber(row.kast) / 100;

  return {
    kpr: safeDiv(toNumber(row.kills), rounds),
    dpr: safeDiv(toNumber(row.deaths), rounds),
    apr: safeDiv(toNumber(row.assists), rounds),
    fk_att_rate: safeDiv(fkAtt, rounds),
    fk_win_rate: fkAtt > 0 ? safeDiv(toNumber(row.fk), fkAtt) : Number.NaN,
    adr_pr: row.adr == null ? Number.NaN : toNumber(row.adr),
    kast01: kast,
  };
}

function buildModelRows(rows: SourceRow[]) {
  const byPlayer = new Map<number, SourceRow[]>();
  for (const row of rows) {
    if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
    byPlayer.get(row.playerId)!.push(row);
  }

  const output: ModelRow[] = [];

  for (const playerRows of Array.from(byPlayer.values())) {
    playerRows.sort((a, b) => {
      const byDate = a.gameDate.getTime() - b.gameDate.getTime();
      return byDate || a.id - b.id;
    });

    const weightedSums: Record<Component, number> = Object.create(null);
    const weights: Record<Component, number> = Object.create(null);
    for (const component of COMPONENTS) {
      weightedSums[component] = 0;
      weights[component] = 0;
    }

    let lastDate: Date | null = null;

    for (const row of playerRows) {
      if (lastDate) {
        const delta = daysBetween(row.gameDate, lastDate);
        if (delta > 0) {
          for (const component of COMPONENTS) {
            const decay = BETAS[component] ** delta;
            weightedSums[component] *= decay;
            weights[component] *= decay;
          }
        }
      }

      const modelRow = { ...row } as ModelRow;
      for (const component of COMPONENTS) {
        modelRow[`pre_${component}`] = weights[component] > 0 ? weightedSums[component] / weights[component] : null;
      }
      output.push(modelRow);

      const components = componentsForRow(row);
      const observationWeight = row.totalRounds > 0 ? row.totalRounds : 1;
      for (const component of COMPONENTS) {
        const value = components[component];
        if (Number.isFinite(value)) {
          weightedSums[component] += observationWeight * value;
          weights[component] += observationWeight;
        }
      }

      lastDate = row.gameDate;
    }
  }

  return output;
}

function buildTrainingRows(modelRows: ModelRow[]) {
  const byMapTeam = new Map<string, ModelRow[]>();
  for (const row of modelRows) {
    const key = `${row.matchId}:${row.mapId}:${row.teamId}`;
    if (!byMapTeam.has(key)) byMapTeam.set(key, []);
    byMapTeam.get(key)!.push(row);
  }

  const teamsByMap = new Map<number, Array<{ teamId: number; row: ModelRow; sums: Record<PreKey, number> }>>();
  for (const teamRows of Array.from(byMapTeam.values())) {
    const first = teamRows[0];
    const sums = Object.create(null) as Record<PreKey, number>;
    for (const component of COMPONENTS) {
      const key = `pre_${component}` as const;
      sums[key] = teamRows.reduce((sum: number, row: ModelRow) => sum + toNumber(row[key]), 0);
    }

    if (!teamsByMap.has(first.mapId)) teamsByMap.set(first.mapId, []);
    teamsByMap.get(first.mapId)!.push({ teamId: first.teamId, row: first, sums });
  }

  const today = normalizeDate(new Date());
  const rows: TeamMapTrainingRow[] = [];

  for (const mapTeams of Array.from(teamsByMap.values())) {
    if (mapTeams.length !== 2) continue;

    for (const team of mapTeams) {
      const opponent = mapTeams.find((candidate: { teamId: number }) => candidate.teamId !== team.teamId);
      if (!opponent) continue;

      const features = COMPONENTS.map((component) => {
        const key = `pre_${component}` as const;
        return team.sums[key] - opponent.sums[key];
      });

      if (features.some((feature) => !Number.isFinite(feature))) continue;

      const roundDiff =
        team.teamId === team.row.winnerTeamId
          ? team.row.winnerRounds - team.row.loserRounds
          : -(team.row.winnerRounds - team.row.loserRounds);
      const y24 = (roundDiff / team.row.totalRounds) * 24;
      const ageDays = Math.max(0, daysBetween(today, team.row.gameDate));
      const rowRecencyWeight = ROW_BETA ** ageDays;

      rows.push({
        date: team.row.gameDate,
        features,
        y24,
        sampleWeight: rowRecencyWeight * team.row.totalRounds,
      });
    }
  }

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function logspace(start: number, stop: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const exponent = start + ((stop - start) * i) / (count - 1);
    return 10 ** exponent;
  });
}

function timeSeriesSplits(n: number, nSplits: number) {
  const testSize = Math.floor(n / (nSplits + 1));
  if (testSize < 1) return [];
  const testStarts: number[] = [];
  for (let start = n - nSplits * testSize; start < n; start += testSize) {
    testStarts.push(start);
  }
  return testStarts.map((testStart) => ({
    trainStart: 0,
    trainEnd: testStart,
    testStart,
    testEnd: testStart + testSize,
  }));
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < 1e-12) {
      a[pivot][col] = 1e-12;
    }

    [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = a[row][n];
    for (let col = row + 1; col < n; col++) sum -= a[row][col] * x[col];
    x[row] = sum / a[row][row];
  }

  return x;
}

function fitRidge(rows: TeamMapTrainingRow[], alpha: number) {
  const p = COMPONENTS.length + 1;
  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);

  for (const row of rows) {
    const x = [1, ...row.features];
    const w = row.sampleWeight;
    for (let i = 0; i < p; i++) {
      xtwy[i] += w * x[i] * row.y24;
      for (let j = 0; j < p; j++) xtwx[i][j] += w * x[i] * x[j];
    }
  }

  for (let i = 1; i < p; i++) xtwx[i][i] += alpha;

  const solution = solveLinearSystem(xtwx, xtwy);
  return { intercept: solution[0], weights: solution.slice(1) };
}

function predict(row: TeamMapTrainingRow, model: { intercept: number; weights: number[] }) {
  return model.intercept + row.features.reduce((sum, value, i) => sum + value * model.weights[i], 0);
}

function r2Score(actual: number[], predicted: number[]) {
  const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const ssRes = actual.reduce((sum, value, i) => sum + (value - predicted[i]) ** 2, 0);
  const ssTot = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function trainModel(trainingRows: TeamMapTrainingRow[]) {
  if (trainingRows.length < 12) {
    throw new Error(`Need at least 12 training rows for VPM model; found ${trainingRows.length}.`);
  }

  const splits = timeSeriesSplits(trainingRows.length, 5);
  const alphas = logspace(-3, 2, 15);
  let bestAlpha = alphas[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const alpha of alphas) {
    const scores: number[] = [];
    for (const split of splits) {
      const model = fitRidge(trainingRows.slice(split.trainStart, split.trainEnd), alpha);
      const test = trainingRows.slice(split.testStart, split.testEnd);
      scores.push(r2Score(test.map((row) => row.y24), test.map((row) => predict(row, model))));
    }
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    if (score > bestScore) {
      bestScore = score;
      bestAlpha = alpha;
    }
  }

  const model = fitRidge(trainingRows, bestAlpha);
  const predictions = trainingRows.map((row) => predict(row, model));
  const r2 = r2Score(trainingRows.map((row) => row.y24), predictions);
  const mae =
    trainingRows.reduce((sum, row, i) => sum + Math.abs(row.y24 - predictions[i]), 0) /
    trainingRows.length;

  return { ...model, alpha: bestAlpha, cvR2: bestScore, r2, mae };
}

function buildModelVersion(weightsByKey: Record<PreKey, number>) {
  const signature = JSON.stringify({
    components: COMPONENTS,
    weights: COMPONENTS.map((component) => weightsByKey[`pre_${component}`]),
  });
  return crypto.createHash("sha1").update(signature).digest("hex").slice(0, 12);
}

function buildPlayerMapRows(modelRows: ModelRow[], weightsByKey: Record<PreKey, number>, modelVersion: string) {
  const rawValues = modelRows.map((row) => {
    let raw = 0;
    for (const component of COMPONENTS) {
      const key = `pre_${component}` as const;
      raw += toNumber(row[key]) * weightsByKey[key];
    }
    return { row, raw };
  });

  const meanByDate = new Map<string, { sum: number; count: number }>();
  for (const item of rawValues) {
    const key = dateKey(item.row.gameDate);
    const aggregate = meanByDate.get(key) ?? { sum: 0, count: 0 };
    aggregate.sum += item.raw;
    aggregate.count += 1;
    meanByDate.set(key, aggregate);
  }

  const updatedAt = new Date();
  return rawValues.map(({ row, raw }) => {
    const aggregate = meanByDate.get(dateKey(row.gameDate))!;
    const centered = raw - aggregate.sum / aggregate.count;
    return {
      player_id: row.playerId,
      team_id: row.teamId,
      match_id: row.matchId,
      map_id: row.mapId,
      game_date: dateKey(row.gameDate),
      total_rounds: row.totalRounds,
      vpm_per24_raw: raw,
      vpm_per24_centered: centered,
      model_version: modelVersion,
      updated_at: updatedAt,
    } satisfies NewVpmPlayerMap;
  });
}

async function loadOpponentEloByMapTeam() {
  const rows = await db
    .select({
      teamId: eloRatingsTable.team_id,
      mapId: eloRatingsTable.map_played_id,
      rating: eloRatingsTable.rating,
    })
    .from(eloRatingsTable);

  const ratings = rows
    .filter((row) => row.mapId != null)
    .map((row) => ({
      teamId: row.teamId,
      mapId: row.mapId!,
      rating: toNumber(row.rating, Number.NaN),
    }))
    .filter((row) => Number.isFinite(row.rating));

  const sortedRatings = ratings.map((row) => row.rating).sort((a, b) => a - b);
  const leagueMedian =
    sortedRatings.length === 0
      ? 1000
      : sortedRatings[Math.floor((sortedRatings.length - 1) / 2)];

  const byMapTeam = new Map<string, number>();
  for (const row of ratings) byMapTeam.set(`${row.mapId}:${row.teamId}`, row.rating);

  return { byMapTeam, leagueMedian };
}

function buildPlayerDpmRows(
  modelRows: ModelRow[],
  weightsByKey: Record<PreKey, number>,
  opponentElo: Map<string, number>,
  leagueMedianElo: number
) {
  const rawRows = modelRows.map((row) => {
    let raw = 0;
    for (const component of COMPONENTS) {
      const key = `pre_${component}` as const;
      raw += toNumber(row[key]) * weightsByKey[key];
    }
    return { row, raw };
  });

  const meanByDate = new Map<string, { sum: number; count: number }>();
  for (const item of rawRows) {
    const key = dateKey(item.row.gameDate);
    const aggregate = meanByDate.get(key) ?? { sum: 0, count: 0 };
    aggregate.sum += item.raw;
    aggregate.count += 1;
    meanByDate.set(key, aggregate);
  }

  return rawRows.map(({ row, raw }) => {
    const aggregate = meanByDate.get(dateKey(row.gameDate))!;
    const centered = raw - aggregate.sum / aggregate.count;
    const opponentTeamId = row.teamId === row.winnerTeamId ? row.loserTeamId : row.winnerTeamId;
    const oppElo = opponentElo.get(`${row.mapId}:${opponentTeamId}`) ?? leagueMedianElo;
    const oppBonus = OPP_ELO_BONUS_PER_100 * ((oppElo - leagueMedianElo) / 100);
    const wonMap = row.teamId === row.winnerTeamId;
    const winBonus = wonMap ? WIN_BONUS : -LOSS_PENALTY;

    return {
      playerId: row.playerId,
      teamId: row.teamId,
      matchId: row.matchId,
      mapId: row.mapId,
      gameDate: row.gameDate,
      dpm: centered + oppBonus + winBonus,
      totalRounds: row.totalRounds,
    } satisfies PlayerDpmRow;
  });
}

function runKalman1D(obs: PlayerDpmRow[], params = KF_DEFAULT) {
  const sorted = [...obs].sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime() || a.mapId - b.mapId);
  const n = sorted.length;
  const xFilt = new Array<number>(n).fill(0);
  const pFilt = new Array<number>(n).fill(0);
  const xPred = new Array<number>(n).fill(0);
  const pPred = new Array<number>(n).fill(0);
  const dt = new Array<number>(n).fill(1);

  for (let i = 1; i < n; i++) {
    dt[i] = params.use_days ? Math.max(1, daysBetween(sorted[i].gameDate, sorted[i - 1].gameDate)) : 1;
  }

  let xPrev = 0;
  let pPrev = 10;

  for (let t = 0; t < n; t++) {
    const at = params.a ** dt[t];
    const q = params.q * dt[t];
    const xPrior = at * xPrev;
    const pPrior = at * pPrev * at + q;
    xPred[t] = xPrior;
    pPred[t] = pPrior;

    const y = sorted[t].dpm;
    const r = params.r0 * (24 / Math.max(1, sorted[t].totalRounds));

    if (Number.isFinite(y) && Number.isFinite(r)) {
      const s = pPrior + r;
      const k = pPrior / s;
      xPrev = xPrior + k * (y - xPrior);
      pPrev = (1 - k) * pPrior;
    } else {
      xPrev = xPrior;
      pPrev = pPrior;
    }

    xFilt[t] = xPrev;
    pFilt[t] = Math.max(pPrev, 0);
  }

  const xSmooth = [...xFilt];
  const pSmooth = [...pFilt];
  for (let t = n - 2; t >= 0; t--) {
    const at1 = params.a ** dt[t + 1];
    const pPrior = Math.max(at1 * pFilt[t] * at1 + params.q * dt[t + 1], 1e-12);
    const c = (pFilt[t] * at1) / pPrior;
    xSmooth[t] = xFilt[t] + c * (xSmooth[t + 1] - xPred[t + 1]);
    pSmooth[t] = Math.max(pFilt[t] + c ** 2 * (pSmooth[t + 1] - pPrior), 0);
  }

  return sorted.map((row, i) => ({
    row,
    gameNum: i + 1,
    kfMean: xFilt[i],
    kfStd: Math.sqrt(Math.max(pFilt[i], 0)),
    smoothMean: xSmooth[i],
    smoothStd: Math.sqrt(Math.max(pSmooth[i], 0)),
  }));
}

function buildKfRows(playerDpmRows: PlayerDpmRow[], modelVersion: string) {
  const byPlayer = new Map<number, PlayerDpmRow[]>();
  for (const row of playerDpmRows) {
    if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
    byPlayer.get(row.playerId)!.push(row);
  }

  const updatedAt = new Date();
  const kfRows: NewVpmPlayerKf[] = [];

  for (const [playerId, rows] of Array.from(byPlayer.entries())) {
    const results = runKalman1D(rows);
    for (const result of results) {
      kfRows.push({
        player_id: playerId,
        game_num: result.gameNum,
        game_date: dateKey(result.row.gameDate),
        y: result.row.dpm,
        kf_mean: result.kfMean,
        kf_std: result.kfStd,
        smooth_mean: result.smoothMean,
        smooth_std: result.smoothStd,
        match_id: result.row.matchId,
        map_id: result.row.mapId,
        a: KF_DEFAULT.a,
        q: KF_DEFAULT.q,
        r0: KF_DEFAULT.r0,
        use_days: KF_DEFAULT.use_days,
        model_version: modelVersion,
        updated_at: updatedAt,
      });
    }
  }

  return kfRows;
}

function buildLatestRows(kfRows: NewVpmPlayerKf[], modelVersion: string) {
  const latestByPlayer = new Map<number, NewVpmPlayerKf>();
  for (const row of kfRows) {
    const existing = latestByPlayer.get(row.player_id);
    if (!existing || row.game_num > existing.game_num) latestByPlayer.set(row.player_id, row);
  }

  const updatedAt = new Date();
  return Array.from(latestByPlayer.values()).map((row) => ({
    player_id: row.player_id,
    current_vpm_per24: row.kf_mean,
    current_std: row.kf_std,
    last_game_num: row.game_num,
    last_game_date: row.game_date,
    model_version: modelVersion,
    updated_at: updatedAt,
  } satisfies NewVpmPlayerLatest));
}

async function rebuildVpmTables(
  playerMapRows: NewVpmPlayerMap[],
  kfRows: NewVpmPlayerKf[],
  latestRows: NewVpmPlayerLatest[],
  modelVersion: string,
  model: ReturnType<typeof trainModel>,
  weightsByKey: Record<PreKey, number>
) {
  await db.transaction(async (tx) => {
    await tx.delete(vpmPlayerLatestTable);
    await tx.delete(vpmPlayerKfTable);
    await tx.delete(vpmPlayerMapTable);

    await tx
      .insert(vpmModelMetaTable)
      .values({
        model_version: modelVersion,
        ridge_alpha: model.alpha,
        components: COMPONENTS as unknown as string[],
        weights_per24: weightsByKey,
        kf_params_default: KF_DEFAULT,
        data_hash: crypto
          .createHash("sha1")
          .update(JSON.stringify({ rows: playerMapRows.length, weightsByKey }))
          .digest("hex"),
        source_git_ref: null,
        created_by: "scripts/process-vpm.ts",
        notes: `Full rebuild. cv_r2=${model.cvR2.toFixed(6)}, r2=${model.r2.toFixed(6)}, mae=${model.mae.toFixed(6)}`,
      })
      .onConflictDoUpdate({
        target: vpmModelMetaTable.model_version,
        set: {
          trained_at: sql`now()`,
          ridge_alpha: model.alpha,
          components: COMPONENTS as unknown as string[],
          weights_per24: weightsByKey,
          kf_params_default: KF_DEFAULT,
          created_by: "scripts/process-vpm.ts",
          notes: `Full rebuild. cv_r2=${model.cvR2.toFixed(6)}, r2=${model.r2.toFixed(6)}, mae=${model.mae.toFixed(6)}`,
        },
      });

    for (const rows of chunk(playerMapRows, 1000)) await tx.insert(vpmPlayerMapTable).values(rows);
    for (const rows of chunk(kfRows, 1000)) await tx.insert(vpmPlayerKfTable).values(rows);
    for (const rows of chunk(latestRows, 1000)) await tx.insert(vpmPlayerLatestTable).values(rows);
  });
}

export async function processVPM() {
  const sourceRows = await loadSourceRows();
  if (sourceRows.length === 0) throw new Error("No player map stats found for VPM processing.");

  const modelRows = buildModelRows(sourceRows);
  const trainingRows = buildTrainingRows(modelRows);
  const model = trainModel(trainingRows);
  const weightsByKey = Object.fromEntries(
    COMPONENTS.map((component, i) => [`pre_${component}`, model.weights[i]])
  ) as Record<PreKey, number>;
  const modelVersion = buildModelVersion(weightsByKey);

  const { byMapTeam: opponentElo, leagueMedian } = await loadOpponentEloByMapTeam();
  const playerMapRows = buildPlayerMapRows(modelRows, weightsByKey, modelVersion);
  const playerDpmRows = buildPlayerDpmRows(modelRows, weightsByKey, opponentElo, leagueMedian);
  const kfRows = buildKfRows(playerDpmRows, modelVersion);
  const latestRows = buildLatestRows(kfRows, modelVersion);

  if (DRY_RUN) {
    console.log("Dry run enabled; VPM tables were not rebuilt.");
  } else {
    await rebuildVpmTables(playerMapRows, kfRows, latestRows, modelVersion, model, weightsByKey);
  }

  console.log(
    `VPM ${DRY_RUN ? "dry run" : "rebuild"} complete. version=${modelVersion} alpha=${model.alpha.toPrecision(4)} ` +
      `r2=${model.r2.toFixed(4)} mae=${model.mae.toFixed(4)} ` +
      `player_map=${playerMapRows.length} kf=${kfRows.length} latest=${latestRows.length}`
  );
}

if (require.main === module) {
  processVPM()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("VPM update failed:", error);
      process.exit(1);
    });
}
