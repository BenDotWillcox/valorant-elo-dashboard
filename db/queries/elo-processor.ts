import { db } from "@/db/db";
import { mapsTable, eloRatingsTable, eloRatingsCurrentTable, teamsTable, seasonsTable } from "@/db/schema";
import { eq, and, lt, desc, gte } from "drizzle-orm";
import { calculateHybridEloUpdate, DEFAULT_CONFIG } from "@/lib/elo/elo-calculator";

export async function getUnprocessedMaps() {
  return await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.processed, false))
    .orderBy(mapsTable.completedAt);
}

export async function getCurrentRatings(teamId: number, mapName: string, beforeDate: Date) {
  // Find the most recent season reset date before this match
  const seasonResetDate = new Date(beforeDate.getFullYear(), 0, 1); // January 1st of the match year
  
  const historicalElo = await db
    .select()
    .from(eloRatingsTable)
    .where(
      and(
        eq(eloRatingsTable.teamId, teamId),
        eq(eloRatingsTable.mapName, mapName),
        lt(eloRatingsTable.ratingDate, beforeDate),
        gte(eloRatingsTable.ratingDate, seasonResetDate)
      )
    )
    .orderBy(desc(eloRatingsTable.ratingDate))
    .limit(1);

  return historicalElo.length ? {
    globalRating: Number(historicalElo[0].globalRating),
    mapOffset: Number(historicalElo[0].mapOffset)
  } : {
    globalRating: DEFAULT_CONFIG.initialGlobal,
    mapOffset: DEFAULT_CONFIG.initialOffset
  };
}

export async function processEloUpdates() {
  const unprocessedMaps = await getUnprocessedMaps();

  for (const map of unprocessedMaps) {
    const winnerRatings = await getCurrentRatings(map.winner_team_id, map.mapName, map.completedAt);
    const loserRatings = await getCurrentRatings(map.loser_team_id, map.mapName, map.completedAt);

    const newRatings = calculateHybridEloUpdate(
      winnerRatings.globalRating,
      winnerRatings.mapOffset,
      loserRatings.globalRating,
      loserRatings.mapOffset,
      map.winner_rounds,
      map.loser_rounds,
      map.mapName
    );

    // Save historical ratings
    await db.insert(eloRatingsTable).values([
      {
        teamId: map.winner_team_id,
        mapName: map.mapName,
        seasonId: map.seasonId,
        rating: String(newRatings.winner.globalRating),
        globalRating: String(newRatings.winner.globalRating),
        mapOffset: String(newRatings.winner.mapOffset),
        effectiveRating: String(newRatings.winner.globalRating + newRatings.winner.mapOffset),
        ratingDate: map.completedAt,
        mapId: map.id,
        mapPlayedId: map.id,
      },
      {
        teamId: map.loser_team_id,
        mapName: map.mapName,
        seasonId: map.seasonId,
        rating: String(newRatings.loser.globalRating),
        globalRating: String(newRatings.loser.globalRating),
        mapOffset: String(newRatings.loser.mapOffset),
        effectiveRating: String(newRatings.loser.globalRating + newRatings.loser.mapOffset),
        ratingDate: map.completedAt,
        mapId: map.id,
        mapPlayedId: map.id,
      },
    ]);

    // Mark map as processed
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
    .where(eq(seasonsTable.isActive, true))
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
      WHERE rating_date >= '${currentSeason.startDate.toISOString()}'
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
      teamId: team.id,
      mapName,
      seasonId: resetDate.getFullYear(),
      rating: "1000",
      globalRating: "1000",
      mapOffset: "0",
      effectiveRating: "1000",
      ratingDate: resetDate,
      mapId: 0,
      mapPlayedId: 0
    }))
  );

  await db.insert(eloRatingsTable).values(resetRatings);
  console.log(`Inserted season reset ratings for ${teams.length} teams on ${maps.length} maps`);
}

async function getAllMapNames() {
  const maps = await db
    .select({ mapName: mapsTable.mapName })
    .from(mapsTable)
    .groupBy(mapsTable.mapName);
  
  return maps.map(m => m.mapName);
}

export async function createNewSeason(year: number) {
  // End current season if exists
  await db
    .update(seasonsTable)
    .set({ 
      isActive: false,
      endDate: new Date()
    })
    .where(eq(seasonsTable.isActive, true));

  // Create new season
  const [newSeason] = await db
    .insert(seasonsTable)
    .values({
      year,
      startDate: new Date(`${year}-01-01`),
      isActive: true
    })
    .returning();

  // Insert baseline ratings for all teams
  await insertSeasonResetRatings(newSeason.startDate);
  
  return newSeason;
}

export async function initializeSeasons() {
  const seasons = await db.select().from(seasonsTable);
  
  if (seasons.length === 0) {
    // Create past seasons
    await db.insert(seasonsTable).values([
      {
        year: 2023,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        isActive: false
      },
      {
        year: 2024,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: false
      }
    ]);

    // Create current season
    await createNewSeason(2025);
  }
} 