import { db } from "@/db/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  const data = await db.execute(sql`
    WITH peak_ratings_per_season AS (
      SELECT
        er.team_id,
        er.map_name,
        EXTRACT(YEAR FROM er.rating_date) AS season_year,
        MAX(er.rating) AS peak_rating
      FROM elo_ratings er
      GROUP BY 1, 2, 3
    ),
    peak_events AS (
      SELECT
        pr.team_id,
        pr.map_name,
        pr.season_year,
        pr.peak_rating,
        MIN(er.rating_date) AS achieved_at
      FROM peak_ratings_per_season pr
      JOIN elo_ratings er ON er.team_id = pr.team_id
        AND er.map_name = pr.map_name
        AND EXTRACT(YEAR FROM er.rating_date) = pr.season_year
        AND er.rating = pr.peak_rating
      GROUP BY 1, 2, 3, 4
    )
    SELECT
      t.name AS "team_name",
      t.slug AS "team_slug",
      t.logo_url as "logo_url",
      pe.map_name AS "map_name",
      pe.peak_rating AS "rating",
      DATE_TRUNC('day', pe.achieved_at)::TEXT AS "peak_date",
      pe.season_year AS "season_year"
    FROM peak_events pe
    JOIN teams t ON t.id = pe.team_id
    ORDER BY pe.peak_rating DESC
    LIMIT 10
  `);

  return NextResponse.json(data);
} 