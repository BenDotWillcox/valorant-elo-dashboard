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
      teamId: eloRatingsCurrentTable.team_id,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      mapName: eloRatingsCurrentTable.map_name,
      rating: sql<string>`CAST(${eloRatingsCurrentTable.effective_rating} AS TEXT)`,
      logoUrl: teamsTable.logo_url,
    })
    .from(eloRatingsCurrentTable)
    .innerJoin(teamsTable, eq(eloRatingsCurrentTable.team_id, teamsTable.id))
    .where(
      and(
        mapName ? eq(eloRatingsCurrentTable.map_name, mapName) : undefined,
        seasonId ? eq(eloRatingsCurrentTable.season_id, seasonId) : undefined
      )
    )
    .orderBy(desc(eloRatingsCurrentTable.effective_rating));

  return query;
}

export async function getAllMapNames() {
  const results = await db
    .select({ mapName: mapsTable.map_name })
    .from(mapsTable)
    .groupBy(mapsTable.map_name)
    .orderBy(mapsTable.map_name);
  
  return results.map(r => r.mapName);
}

export async function getEloHistory(seasonId?: number) {
  const query = db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      mapName: eloRatingsTable.map_name,
      rating: sql<string>`CAST(${eloRatingsTable.effective_rating} AS TEXT)`,
      ratingDate: eloRatingsTable.rating_date,
      opponentName: sql<string>`
        CASE 
          WHEN ${mapsTable.winner_team_id} = ${eloRatingsTable.team_id} 
          THEN (SELECT name FROM ${teamsTable} WHERE id = ${mapsTable.loser_team_id})
          ELSE (SELECT name FROM ${teamsTable} WHERE id = ${mapsTable.winner_team_id})
        END
      `,
      isWinner: sql<boolean>`${mapsTable.winner_team_id} = ${eloRatingsTable.team_id}`,
      winnerScore: mapsTable.winner_rounds,
      loserScore: mapsTable.loser_rounds
    })
    .from(eloRatingsTable)
    .innerJoin(teamsTable, eq(eloRatingsTable.team_id, teamsTable.id))
    .innerJoin(mapsTable, eq(eloRatingsTable.map_played_id, mapsTable.id));

  if (seasonId) {
    const season = await db.select().from(seasonsTable).where(eq(seasonsTable.id, seasonId)).limit(1);
    if (season.length) {
      query.where(and(
        gte(eloRatingsTable.rating_date, season[0].start_date),
        season[0].end_date ? lt(eloRatingsTable.rating_date, season[0].end_date) : undefined
      ));
    }
  }

  return await query.orderBy(desc(eloRatingsTable.rating_date));
}

export async function getSeasons() {
  return await db
    .select()
    .from(seasonsTable)
    .orderBy(desc(seasonsTable.year));
} 