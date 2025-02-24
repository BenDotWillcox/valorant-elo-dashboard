import { db } from "@/db/db";
import { desc, asc, and, eq, or, gte, lt, sql, isNull } from "drizzle-orm";
import { eloRatingsTable, teamsTable, mapsTable, seasonsTable } from "@/db/schema";

export async function getTopMapRatings(limit = 10) {
  const subquery = db
    .select({
      teamId: eloRatingsTable.teamId,
      mapName: eloRatingsTable.mapName,
      seasonId: seasonsTable.id,
      maxRating: sql`MAX(${eloRatingsTable.effectiveRating})`.as('max_rating'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .groupBy(eloRatingsTable.teamId, eloRatingsTable.mapName, seasonsTable.id)
    .as('max_ratings');

  return await db
    .select({
      teamId: subquery.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      mapName: subquery.mapName,
      rating: subquery.maxRating,
      ratingDate: eloRatingsTable.ratingDate,
      seasonId: subquery.seasonId,
      seasonYear: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.teamId, teamsTable.id))
    .innerJoin(eloRatingsTable, and(
      eq(eloRatingsTable.teamId, subquery.teamId),
      eq(eloRatingsTable.mapName, subquery.mapName),
      eq(eloRatingsTable.effectiveRating, subquery.maxRating)
    ))
    .innerJoin(seasonsTable, eq(subquery.seasonId, seasonsTable.id))
    .orderBy(desc(subquery.maxRating))
    .limit(limit);
}

export async function getWorstMapRatings(limit = 10) {
  return await db
    .select({
      teamId: eloRatingsTable.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      mapName: eloRatingsTable.mapName,
      rating: sql`MIN(${eloRatingsTable.effectiveRating})`.as('rating'),
      ratingDate: sql`${eloRatingsTable.ratingDate}`,
      seasonId: seasonsTable.id,
      seasonYear: seasonsTable.year,
    })
    .from(eloRatingsTable)
    .innerJoin(teamsTable, eq(eloRatingsTable.teamId, teamsTable.id))
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .groupBy(
      eloRatingsTable.teamId,
      teamsTable.name,
      teamsTable.slug,
      teamsTable.logoUrl,
      eloRatingsTable.mapName,
      eloRatingsTable.ratingDate,
      seasonsTable.id,
      seasonsTable.year
    )
    .orderBy(asc(sql`MIN(${eloRatingsTable.effectiveRating})`))
    .limit(limit);
}

export async function getBiggestVariances() {
  return await db
    .select({
      teamId: eloRatingsTable.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      mapName: eloRatingsTable.mapName,
      variance: sql`MAX(${eloRatingsTable.effectiveRating}) - MIN(${eloRatingsTable.effectiveRating})`.as('variance'),
      maxRating: sql`MAX(${eloRatingsTable.effectiveRating})`,
      minRating: sql`MIN(${eloRatingsTable.effectiveRating})`,
      seasonId: seasonsTable.id,
      seasonYear: seasonsTable.year,
    })
    .from(eloRatingsTable)
    .innerJoin(teamsTable, eq(eloRatingsTable.teamId, teamsTable.id))
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .groupBy(
      eloRatingsTable.teamId,
      teamsTable.name,
      teamsTable.slug,
      teamsTable.logoUrl,
      eloRatingsTable.mapName,
      seasonsTable.id,
      seasonsTable.year
    )
    .orderBy(desc(sql`variance`))
    .limit(10);
}

export async function getBiggestUpsets() {
  return await db
    .select({
      winnerTeamId: mapsTable.winner_team_id,
      winnerName: teamsTable.name,
      winnerSlug: teamsTable.slug,
      winnerLogo: teamsTable.logoUrl,
      winnerElo: sql<number>`(SELECT effective_rating FROM elo_ratings 
        WHERE team_id = ${mapsTable.winner_team_id} 
        AND map_played_id = ${mapsTable.id})`,
      loserTeamId: mapsTable.loser_team_id,
      loserName: sql<string>`(SELECT name FROM teams WHERE id = maps.loser_team_id)`,
      loserSlug: sql<string>`(SELECT slug FROM teams WHERE id = maps.loser_team_id)`,
      loserLogo: sql<string>`(SELECT logo_url FROM teams WHERE id = maps.loser_team_id)`,
      loserElo: sql<number>`(SELECT effective_rating FROM elo_ratings 
        WHERE team_id = ${mapsTable.loser_team_id} 
        AND map_played_id = ${mapsTable.id})`,
      mapName: mapsTable.mapName,
      winnerScore: mapsTable.winner_rounds,
      loserScore: mapsTable.loser_rounds,
      matchDate: mapsTable.completedAt,
    })
    .from(mapsTable)
    .innerJoin(teamsTable, eq(mapsTable.winner_team_id, teamsTable.id))
    .where(sql`
      (SELECT effective_rating FROM elo_ratings 
       WHERE team_id = ${mapsTable.loser_team_id} 
       AND map_played_id = ${mapsTable.id}) >
      (SELECT effective_rating FROM elo_ratings 
       WHERE team_id = ${mapsTable.winner_team_id} 
       AND map_played_id = ${mapsTable.id})
    `)
    .orderBy(desc(sql`
      ABS((SELECT effective_rating FROM elo_ratings 
          WHERE team_id = ${mapsTable.loser_team_id} 
          AND map_played_id = ${mapsTable.id}) -
          (SELECT effective_rating FROM elo_ratings 
          WHERE team_id = ${mapsTable.winner_team_id} 
          AND map_played_id = ${mapsTable.id}))
    `))
    .limit(10);
}

export async function getLongestWinStreaks(limit = 10) {
  return await db.execute(sql`
    WITH matches AS (
      SELECT 
        m.winner_team_id as team_id,
        m.map_name,
        m.completed_at,
        m.winner_rounds - m.loser_rounds as margin,
        ROW_NUMBER() OVER (PARTITION BY m.winner_team_id, m.map_name ORDER BY m.completed_at) as rn,
        LAG(m.completed_at) OVER (PARTITION BY m.winner_team_id, m.map_name ORDER BY m.completed_at) as prev_win
      FROM maps m
      WHERE m.completed_at IS NOT NULL
    ),
    streak_breaks AS (
      SELECT 
        m1.team_id,
        m1.map_name,
        m1.completed_at
      FROM matches m1
      LEFT JOIN maps m2 ON 
        m2.loser_team_id = m1.team_id AND 
        m2.map_name = m1.map_name AND
        m2.completed_at > m1.completed_at AND
        m2.completed_at < (
          SELECT MIN(completed_at) 
          FROM matches m3 
          WHERE m3.team_id = m1.team_id 
          AND m3.map_name = m1.map_name 
          AND m3.completed_at > m1.completed_at
        )
      WHERE m2.id IS NOT NULL
    ),
    streaks AS (
      SELECT 
        m.team_id,
        m.map_name,
        MIN(m.completed_at) as start_date,
        MAX(m.completed_at) as end_date,
        COUNT(*) as streak_length,
        AVG(m.margin)::numeric(10,2) as avg_margin
      FROM matches m
      LEFT JOIN streak_breaks sb ON 
        m.team_id = sb.team_id AND 
        m.map_name = sb.map_name AND
        m.completed_at > sb.completed_at
      WHERE sb.completed_at IS NULL
      GROUP BY m.team_id, m.map_name
      HAVING COUNT(*) >= 3
    )
    SELECT 
      t.id as team_id,
      t.name as team_name,
      t.slug as team_slug,
      t.logo_url,
      s.map_name,
      s.streak_length,
      s.start_date,
      s.end_date,
      s.avg_margin
    FROM streaks s
    JOIN teams t ON t.id = s.team_id
    ORDER BY s.streak_length DESC, s.avg_margin DESC
    LIMIT ${limit}
  `);
}

export async function getPerfectGames() {
  return await db
    .select({
      winnerTeamId: mapsTable.winner_team_id,
      winnerName: teamsTable.name,
      winnerSlug: teamsTable.slug,
      winnerLogo: teamsTable.logoUrl,
      loserTeamId: mapsTable.loser_team_id,
      loserName: sql`(SELECT name FROM teams WHERE id = maps.loser_team_id)`,
      loserSlug: sql`(SELECT slug FROM teams WHERE id = maps.loser_team_id)`,
      mapName: mapsTable.mapName,
      matchDate: mapsTable.completedAt,
    })
    .from(mapsTable)
    .innerJoin(teamsTable, eq(mapsTable.winner_team_id, teamsTable.id))
    .where(and(
      eq(mapsTable.winner_rounds, 13),
      eq(mapsTable.loser_rounds, 0)
    ))
    .orderBy(mapsTable.completedAt);
}

export async function getMapSpecialists(limit = 10) {
  const subquery = db
    .select({
      teamId: eloRatingsTable.teamId,
      mapName: eloRatingsTable.mapName,
      seasonId: seasonsTable.id,
      mapOffset: sql`MAX(${eloRatingsTable.mapOffset})`.as('max_offset'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .groupBy(eloRatingsTable.teamId, eloRatingsTable.mapName, seasonsTable.id)
    .as('map_offsets');

  return await db
    .select({
      teamId: subquery.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      mapName: subquery.mapName,
      mapOffset: subquery.mapOffset,
      seasonId: subquery.seasonId,
      seasonYear: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.teamId, teamsTable.id))
    .innerJoin(seasonsTable, eq(subquery.seasonId, seasonsTable.id))
    .orderBy(desc(subquery.mapOffset))
    .limit(limit);
}

export async function getMapStrugglers(limit = 10) {
  const subquery = db
    .select({
      teamId: eloRatingsTable.teamId,
      mapName: eloRatingsTable.mapName,
      seasonId: seasonsTable.id,
      mapOffset: sql`MIN(${eloRatingsTable.mapOffset})`.as('min_offset'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .groupBy(eloRatingsTable.teamId, eloRatingsTable.mapName, seasonsTable.id)
    .as('map_offsets');

  return await db
    .select({
      teamId: subquery.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      mapName: subquery.mapName,
      mapOffset: subquery.mapOffset,
      seasonId: subquery.seasonId,
      seasonYear: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.teamId, teamsTable.id))
    .innerJoin(seasonsTable, eq(subquery.seasonId, seasonsTable.id))
    .orderBy(asc(subquery.mapOffset))
    .limit(limit);
}

export async function getGreatestTeams(limit = 10) {
  const subquery = db
    .select({
      teamId: eloRatingsTable.teamId,
      seasonId: seasonsTable.id,
      maxGlobal: sql`MAX(${eloRatingsTable.globalRating})`.as('max_global'),
      peakDate: sql`${eloRatingsTable.ratingDate}`.as('peak_date'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .where(sql`${eloRatingsTable.globalRating} = (
      SELECT MAX(global_rating) 
      FROM elo_ratings e2 
      INNER JOIN seasons s2 ON (
        e2.rating_date >= s2.start_date AND 
        (e2.rating_date < s2.end_date OR s2.end_date IS NULL)
      )
      WHERE e2.team_id = ${eloRatingsTable.teamId}
      AND s2.id = ${seasonsTable.id}
    )`)
    .groupBy(eloRatingsTable.teamId, seasonsTable.id, eloRatingsTable.ratingDate)
    .as('peak_ratings');

  return await db
    .select({
      teamId: subquery.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      globalRating: subquery.maxGlobal,
      peakDate: subquery.peakDate,
      seasonId: subquery.seasonId,
      seasonYear: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.teamId, teamsTable.id))
    .innerJoin(seasonsTable, eq(subquery.seasonId, seasonsTable.id))
    .orderBy(desc(subquery.maxGlobal))
    .limit(limit);
}

export async function getWorstTeams(limit = 10) {
  const subquery = db
    .select({
      teamId: eloRatingsTable.teamId,
      seasonId: seasonsTable.id,
      minGlobal: sql`MIN(${eloRatingsTable.globalRating})`.as('min_global'),
      lowestDate: sql`${eloRatingsTable.ratingDate}::date`.as('lowest_date'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.ratingDate, seasonsTable.startDate),
      or(
        lt(eloRatingsTable.ratingDate, seasonsTable.endDate),
        isNull(seasonsTable.endDate)
      )
    ))
    .where(sql`${eloRatingsTable.globalRating} = (
      SELECT MIN(global_rating) 
      FROM elo_ratings e2 
      INNER JOIN seasons s2 ON (
        e2.rating_date >= s2.start_date AND 
        (e2.rating_date < s2.end_date OR s2.end_date IS NULL)
      )
      WHERE e2.team_id = ${eloRatingsTable.teamId}
      AND s2.id = ${seasonsTable.id}
    )`)
    .groupBy(eloRatingsTable.teamId, seasonsTable.id, eloRatingsTable.ratingDate)
    .as('lowest_ratings');

  return await db
    .select({
      teamId: subquery.teamId,
      teamName: teamsTable.name,
      teamSlug: teamsTable.slug,
      logoUrl: teamsTable.logoUrl,
      globalRating: subquery.minGlobal,
      lowestDate: subquery.lowestDate,
      seasonId: subquery.seasonId,
      seasonYear: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.teamId, teamsTable.id))
    .innerJoin(seasonsTable, eq(subquery.seasonId, seasonsTable.id))
    .orderBy(asc(subquery.minGlobal))
    .limit(limit);
}

export async function getLongestLoseStreaks(limit = 10) {
  return await db.execute(sql`
    WITH matches AS (
      SELECT 
        m.loser_team_id as team_id,
        m.map_name,
        m.completed_at,
        m.loser_rounds - m.winner_rounds as margin,
        ROW_NUMBER() OVER (PARTITION BY m.loser_team_id, m.map_name ORDER BY m.completed_at) as rn,
        LAG(m.completed_at) OVER (PARTITION BY m.loser_team_id, m.map_name ORDER BY m.completed_at) as prev_loss
      FROM maps m
      WHERE m.completed_at IS NOT NULL
    ),
    streak_breaks AS (
      SELECT 
        m1.team_id,
        m1.map_name,
        m1.completed_at
      FROM matches m1
      LEFT JOIN maps m2 ON 
        m2.winner_team_id = m1.team_id AND 
        m2.map_name = m1.map_name AND
        m2.completed_at > m1.completed_at AND
        m2.completed_at < (
          SELECT MIN(completed_at) 
          FROM matches m3 
          WHERE m3.team_id = m1.team_id 
          AND m3.map_name = m1.map_name 
          AND m3.completed_at > m1.completed_at
        )
      WHERE m2.id IS NOT NULL
    ),
    streaks AS (
      SELECT 
        m.team_id,
        m.map_name,
        MIN(m.completed_at) as start_date,
        MAX(m.completed_at) as end_date,
        COUNT(*) as streak_length,
        AVG(m.margin)::numeric(10,2) as avg_margin
      FROM matches m
      LEFT JOIN streak_breaks sb ON 
        m.team_id = sb.team_id AND 
        m.map_name = sb.map_name AND
        m.completed_at > sb.completed_at
      WHERE sb.completed_at IS NULL
      GROUP BY m.team_id, m.map_name
      HAVING COUNT(*) >= 3
    )
    SELECT 
      t.id as team_id,
      t.name as team_name,
      t.slug as team_slug,
      t.logo_url,
      s.map_name,
      s.streak_length,
      s.start_date,
      s.end_date,
      s.avg_margin
    FROM streaks s
    JOIN teams t ON t.id = s.team_id
    ORDER BY s.streak_length DESC, s.avg_margin ASC
    LIMIT ${limit}
  `);
} 