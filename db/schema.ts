import { pgTable, varchar, decimal, timestamp, integer } from "drizzle-orm/pg-core";

// Types
export type NewEloRatingCurrent = {
  teamId: number;
  mapName: string;
  rating: number;
  seasonId: number;
  updatedAt?: Date;
};

// Tables
export const elo_ratings_current = pgTable('elo_ratings_current', {
  teamId: integer('team_id').notNull(),
  mapName: varchar('map_name').notNull(),
  rating: decimal('rating').notNull(),
  seasonId: integer('season_id').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // ... any other fields
}); 