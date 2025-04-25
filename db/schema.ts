import { pgTable, varchar, decimal, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Types
export type Season = {
  id: number;
  year: number;
  is_active: boolean;
  start_date: Date;
  end_date?: Date;
};

export type NewMap = {
  map_name: string;
  completed_at: Date;
  winner_score: number;
  loser_score: number;
  season_id: number;
  winner_team_id: number;
  loser_team_id: number;
  winner_rounds: number;
  loser_rounds: number;
  processed?: boolean;
};

export type NewEloRating = {
  team_id: number;
  map_name: string;
  global_rating: string;
  map_offset: string;
  effective_rating: string;
  rating_date: Date;
  map_id: number;
  map_played_id: number;
  season_id: number;
};

export type NewEloRatingCurrent = {
  team_id: number;
  map_name: string;
  effective_rating: string;
  season_id: number;
  updated_at?: Date;
};

export type NewTeam = {
  name: string;
  slug: string;
  logo_url?: string;
};

// Tables
export const seasonsTable = pgTable('seasons', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('seasons_id_seq')`),
  year: integer('year').notNull(),
  is_active: boolean('is_active').notNull().default(false),
  start_date: timestamp('start_date').notNull(),
  end_date: timestamp('end_date'),
});

export const teamsTable = pgTable('teams', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('teams_id_seq')`),
  name: varchar('name').notNull(),
  slug: varchar('slug').notNull(),
  logo_url: varchar('logo_url'),
});

export const mapsTable = pgTable('maps', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('maps_id_seq')`),
  map_name: varchar('map_name').notNull(),
  completed_at: timestamp('completed_at').notNull(),
  winner_score: integer('winner_score').notNull(),
  loser_score: integer('loser_score').notNull(),
  season_id: integer('season_id').notNull(),
  winner_team_id: integer('winner_team_id').notNull(),
  loser_team_id: integer('loser_team_id').notNull(),
  winner_rounds: integer('winner_rounds').notNull(),
  loser_rounds: integer('loser_rounds').notNull(),
  processed: boolean('processed').notNull().default(false),
});

export const eloRatingsTable = pgTable('elo_ratings', {
  id: integer('id').primaryKey().notNull().default(sql`nextval('elo_ratings_id_seq')`),
  team_id: integer('team_id').notNull(),
  global_rating: decimal('global_rating').notNull(),
  map_offset: decimal('map_offset').notNull(),
  effective_rating: decimal('effective_rating').notNull(),
  rating_date: timestamp('rating_date').notNull(),
  map_played_id: integer('map_played_id').notNull(),
  map_name: varchar('map_name').notNull(),
});

export const eloRatingsCurrentTable = pgTable('elo_ratings_current', {
  team_id: integer('team_id').notNull(),
  map_name: varchar('map_name').notNull(),
  effective_rating: decimal('effective_rating').notNull(),
  season_id: integer('season_id').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
}); 