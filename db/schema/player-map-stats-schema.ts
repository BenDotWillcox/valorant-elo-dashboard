// db/schema/player-map-stats-schema.ts
import { pgTable, bigserial, integer, varchar, numeric } from "drizzle-orm/pg-core";
import { mapsTable } from "./maps-schema";
import { matchesTable } from "./matches-schema";
import { teamsTable } from "./teams-schema";
import { playersTable } from "./players-schema";

export const playerMapStatsTable = pgTable("player_map_stats", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  match_id: bigserial("match_id", { mode: "number" }).references(() => matchesTable.id).notNull(),
  map_id: bigserial("map_id", { mode: "number" }).references(() => mapsTable.id).notNull(),
  game_number: integer("game_number").notNull(), // 1..N
  team_id: bigserial("team_id", { mode: "number" }).references(() => teamsTable.id).notNull(),
  player_id: bigserial("player_id", { mode: "number" }).references(() => playersTable.id).notNull(),
  agent: varchar("agent").notNull(),
  kills: integer("kills").notNull(),
  deaths: integer("deaths").notNull(),
  assists: integer("assists").notNull(),
  fk: integer("first_kills").notNull(),
  fd: integer("first_deaths").notNull(),
  acs: integer("acs"),
  adr: integer("adr"),
  kast: numeric("kast", { precision: 5, scale: 2 }), // store 0-100
  rounds_played: integer("rounds_played"),
});

export type PlayerMapStat = typeof playerMapStatsTable.$inferSelect;
export type NewPlayerMapStat = typeof playerMapStatsTable.$inferInsert;