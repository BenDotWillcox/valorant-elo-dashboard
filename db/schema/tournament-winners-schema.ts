import { pgTable, bigserial, varchar, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const tournamentWinnersTable = pgTable("tournament_winners", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tournament_name: varchar("tournament_name").notNull(),
  tournament_id: integer("tournament_id").notNull(),
  winner_team_id: bigint("winner_team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  region: varchar("region").notNull(), // International, Americas, EMEA, Pacific, China
  tournament_type: varchar("tournament_type").notNull(), // Champions, Masters, Domestic
  completed_at: timestamp("completed_at").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type TournamentWinner = typeof tournamentWinnersTable.$inferSelect;
export type NewTournamentWinner = typeof tournamentWinnersTable.$inferInsert;
