import { pgTable, bigserial, varchar, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const seasonsTable = pgTable("seasons", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    year: integer("year").notNull().unique(),
    start_date: timestamp("start_date").notNull(),
    end_date: timestamp("end_date"),
    is_active: boolean("is_active").notNull().default(false),
  });

export type Season = typeof seasonsTable.$inferSelect;
export type NewSeason = typeof seasonsTable.$inferInsert; 