import { db } from "@/db/db";
import { eloRatingsTable, teamsTable } from "@/db/schema";
import { sql, and, lt, inArray, gte } from "drizzle-orm";

/**
 * Get a snapshot of ELO ratings for specified teams before a given date.
 * Returns the latest rating per team/map combination before the snapshot date.
 *
 * @param beforeDate - Get ratings as of this date
 * @param teamSlugs - Array of team slugs to fetch ratings for
 * @returns Record mapping team slug -> map name -> rating
 */
export async function getHistoricalEloSnapshot(
  beforeDate: Date,
  teamSlugs: string[]
): Promise<Record<string, Record<string, number>>> {
  // Get team IDs for the given slugs
  const teams = await db
    .select({
      id: teamsTable.id,
      slug: teamsTable.slug,
    })
    .from(teamsTable)
    .where(inArray(teamsTable.slug, teamSlugs));

  console.log(`  Found ${teams.length} teams in database matching slugs`);
  
  const teamIdToSlug = new Map(teams.map((t) => [t.id, t.slug]));
  const teamIds = teams.map((t) => t.id);

  if (teamIds.length === 0) {
    console.log(`  No team IDs found. Requested slugs: ${teamSlugs.join(', ')}`);
    return {};
  }
  
  console.log(`  Team IDs: ${teamIds.join(', ')}`);
  console.log(`  Looking for ratings before: ${beforeDate.toISOString()}`)

  // Determine season start date (January 1st of the match year)
  const seasonResetDate = new Date(beforeDate.getFullYear(), 0, 1);

  // Get the latest rating for each team/map combo before the given date
  // Using Drizzle's query builder with proper array handling
  const beforeDateStr = beforeDate.toISOString();
  const seasonResetDateStr = seasonResetDate.toISOString();
  
  console.log(`  Date range: ${seasonResetDateStr} to ${beforeDateStr}`);
  
  const latestRatings = await db.execute(sql`
    WITH LatestRatings AS (
      SELECT DISTINCT ON (team_id, map_name)
        team_id,
        map_name,
        rating
      FROM elo_ratings
      WHERE team_id IN (${sql.join(teamIds.map(id => sql`${id}`), sql`, `)})
        AND rating_date < ${beforeDateStr}
        AND rating_date >= ${seasonResetDateStr}
      ORDER BY team_id, map_name, rating_date DESC
    )
    SELECT team_id, map_name, rating FROM LatestRatings
  `);

  // Build the result object
  const result: Record<string, Record<string, number>> = {};

  // db.execute returns rows directly as an array
  const rows = latestRatings as unknown as {
    team_id: number;
    map_name: string;
    rating: string;
  }[];

  console.log(`  Query returned ${rows.length} rating rows`);
  if (rows.length > 0) {
    console.log(`  Sample row:`, rows[0]);
  }

  for (const row of rows) {
    // team_id comes back as string from raw SQL, need to parse it
    const teamId = typeof row.team_id === 'string' ? parseInt(row.team_id, 10) : row.team_id;
    const slug = teamIdToSlug.get(teamId);
    if (slug) {
      if (!result[slug]) {
        result[slug] = {};
      }
      result[slug][row.map_name] = parseFloat(row.rating);
    }
  }

  return result;
}
