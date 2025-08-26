import { pgTable, bigserial, varchar, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { mapsTable } from "./maps-schema";

// Historical ratings per-map
export const eloRatingsTable = pgTable("elo_ratings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  map_name: varchar("map_name").notNull(),
  rating: numeric("rating").notNull(),
  rating_date: timestamp("rating_date").notNull(),
  map_played_id: bigserial("map_played_id", { mode: "number" })
    .references(() => mapsTable.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
});


export type EloRating = typeof eloRatingsTable.$inferSelect;
export type NewEloRating = typeof eloRatingsTable.$inferInsert;

