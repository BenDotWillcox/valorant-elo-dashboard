import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export type EtlRunStatus = "running" | "success" | "failed";

export type EtlRunStep = {
  name: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  finishedAt: string;
  exitCode?: number | null;
  error?: string;
};

export const etlRunsTable = pgTable(
  "etl_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    status: varchar("status", { length: 16 }).$type<EtlRunStatus>().notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    failed_step: varchar("failed_step", { length: 128 }),
    error: text("error"),
    steps: jsonb("steps").$type<EtlRunStep[]>().notNull().default([]),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusStartedAtIdx: index("etl_runs_status_started_at_idx").on(
      table.status,
      table.started_at
    ),
  })
);

export type EtlRun = typeof etlRunsTable.$inferSelect;
export type NewEtlRun = typeof etlRunsTable.$inferInsert;
