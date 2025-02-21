import { db } from "@/db/db";
import { mapsTable } from "@/db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { subDays } from "date-fns";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || subDays(new Date(), 30).toISOString();
  const endDate = searchParams.get('endDate') || new Date().toISOString();

  const data = await db.execute(sql`
    WITH RECURSIVE dates AS (
      SELECT MIN(DATE_TRUNC('day', completed_at)) as date
      FROM maps
      WHERE completed_at >= ${startDate}::timestamp
        AND completed_at <= ${endDate}::timestamp
      UNION ALL
      SELECT date + INTERVAL '1 day'
      FROM dates
      WHERE date < ${endDate}::timestamp
    ),
    daily_counts AS (
      SELECT 
        DATE_TRUNC('day', completed_at) as date,
        map_name as "mapName",
        COUNT(*) as daily_count
      FROM maps 
      WHERE completed_at >= ${startDate}::timestamp
        AND completed_at <= ${endDate}::timestamp
      GROUP BY DATE_TRUNC('day', completed_at), map_name
    ),
    rolling_counts AS (
      SELECT 
        d.date,
        m."mapName",
        SUM(dc.daily_count) OVER (
          PARTITION BY m."mapName" 
          ORDER BY d.date 
          RANGE BETWEEN INTERVAL '30 days' PRECEDING AND CURRENT ROW
        ) as map_count,
        SUM(dc.daily_count) OVER (
          ORDER BY d.date 
          RANGE BETWEEN INTERVAL '30 days' PRECEDING AND CURRENT ROW
        ) as total_count
      FROM dates d
      CROSS JOIN (SELECT DISTINCT "mapName" FROM daily_counts) m
      LEFT JOIN daily_counts dc ON 
        dc.date = d.date AND 
        dc."mapName" = m."mapName"
    )
    SELECT 
      date::text,
      "mapName",
      ROUND((COALESCE(map_count, 0)::decimal / NULLIF(total_count, 0) * 100)::decimal, 2) as percentage
    FROM rolling_counts
    WHERE total_count > 0
    ORDER BY date, "mapName"
  `);

  return NextResponse.json(data);
} 