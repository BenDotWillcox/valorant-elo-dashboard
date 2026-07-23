import { db } from "@/db/db";
import {
  vpmPlayerStateTable,
  NewVpmPlayerState,
  VpmPlayerState,
  vpmKfStateTable,
  NewVpmKfState,
  VpmKfState,
  vpmPlayerMapTable,
  NewVpmPlayerMap,
  VpmPlayerMap,
  vpmPlayerKfTable,
  NewVpmPlayerKf,
  VpmPlayerKf,
  vpmPlayerLatestTable,
  NewVpmPlayerLatest,
  VpmPlayerLatest,
  vpmModelMetaTable,
  NewVpmModelMeta,
  VpmModelMeta,
  playersTable,
  teamsTable,
} from "@/db/schema";
import { eq, and, desc, gte, isNotNull, lte, asc, sql } from "drizzle-orm";

// VPM Player State
export async function createVpmPlayerState(
  data: NewVpmPlayerState
): Promise<VpmPlayerState[]> {
  return await db.insert(vpmPlayerStateTable).values(data).returning();
}

export async function getVpmPlayerState(
  playerId: number
): Promise<VpmPlayerState[]> {
  return await db
    .select()
    .from(vpmPlayerStateTable)
    .where(eq(vpmPlayerStateTable.player_id, playerId));
}

export async function updateVpmPlayerState(
  playerId: number,
  data: Partial<NewVpmPlayerState>
): Promise<VpmPlayerState[]> {
  return await db
    .update(vpmPlayerStateTable)
    .set(data)
    .where(eq(vpmPlayerStateTable.player_id, playerId))
    .returning();
}

// VPM KF State
export async function createVpmKfState(
  data: NewVpmKfState
): Promise<VpmKfState[]> {
  return await db.insert(vpmKfStateTable).values(data).returning();
}

export async function getVpmKfState(playerId: number): Promise<VpmKfState[]> {
  return await db
    .select()
    .from(vpmKfStateTable)
    .where(eq(vpmKfStateTable.player_id, playerId));
}

export async function updateVpmKfState(
  playerId: number,
  data: Partial<NewVpmKfState>
): Promise<VpmKfState[]> {
  return await db
    .update(vpmKfStateTable)
    .set(data)
    .where(eq(vpmKfStateTable.player_id, playerId))
    .returning();
}

// VPM Player Map
export async function createVpmPlayerMap(
  data: NewVpmPlayerMap
): Promise<VpmPlayerMap[]> {
  return await db.insert(vpmPlayerMapTable).values(data).returning();
}

export async function getVpmPlayerMap(
  playerId: number,
  mapId: number,
  modelVersion: string
): Promise<VpmPlayerMap[]> {
  return await db
    .select()
    .from(vpmPlayerMapTable)
    .where(
      and(
        eq(vpmPlayerMapTable.player_id, playerId),
        eq(vpmPlayerMapTable.map_id, mapId),
        eq(vpmPlayerMapTable.model_version, modelVersion)
      )
    );
}

// VPM Player KF
export async function createVpmPlayerKf(
  data: NewVpmPlayerKf
): Promise<VpmPlayerKf[]> {
  return await db.insert(vpmPlayerKfTable).values(data).returning();
}

export async function getVpmPlayerKf(
  playerId: number,
  gameNum: number,
  modelVersion: string
): Promise<VpmPlayerKf[]> {
  return await db
    .select()
    .from(vpmPlayerKfTable)
    .where(
      and(
        eq(vpmPlayerKfTable.player_id, playerId),
        eq(vpmPlayerKfTable.game_num, gameNum),
        eq(vpmPlayerKfTable.model_version, modelVersion)
      )
    );
}

// VPM Player Latest
export async function createVpmPlayerLatest(
  data: NewVpmPlayerLatest
): Promise<VpmPlayerLatest[]> {
  return await db.insert(vpmPlayerLatestTable).values(data).returning();
}

export async function getVpmPlayerLatest(
  playerId: number
): Promise<VpmPlayerLatest[]> {
  return await db
    .select()
    .from(vpmPlayerLatestTable)
    .where(eq(vpmPlayerLatestTable.player_id, playerId));
}

export async function updateVpmPlayerLatest(
  playerId: number,
  data: Partial<NewVpmPlayerLatest>
): Promise<VpmPlayerLatest[]> {
  return await db
    .update(vpmPlayerLatestTable)
    .set(data)
    .where(eq(vpmPlayerLatestTable.player_id, playerId))
    .returning();
}

// VPM Model Meta
export async function createVpmModelMeta(
  data: NewVpmModelMeta
): Promise<VpmModelMeta[]> {
  return await db.insert(vpmModelMetaTable).values(data).returning();
}

export async function getVpmModelMeta(
  modelVersion: string
): Promise<VpmModelMeta[]> {
  return await db
    .select()
    .from(vpmModelMetaTable)
    .where(eq(vpmModelMetaTable.model_version, modelVersion));
}

export async function getAllVpmModelMetas(): Promise<VpmModelMeta[]> {
  return await db.select().from(vpmModelMetaTable);
}

export async function updateVpmModelMeta(
  modelVersion: string,
  data: Partial<NewVpmModelMeta>
): Promise<VpmModelMeta[]> {
  return await db
    .update(vpmModelMetaTable)
    .set(data)
    .where(eq(vpmModelMetaTable.model_version, modelVersion))
    .returning();
}

export async function deleteVpmModelMeta(
  modelVersion: string
): Promise<VpmModelMeta[]> {
  return await db
    .delete(vpmModelMetaTable)
    .where(eq(vpmModelMetaTable.model_version, modelVersion))
    .returning();
}

export async function getPlayerKfData(playerId: number) {
  const data = await db
    .select({
      gameNum: vpmPlayerKfTable.game_num,
      gameDate: vpmPlayerKfTable.game_date,
      y: vpmPlayerKfTable.y,
      smoothMean: vpmPlayerKfTable.smooth_mean,
      smoothStd: vpmPlayerKfTable.smooth_std,
    })
    .from(vpmPlayerKfTable)
    .where(eq(vpmPlayerKfTable.player_id, playerId))
    .orderBy(asc(vpmPlayerKfTable.game_num));

  return data;
}

export async function getPlayerRatingsList({
  minGames = 50,
  seasonStartDate,
  seasonEndDate,
}: {
  minGames?: number;
  seasonStartDate?: Date;
  seasonEndDate?: Date | null;
}) {
  const conditions = [
    gte(vpmPlayerLatestTable.last_game_num, minGames),
    isNotNull(vpmPlayerLatestTable.current_vpm_per24),
  ];

  if (seasonStartDate) {
    conditions.push(
      gte(
        vpmPlayerLatestTable.last_game_date,
        seasonStartDate.toISOString().split("T")[0]
      )
    );
  }

  if (seasonEndDate) {
    conditions.push(
      lte(
        vpmPlayerLatestTable.last_game_date,
        seasonEndDate.toISOString().split("T")[0]
      )
    );
  }

  const results = await db
    .select({
      ign: playersTable.ign,
      teamName: teamsTable.name,
      teamLogo: teamsTable.logo_url,
      vpm: vpmPlayerLatestTable.current_vpm_per24,
      mapsPlayed: vpmPlayerLatestTable.last_game_num,
    })
    .from(vpmPlayerLatestTable)
    .leftJoin(playersTable, eq(vpmPlayerLatestTable.player_id, playersTable.id))
    .leftJoin(teamsTable, eq(playersTable.team_id, teamsTable.id))
    .where(and(...conditions))
    .orderBy(desc(vpmPlayerLatestTable.current_vpm_per24));

  return results;
}
