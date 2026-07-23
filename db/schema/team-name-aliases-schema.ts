import { pgTable, bigserial, varchar, integer } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const teamNameAliasesTable = pgTable("team_name_aliases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: integer("team_id").notNull().references(() => teamsTable.id),
  alias: varchar("alias").notNull().unique(),
});

export type TeamNameAlias = typeof teamNameAliasesTable.$inferSelect;
export type NewTeamNameAlias = typeof teamNameAliasesTable.$inferInsert;
