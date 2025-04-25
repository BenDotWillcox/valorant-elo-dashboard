import { pgTable, bigserial, varchar, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { mapsTable } from "./maps-schema";

// For historical ratings (both global and map-specific)
export const eloRatingsTable = pgTable("elo_ratings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  global_rating: numeric("global_rating").notNull(),
  map_name: varchar("map_name").notNull(),
  map_offset: numeric("map_offset").notNull(),
  effective_rating: numeric("effective_rating").notNull(),
  rating_date: timestamp("rating_date").notNull(),
  map_played_id: bigserial("map_played_id", { mode: "number" })
    .references(() => mapsTable.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Add a new table for season info
export const seasonsTable = pgTable("seasons", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  year: integer("year").notNull().unique(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date"),
  is_active: boolean("is_active").notNull().default(false),
});

// Update current ratings table to include season
export const eloRatingsCurrentTable = pgTable("elo_ratings_current", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  season_id: bigserial("season_id", { mode: "number" })
    .notNull()
    .references(() => seasonsTable.id),
  global_rating: numeric("global_rating").notNull(),
  map_name: varchar("map_name").notNull(),
  map_offset: numeric("map_offset").notNull(),
  effective_rating: numeric("effective_rating").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type EloRating = typeof eloRatingsTable.$inferSelect;
export type NewEloRating = typeof eloRatingsTable.$inferInsert;

// Add type exports
export type Season = typeof seasonsTable.$inferSelect;
export type NewSeason = typeof seasonsTable.$inferInsert; 