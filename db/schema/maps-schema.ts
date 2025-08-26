import { pgTable, bigserial, varchar, timestamp, integer, boolean, type AnyPgColumn } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { matchesTable } from "./matches-schema";

export const mapsTable = pgTable("maps", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  map_name: varchar("map_name").notNull(),
  winner_team_id: bigserial("winner_team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  loser_team_id: bigserial("loser_team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  winner_rounds: integer("winner_rounds").notNull(),
  loser_rounds: integer("loser_rounds").notNull(),
  event_name: varchar("event_name"),
  region: varchar("region"),
  completed_at: timestamp("completed_at"),
  processed: boolean("processed").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  match_id: bigserial("match_id", { mode: "number" }).references(() => matchesTable.id),
  game_number: integer("game_number").notNull(),
});

export type Map = typeof mapsTable.$inferSelect;
export type NewMap = typeof mapsTable.$inferInsert; 