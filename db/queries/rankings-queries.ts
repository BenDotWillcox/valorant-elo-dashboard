import { db } from "@/db/db";
import { eloRatingsCurrentTable, teamsTable, eloRatingsTable, mapsTable, seasonsTable } from "@/db/schema";
import { desc, eq, and, sql, gte, lt } from "drizzle-orm";
import { initializeSeasons } from "@/db/queries/elo-processor";

export async function getCurrentMapRankings(
  mapName?: string,
  seasonId?: number
) {
  const query = db
    .select({
      teamId: eloRatingsCurrentTable.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      mapName: eloRatingsCurrentTable.mapName,
      rating: sql<string>`CAST(${eloRatingsCurrentTable.effectiveRating} AS TEXT)`,
      logoUrl: teamsTable.logoUrl,
    })
    .from(eloRatingsCurrentTable)
    .innerJoin(teamsTable, eq(eloRatingsCurrentTable.teamId, teamsTable.id))
    .where(
      and(
        mapName ? eq(eloRatingsCurrentTable.mapName, mapName) : undefined,
        seasonId ? eq(eloRatingsCurrentTable.seasonId, seasonId) : undefined
      )
    )
    .orderBy(desc(eloRatingsCurrentTable.effectiveRating));

  return query;
}

export async function getAllMapNames() {
  const results = await db
    .select({ mapName: mapsTable.mapName })
    .from(mapsTable)
    .groupBy(mapsTable.mapName)
    .orderBy(mapsTable.mapName);
  
  return results.map(r => r.mapName);
}

export async function getEloHistory(seasonId?: number) {
  const query = db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      mapName: eloRatingsTable.mapName,
      rating: sql<string>`CAST(${eloRatingsTable.effectiveRating} AS TEXT)`,
      ratingDate: eloRatingsTable.ratingDate,
      opponentName: sql<string>`
        CASE 
          WHEN ${mapsTable.winner_team_id} = ${eloRatingsTable.teamId} 
          THEN (SELECT name FROM ${teamsTable} WHERE id = ${mapsTable.loser_team_id})
          ELSE (SELECT name FROM ${teamsTable} WHERE id = ${mapsTable.winner_team_id})
        END
      `,
      isWinner: sql<boolean>`${mapsTable.winner_team_id} = ${eloRatingsTable.teamId}`,
      winnerScore: mapsTable.winner_rounds,
      loserScore: mapsTable.loser_rounds
    })
    .from(eloRatingsTable)
    .innerJoin(teamsTable, eq(eloRatingsTable.teamId, teamsTable.id))
    .innerJoin(mapsTable, eq(eloRatingsTable.mapPlayedId, mapsTable.id));

  if (seasonId) {
    const season = await db.select().from(seasonsTable).where(eq(seasonsTable.id, seasonId)).limit(1);
    if (season.length) {
      query.where(and(
        gte(eloRatingsTable.ratingDate, season[0].startDate),
        season[0].endDate ? lt(eloRatingsTable.ratingDate, season[0].endDate) : undefined
      ));
    }
  }

  return await query.orderBy(desc(eloRatingsTable.ratingDate));
}

export async function getSeasons() {
  return await db
    .select()
    .from(seasonsTable)
    .orderBy(desc(seasonsTable.year));
} 