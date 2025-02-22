import { pgTable, varchar, decimal, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// Types
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
});

export const mapsTable = pgTable('maps', {
  id: integer('id').primaryKey(),
  mapName: varchar('map_name').notNull(),
  completedAt: timestamp('completed_at').notNull(),
  winnerScore: integer('winner_score').notNull(),
  loserScore: integer('loser_score').notNull(),
  seasonId: integer('season_id').notNull(),
});

export const elo_ratings_current = pgTable('elo_ratings_current', {
  teamId: integer('team_id').notNull(),
  mapName: varchar('map_name').notNull(),
  rating: decimal('rating').notNull(),
  seasonId: integer('season_id').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // ... any other fields
}); 