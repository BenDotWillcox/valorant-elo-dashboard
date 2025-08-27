// db/schema/pick-ban-analysis-schema.ts
import { pgTable, bigserial, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const pickBanAnalysisTable = pgTable("pick_ban_analysis", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .references(() => teamsTable.id)
    .notNull()
    .unique(),
  average_elo_lost: doublePrecision("average_elo_lost").notNull(),
  matches_analyzed: integer("matches_analyzed").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type PickBanAnalysis = typeof pickBanAnalysisTable.$inferSelect;
export type NewPickBanAnalysis = typeof pickBanAnalysisTable.$inferInsert;
