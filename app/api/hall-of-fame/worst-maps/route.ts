import { db } from "@/db/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await db.execute(sql`
    SELECT 
      t.name as "teamName",
      t.slug as "teamSlug",
      er.map_name as "mapName",
      er.rating as "rating",
      DATE_TRUNC('day', er.rating_date)::text as "achievedAt"
    FROM elo_ratings er
    JOIN teams t ON t.id = er.team_id
    WHERE (er.team_id, er.map_name, er.rating) IN (
      SELECT 
        team_id,
        map_name,
        MIN(rating) as lowest_rating
      FROM elo_ratings
      GROUP BY team_id, map_name
    )
    ORDER BY er.rating ASC
    LIMIT 10
  `);

  return NextResponse.json(data);
} 