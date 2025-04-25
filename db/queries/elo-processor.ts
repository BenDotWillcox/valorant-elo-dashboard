import { db } from "@/db/db";
import { mapsTable, eloRatingsTable, eloRatingsCurrentTable, teamsTable, seasonsTable } from "@/db/schema";
import { eq, and, lt, desc, gte } from "drizzle-orm";
import { calculateHybridEloUpdate, DEFAULT_CONFIG } from "@/lib/elo/elo-calculator";

export async function getUnprocessedMaps() {
  return await db
    .select({
      id: mapsTable.id,
      map_name: mapsTable.map_name,
      winner_team_id: mapsTable.winner_team_id,
      loser_team_id: mapsTable.loser_team_id,
      winner_rounds: mapsTable.winner_rounds,
      loser_rounds: mapsTable.loser_rounds,
      completed_at: mapsTable.completed_at,
      processed: mapsTable.processed
    })
    .from(mapsTable)
    .where(eq(mapsTable.processed, false))
    .orderBy(mapsTable.completed_at);
}

export async function getCurrentRatings(teamId: number, mapName: string, beforeDate: Date) {
  // Find the most recent season reset date before this match
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

  return historicalElo.length ? {
    global_rating: Number(historicalElo[0].global_rating),
    map_offset: Number(historicalElo[0].map_offset)
  } : {
    global_rating: DEFAULT_CONFIG.initialGlobal,
    map_offset: DEFAULT_CONFIG.initialOffset
  };
}

export async function processEloUpdates() {
  const unprocessedMaps = await getUnprocessedMaps();

  for (const map of unprocessedMaps) {
    const season_id = map.completed_at.getFullYear();
    
    const winnerRatings = await getCurrentRatings(map.winner_team_id, map.map_name, map.completed_at);
    const loserRatings = await getCurrentRatings(map.loser_team_id, map.map_name, map.completed_at);

    const newRatings = calculateHybridEloUpdate(
      winnerRatings.global_rating,
      winnerRatings.map_offset,
      loserRatings.global_rating,
      loserRatings.map_offset,
      map.winner_rounds,
      map.loser_rounds,
      map.map_name
    );

    // Save historical ratings without the redundant rating field
    await Promise.all([
      db.insert(eloRatingsTable).values({
        team_id: map.winner_team_id,
        map_name: map.map_name,
        global_rating: String(newRatings.winner.global_rating),
        map_offset: String(newRatings.winner.map_offset),
        effective_rating: String(newRatings.winner.global_rating + newRatings.winner.map_offset),
        rating_date: map.completed_at,
        map_played_id: map.id,
      }),
      db.insert(eloRatingsTable).values({ 
        team_id: map.loser_team_id,
        map_name: map.map_name,
        global_rating: String(newRatings.loser.global_rating),
        map_offset: String(newRatings.loser.map_offset),
        effective_rating: String(newRatings.loser.global_rating + newRatings.loser.map_offset),
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
    throw new Error('No active season found');
  }
  
  return activeSeason[0];
}

async function updateCurrentRatings() {
  const currentSeason = await getCurrentSeason();
  await db.delete(eloRatingsCurrentTable);

  // Get the latest rating for each team/map combo in the current season
  await db.execute(`
    WITH LatestRatings AS (
      SELECT DISTINCT ON (team_id, map_name)
        team_id,
        map_name,
        global_rating,
        map_offset,
        effective_rating,
        rating_date
      FROM elo_ratings
      WHERE rating_date >= '${currentSeason.start_date.toISOString()}'
      ORDER BY team_id, map_name, rating_date DESC
    )
    INSERT INTO elo_ratings_current (
      team_id,
      season_id,
      map_name,
      global_rating,
      map_offset,
      effective_rating
    )
    SELECT 
      team_id,
      ${currentSeason.id},
      map_name,
      global_rating,
      map_offset,
      effective_rating
    FROM LatestRatings
  `);

  console.log('Current ratings updated for season', currentSeason.year);
}

export async function resetEloSystem() {
  await db.delete(eloRatingsTable);
  await db.delete(eloRatingsCurrentTable);
  
  // Reset all maps to unprocessed
  await db.update(mapsTable)
    .set({ processed: false });
    
  // Insert season reset ratings for 2025
  await insertSeasonResetRatings(new Date('2025-01-01'));
  
  console.log('ELO system reset complete with 2025 season baseline ratings.');
}

// Add this function to handle season resets
async function insertSeasonResetRatings(resetDate: Date) {
  const teams = await db.select().from(teamsTable);
  const maps = await getAllMapNames();
  
  // Insert reset ratings for each team/map combo
  const resetRatings = teams.flatMap(team => 
    maps.map(mapName => ({
      team_id: team.id,
      map_name: mapName,
      season_id: resetDate.getFullYear(),
      global_rating: "1000",
      map_offset: "0",
      effective_rating: "1000",
      rating_date: resetDate,
      map_played_id: 0
    }))
  );

  await db.insert(eloRatingsTable).values(resetRatings);
  console.log(`Inserted season reset ratings for ${teams.length} teams on ${maps.length} maps`);
}

async function getAllMapNames() {
  const maps = await db
    .select({ map_name: mapsTable.map_name })
    .from(mapsTable)
    .groupBy(mapsTable.map_name);
  
  return maps.map(m => m.map_name);
}

export async function createNewSeason(year: number) {
  // End current season if exists
  await db
    .update(seasonsTable)
    .set({ 
      is_active: false,
      end_date: new Date()
    })
    .where(eq(seasonsTable.is_active, true));

  // Create new season
  const [newSeason] = await db
    .insert(seasonsTable)
    .values({
      year,
      start_date: new Date(`${year}-01-01`),
      is_active: true
    })
    .returning();

  // Insert baseline ratings for all teams
  await insertSeasonResetRatings(newSeason.start_date);
  
  return newSeason;
}

export async function initializeSeasons() {
  const seasons = await db.select().from(seasonsTable);
  
  if (seasons.length === 0) {
    // Create past seasons
    await db.insert(seasonsTable).values([
      {
        year: 2023,
        start_date: new Date('2023-01-01'),
        end_date: new Date('2023-12-31'),
        is_active: false
      },
      {
        year: 2024,
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_active: false
      }
    ]);

    // Create current season
    await createNewSeason(2025);
  }
} 