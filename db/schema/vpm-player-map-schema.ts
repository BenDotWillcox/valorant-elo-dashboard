import {
  pgTable,
  bigint,
  date,
  integer,
  doublePrecision,
  varchar,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players-schema";
import { teamsTable } from "./teams-schema";
import { matchesTable } from "./matches-schema";
import { mapsTable } from "./maps-schema";

export const vpmPlayerMapTable = pgTable(
  "vpm_player_map",
  {
    player_id: bigint("player_id", { mode: "number" })
      .notNull()
      .references(() => playersTable.id),
    team_id: bigint("team_id", { mode: "number" }).references(
      () => teamsTable.id
    ),
    match_id: bigint("match_id", { mode: "number" })
      .notNull()
      .references(() => matchesTable.id),
    map_id: bigint("map_id", { mode: "number" })
      .notNull()
      .references(() => mapsTable.id),
    game_date: date("game_date"),
    total_rounds: integer("total_rounds"),
    vpm_per24_raw: doublePrecision("vpm_per24_raw"),
    vpm_per24_centered: doublePrecision("vpm_per24_centered"),
    model_version: varchar("model_version", { length: 64 }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.player_id, table.map_id, table.model_version],
      }),
    };
  }
);

export type VpmPlayerMap = typeof vpmPlayerMapTable.$inferSelect;
export type NewVpmPlayerMap = typeof vpmPlayerMapTable.$inferInsert;
