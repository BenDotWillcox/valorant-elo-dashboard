import { pgTable, bigserial, varchar, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { seasonsTable } from "./seasons-schema";

export const eloRatingsCurrentTable = pgTable("elo_ratings_current", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  season_id: bigserial("season_id", { mode: "number" })
    .notNull()
    .references(() => seasonsTable.id),
  map_name: varchar("map_name").notNull(),
  rating: numeric("rating").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  team_map_season_unique: uniqueIndex("team_map_season_unique_idx").on(table.team_id, table.map_name, table.season_id),
}));

export type EloRatingCurrent = typeof eloRatingsCurrentTable.$inferSelect;
export type NewEloRatingCurrent = typeof eloRatingsCurrentTable.$inferInsert; 