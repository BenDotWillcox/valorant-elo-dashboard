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
  // Use raw SQL for better performance - eliminates subqueries
  const result = await db.execute(sql`
    SELECT 
      m.winner_team_id,
      wt.name as winner_name,
      wt.slug as winner_slug,
      wt.logo_url as winner_logo,
      we.rating as winner_elo,
      m.loser_team_id,
      lt.name as loser_name,
      lt.slug as loser_slug,
      lt.logo_url as loser_logo,
      le.rating as loser_elo,
      m.map_name,
      m.winner_rounds as winner_score,
      m.loser_rounds as loser_score,
      m.completed_at as match_date
    FROM maps m
    INNER JOIN teams wt ON m.winner_team_id = wt.id
    INNER JOIN teams lt ON m.loser_team_id = lt.id
    INNER JOIN elo_ratings we ON we.team_id = m.winner_team_id AND we.map_played_id = m.id
    INNER JOIN elo_ratings le ON le.team_id = m.loser_team_id AND le.map_played_id = m.id
    WHERE le.rating > we.rating
    ORDER BY ABS(le.rating - we.rating) DESC
    LIMIT 10
  `);
  return result as any;
}

export async function getLongestWinStreaks(limit = 10) {
  const result = await db.execute(sql`
    WITH match_results AS (
        SELECT 
            winner_team_id,
            loser_team_id,
            map_name,
            completed_at,
            winner_rounds - loser_rounds AS winner_margin,
            loser_rounds - winner_rounds AS loser_margin
        FROM maps
        WHERE completed_at IS NOT NULL
    ),
    team_matches AS (
        SELECT 
            winner_team_id AS team_id,
            map_name,
            completed_at,
            winner_margin AS margin,
            'win' AS result
        FROM match_results
        UNION ALL
        SELECT
            loser_team_id AS team_id,
            map_name,
            completed_at,
            loser_margin AS margin,
            'loss' AS result
        FROM match_results
    ),
    streak_groups AS (
        SELECT
            *,
            LAG(result, 1, 'none') OVER (PARTITION BY team_id, map_name ORDER BY completed_at) as prev_result
        FROM team_matches
    ),
    streak_starts AS (
        SELECT
            *,
            CASE WHEN result != prev_result THEN 1 ELSE 0 END AS is_streak_start
        FROM streak_groups
    ),
    streak_ids AS (
        SELECT
            *,
            SUM(is_streak_start) OVER (PARTITION BY team_id, map_name ORDER BY completed_at) AS streak_id
        FROM streak_starts
    ),
    streaks AS (
        SELECT
            team_id,
            map_name,
            MIN(completed_at) as start_date,
            MAX(completed_at) as end_date,
            COUNT(*) as streak_length,
            AVG(margin)::numeric(10,2) as avg_margin
        FROM streak_ids
        WHERE result = 'win'
        GROUP BY team_id, map_name, streak_id, result
        HAVING COUNT(*) >= 2
    ),
    last_match_dates AS (
        SELECT
            team_id,
            map_name,
            MAX(completed_at) AS last_match_date
        FROM team_matches
        GROUP BY team_id, map_name
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
        s.avg_margin,
        (s.end_date = lmd.last_match_date) as is_active
    FROM streaks s
    JOIN teams t ON t.id = s.team_id
    JOIN last_match_dates lmd ON s.team_id = lmd.team_id AND s.map_name = lmd.map_name
    ORDER BY s.streak_length DESC, s.avg_margin DESC
    LIMIT ${limit}
  `);
  return result as any;
}

export async function getPerfectGames() {
  // Use raw SQL for cleaner joins
  const result = await db.execute(sql`
    SELECT 
      m.winner_team_id as "winnerTeamId",
      wt.name as winner_name,
      wt.slug as winner_slug,
      wt.logo_url as winner_logo,
      m.loser_team_id,
      lt.name as loser_name,
      lt.slug as loser_slug,
      m.map_name,
      m.completed_at as match_date
    FROM maps m
    INNER JOIN teams wt ON m.winner_team_id = wt.id
    INNER JOIN teams lt ON m.loser_team_id = lt.id
    WHERE m.winner_rounds = 13 AND m.loser_rounds = 0
    ORDER BY m.completed_at
  `);
  return result as any;
}

export async function getGreatestTeams(limit = 10) {
  return await db.execute(sql`
    WITH ranked_ratings AS (
      SELECT
        er.team_id,
        s.id as season_id,
        s.year as season_year,
        t.name as team_name,
        t.slug as team_slug,
        t.logo_url,
        er.rating,
        er.rating_date,
        er.map_name,
        ROW_NUMBER() OVER(PARTITION BY er.team_id, s.id ORDER BY er.rating DESC) as rn
      FROM elo_ratings er
      JOIN seasons s ON er.rating_date >= s.start_date AND (er.rating_date < s.end_date OR s.end_date IS NULL)
      JOIN teams t ON t.id = er.team_id
    )
    SELECT
      team_id,
      season_id,
      season_year,
      team_name,
      team_slug,
      logo_url,
      rating,
      rating_date as peak_date,
      map_name
    FROM ranked_ratings
    WHERE rn = 1
    ORDER BY rating DESC
    LIMIT ${limit}
  `);
}

export async function getWorstTeams(limit = 10) {
  return await db.execute(sql`
    WITH ranked_ratings AS (
      SELECT
        er.team_id,
        s.id as season_id,
        s.year as season_year,
        t.name as team_name,
        t.slug as team_slug,
        t.logo_url,
        er.rating,
        er.rating_date,
        er.map_name,
        ROW_NUMBER() OVER(PARTITION BY er.team_id, s.id ORDER BY er.rating ASC) as rn
      FROM elo_ratings er
      JOIN seasons s ON er.rating_date >= s.start_date AND (er.rating_date < s.end_date OR s.end_date IS NULL)
      JOIN teams t ON t.id = er.team_id
    )
    SELECT
      team_id,
      season_id,
      season_year,
      team_name,
      team_slug,
      logo_url,
      rating,
      rating_date as lowest_date,
      map_name
    FROM ranked_ratings
    WHERE rn = 1
    ORDER BY rating ASC
    LIMIT ${limit}
  `);
}

export async function getLongestLoseStreaks(limit = 10) {
  const result = await db.execute(sql`
    WITH match_results AS (
        SELECT 
            winner_team_id,
            loser_team_id,
            map_name,
            completed_at,
            winner_rounds - loser_rounds AS winner_margin,
            loser_rounds - winner_rounds AS loser_margin
        FROM maps
        WHERE completed_at IS NOT NULL
    ),
    team_matches AS (
        SELECT 
            winner_team_id AS team_id,
            map_name,
            completed_at,
            winner_margin AS margin,
            'win' AS result
        FROM match_results
        UNION ALL
        SELECT
            loser_team_id AS team_id,
            map_name,
            completed_at,
            loser_margin AS margin,
            'loss' AS result
        FROM match_results
    ),
    streak_groups AS (
        SELECT
            *,
            LAG(result, 1, 'none') OVER (PARTITION BY team_id, map_name ORDER BY completed_at) as prev_result
        FROM team_matches
    ),
    streak_starts AS (
        SELECT
            *,
            CASE WHEN result != prev_result THEN 1 ELSE 0 END AS is_streak_start
        FROM streak_groups
    ),
    streak_ids AS (
        SELECT
            *,
            SUM(is_streak_start) OVER (PARTITION BY team_id, map_name ORDER BY completed_at) AS streak_id
        FROM streak_starts
    ),
    streaks AS (
        SELECT
            team_id,
            map_name,
            MIN(completed_at) as start_date,
            MAX(completed_at) as end_date,
            COUNT(*) as streak_length,
            AVG(margin)::numeric(10,2) as avg_margin
        FROM streak_ids
        WHERE result = 'loss'
        GROUP BY team_id, map_name, streak_id, result
        HAVING COUNT(*) >= 2
    ),
    last_match_dates AS (
        SELECT
            team_id,
            map_name,
            MAX(completed_at) AS last_match_date
        FROM team_matches
        GROUP BY team_id, map_name
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
        s.avg_margin,
        (s.end_date = lmd.last_match_date) as is_active
    FROM streaks s
    JOIN teams t ON t.id = s.team_id
    JOIN last_match_dates lmd ON s.team_id = lmd.team_id AND s.map_name = lmd.map_name
    ORDER BY s.streak_length DESC, s.avg_margin ASC
    LIMIT ${limit}
  `);
  return result as any;
} 