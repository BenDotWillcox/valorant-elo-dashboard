// db/schema/match-vetoes-schema.ts
import { pgTable, bigserial, integer, varchar } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches-schema";
import { teamsTable } from "./teams-schema";

export const matchVetoesTable = pgTable("match_vetoes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  match_id: bigserial("match_id", { mode: "number" }).references(() => matchesTable.id).notNull(),
  order_index: integer("order_index").notNull(), // 1..N
  action: varchar("action").notNull(), // 'ban' | 'pick' | 'decider'
  map_name: varchar("map_name").notNull(),
  team_id: bigserial("team_id", { mode: "number" }).references(() => teamsTable.id), // null for decider
  resulted_game_number: integer("resulted_game_number"), // link to game_index if pick/decider led to a played map
});

export type MatchVeto = typeof matchVetoesTable.$inferSelect;
export type NewMatchVeto = typeof matchVetoesTable.$inferInsert;