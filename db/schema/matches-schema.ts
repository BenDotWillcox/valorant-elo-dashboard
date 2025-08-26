// db/schema/matches-schema.ts
import { pgTable, bigserial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const matchesTable = pgTable("matches", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  vlr_match_id: integer("vlr_match_id").notNull().unique(),
  event_name: varchar("event_name").notNull(),
  region: varchar("region"),
  stage: varchar("stage"),
  best_of: integer("best_of"),
  completed_at: timestamp("completed_at"),

  team1_id: bigserial("team1_id", { mode: "number" }).references(() => teamsTable.id),
  team2_id: bigserial("team2_id", { mode: "number" }).references(() => teamsTable.id),
  team1_score: integer("team1_score"),
  team2_score: integer("team2_score"),

  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type Match = typeof matchesTable.$inferSelect;
export type NewMatch = typeof matchesTable.$inferInsert;