import { pgTable, varchar, decimal, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  winner_team_id: number;
  loser_team_id: number;
  winner_rounds: number;
  loser_rounds: number;
  processed?: boolean;
};

export type NewEloRating = {
  teamId: number;
  mapName: string;
  rating: string;
  globalRating: string;
  mapOffset: string;
  effectiveRating: string;
  ratingDate: Date;
  mapId: number;
  mapPlayedId: number;
  seasonId: number;
};

export type NewEloRatingCurrent = {
  teamId: number;
  mapName: string;
  rating: string;
  effectiveRating: string;
  seasonId: number;
  updatedAt?: Date;
};

// Tables
export const seasonsTable = pgTable('seasons', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('seasons_id_seq')`),
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
  processed: boolean('processed').notNull().default(false),
});

export const eloRatingsTable = pgTable('elo_ratings', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('elo_ratings_id_seq')`),
  teamId: integer('team_id').notNull(),
  rating: decimal('rating').notNull(),
  globalRating: decimal('global_rating').notNull(),
  mapOffset: decimal('map_offset').notNull(),
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