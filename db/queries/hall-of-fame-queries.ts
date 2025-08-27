import { db } from "@/db/db";
import { desc, asc, and, eq, or, gte, lt, sql, isNull } from "drizzle-orm";
import { eloRatingsTable, teamsTable, mapsTable, seasonsTable } from "@/db/schema";

export async function getTopMapRatings(limit = 10) {
  const subquery = db
    .select({
      team_id: eloRatingsTable.team_id,
      map_name: eloRatingsTable.map_name,
      season_id: seasonsTable.id,
      max_rating: sql`MAX(${eloRatingsTable.rating})`.as('max_rating'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.rating_date, seasonsTable.start_date),
      or(
        lt(eloRatingsTable.rating_date, seasonsTable.end_date),
        isNull(seasonsTable.end_date)
      )
    ))
    .groupBy(eloRatingsTable.team_id, eloRatingsTable.map_name, seasonsTable.id)
    .as('max_ratings');

  return await db
    .select({
      team_id: subquery.team_id,
      team_name: teamsTable.name,
      team_slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
      map_name: subquery.map_name,
      rating: subquery.max_rating,
      rating_date: eloRatingsTable.rating_date,
      season_id: subquery.season_id,
      season_year: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.team_id, teamsTable.id))
    .innerJoin(eloRatingsTable, and(
      eq(eloRatingsTable.team_id, subquery.team_id),
      eq(eloRatingsTable.map_name, subquery.map_name),
      eq(eloRatingsTable.rating, subquery.max_rating)
    ))
    .innerJoin(seasonsTable, eq(subquery.season_id, seasonsTable.id))
    .orderBy(desc(subquery.max_rating))
    .limit(limit);
}

export async function getWorstMapRatings(limit = 10) {
  const subquery = db
    .select({
      team_id: eloRatingsTable.team_id,
      map_name: eloRatingsTable.map_name,
      season_id: seasonsTable.id,
      min_rating: sql`MIN(${eloRatingsTable.rating})`.as('min_rating'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.rating_date, seasonsTable.start_date),
      or(
        lt(eloRatingsTable.rating_date, seasonsTable.end_date),
        isNull(seasonsTable.end_date)
      )
    ))
    .groupBy(eloRatingsTable.team_id, eloRatingsTable.map_name, seasonsTable.id)
    .as('min_ratings');

  return await db
    .select({
      team_id: subquery.team_id,
      team_name: teamsTable.name,
      team_slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
      map_name: subquery.map_name,
      rating: subquery.min_rating,
      rating_date: eloRatingsTable.rating_date,
      season_id: subquery.season_id,
      season_year: seasonsTable.year,
    })
    .from(subquery)
    .innerJoin(teamsTable, eq(subquery.team_id, teamsTable.id))
    .innerJoin(eloRatingsTable, and(
      eq(eloRatingsTable.team_id, subquery.team_id),
      eq(eloRatingsTable.map_name, subquery.map_name),
      eq(eloRatingsTable.rating, subquery.min_rating)
    ))
    .innerJoin(seasonsTable, eq(subquery.season_id, seasonsTable.id))
    .orderBy(asc(subquery.min_rating))
    .limit(limit);
}

export async function getBiggestVariances() {
  return await db
    .select({
      team_id: eloRatingsTable.team_id,
      team_name: teamsTable.name,
      team_slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
      map_name: eloRatingsTable.map_name,
      variance: sql`MAX(${eloRatingsTable.rating}) - MIN(${eloRatingsTable.rating})`.as('variance'),
      max_rating: sql`MAX(${eloRatingsTable.rating})`,
      min_rating: sql`MIN(${eloRatingsTable.rating})`,
      season_id: seasonsTable.id,
      season_year: seasonsTable.year,
    })
    .from(eloRatingsTable)
    .innerJoin(teamsTable, eq(eloRatingsTable.team_id, teamsTable.id))
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.rating_date, seasonsTable.start_date),
      or(
        lt(eloRatingsTable.rating_date, seasonsTable.end_date),
        isNull(seasonsTable.end_date)
      )
    ))
    .groupBy(
      eloRatingsTable.team_id,
      teamsTable.name,
      teamsTable.slug,
      teamsTable.logo_url,
      eloRatingsTable.map_name,
      seasonsTable.id,
      seasonsTable.year
    )
    .orderBy(desc(sql`variance`))
    .limit(10);
}

export async function getBiggestUpsets() {
  return await db
    .select({
      winner_team_id: mapsTable.winner_team_id,
      winner_name: teamsTable.name,
      winner_slug: teamsTable.slug,
      winner_logo: teamsTable.logo_url,
      winner_elo: sql<number>`(SELECT rating FROM elo_ratings 
        WHERE team_id = ${mapsTable.winner_team_id} 
        AND map_played_id = ${mapsTable.id})`,
      loser_team_id: mapsTable.loser_team_id,
      loser_name: sql<string>`(SELECT name FROM teams WHERE id = maps.loser_team_id)`,
      loser_slug: sql<string>`(SELECT slug FROM teams WHERE id = maps.loser_team_id)`,
      loser_logo: sql<string>`(SELECT logo_url FROM teams WHERE id = maps.loser_team_id)`,
      loser_elo: sql<number>`(SELECT rating FROM elo_ratings 
        WHERE team_id = ${mapsTable.loser_team_id} 
        AND map_played_id = ${mapsTable.id})`,
      map_name: mapsTable.map_name,
      winner_score: mapsTable.winner_rounds,
      loser_score: mapsTable.loser_rounds,
      match_date: mapsTable.completed_at,
    })
    .from(mapsTable)
    .innerJoin(teamsTable, eq(mapsTable.winner_team_id, teamsTable.id))
    .where(sql`
      (SELECT rating FROM elo_ratings 
       WHERE team_id = ${mapsTable.loser_team_id} 
       AND map_played_id = ${mapsTable.id}) >
      (SELECT rating FROM elo_ratings 
       WHERE team_id = ${mapsTable.winner_team_id} 
       AND map_played_id = ${mapsTable.id})
    `)
    .orderBy(desc(sql`
      ABS((SELECT rating FROM elo_ratings 
          WHERE team_id = ${mapsTable.loser_team_id} 
          AND map_played_id = ${mapsTable.id}) -
          (SELECT rating FROM elo_ratings 
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
      winner_name: teamsTable.name,
      winner_slug: teamsTable.slug,
      winner_logo: teamsTable.logo_url,
      loser_team_id: mapsTable.loser_team_id,
      loser_name: sql`(SELECT name FROM teams WHERE id = maps.loser_team_id)`,
      loser_slug: sql`(SELECT slug FROM teams WHERE id = maps.loser_team_id)`,
      map_name: mapsTable.map_name,
      match_date: mapsTable.completed_at,
    })
    .from(mapsTable)
    .innerJoin(teamsTable, eq(mapsTable.winner_team_id, teamsTable.id))
    .where(and(
      eq(mapsTable.winner_rounds, 13),
      eq(mapsTable.loser_rounds, 0)
    ))
    .orderBy(mapsTable.completed_at);
}

export async function getGreatestTeams(limit = 10) {
  const subquery = db
    .select({
      team_id: eloRatingsTable.team_id,
      season_id: seasonsTable.id,
      max_rating: sql`MAX(${eloRatingsTable.rating})`.as('max_rating'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.rating_date, seasonsTable.start_date),
      or(
        lt(eloRatingsTable.rating_date, seasonsTable.end_date),
        isNull(seasonsTable.end_date)
      )
    ))
    .groupBy(eloRatingsTable.team_id, seasonsTable.id)
    .as('peak_ratings');

  const ratingsWithDates = db
    .select({
      team_id: subquery.team_id,
      season_id: subquery.season_id,
      max_rating: subquery.max_rating,
      peak_date: eloRatingsTable.rating_date,
    })
    .from(subquery)
    .innerJoin(eloRatingsTable, and(
      eq(eloRatingsTable.team_id, subquery.team_id),
      eq(eloRatingsTable.rating, subquery.max_rating)
    ))
    .as('ratings_with_dates');

  return await db
    .select({
      team_id: ratingsWithDates.team_id,
      team_name: teamsTable.name,
      team_slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
      rating: ratingsWithDates.max_rating,
      peak_date: ratingsWithDates.peak_date,
      season_id: ratingsWithDates.season_id,
      season_year: seasonsTable.year,
    })
    .from(ratingsWithDates)
    .innerJoin(teamsTable, eq(ratingsWithDates.team_id, teamsTable.id))
    .innerJoin(seasonsTable, eq(ratingsWithDates.season_id, seasonsTable.id))
    .orderBy(desc(ratingsWithDates.max_rating))
    .limit(limit);
}

export async function getWorstTeams(limit = 10) {
  const subquery = db
    .select({
      team_id: eloRatingsTable.team_id,
      season_id: seasonsTable.id,
      min_rating: sql`MIN(${eloRatingsTable.rating})`.as('min_rating'),
    })
    .from(eloRatingsTable)
    .innerJoin(seasonsTable, and(
      gte(eloRatingsTable.rating_date, seasonsTable.start_date),
      or(
        lt(eloRatingsTable.rating_date, seasonsTable.end_date),
        isNull(seasonsTable.end_date)
      )
    ))
    .groupBy(eloRatingsTable.team_id, seasonsTable.id)
    .as('lowest_ratings');

  const ratingsWithDates = db
    .select({
      team_id: subquery.team_id,
      season_id: subquery.season_id,
      min_rating: subquery.min_rating,
      lowest_date: eloRatingsTable.rating_date,
    })
    .from(subquery)
    .innerJoin(eloRatingsTable, and(
      eq(eloRatingsTable.team_id, subquery.team_id),
      eq(eloRatingsTable.rating, subquery.min_rating)
    ))
    .as('ratings_with_dates');

  return await db
    .select({
      team_id: ratingsWithDates.team_id,
      team_name: teamsTable.name,
      team_slug: teamsTable.slug,
      logo_url: teamsTable.logo_url,
      rating: ratingsWithDates.min_rating,
      lowest_date: ratingsWithDates.lowest_date,
      season_id: ratingsWithDates.season_id,
      season_year: seasonsTable.year,
    })
    .from(ratingsWithDates)
    .innerJoin(teamsTable, eq(ratingsWithDates.team_id, teamsTable.id))
    .innerJoin(seasonsTable, eq(ratingsWithDates.season_id, seasonsTable.id))
    .orderBy(asc(ratingsWithDates.min_rating))
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