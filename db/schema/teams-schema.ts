import { pgTable, bigserial, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  vlr_id: bigserial("vlr_id", { mode: "number" }),
  name: varchar("name").notNull(),
  slug: varchar("slug"),
  logo_url: varchar("logo_url"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type Team = typeof teamsTable.$inferSelect;
export type NewTeam = typeof teamsTable.$inferInsert; 