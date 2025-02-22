import { pgTable, varchar, decimal, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// Types
export type Season = {
  id: number;
  year: number;
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
};

export type NewMap = {
  mapName: string;
  completedAt: Date;
  winnerScore: number;
  loserScore: number;
  seasonId: number;
};

export type NewEloRating = {
  teamId: number;
  rating: number;
  ratingDate: Date;
  mapId: number;
  seasonId: number;
};

export type NewEloRatingCurrent = {
  teamId: number;
  mapName: string;
  rating: number;
  seasonId: number;
  updatedAt?: Date;
};

// Tables
export const seasonsTable = pgTable('seasons', {
  id: integer('id').primaryKey(),
  year: integer('year').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
});

export const teamsTable = pgTable('teams', {
  id: integer('id').primaryKey(),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull(),
  logoUrl: varchar('logo_url'),
});

export const mapsTable = pgTable('maps', {
  id: integer('id').primaryKey(),
  mapName: varchar('map_name').notNull(),
  completedAt: timestamp('completed_at').notNull(),
  winnerScore: integer('winner_score').notNull(),
  loserScore: integer('loser_score').notNull(),
  seasonId: integer('season_id').notNull(),
  winner_team_id: integer('winner_team_id').notNull(),
  loser_team_id: integer('loser_team_id').notNull(),
  winner_rounds: integer('winner_rounds').notNull(),
  loser_rounds: integer('loser_rounds').notNull(),
});

export const eloRatingsTable = pgTable('elo_ratings', {
  id: integer('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  rating: decimal('rating').notNull(),
  effectiveRating: decimal('effective_rating').notNull(),
  ratingDate: timestamp('rating_date').notNull(),
  mapId: integer('map_id').notNull(),
  mapPlayedId: integer('map_played_id').notNull(),
  mapName: varchar('map_name').notNull(),
  seasonId: integer('season_id').notNull(),
});

export const eloRatingsCurrentTable = pgTable('elo_ratings_current', {
  teamId: integer('team_id').notNull(),
  mapName: varchar('map_name').notNull(),
  rating: decimal('rating').notNull(),
  effectiveRating: decimal('effective_rating').notNull(),
  seasonId: integer('season_id').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}); 