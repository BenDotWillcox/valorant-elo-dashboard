// db/schema/players-schema.ts
import { pgTable, bigserial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams-schema";

export const playersTable = pgTable("players", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  vlr_player_id: integer("vlr_player_id"),
  slug: varchar("slug").unique().notNull(),   // from /player/<id>/<slug>
  ign: varchar("ign").notNull(),
  name: varchar("name"),
  team_id: bigserial("team_id", { mode: "number" }).references(() => teamsTable.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type Player = typeof playersTable.$inferSelect;
export type NewPlayer = typeof playersTable.$inferInsert;