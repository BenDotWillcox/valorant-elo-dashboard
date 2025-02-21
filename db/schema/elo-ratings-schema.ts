import { pgTable, bigserial, varchar, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { mapsTable } from "./maps-schema";

// For historical ratings (both global and map-specific)
export const eloRatingsTable = pgTable("elo_ratings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  globalRating: numeric("global_rating").notNull(),
  mapName: varchar("map_name").notNull(),
  mapOffset: numeric("map_offset").notNull(),
  effectiveRating: numeric("effective_rating").notNull(),
  ratingDate: timestamp("rating_date").notNull(),
  mapPlayedId: bigserial("map_played_id", { mode: "number" })
    .references(() => mapsTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Add a new table for season info
export const seasonsTable = pgTable("seasons", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  year: integer("year").notNull().unique(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(false),
});

// Update current ratings table to include season
export const eloRatingsCurrentTable = pgTable("elo_ratings_current", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  seasonId: bigserial("season_id", { mode: "number" })
    .notNull()
    .references(() => seasonsTable.id),
  globalRating: numeric("global_rating").notNull(),
  mapName: varchar("map_name").notNull(),
  mapOffset: numeric("map_offset").notNull(),
  effectiveRating: numeric("effective_rating").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type EloRating = typeof eloRatingsTable.$inferSelect;
export type NewEloRating = typeof eloRatingsTable.$inferInsert;

// Add type exports
export type Season = typeof seasonsTable.$inferSelect;
export type NewSeason = typeof seasonsTable.$inferInsert; 