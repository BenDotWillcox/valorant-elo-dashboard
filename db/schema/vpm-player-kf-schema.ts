import {
  pgTable,
  bigint,
  integer,
  date,
  doublePrecision,
  boolean,
  varchar,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players-schema";
import { matchesTable } from "./matches-schema";
import { mapsTable } from "./maps-schema";

export const vpmPlayerKfTable = pgTable(
  "vpm_player_kf",
  {
    player_id: bigint("player_id", { mode: "number" })
      .notNull()
      .references(() => playersTable.id),
    game_num: integer("game_num").notNull(),
    game_date: date("game_date"),
    y: doublePrecision("y"),
    kf_mean: doublePrecision("kf_mean"),
    kf_std: doublePrecision("kf_std"),
    smooth_mean: doublePrecision("smooth_mean"),
    smooth_std: doublePrecision("smooth_std"),
    match_id: bigint("match_id", { mode: "number" }).references(
      () => matchesTable.id
    ),
    map_id: bigint("map_id", { mode: "number" }).references(
      () => mapsTable.id
    ),
    a: doublePrecision("a"),
    q: doublePrecision("q"),
    r0: doublePrecision("r0"),
    use_days: boolean("use_days"),
    model_version: varchar("model_version", { length: 64 }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.player_id, table.game_num, table.model_version],
      }),
    };
  }
);

export type VpmPlayerKf = typeof vpmPlayerKfTable.$inferSelect;
export type NewVpmPlayerKf = typeof vpmPlayerKfTable.$inferInsert;
