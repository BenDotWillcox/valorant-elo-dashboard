import { pgTable, bigserial, varchar, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const eloRatingsCurrentTable = pgTable("elo_ratings_current", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  map_name: varchar("map_name").notNull(),
  rating: numeric("rating").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  team_map_unique: uniqueIndex("team_map_unique_idx").on(table.team_id, table.map_name),
}));

export type EloRatingCurrent = typeof eloRatingsCurrentTable.$inferSelect;
export type NewEloRatingCurrent = typeof eloRatingsCurrentTable.$inferInsert; 