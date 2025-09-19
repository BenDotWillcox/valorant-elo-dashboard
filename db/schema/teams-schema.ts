import { pgTable, bigserial, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: varchar("slug").notNull().unique(),
  vlr_slug: varchar("vlr_slug"),
  name: varchar("name").notNull(),
  region: varchar("region"),
  logo_url: varchar("logo_url"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type Team = typeof teamsTable.$inferSelect;
export type NewTeam = typeof teamsTable.$inferInsert; 