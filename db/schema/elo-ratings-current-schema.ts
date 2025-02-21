import { pgTable, bigserial, varchar, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const eloRatingsCurrentTable = pgTable("elo_ratings_current", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  mapName: varchar("map_name").notNull(),
  rating: numeric("rating").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  teamMapUnique: uniqueIndex("team_map_unique_idx").on(table.teamId, table.mapName),
}));

export type EloRatingCurrent = typeof eloRatingsCurrentTable.$inferSelect;
export type NewEloRatingCurrent = typeof eloRatingsCurrentTable.$inferInsert; 