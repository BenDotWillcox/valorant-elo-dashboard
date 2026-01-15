import { db } from "@/db/db";
import { mapsTable, eloRatingsTable, eloRatingsCurrentTable, teamsTable, seasonsTable } from "@/db/schema";
import { eq, and, lt, desc, gte } from "drizzle-orm";
import { calculateMapEloUpdate, DEFAULT_MAP_CONFIG } from "@/lib/elo/elo-calculator";
import { MAP_AVAILABILITY } from "@/lib/constants/maps";

export async function getUnprocessedMaps() {
  return await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.processed, false))
    .orderBy(mapsTable.completed_at);
}

export async function getCurrentRating(teamId: number, mapName: string, beforeDate: Date) {
  const seasonResetDate = new Date(beforeDate.getFullYear(), 0, 1); // January 1st of the match year

  const historicalElo = await db
    .select()
    .from(eloRatingsTable)
    .where(
      and(
        eq(eloRatingsTable.team_id, teamId),
        eq(eloRatingsTable.map_name, mapName),
        lt(eloRatingsTable.rating_date, beforeDate),
        gte(eloRatingsTable.rating_date, seasonResetDate)
      )
    )
    .orderBy(desc(eloRatingsTable.rating_date))
    .limit(1);

  return historicalElo.length ? Number(historicalElo[0].rating) : DEFAULT_MAP_CONFIG.initialRating;
}

export async function processEloUpdates() {
  const unprocessedMaps = await getUnprocessedMaps();

  for (const map of unprocessedMaps) {
    if (!map.completed_at) {
        console.warn(`Skipping map ID ${map.id} due to null completed_at date.`);
        continue;
    }

    const winnerRating = await getCurrentRating(map.winner_team_id, map.map_name, map.completed_at);
    const loserRating = await getCurrentRating(map.loser_team_id, map.map_name, map.completed_at);

    const newRatings = calculateMapEloUpdate(
      winnerRating,
      loserRating,
      map.winner_rounds,
      map.loser_rounds
    );

    // Save historical ratings
    await Promise.all([
      db.insert(eloRatingsTable).values({
        team_id: map.winner_team_id,
        map_name: map.map_name,
        rating: String(newRatings.winnerRating),
        rating_date: map.completed_at,
        map_played_id: map.id,
      }),
      db.insert(eloRatingsTable).values({
        team_id: map.loser_team_id,
        map_name: map.map_name,
        rating: String(newRatings.loserRating),
        rating_date: map.completed_at,
        map_played_id: map.id,
      })
    ]);

    await db.update(mapsTable)
      .set({ processed: true })
      .where(eq(mapsTable.id, map.id));
  }

  await updateCurrentRatings();
}

async function getCurrentSeason() {
  const activeSeason = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.is_active, true))
    .limit(1);

  if (!activeSeason.length) {
    // Fallback to creating a season for the current year if none is active
    console.warn("No active season found, creating one for the current year.");
    return createNewSeason(new Date().getFullYear());
  }

  return activeSeason[0];
}

async function updateCurrentRatings() {
  const currentSeason = await getCurrentSeason();
  await db.delete(eloRatingsCurrentTable).where(eq(eloRatingsCurrentTable.season_id, currentSeason.id));

  // Get the latest rating for each team/map combo in the current season
  await db.execute(`
    WITH LatestRatings AS (
      SELECT DISTINCT ON (team_id, map_name)
        team_id,
        map_name,
        rating,
        rating_date
      FROM elo_ratings
      WHERE rating_date >= '${currentSeason.start_date.toISOString()}'
      ORDER BY team_id, map_name, rating_date DESC
    )
    INSERT INTO elo_ratings_current (
      team_id,
      season_id,
      map_name,
      rating
    )
    SELECT
      lr.team_id,
      ${currentSeason.id},
      lr.map_name,
      lr.rating
    FROM LatestRatings lr
  `);

  console.log('Current ratings updated for season', currentSeason.year);
}

export async function resetEloSystem() {
  await db.delete(eloRatingsTable);
  await db.delete(eloRatingsCurrentTable);

  await db.update(mapsTable).set({ processed: false });

  await insertSeasonResetRatings(new Date('2025-01-01'));

  console.log('ELO system reset complete with 2025 season baseline ratings.');
}

async function insertSeasonResetRatings(resetDate: Date) {
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.is_active, true));
  const year = resetDate.getFullYear();
  const mapNames = MAP_AVAILABILITY[year] || [];

  if (mapNames.length === 0) {
    console.warn(`No maps defined for season ${year}, skipping rating initialization.`);
    return;
  }

  const resetRatings = teams.flatMap(team =>
    mapNames.map(mapName => ({
      team_id: team.id,
      map_name: mapName,
      rating: String(DEFAULT_MAP_CONFIG.initialRating),
      rating_date: resetDate,
      map_played_id: undefined
    }))
  );

  if (resetRatings.length > 0) {
    await db.insert(eloRatingsTable).values(resetRatings);
  }
  console.log(`Inserted season reset ratings for ${teams.length} active teams on ${mapNames.length} maps`);
}

export async function createNewSeason(year: number) {
  await db
    .update(seasonsTable)
    .set({
      is_active: false,
      end_date: new Date()
    })
    .where(eq(seasonsTable.is_active, true));

  const [newSeason] = await db
    .insert(seasonsTable)
    .values({
      year,
      start_date: new Date(`${year}-01-01`),
      is_active: true
    })
    .returning();

  await insertSeasonResetRatings(newSeason.start_date);

  return newSeason;
}

export async function initializeSeasons() {
  const seasons = await db.select().from(seasonsTable);

  if (seasons.length === 0) {
    console.log("Initializing seasons for the first time...");
    // Create historical seasons
    const historicalSeasons = [
      { year: 2023, start_date: new Date('2023-01-01'), end_date: new Date('2023-12-31'), is_active: false },
      { year: 2024, start_date: new Date('2024-01-01'), end_date: new Date('2024-12-31'), is_active: false },
      { year: 2025, start_date: new Date('2025-01-01'), end_date: new Date('2025-12-31'), is_active: false }
    ];
    await db.insert(seasonsTable).values(historicalSeasons);
    
    // Insert baseline ratings for each historical season
    await insertSeasonResetRatings(new Date('2023-01-01'));
    await insertSeasonResetRatings(new Date('2024-01-01'));
    await insertSeasonResetRatings(new Date('2025-01-01'));

    // Create and activate the current season
    await createNewSeason(new Date().getFullYear());
    console.log("Seasons initialized.");
  }
} 