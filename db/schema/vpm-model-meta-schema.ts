import {
  pgTable,
  varchar,
  timestamp,
  doublePrecision,
  jsonb,
  text,
} from "drizzle-orm/pg-core";

export const vpmModelMetaTable = pgTable("vpm_model_meta", {
  model_version: varchar("model_version", { length: 64 }).primaryKey(),
  trained_at: timestamp("trained_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ridge_alpha: doublePrecision("ridge_alpha"),
  components: jsonb("components").notNull(),
  weights_per24: jsonb("weights_per24").notNull(),
  kf_params_default: jsonb("kf_params_default").notNull(),
  data_hash: varchar("data_hash", { length: 128 }),
  source_git_ref: varchar("source_git_ref", { length: 128 }),
  created_by: varchar("created_by", { length: 128 }),
  notes: text("notes"),
});

export type VpmModelMeta = typeof vpmModelMetaTable.$inferSelect;
export type NewVpmModelMeta = typeof vpmModelMetaTable.$inferInsert;

