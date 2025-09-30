// db/schema/match-pick-ban-analysis-schema.ts
import { pgTable, bigserial, doublePrecision, primaryKey } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";
import { matchesTable } from "./matches-schema";

export const matchPickBanAnalysisTable = pgTable("match_pick_ban_analysis", {
  match_id: bigserial("match_id", { mode: "number" })
    .references(() => matchesTable.id)
    .notNull(),
  team_id: bigserial("team_id", { mode: "number" })
    .references(() => teamsTable.id)
    .notNull(),
  elo_lost: doublePrecision("elo_lost").notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.match_id, table.team_id] }),
    }
});

export type MatchPickBanAnalysis = typeof matchPickBanAnalysisTable.$inferSelect;
export type NewMatchPickBanAnalysis = typeof matchPickBanAnalysisTable.$inferInsert;

