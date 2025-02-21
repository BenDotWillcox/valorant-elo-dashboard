import { pgTable, bigserial, varchar, timestamp } from "drizzle-orm/pg-core";

export const teamsTable = pgTable("teams", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: varchar("slug").notNull().unique(),
  vlr_slug: varchar("vlr_slug"),
  name: varchar("name").notNull(),
  region: varchar("region"),
  logoUrl: varchar("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Team = typeof teamsTable.$inferSelect;
export type NewTeam = typeof teamsTable.$inferInsert; 