import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/db";
import { etlRunsTable, mapsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

const iso = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function GET() {
  try {
    const [coverage] = await db
      .select({
        firstMapAt: sql<string | null>`case
          when min(${mapsTable.completed_at}) is null then null
          else to_char(min(${mapsTable.completed_at}), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end`,
        latestMapAt: sql<string | null>`case
          when max(${mapsTable.completed_at}) is null then null
          else to_char(max(${mapsTable.completed_at}), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end`,
        mapCount: sql<number>`count(*)`,
        processedMapCount: sql<number>`count(*) filter (where ${mapsTable.processed} = true)`,
      })
      .from(mapsTable)
      .where(isNotNull(mapsTable.completed_at));

    let runHistoryAvailable = true;
    let historyUnavailableReason: "migration-required" | "query-error" | null = null;
    let latestRun: typeof etlRunsTable.$inferSelect | undefined;
    let latestSuccessfulPipeline: typeof etlRunsTable.$inferSelect | undefined;
    let latestSuccessfulIngest: typeof etlRunsTable.$inferSelect | undefined;

    try {
      const [latestRuns, successfulPipelines, successfulIngests] = await Promise.all([
        db.select().from(etlRunsTable).orderBy(desc(etlRunsTable.started_at)).limit(1),
        db
          .select()
          .from(etlRunsTable)
          .where(eq(etlRunsTable.status, "success"))
          .orderBy(desc(etlRunsTable.started_at))
          .limit(1),
        db
          .select()
          .from(etlRunsTable)
          .where(sql`exists (
            select 1
            from jsonb_array_elements(${etlRunsTable.steps}) as run_step
            where run_step ->> 'name' = 'scrape-new-maps'
              and run_step ->> 'status' = 'success'
          )`)
          .orderBy(desc(etlRunsTable.started_at))
          .limit(1),
      ]);
      latestRun = latestRuns[0];
      latestSuccessfulPipeline = successfulPipelines[0];
      latestSuccessfulIngest = successfulIngests[0];
    } catch (error) {
      runHistoryAvailable = false;
      const postgresCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : null;
      historyUnavailableReason =
        postgresCode === "42P01" ? "migration-required" : "query-error";
      console.error("ETL run history is unavailable.", error);
    }

    const successfulIngestStep = latestSuccessfulIngest?.steps.find(
      (step) => step.name === "scrape-new-maps" && step.status === "success"
    );

    return NextResponse.json(
      {
        source: "VLR.gg",
        cadence: "Daily at approximately 8:00 AM America/Chicago",
        coverage: {
          firstMapAt: iso(coverage?.firstMapAt),
          latestMapAt: iso(coverage?.latestMapAt),
          mapCount: Number(coverage?.mapCount ?? 0),
          processedMapCount: Number(coverage?.processedMapCount ?? 0),
        },
        ingest: {
          historyAvailable: runHistoryAvailable,
          historyUnavailableReason,
          lastSuccessfulIngestAt: iso(
            successfulIngestStep?.finishedAt ??
              latestSuccessfulIngest?.finished_at ??
              latestSuccessfulIngest?.started_at
          ),
          lastSuccessfulPipelineAt: iso(
            latestSuccessfulPipeline?.finished_at ?? latestSuccessfulPipeline?.started_at
          ),
          latestRun: latestRun
            ? {
                status: latestRun.status,
                startedAt: iso(latestRun.started_at),
                finishedAt: iso(latestRun.finished_at),
                failedStep: latestRun.failed_step,
              }
            : null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to load public data-methodology status.", error);
    return NextResponse.json(
      {
        source: "VLR.gg",
        cadence: "Daily at approximately 8:00 AM America/Chicago",
        coverage: null,
        ingest: {
          historyAvailable: false,
          historyUnavailableReason: "status-unavailable",
          lastSuccessfulIngestAt: null,
          lastSuccessfulPipelineAt: null,
          latestRun: null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
