import { db } from "@/db/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await db.execute(sql`
    WITH lowest_ratings_per_season AS (
      SELECT
        er.team_id,
        er.map_name,
        EXTRACT(YEAR FROM er.rating_date) AS season_year,
        MIN(er.rating) AS lowest_rating
      FROM elo_ratings er
      GROUP BY 1, 2, 3
    ),
    lowest_events AS (
      SELECT
        lr.team_id,
        lr.map_name,
        lr.season_year,
        lr.lowest_rating,
        MIN(er.rating_date) AS achieved_at
      FROM lowest_ratings_per_season lr
      JOIN elo_ratings er ON er.team_id = lr.team_id
        AND er.map_name = lr.map_name
        AND EXTRACT(YEAR FROM er.rating_date) = lr.season_year
        AND er.rating = lr.lowest_rating
      GROUP BY 1, 2, 3, 4
    )
    SELECT
      t.name AS "team_name",
      t.slug AS "team_slug",
      t.logo_url as "logo_url",
      le.map_name AS "map_name",
      le.lowest_rating AS "rating",
      DATE_TRUNC('day', le.achieved_at)::TEXT AS "lowest_date",
      le.season_year AS "season_year"
    FROM lowest_events le
    JOIN teams t ON t.id = le.team_id
    ORDER BY le.lowest_rating ASC
    LIMIT 10
  `);

  return NextResponse.json(data);
} 