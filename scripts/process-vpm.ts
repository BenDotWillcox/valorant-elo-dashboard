// process-vpm.ts
// Incremental updater for VPM tables after new maps are scraped.

import { db } from "@/db/db";
import {
  playerMapStatsTable as pmsTable,
  mapsTable,
  vpmPlayerMapTable,
  vpmPlayerKfTable,
  vpmPlayerLatestTable,
  vpmModelMetaTable,
  NewVpmPlayerMap,
  NewVpmPlayerKf,
  NewVpmPlayerLatest,
} from "@/db/schema";


import { and, eq, gt, sql, desc } from "drizzle-orm";

// ---------- Config / constants ----------

// Component names (must match your training)
const COMPONENTS = [
  "kpr",
  "dpr",
  "apr",
  "fk_att_rate",
  "fk_win_rate",
  "adr_pr",
  "kast01",
] as const;
type Component = typeof COMPONENTS[number];

// Per-component decay (β) — from the notebook; tune later
const BETAS: Record<Component, number> = {
  kpr: 0.992,
  dpr: 0.992,
  apr: 0.992,
  fk_att_rate: 0.990,
  fk_win_rate: 0.985,
  adr_pr: 0.993,
  kast01: 0.991,
};

// KF default params (store also in vpm_model_meta.kf_params_default)
const KF_DEFAULT = { a: 1.0, q: 0.05, r0: 1.0, use_days: true };

// Safety: treat missing/NaN as 0 for ADR, 0..1 for KAST already converted
const toNum = (x: unknown) => (x == null ? NaN : Number(x));

// ---------- Small math helpers ----------
function safeDiv(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
  return a / b;
}

// ---------- Fetch latest model meta ----------
async function getActiveModelMeta() {
  const [row] = await db
    .select()
    .from(vpmModelMetaTable)
    .orderBy(desc(vpmModelMetaTable.trained_at))
    .limit(1);
  if (!row) throw new Error("No vpm_model_meta rows found.");
  // Validate minimal fields
  const weights = row.weights_per24 as Record<string, number>;
  for (const c of COMPONENTS) {
    const key = `pre_${c}`;
    if (!(key in weights))
      throw new Error(`weights_per24 missing key ${key} in model meta`);
  }
  return {
    modelVersion: row.model_version,
    weightsPer24: weights,
    kfParams: (row.kf_params_default as any) ?? KF_DEFAULT,
  };
}

// ---------- Find newly completed maps needing VPM ----------
async function getMapsNeedingVPM(modelVersion: string) {
  // Strategy: maps that have player stats, completed_at not null,
  // and no rows in vpm_player_map for this model_version.
  // Using NOT EXISTS for performance.
  const rows = await db.execute<{
    id: number;
    completed_at: Date | null;
  }>(sql`
    SELECT m.id, m.completed_at
    FROM ${mapsTable} m
    WHERE m.completed_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM ${pmsTable} p
        WHERE p.map_id = m.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${vpmPlayerMapTable} v
        WHERE v.map_id = m.id
          AND v.model_version = ${modelVersion}
      )
    ORDER BY m.completed_at ASC
  `);
  return rows.map((r) => ({ mapId: Number(r.id), completedAt: r.completed_at! }));
}

// ---------- Pull all stats for players on a given map ----------
type PMSRow = {
  player_id: number; team_id: number; match_id: number; map_id: number;
  kills: number; deaths: number; assists: number;
  first_kills: number; first_deaths: number;
  adr: number | null; kast: number | null;
};
async function getPlayersOnMap(mapId: number) {
  const rows = await db
    .select({
      player_id: pmsTable.player_id,
      team_id: pmsTable.team_id,
      match_id: pmsTable.match_id,
      map_id: pmsTable.map_id,
      kills: pmsTable.kills,
      deaths: pmsTable.deaths,
      assists: pmsTable.assists,
      first_kills: pmsTable.fk,
      first_deaths: pmsTable.fd,
      adr: pmsTable.adr,
      kast: pmsTable.kast,
    })
    .from(pmsTable)
    .where(eq(pmsTable.map_id, mapId));
  return rows as PMSRow[];
}

// ---------- Get total rounds for a map ----------
async function getMapTotalRounds(mapId: number) {
  const [m] = await db
    .select({
      winner_rounds: mapsTable.winner_rounds,
      loser_rounds: mapsTable.loser_rounds,
      completed_at: mapsTable.completed_at,
    })
    .from(mapsTable)
    .where(eq(mapsTable.id, mapId))
    .limit(1);
  if (!m || !m.completed_at) throw new Error(`Map ${mapId} missing completed_at`);
  const totalRounds = Number(m.winner_rounds ?? 0) + Number(m.loser_rounds ?? 0);
  return { totalRounds: Math.max(1, totalRounds), completedAt: new Date(m.completed_at) };
}

// ---------- Pull a player's prior maps (strictly before a cutoff date) ----------
type PriorRow = PMSRow & {
  completed_at: Date | null;
  winner_rounds: number | null;
  loser_rounds: number | null;
};
async function getPlayerHistoryBefore(playerId: number, cutoff: Date) {
  const rows = await db
    .select({
      player_id: pmsTable.player_id,
      team_id: pmsTable.team_id,
      match_id: pmsTable.match_id,
      map_id: pmsTable.map_id,
      kills: pmsTable.kills,
      deaths: pmsTable.deaths,
      assists: pmsTable.assists,
      first_kills: pmsTable.fk,
      first_deaths: pmsTable.fd,
      adr: pmsTable.adr,
      kast: pmsTable.kast,
      completed_at: mapsTable.completed_at,
      winner_rounds: mapsTable.winner_rounds,
      loser_rounds: mapsTable.loser_rounds,
    })
    .from(pmsTable)
    .innerJoin(mapsTable, eq(pmsTable.map_id, mapsTable.id))
    .where(and(
      eq(pmsTable.player_id, playerId),
      gt(mapsTable.completed_at, new Date(0)), // not null
      // strictly earlier than the target map's completed_at
      sql`${mapsTable.completed_at} < ${cutoff.toISOString()}`
    ))
    .orderBy(mapsTable.completed_at);
  return rows as PriorRow[];
}

// ---------- Convert a PMS row to per-round components ----------
function computePerRoundComponents(row: PMSRow | PriorRow, rounds: number) {
  const kills = Number(row.kills ?? 0);
  const deaths = Number(row.deaths ?? 0);
  const assists = Number(row.assists ?? 0);
  const fk = Number(row.first_kills ?? 0);
  const fd = Number(row.first_deaths ?? 0);
  const fk_att = fk + fd;

  const kpr = safeDiv(kills, rounds);
  const dpr = safeDiv(deaths, rounds);
  const apr = safeDiv(assists, rounds);
  const fk_att_rate = safeDiv(fk_att, rounds);
  const fk_win_rate = fk_att > 0 ? safeDiv(fk, fk_att) : NaN;
  const adr_pr = toNum((row as any).adr);
  const kast01 = toNum((row as any).kast); // already 0..100 in your scrape; convert:
  const kast01_unit = isFinite(kast01) ? kast01 / 100 : NaN;

  return { kpr, dpr, apr, fk_att_rate, fk_win_rate, adr_pr, kast01: kast01_unit } as Record<Component, number>;
}

// ---------- Pre-EMA up to a date ----------
function preEmaForPlayer(prior: PriorRow[], betas = BETAS) {
  // Running weighted sums per component (S/W)
  const S: Record<Component, number> = Object.create(null);
  const W: Record<Component, number> = Object.create(null);
  COMPONENTS.forEach((c) => { S[c] = 0; W[c] = 0; });

  let lastDate: Date | null = null;

  for (const r of prior) {
    if (!r.completed_at) continue;
    const rounds = Math.max(1, Number(r.winner_rounds ?? 0) + Number(r.loser_rounds ?? 0));

    // decay from last date
    if (lastDate) {
      const days = Math.max(0, Math.floor((+new Date(r.completed_at) - +new Date(lastDate)) / 86400000));
      if (days > 0) {
        for (const c of COMPONENTS) {
          const decay = Math.pow(betas[c], days);
          S[c] *= decay;
          W[c] *= decay;
        }
      }
    }

    // add observation (rounds-weighted)
    const comp = computePerRoundComponents(r, rounds);
    for (const c of COMPONENTS) {
      const x = comp[c];
      if (isFinite(x)) {
        S[c] += rounds * x;
        W[c] += rounds;
      }
    }
    lastDate = new Date(r.completed_at);
  }

  // Return pre_ values = S/W
  const pre: Record<`pre_${Component}`, number | null> = Object.create(null);
  for (const c of COMPONENTS) {
    pre[`pre_${c}`] = W[c] > 0 ? (S[c] / W[c]) : null;
  }
  return pre;
}

// ---------- 1D Kalman (filtered + smoothed) ----------
function runKalman1D(
  obs: { date: Date; y: number; totalRounds: number }[],
  params = KF_DEFAULT
) {
  const n = obs.length;
  if (n === 0) return { filt: [], smooth: [] as { mean:number; std:number; idx:number }[] };

  const dt: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) dt[i] = 1;
    else {
      const days = Math.max(1, Math.floor((+obs[i].date - +obs[i-1].date) / 86400000));
      dt[i] = params.use_days ? days : 1;
    }
  }

  const r: number[] = obs.map(o => params.r0 * (24 / Math.max(1, o.totalRounds)));

  const x_f: number[] = new Array(n).fill(0);
  const P_f: number[] = new Array(n).fill(0);
  const x_p: number[] = new Array(n).fill(0);
  const P_p: number[] = new Array(n).fill(0);

  let xPrev = 0.0, PPrev = 10.0;
  for (let t=0; t<n; t++) {
    const at = Math.pow(params.a, dt[t]);
    const Qt = params.q * dt[t];

    const xPrior = at * xPrev;
    const PPrior = at * PPrev * at + Qt;
    x_p[t] = xPrior; P_p[t] = PPrior;

    const yt = obs[t].y;
    if (isFinite(yt) && isFinite(r[t])) {
      const S = PPrior + r[t];
      const K = PPrior / S;
      const xPost = xPrior + K * (yt - xPrior);
      const PPost = (1 - K) * PPrior;
      x_f[t] = xPost; P_f[t] = Math.max(PPost, 0);
      xPrev = xPost; PPrev = PPost;
    } else {
      x_f[t] = xPrior; P_f[t] = Math.max(PPrior, 0);
      xPrev = xPrior; PPrev = PPrior;
    }
  }

  // RTS smoother
  const x_s: number[] = x_f.slice();
  const P_s: number[] = P_f.slice();
  for (let t=n-2; t>=0; t--) {
    const at1 = Math.pow(params.a, dt[t+1]);
    const Pprior = at1 * P_f[t] * at1 + params.q * dt[t+1];
    const C = (P_f[t] * at1) / Math.max(Pprior, 1e-12);
    x_s[t] = x_f[t] + C * (x_s[t+1] - x_p[t+1]);
    P_s[t] = Math.max(P_f[t] + C*C*(P_s[t+1] - Pprior), 0);
  }

  const filt = x_f.map((m, i) => ({ mean: m, std: Math.sqrt(Math.max(P_f[i], 0)), idx: i }));
  const smooth = x_s.map((m, i) => ({ mean: m, std: Math.sqrt(Math.max(P_s[i], 0)), idx: i }));
  return { filt, smooth };
}

// ---------- Main: process VPM ----------
export async function processVPM() {
  const { modelVersion, weightsPer24, kfParams } = await getActiveModelMeta();

  // 1) Which maps need processing?
  const maps = await getMapsNeedingVPM(modelVersion);
  if (maps.length === 0) {
    console.log("VPM: nothing to do.");
    return;
  }

  // Keep track of players we touched (for KF updates)
  const touchedPlayerIds = new Set<number>();

  for (const m of maps) {
    const players = await getPlayersOnMap(m.mapId);
    if (players.length === 0) continue;

    // Pre-fetch target map total rounds/date
    const { totalRounds: targetRounds, completedAt: targetDate } = await getMapTotalRounds(m.mapId);

    // Build per-player rows
    const rowsToInsert: NewVpmPlayerMap[] = [];

    for (const row of players) {
      const prior = await getPlayerHistoryBefore(row.player_id, targetDate);

      // compute pre-ema
      const pre = preEmaForPlayer(prior);

      // dot(weights, pre_)
      let vpmPer24 = 0;
      for (const c of COMPONENTS) {
        const key = `pre_${c}` as const;
        const w = Number(weightsPer24[key] ?? 0);
        const x = pre[key];
        const term = x == null || !isFinite(x) ? 0 : w * x;
        vpmPer24 += term;
      }

      rowsToInsert.push({
        player_id: row.player_id,
        team_id: row.team_id,
        match_id: row.match_id,
        map_id: row.map_id,
        game_date: targetDate.toISOString().slice(0, 10), // DATE
        total_rounds: targetRounds,
        vpm_per24_raw: vpmPer24,
        vpm_per24_centered: null, // fill after we compute league-mean for the date (optional)
        model_version: modelVersion,
        updated_at: new Date(),
      });

      touchedPlayerIds.add(row.player_id);
    }

    // Centering by date (optional)
    const dayMean =
      rowsToInsert.reduce((s, r) => s + (Number(r.vpm_per24_raw) || 0), 0) / Math.max(1, rowsToInsert.length);
    for (const r of rowsToInsert) {
      r.vpm_per24_centered = Number.isFinite(dayMean) && r.vpm_per24_raw ? (r.vpm_per24_raw - dayMean) : r.vpm_per24_raw;
    }

    // Upsert vpm_player_map
    for (const chunk of chunked(rowsToInsert, 500)) {
      await db
        .insert(vpmPlayerMapTable)
        .values(chunk)
        .onConflictDoUpdate({
          target: [vpmPlayerMapTable.player_id, vpmPlayerMapTable.map_id, vpmPlayerMapTable.model_version],
          set: {
            team_id: sql`excluded.team_id`,
            match_id: sql`excluded.match_id`,
            game_date: sql`excluded.game_date`,
            total_rounds: sql`excluded.total_rounds`,
            vpm_per24_raw: sql`excluded.vpm_per24_raw`,
            vpm_per24_centered: sql`excluded.vpm_per24_centered`,
            updated_at: sql`excluded.updated_at`,
            // contributions...
            // add these if you created columns
          },
        });
    }
  }

  // 2) Recompute KF for affected players
  if (touchedPlayerIds.size > 0) {
    const ids = Array.from(touchedPlayerIds);
    await updateKalmanForPlayers(ids, modelVersion, kfParams);
  }

  // 3) Update latest snapshot
  await upsertLatest(modelVersion);

  console.log(`VPM: processed ${maps.length} maps; KF updated for ${touchedPlayerIds.size} players.`);
}

// ---------- Recompute KF for players ----------
async function updateKalmanForPlayers(playerIds: number[], modelVersion: string, kfParams: typeof KF_DEFAULT) {
  // Pull player VPM observations (per-24) ordered by date
  const rows = await db.execute<{
    player_id: number;
    map_id: number;
    match_id: number;
    game_date: string | null;
    total_rounds: number | null;
    y: number | null;
  }>(sql`
    SELECT v.player_id, v.map_id, v.match_id, v.game_date, v.total_rounds,
           v.vpm_per24_raw as y
    FROM ${vpmPlayerMapTable} v
    WHERE v.player_id = ANY(${playerIds})
      AND v.model_version = ${modelVersion}
    ORDER BY v.player_id, v.game_date, v.map_id
  `);

  // Group by player
  const byPlayer = new Map<number, { date: Date; y: number; totalRounds: number; matchId: number; mapId: number; }[]>();
  for (const r of rows) {
    if (!r.game_date) continue;
    const date = new Date(r.game_date + "T00:00:00Z");
    const y = Number(r.y);
    const totalRounds = Math.max(1, Number(r.total_rounds ?? 24));
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push({ date, y, totalRounds, matchId: Number(r.match_id), mapId: Number(r.map_id) });
  }

  // Recompute and upsert
  type PlayerSeriesPoint = { date: Date; y: number; totalRounds: number; matchId: number; mapId: number; };
  for (const [pid, series] of byPlayer.entries()) {
    if (series.length === 0) continue;
    // Kalman
    const { filt, smooth } = runKalman1D(series, kfParams);

    // Build rows for vpm_player_kf
    const kfRows: NewVpmPlayerKf[] = series.map((pt: PlayerSeriesPoint, i: number) => ({
      player_id: pid,
      game_num: i + 1,
      game_date: pt.date.toISOString().slice(0, 10),
      y: pt.y,
      kf_mean: filt[i].mean,
      kf_std: filt[i].std,
      smooth_mean: smooth[i].mean,
      smooth_std: smooth[i].std,
      match_id: pt.matchId,
      map_id: pt.mapId,
      a: kfParams.a,
      q: kfParams.q,
      r0: kfParams.r0,
      use_days: kfParams.use_days,
      model_version: modelVersion,
      updated_at: new Date(),
    }));

    for (const chunk of chunked(kfRows, 500)) {
      await db
        .insert(vpmPlayerKfTable)
        .values(chunk)
        .onConflictDoUpdate({
          target: [vpmPlayerKfTable.player_id, vpmPlayerKfTable.game_num, vpmPlayerKfTable.model_version],
          set: {
            game_date: sql`excluded.game_date`,
            y: sql`excluded.y`,
            kf_mean: sql`excluded.kf_mean`,
            kf_std: sql`excluded.kf_std`,
            smooth_mean: sql`excluded.smooth_mean`,
            smooth_std: sql`excluded.smooth_std`,
            match_id: sql`excluded.match_id`,
            map_id: sql`excluded.map_id`,
            a: sql`excluded.a`,
            q: sql`excluded.q`,
            r0: sql`excluded.r0`,
            use_days: sql`excluded.use_days`,
            updated_at: sql`excluded.updated_at`,
          },
        });
    }
  }
}

// ---------- Update vpm_player_latest ----------
async function upsertLatest(modelVersion: string) {
  // Get latest KF row per player (by game_num)
  const latest = await db.execute<{
    player_id: number;
    game_num: number;
    game_date: string | null;
    current_vpm_per24: number | null;
    current_std: number | null;
  }>(sql`
    WITH ranked AS (
      SELECT
        player_id, game_num, game_date, kf_mean AS current_vpm_per24, kf_std AS current_std,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY game_num DESC) AS rn
      FROM ${vpmPlayerKfTable}
      WHERE model_version = ${modelVersion}
    )
    SELECT player_id, game_num, game_date, current_vpm_per24, current_std
    FROM ranked
    WHERE rn = 1
  `);

  const rows: NewVpmPlayerLatest[] = latest.map((r) => ({
    player_id: r.player_id,
    current_vpm_per24: r.current_vpm_per24,
    current_std: r.current_std,
    last_game_num: r.game_num,
    last_game_date: r.game_date,
    model_version: modelVersion,
    updated_at: new Date(),
  }));

  for (const chunk of chunked(rows, 500)) {
    await db.insert(vpmPlayerLatestTable).values(chunk).onConflictDoUpdate({
      target: [vpmPlayerLatestTable.player_id],
      set: {
        current_vpm_per24: sql`excluded.current_vpm_per24`,
        current_std: sql`excluded.current_std`,
        last_game_num: sql`excluded.last_game_num`,
        last_game_date: sql`excluded.last_game_date`,
        model_version: sql`excluded.model_version`,
        updated_at: sql`excluded.updated_at`,
      },
    });
  }
}

// ---------- Tiny util ----------
function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// ---------- CLI entry ----------
if (require.main === module) {
  processVPM()
    .then(() => {
      console.log("VPM update complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("VPM update failed:", err);
      process.exit(1);
    });
}
