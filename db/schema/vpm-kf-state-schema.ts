import {
  pgTable,
  bigint,
  date,
  integer,
  doublePrecision,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players-schema";

export const vpmKfStateTable = pgTable("vpm_kf_state", {
  player_id: bigint("player_id", { mode: "number" })
    .primaryKey()
    .references(() => playersTable.id),
  last_date: date("last_date"),
  game_num: integer("game_num").default(0),
  x_mean: doublePrecision("x_mean"),
  x_var: doublePrecision("x_var"),
  a: doublePrecision("a").notNull(),
  q: doublePrecision("q").notNull(),
  r0: doublePrecision("r0").notNull(),
  use_days: boolean("use_days").notNull().default(true),
  model_version: varchar("model_version", { length: 64 }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type VpmKfState = typeof vpmKfStateTable.$inferSelect;
export type NewVpmKfState = typeof vpmKfStateTable.$inferInsert;
