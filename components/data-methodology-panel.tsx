"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MAP_ELO_MODEL_VERSION } from "@/lib/elo/elo-calculator";

type MethodologyStatus = {
  source: string;
  cadence: string;
  coverage: {
    firstMapAt: string | null;
    latestMapAt: string | null;
    mapCount: number;
    processedMapCount: number;
  } | null;
  ingest: {
    historyAvailable: boolean;
    historyUnavailableReason:
      | "migration-required"
      | "query-error"
      | "status-unavailable"
      | null;
    lastSuccessfulIngestAt: string | null;
    lastSuccessfulPipelineAt: string | null;
    latestRun: {
      status: "running" | "success" | "failed";
      startedAt: string | null;
      finishedAt: string | null;
      failedStep: string | null;
    } | null;
  };
};

type DataMethodologyPanelProps = {
  backtestGeneratedAt?: string | null;
  evaluatedModelVersion?: string | null;
  evaluationCoverage?: { start: string; end: string } | null;
};

const formatDate = (value: string | null | undefined, includeTime = false) => {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
      : {}),
  }).format(date);
};

const DateValue = ({
  value,
  includeTime = false,
  fallback = "Not yet recorded",
}: {
  value?: string | null;
  includeTime?: boolean;
  fallback?: string;
}) => (value ? <time dateTime={value}>{formatDate(value, includeTime)}</time> : <>{fallback}</>);

export function DataMethodologyPanel({
  backtestGeneratedAt = null,
  evaluatedModelVersion = null,
  evaluationCoverage = null,
}: DataMethodologyPanelProps) {
  const [status, setStatus] = useState<MethodologyStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/data-methodology", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
        return response.json() as Promise<MethodologyStatus>;
      })
      .then((nextStatus) => {
        setStatus(nextStatus);
        setStatusUnavailable(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatusUnavailable(true);
      });

    return () => controller.abort();
  }, []);

  const coverage = status?.coverage;
  const coverageIsLoading = status === null && !statusUnavailable;
  const coverageIsUnavailable = statusUnavailable || (status !== null && coverage === null);
  const coverageLabel = coverage
    ? `${formatDate(coverage.firstMapAt)} – ${formatDate(coverage.latestMapAt)}`
    : coverageIsUnavailable
      ? "Temporarily unavailable"
      : coverageIsLoading
        ? "Loading current coverage…"
        : "No maps recorded";
  const ingestHistoryUnavailable =
    statusUnavailable || status?.ingest.historyAvailable === false;
  const ingestFallback = statusUnavailable
    ? "Temporarily unavailable"
    : status === null
      ? "Loading…"
      : ingestHistoryUnavailable
        ? "Telemetry unavailable"
        : "No successful run recorded";
  const latestRun = status?.ingest.latestRun;
  const latestRunNote =
    latestRun?.status === "failed"
      ? `Latest run failed${latestRun.failedStep ? ` at ${latestRun.failedStep}` : ""}.`
        : latestRun?.status === "running"
        ? "A pipeline run is currently in progress."
        : status?.ingest.historyUnavailableReason === "migration-required"
          ? "The ETL-run migration is required to publish run history."
          : ingestHistoryUnavailable
            ? "Run history is temporarily unavailable; coverage may still be current."
          : null;
  const versionsMatch = evaluatedModelVersion
    ? evaluatedModelVersion === MAP_ELO_MODEL_VERSION
    : null;

  return (
    <section
      aria-labelledby="data-methodology-title"
      className="border-y border-slate-200 bg-white/70 px-6 py-16 dark:border-slate-800 dark:bg-slate-950/70 sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-green-600 dark:text-green-400">
            Evidence &amp; freshness
          </p>
          <h2 id="data-methodology-title" className="text-3xl font-bold text-slate-950 dark:text-white sm:text-4xl">
            What the model knows—and what it does not
          </h2>
          <p className="mt-4 text-slate-600 dark:text-slate-300">
            Results are estimates from a daily VLR.gg ingestion pipeline and a map-specific Elo model. Data freshness, model evaluation, and limitations are disclosed separately below.
          </p>
        </div>

        <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Source &amp; cadence</dt>
            <dd className="mt-2 font-semibold text-slate-950 dark:text-white">
              {status?.source ?? "VLR.gg"}
            </dd>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {status?.cadence ?? "Daily at approximately 8:00 AM America/Chicago"}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Map coverage</dt>
            <dd className="mt-2 font-semibold text-slate-950 dark:text-white">{coverageLabel}</dd>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {coverage
                ? `${coverage.mapCount.toLocaleString()} scraped maps; ${coverage.processedMapCount.toLocaleString()} Elo-processed`
                : coverageIsLoading
                  ? "Loading live database status"
                  : "Live database status unavailable"}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Last successful ingest</dt>
            <dd className="mt-2 font-semibold text-slate-950 dark:text-white">
              <DateValue
                value={status?.ingest.lastSuccessfulIngestAt}
                includeTime
                fallback={ingestFallback}
              />
            </dd>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Full pipeline: {""}
              <DateValue
                value={status?.ingest.lastSuccessfulPipelineAt}
                includeTime
                fallback={ingestFallback}
              />
            </dd>
            {latestRunNote ? (
              <dd className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                {latestRunNote}
              </dd>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-sm text-slate-500 dark:text-slate-400">Model &amp; evaluation</dt>
            <dd className="mt-2 text-sm text-slate-950 dark:text-white">
              Deployed: <span className="font-mono font-semibold">{MAP_ELO_MODEL_VERSION}</span>
            </dd>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Evaluated: <span className="font-mono">{evaluatedModelVersion ?? "Not published"}</span>
            </dd>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Backtest generated: <DateValue value={backtestGeneratedAt} fallback="Not published" />
              {evaluationCoverage
                ? ` · holdout ${formatDate(evaluationCoverage.start)} – ${formatDate(evaluationCoverage.end)}`
                : " · temporal evidence pending publication"}
            </dd>
            <dd className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Calibration: <span className="font-medium text-slate-700 dark:text-slate-300">Not calibrated</span>
              {backtestGeneratedAt
                ? ` · latest retrospective evaluation ${formatDate(backtestGeneratedAt)}`
                : " · no retrospective evaluation published"}
            </dd>
            {versionsMatch === false ? (
              <dd className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                The deployed version differs from the evaluated artifact; do not treat the holdout as evidence for the deployed version.
              </dd>
            ) : null}
          </div>
        </dl>

        <div className="mt-8 grid gap-6 rounded-xl bg-slate-100 p-6 dark:bg-slate-900 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-white">Known limitations</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Daily—not streaming—updates; third-party scrape delays and corrections; hard annual rating resets; 1000-point priors for sparse team/map histories; no deployed roster adjustment or explicit uncertainty model; and predictions are probabilistic estimates, not guarantees.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/methodology">Read calibration and veto evidence</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
