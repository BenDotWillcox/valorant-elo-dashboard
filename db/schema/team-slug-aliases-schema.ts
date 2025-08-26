import { pgTable, bigserial, varchar, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const teamSlugAliasesTable = pgTable("team_slug_aliases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  team_id: bigserial("team_id", { mode: "number" })
    .notNull()
    .references(() => teamsTable.id),
  slug: varchar("slug").notNull(),
});

export type TeamSlugAlias = typeof teamSlugAliasesTable.$inferSelect;
export type NewTeamSlugAlias = typeof teamSlugAliasesTable.$inferInsert;