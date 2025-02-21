import { db } from "@/db/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await db.execute(sql`
    SELECT 
      t.name as "teamName",
      t.slug as "teamSlug",
      er.map_name as "mapName",
      er.effective_rating as "effectiveRating",
      DATE_TRUNC('day', er.rating_date)::text as "achievedAt",
      EXTRACT(YEAR FROM er.rating_date) as "seasonYear"
    FROM elo_ratings er
    JOIN teams t ON t.id = er.team_id
    WHERE (er.team_id, er.map_name, er.effective_rating) IN (
      SELECT 
        team_id,
        map_name,
        MAX(effective_rating) as peak_rating
      FROM elo_ratings
      GROUP BY team_id, map_name
    )
    ORDER BY er.effective_rating DESC
    LIMIT 10
  `);

  return NextResponse.json(data);
} 