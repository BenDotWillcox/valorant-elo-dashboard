import {
  pgTable,
  bigint,
  doublePrecision,
  integer,
  date,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players-schema";

export const vpmPlayerLatestTable = pgTable("vpm_player_latest", {
  player_id: bigint("player_id", { mode: "number" })
    .primaryKey()
    .references(() => playersTable.id),
  current_vpm_per24: doublePrecision("current_vpm_per24"),
  current_std: doublePrecision("current_std"),
  last_game_num: integer("last_game_num"),
  last_game_date: date("last_game_date"),
  model_version: varchar("model_version", { length: 64 }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export type VpmPlayerLatest = typeof vpmPlayerLatestTable.$inferSelect;
export type NewVpmPlayerLatest = typeof vpmPlayerLatestTable.$inferInsert;
