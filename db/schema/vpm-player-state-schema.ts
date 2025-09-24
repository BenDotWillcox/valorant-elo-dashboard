import {
  pgTable,
  bigint,
  date,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players-schema";

export const vpmPlayerStateTable = pgTable("vpm_player_state", {
  player_id: bigint("player_id", { mode: "number" })
    .primaryKey()
    .references(() => playersTable.id),
  last_date: date("last_date"),
  s_kpr: doublePrecision("s_kpr"),
  w_kpr: doublePrecision("w_kpr"),
  s_dpr: doublePrecision("s_dpr"),
  w_dpr: doublePrecision("w_dpr"),
  s_apr: doublePrecision("s_apr"),
  w_apr: doublePrecision("w_apr"),
  s_fk_att_rate: doublePrecision("s_fk_att_rate"),
  w_fk_att_rate: doublePrecision("w_fk_att_rate"),
  s_fk_win_rate: doublePrecision("s_fk_win_rate"),
  w_fk_win_rate: doublePrecision("w_fk_win_rate"),
  s_adr_pr: doublePrecision("s_adr_pr"),
  w_adr_pr: doublePrecision("w_adr_pr"),
  s_kast01: doublePrecision("s_kast01"),
  w_kast01: doublePrecision("w_kast01"),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type VpmPlayerState = typeof vpmPlayerStateTable.$inferSelect;
export type NewVpmPlayerState = typeof vpmPlayerStateTable.$inferInsert;
