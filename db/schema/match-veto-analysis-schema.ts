import { pgTable, bigserial, integer, real, text, jsonb } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches-schema";
import { teamsTable } from "./teams-schema";

export const matchVetoAnalysisTable = pgTable("match_veto_analysis", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id),
  teamId: integer("team_id").notNull().references(() => teamsTable.id),
  
  vetoOrder: integer("veto_order").notNull(),
  action: text("action", { enum: ["pick", "ban"] }).notNull(),
  mapName: text("map_name").notNull(),

  eloLost: real("elo_lost").notNull().default(0),
  cumulativeEloLost: real("cumulative_elo_lost").notNull().default(0),
  
  optimalChoice: text("optimal_choice"),
  availableMaps: jsonb("available_maps").$type<string[]>(),
});

export type MatchVetoAnalysis = typeof matchVetoAnalysisTable.$inferSelect;
export type NewMatchVetoAnalysis = typeof matchVetoAnalysisTable.$inferInsert;
