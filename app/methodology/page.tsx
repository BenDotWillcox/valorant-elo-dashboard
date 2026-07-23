import type { Metadata } from "next";
import Link from "next/link";

import {
  ConfidenceAccuracyChart,
  MapSampleChart,
  ReliabilityChart,
  type ReliabilitySeries,
} from "@/components/methodology/backtest-charts";
import {
  PickBanOutcomeChart,
  type PickBanOutcomePoint,
} from "@/components/methodology/pick-ban-outcome-chart";
import { Button } from "@/components/ui/button";
import {
  MAP_ELO_MODEL_VERSION,
} from "@/lib/elo/elo-calculator";
import type {
  ConfidenceInterval,
  FinalModelEvaluation,
  TemporalBacktestResult,
} from "@/lib/elo/backtest";
import type {
  PickBanOutcomeTrack,
  PickBanTemporalBacktestResult,
} from "@/lib/elo/pick-ban-backtest";
import backtestJson from "@/public/data/elo-backtest.json";
import pickBanBacktestJson from "@/public/data/pick-ban-backtest.json";

export const metadata: Metadata = {
  title: "Data & Elo Methodology | ValoMapped",
  description:
    "Separate retrospective studies of Elo probability calibration and observational pick/ban outcome association, with source coverage and limitations.",
};

const report = backtestJson as unknown as TemporalBacktestResult;
const vetoReport = pickBanBacktestJson as unknown as PickBanTemporalBacktestResult & {
  manifest: {
    generatedAt: string;
    ratingHistoryModelVersion: string;
    sourceExtraction: {
      sourceQuality: {
        ratingsWithoutSourceMatchId: number;
        sourceLessRatingsMatchingHardResetSignature: number;
        sourceLessRatingsOutsideHardResetSignature: number;
      };
    };
  };
};
const modelByRole = new Map(report.finalModels.map((model) => [model.role, model]));
const plain = modelByRole.get("plain-elo-baseline")!;
const frozenProduction = modelByRole.get("pre-holdout-frozen-production")!;
const production = modelByRole.get("fixed-production")!;
const challenger = modelByRole.get("validation-selected-challenger")!;
const evaluatedModelVersion = report.manifest.evaluatedModelVersion;
const modelVersionsMatch = evaluatedModelVersion === MAP_ELO_MODEL_VERSION;

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const decimal = (value: number, digits = 4) => value.toFixed(digits);
const signed = (value: number, digits = 4) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not available";

const interval = (value: ConfidenceInterval, formatter = decimal) =>
  `${formatter(value.lower95)} to ${formatter(value.upper95)}`;

const reliabilitySeries: ReliabilitySeries[] = [
  { model: plain, color: "#64748b" },
  { model: frozenProduction, color: "#2563eb" },
  { model: production, color: "#16a34a" },
  { model: challenger, color: "#d97706" },
].map(({ model, color }) => ({
  id: model.model.id,
  label: model.model.label,
  color,
  points: model.test.metrics.reliabilityBins
    .filter(
      (bin) =>
        bin.n > 0 &&
        bin.meanPredictedProbability !== null &&
        bin.observedTeamAWinRate !== null &&
        bin.observedRateWilson95 !== null
    )
    .map((bin) => ({
      predicted: bin.meanPredictedProbability!,
      observed: bin.observedTeamAWinRate!,
      n: bin.n,
      bin: `${percent(bin.lower, 0)}–${percent(bin.upper, 0)}`,
      lower95: bin.observedRateWilson95!.lower95,
      upper95: bin.observedRateWilson95!.upper95,
    })),
}));

const confidenceData = frozenProduction.test.metrics.accuracyByConfidenceBand
  .filter(
    (band) =>
      band.n > 0 &&
      band.accuracy !== null &&
      band.meanConfidence !== null &&
      band.accuracyWilson95 !== null
  )
  .map((band) => ({
    band: `${percent(band.lower, 0)}–${percent(band.upper, 0)}`,
    accuracy: band.accuracy!,
    meanConfidence: band.meanConfidence!,
    n: band.n,
    lower95: band.accuracyWilson95!.lower95,
    upper95: band.accuracyWilson95!.upper95,
  }));

const mapSamples = [...plain.test.metrics.sampleSizeByMap].sort(
  (a, b) => b.n - a.n || a.mapName.localeCompare(b.mapName)
);

const regretBandLabel = (lower: number, upper: number | null) =>
  upper === null ? `${lower}+ Elo` : `${lower}\u2013<${upper} Elo`;

const vetoOutcomeBands: PickBanOutcomePoint[] =
  vetoReport.associations.regretGapBands.flatMap((band) => {
    const interval95 = band.uncertainty.interval95;
    return band.rate === null || interval95 === null
      ? []
      : [{
          label: regretBandLabel(band.lowerInclusive, band.upperExclusive),
          n: band.n,
          rate: band.rate,
          lower95: interval95.lower95,
          upper95: interval95.upper95,
        }];
  });

const pickedMapOutcomeBands =
  vetoReport.associations.observedPickedMapWinRatesByRegretBand.flatMap((band) => {
    const interval95 = band.uncertainty.interval95;
    return band.rate === null || interval95 === null
      ? []
      : [{
          ...band,
          rate: band.rate,
          interval95,
        }];
  });

const vetoTrackOrder: PickBanOutcomeTrack[] = [
  "neutral",
  "preVetoPoolElo",
  "selectedMapSeriesElo",
  "calibratedSelectedMap",
  "calibratedSelectedMapPlusRegret",
];

const vetoTrackLabels: Record<PickBanOutcomeTrack, string> = {
  neutral: "Neutral p=0.5",
  preVetoPoolElo: "Pre-veto pool Elo",
  selectedMapSeriesElo: "Selected-map series Elo",
  calibratedSelectedMap: "Calibrated selected-map",
  calibratedSelectedMapPlusRegret: "Calibrated selected-map + regret",
};

const lowerRegretOutcome = vetoReport.associations.lowerRegretTeamHoldout;
const lowerRegretInterval = lowerRegretOutcome.uncertainty.interval95!;
const regretBrierDelta =
  vetoReport.pairedHoldoutDeltaRegretVsCalibratedSelectedMap.brier;
const pickedMapCoverage = vetoReport.associations.pickedMapOutcomeCoverage;
const vetoRatingSourceQuality =
  vetoReport.manifest.sourceExtraction.sourceQuality;

const closeWinChange = report.evaluatedModelExamples.updates.find(
  (example) => example.winnerScore === 13 && example.loserScore === 11
)!.winnerChange;
const shutoutChange = report.evaluatedModelExamples.updates.find(
  (example) => example.winnerScore === 13 && example.loserScore === 0
)!.winnerChange;

function ModelRow({ evaluation }: { evaluation: FinalModelEvaluation }) {
  const delta = evaluation.test.pairedDeltaVsPlainElo?.brier;

  return (
    <tr className="border-b border-slate-200 align-top last:border-0 dark:border-slate-800">
      <th scope="row" className="px-4 py-4 text-left font-medium text-slate-950 dark:text-white">
        {evaluation.model.label}
        <span className="mt-1 block font-mono text-xs font-normal text-slate-600 dark:text-slate-300">
          {evaluation.model.id}
        </span>
      </th>
      <td className="px-4 py-4 font-mono">{decimal(evaluation.test.metrics.brier)}</td>
      <td className="px-4 py-4 text-sm">
        {interval(evaluation.test.intervals95.brier)}
      </td>
      <td className="px-4 py-4 font-mono">{decimal(evaluation.test.metrics.logLoss)}</td>
      <td className="px-4 py-4 font-mono">{percent(evaluation.test.metrics.accuracy)}</td>
      <td className="px-4 py-4 font-mono">{decimal(evaluation.test.metrics.ece)}</td>
      <td className="px-4 py-4 font-mono">
        {delta ? signed(delta.estimate) : "Reference"}
        {delta ? (
          <span className="mt-1 block font-sans text-xs text-slate-600 dark:text-slate-300">
            95% CI {signed(delta.lower95)} to {signed(delta.upper95)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export default function MethodologyPage() {
  const frozenProductionDelta =
    frozenProduction.test.pairedDeltaVsPlainElo!.brier;
  const productionDelta = production.test.pairedDeltaVsPlainElo!.brier;
  const challengerDelta = challenger.test.pairedDeltaVsPlainElo!.brier;
  const allCandidates = report.experiments.flatMap((experiment) =>
    experiment.candidates.map((candidate) => ({
      family: experiment.family,
      status: experiment.status,
      ...candidate,
    }))
  );

  return (
    <article className="min-h-screen bg-slate-50 text-slate-700 dark:bg-black dark:text-slate-300">
      <header className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-green-950 px-6 py-20 text-white dark:border-slate-800 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-green-400">
            Data &amp; Elo methodology
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
            Two retrospective studies, two different evidence questions
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            The Elo study asks whether map-win probabilities are calibrated on a chronological test period. The veto study asks whether greedy Elo regret is associated with observed series and picked-map outcomes. They use separate artifacts and neither establishes a causal effect.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <a href="/data/elo-backtest.json">Open Elo backtest JSON</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/data/pick-ban-backtest.json">Open veto backtest JSON</a>
            </Button>
            <Button asChild variant="outline" className="border-slate-500 text-white hover:bg-white hover:text-slate-950">
              <a href="https://github.com/BenDotWillcox/valorant-elo-dashboard" rel="noreferrer">
                Inspect the source and snapshot
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-16 px-6 py-14 sm:px-8 lg:px-12">
        <section aria-labelledby="evaluation-questions-title">
          <h2 id="evaluation-questions-title" className="text-3xl font-bold text-slate-950 dark:text-white">
            Two evaluations, two questions
          </h2>
          <p className="mt-3 max-w-4xl leading-7">
            Probability calibration and veto outcome association are complementary, not interchangeable. A model-derived veto score cannot validate the probability model that produced it.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-green-200 bg-white p-6 dark:border-green-900 dark:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-green-700 dark:text-green-400">Probability calibration</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Do forecast probabilities match observed map outcomes?</h3>
              <p className="mt-3 text-sm leading-6">The chronological map replay reports Brier score, log loss, ECE, reliability, confidence bands, and a plain-Elo baseline. It controls candidate selection within each run.</p>
              <a href="#comparison-title" className="mt-4 inline-block text-sm font-semibold text-green-700 underline underline-offset-4 dark:text-green-400">Review calibration evidence</a>
            </article>
            <article className="rounded-2xl border border-blue-200 bg-white p-6 dark:border-blue-900 dark:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400">Veto outcome association</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Does lower greedy Elo regret accompany better observed outcomes?</h3>
              <p className="mt-3 text-sm leading-6">The match replay compares observational series and guaranteed-played BO3 pick outcomes. Bans and unchosen sequences remain counterfactual, so this is not evidence of coaching quality or causal win lift.</p>
              <a href="#veto-alignment" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline underline-offset-4 dark:text-blue-400">Review veto evidence</a>
            </article>
          </div>
        </section>

        <section aria-labelledby="assessment-title">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Source coverage", `${report.manifest.acceptedRows.toLocaleString()} maps`],
              ["Chronological test", `${report.split.counts.test.toLocaleString()} maps / ${report.split.seriesCounts.test} series`],
              ["Data through", date(report.manifest.latestCompletedAt)],
              ["Evaluated model", evaluatedModelVersion],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
                <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${modelVersionsMatch ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"}`}>
            Deployed model: <span className="font-mono">{MAP_ELO_MODEL_VERSION}</span>. Evaluated artifact: <span className="font-mono">{evaluatedModelVersion}</span>.
            {modelVersionsMatch
              ? " The versions match."
              : " They differ, so this holdout must not be presented as evidence for the deployed version."}
          </p>
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            This is a {report.evaluationContext.studyDesign}, not a prospectively registered confirmatory study. The evaluated production configuration is the version deployed at analysis time. Repository history records its rating-scale change on {date(report.evaluationContext.productionConfiguration.knownRepositoryChangeAt)} at commit <span className="font-mono">{report.evaluationContext.productionConfiguration.knownRepositoryChangeCommit.slice(0, 7)}</span>{report.evaluationContext.productionConfiguration.changePredatesTestStart ? ", before" : ", after"} this test period began.
          </p>
          <p className="mt-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
            A second production comparator is reconstructed exactly from repository commit <span className="font-mono">{report.evaluationContext.preHoldoutFrozenProductionConfiguration.repositoryCommit.slice(0, 7)}</span>, dated {date(report.evaluationContext.preHoldoutFrozenProductionConfiguration.repositoryCommitAt)} and therefore frozen before the chronological test began. It used update scale 2000 but forecast scale 1000, K=74, production MOV scale 1, and a hard annual reset. Its later predictions are retrospectively out of sample, but this does not prove the original parameter selection was leakage-free or turn the already-viewed period into an untouched holdout.
          </p>

          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-7 dark:border-amber-800 dark:bg-amber-950/30">
            <h2 id="assessment-title" className="text-2xl font-bold text-slate-950 dark:text-white">
              Assessment: the pre-holdout production model is not proven better than plain Elo
            </h2>
            <p className="mt-3 leading-7">
              On the {report.split.counts.test}-map chronological test, the pre-holdout frozen production model recorded Brier {decimal(frozenProduction.test.metrics.brier)} versus {decimal(plain.test.metrics.brier)} for plain overall-team Elo. The paired difference was {signed(frozenProductionDelta.estimate)} with a 95% block-bootstrap interval of {signed(frozenProductionDelta.lower95)} to {signed(frozenProductionDelta.upper95)}. The interval crosses zero, so this run does not establish an improvement.
            </p>
            <p className="mt-3 leading-7">
              The analysis-time production comparator was also inconclusive versus plain Elo ({signed(productionDelta.estimate)}, 95% CI {signed(productionDelta.lower95)} to {signed(productionDelta.upper95)}). Among {allCandidates.length} experimental map-Elo candidates, validation selected <strong>{challenger.model.label}</strong>; plain Elo itself had lower validation log loss ({decimal(plain.validation.metrics.logLoss)} versus {decimal(challenger.validation.metrics.logLoss)}). The challenger&apos;s test change versus plain Elo was inconclusive ({signed(challengerDelta.estimate)}, 95% CI {signed(challengerDelta.lower95)} to {signed(challengerDelta.upper95)}). No production parameters were changed automatically.
            </p>
          </div>
        </section>

        <section aria-labelledby="split-title" className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 id="split-title" className="text-3xl font-bold text-slate-950 dark:text-white">Temporal split and leakage controls</h2>
            <p className="mt-4 leading-7">
              Training warms rating state. Validation chooses one challenger by log loss from the experimental map-Elo grid; fixed references are not eligible. Within each run, the final test period begins on {date(report.split.boundaries.validationEndExclusive)} and is evaluated only after that choice is frozen.
            </p>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr><th className="px-4 py-3">Partition</th><th className="px-4 py-3">Observed dates (UTC)</th><th className="px-4 py-3">Maps</th><th className="px-4 py-3">Series</th></tr>
                </thead>
                <tbody>
                  {(["train", "validation", "test"] as const).map((split) => (
                    <tr key={split} className="border-t border-slate-200 dark:border-slate-800">
                      <th scope="row" className="px-4 py-3 text-left capitalize text-slate-950 dark:text-white">{split}</th>
                      <td className="px-4 py-3">{date(report.split.observedRanges[split].firstCompletedAt)} – {date(report.split.observedRanges[split].lastCompletedAt)}</td>
                      <td className="px-4 py-3 font-mono">{report.split.counts[split].toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{report.split.seriesCounts[split].toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-7 text-slate-200">
            <h3 className="text-xl font-semibold text-white">Prediction timing</h3>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6">
              <li>Teams are assigned to A/B lexically before the winner label is derived.</li>
              <li>All maps sharing a match timestamp are predicted before any result at that timestamp updates ratings.</li>
              <li>Roster appearances become visible only after those predictions, so the roster experiment is a last-observed proxy.</li>
              <li>Bootstrap samples are clustered by series, with a fixed seed and {report.methodology.bootstrap.iterations} draws.</li>
            </ol>
            <p className="mt-5 break-all font-mono text-xs text-slate-400">data sha256: {report.manifest.dataSha256}</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-400">source sha256: {report.manifest.sourceCodeSha256}</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-400">git: {report.manifest.gitCommit ?? "unavailable"} ({report.manifest.gitWorkingTree})</p>
          </div>
        </section>

        <section aria-labelledby="comparison-title">
          <h2 id="comparison-title" className="text-3xl font-bold text-slate-950 dark:text-white">Final chronological test comparison</h2>
          <p className="mt-3 max-w-4xl leading-7">Lower Brier, log loss, and ECE are better; higher accuracy is better. Candidate selection used validation log loss only within the experimental map-Elo grid. Plain Elo, both production comparators, and the 0.5 reference were fixed comparisons rather than selection candidates.</p>
          <div tabIndex={0} aria-label="Scrollable final chronological test comparison table" className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Brier</th><th className="px-4 py-3">Brier 95% CI</th><th className="px-4 py-3">Log loss</th><th className="px-4 py-3">Accuracy</th><th className="px-4 py-3">ECE</th><th className="px-4 py-3">Brier Δ vs plain</th></tr>
              </thead>
              <tbody>{report.finalModels.map((evaluation) => <ModelRow key={evaluation.model.id} evaluation={evaluation} />)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">The 0.5 reference is close to this holdout&apos;s aggregate lexical A/B base rate (ECE {decimal(modelByRole.get("naive-0.5-reference")!.test.metrics.ece)}), but it carries no ranking information and is not perfectly calibrated. Accuracy and proper scoring rules must be read together.</p>
        </section>

        <section aria-labelledby="calibration-title">
          <h2 id="calibration-title" className="text-3xl font-bold text-slate-950 dark:text-white">Calibration and confidence</h2>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Reliability plot</h3>
              <p className="mt-2 text-sm">Bubble area reflects maps per probability bin; tiny extreme bins are visually identifiable but should not drive conclusions.</p>
              <ReliabilityChart series={reliabilitySeries} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Pre-holdout production accuracy by confidence</h3>
              <p className="mt-2 text-sm">Accuracy does not rise consistently across the populated confidence bands. Each bar is labeled with its sample size; muted bars have fewer than 30 maps and should not drive conclusions.</p>
              <ConfidenceAccuracyChart data={confidenceData} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="py-2">Band</th><th>Maps</th><th>Mean confidence</th><th>Accuracy</th><th>Accuracy 95% CI</th></tr></thead>
                  <tbody>{confidenceData.map((row) => <tr key={row.band} className="border-t border-slate-200 dark:border-slate-800"><th scope="row" className="py-2 text-left">{row.band}</th><td>{row.n}{row.n < 30 ? "†" : ""}</td><td>{percent(row.meanConfidence)}</td><td>{percent(row.accuracy)}</td><td>{percent(row.lower95)}–{percent(row.upper95)}</td></tr>)}</tbody>
                </table>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">† Fewer than 30 maps; interval is correspondingly wide.</p>
              </div>
            </div>
          </div>

          <details className="mt-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer font-semibold text-slate-950 dark:text-white">Exact reliability-bin values</summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="py-2">Model</th><th>Bin</th><th>Maps</th><th>Mean predicted</th><th>Observed</th><th>Observed 95% CI</th></tr></thead>
                <tbody>{reliabilitySeries.flatMap((series) => series.points.map((point) => <tr key={`${series.id}-${point.bin}`} className="border-t border-slate-200 dark:border-slate-800"><th scope="row" className="py-2 text-left">{series.label}</th><td>{point.bin}</td><td>{point.n}</td><td>{percent(point.predicted)}</td><td>{percent(point.observed)}</td><td>{percent(point.lower95)}–{percent(point.upper95)}</td></tr>))}</tbody>
              </table>
            </div>
          </details>
        </section>

        <section aria-labelledby="map-sample-title" className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 id="map-sample-title" className="text-2xl font-bold text-slate-950 dark:text-white">Chronological test sample size by map</h2>
            <p className="mt-2 text-sm">Map-level conclusions are less stable where the retrospective test period is sparse.</p>
            <MapSampleChart data={mapSamples} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Cold-start context</h3>
            <p className="mt-3 leading-7">Among the {allCandidates.length} experimental map-Elo variants, validation selected an eight-game cold-start prior. It was not the best model overall: plain Elo had lower validation log loss, and the challenger did not beat plain Elo decisively on the chronological test.</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm"><thead className="bg-slate-100 text-left dark:bg-slate-800"><tr><th className="px-4 py-2">Map</th><th className="px-4 py-2">Holdout maps</th></tr></thead><tbody>{mapSamples.map((row) => <tr key={row.mapName} className="border-t border-slate-200 dark:border-slate-800"><th scope="row" className="px-4 py-2 text-left">{row.mapName}</th><td className="px-4 py-2 font-mono">{row.n}</td></tr>)}</tbody></table>
            </div>
          </div>
        </section>

        <section aria-labelledby="experiments-title">
          <h2 id="experiments-title" className="text-3xl font-bold text-slate-950 dark:text-white">VM-07 experiment comparison</h2>
          <p className="mt-3 max-w-4xl leading-7">Every experimental variant below is published on validation data. Within this run, only the lowest-log-loss experimental map-Elo candidate proceeds to the final holdout; fixed references are not eligible, and plain Elo scored better on validation than the selected challenger. The runner enforces that ordering, but it cannot prevent a person from rerunning and informally tuning after viewing test results; future decisions need a newly untouched period or rolling-origin confirmation.</p>
          <div tabIndex={0} aria-label="Scrollable validation experiment comparison table" className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="px-4 py-3">Family</th><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Configuration</th><th className="px-4 py-3">Validation Brier</th><th className="px-4 py-3">Validation log loss</th><th className="px-4 py-3">Accuracy</th></tr></thead>
              <tbody>{allCandidates.map(({ family, model, validation }) => <tr key={model.id} className="border-t border-slate-200 align-top dark:border-slate-800"><td className="px-4 py-3">{family}</td><th scope="row" className="px-4 py-3 text-left text-slate-950 dark:text-white">{model.label}<span className="block font-mono text-xs font-normal text-slate-600 dark:text-slate-300">{model.id}</span></th><td className="px-4 py-3 font-mono text-xs">K {model.kFactor}; update scale {model.ratingScale}; forecast scale {model.predictionScale}; MOV {model.marginFormula}/{model.marginScale}; carry {model.seasonCarry ?? "none"}; roster {model.rosterRegressionStrength}; prior {model.coldStartPriorGames}</td><td className="px-4 py-3 font-mono">{decimal(validation.metrics.brier)}</td><td className="px-4 py-3 font-mono">{decimal(validation.metrics.logLoss)}</td><td className="px-4 py-3 font-mono">{percent(validation.metrics.accuracy)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {report.experiments.map((experiment) => <div key={experiment.family} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h3 className="font-semibold capitalize text-slate-950 dark:text-white">{experiment.family.replaceAll("-", " ")}</h3><p className="mt-2 text-sm leading-6">{experiment.reason}</p><p className="mt-3 font-mono text-xs text-slate-600 dark:text-slate-300">best on validation: {experiment.bestOnValidationModelId}</p></div>)}
          </div>
        </section>

        <section aria-labelledby="aggression-title" className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="aggression-title" className="text-3xl font-bold text-slate-950 dark:text-white">The evaluated update is intentionally aggressive</h2>
            <p className="mt-4 leading-7">At equal 1000 ratings, the fixed production formula moves each team by approximately <strong>{closeWinChange.toFixed(1)} points for 13–11</strong> and <strong>{shutoutChange.toFixed(1)} points for 13–0</strong>. The holdout evidence above does not validate those magnitudes as superior.</p>
          </div>
          <div className="rounded-xl bg-slate-900 p-6 font-mono text-sm text-slate-200">
            <p>expected = 1 / (1 + 10^((loser − winner) / {production.model.ratingScale}))</p>
            <p className="mt-3">margin = ln(5.95 × √(round difference + 1))</p>
            <p className="mt-3">change = {production.model.kFactor} × margin × (1 − expected)</p>
          </div>
        </section>

        <section id="veto-alignment" aria-labelledby="veto-alignment-title" className="scroll-mt-24">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-400">
            Separate observational study
          </p>
          <h2 id="veto-alignment-title" className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
            Veto outcome association, not calibration or causal lift
          </h2>
          <p className="mt-4 max-w-4xl leading-7">
            This replay asks whether lower regret from a deterministic greedy Elo pick/ban rule is associated with observed outcomes. It does not observe what would have happened on banned maps or under an unchosen sequence, and it cannot establish that following the rule causes wins.
          </p>

          <div className="mt-7 rounded-2xl border border-blue-300 bg-blue-50 p-7 dark:border-blue-900 dark:bg-blue-950/30">
            <h3 className="text-2xl font-bold text-slate-950 dark:text-white">
              Holdout conclusion: no incremental evidence for veto regret
            </h3>
            <p className="mt-3 leading-7">
              The lower-regret team won <strong>{percent(lowerRegretOutcome.winRate!, 1)}</strong> of <strong>{lowerRegretOutcome.includedMatches.toLocaleString()} non-tied holdout matches</strong> ({lowerRegretOutcome.wins} wins). The event-cluster 95% interval was {percent(lowerRegretInterval.lower95, 1)} to {percent(lowerRegretInterval.upper95, 1)}, which includes 50%.
            </p>
            <p className="mt-3 leading-7">
              Adding relative regret to the calibrated selected-map forecast changed holdout Brier by <strong>{signed(regretBrierDelta.estimate)}</strong> (95% interval {signed(regretBrierDelta.lower95)} to {signed(regretBrierDelta.upper95)}; positive is worse). The interval crosses zero, so this run provides no incremental predictive evidence.
            </p>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-sm text-slate-600 dark:text-slate-300">Holdout matches</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{lowerRegretOutcome.holdoutMatches.toLocaleString()}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-sm text-slate-600 dark:text-slate-300">Regret ties excluded</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{lowerRegretOutcome.regretTiesExcluded.toLocaleString()}</dd>
              <dd className="mt-1 text-xs text-slate-600 dark:text-slate-300">{lowerRegretOutcome.includedMatches.toLocaleString()} non-tied matches included</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-sm text-slate-600 dark:text-slate-300">Holdout cold starts</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{vetoReport.coldStartCoverage.bySplit.test.matchesWithColdStart.toLocaleString()}</dd>
              <dd className="mt-1 text-xs text-slate-600 dark:text-slate-300">matches with any 1000 fallback</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-sm text-slate-600 dark:text-slate-300">Source quality</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{vetoReport.dataQuality.acceptedMatches.toLocaleString()} / {vetoReport.dataQuality.rejectedMatches.toLocaleString()}</dd>
              <dd className="mt-1 text-xs text-slate-600 dark:text-slate-300">accepted / rejected matches</dd>
            </div>
          </dl>

          <div className="mt-8">
            <h3 id="veto-track-title" className="text-2xl font-semibold text-slate-950 dark:text-white">Five holdout forecast tracks</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6">Lower Brier, log loss, and ECE are better. Accuracy is descriptive for non-neutral tracks; the neutral track&apos;s accuracy is intentionally suppressed.</p>
            <div tabIndex={0} aria-label="Scrollable table of five pick and ban holdout forecast tracks" className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[760px] text-sm" aria-labelledby="veto-track-title">
                <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Track</th>
                    <th scope="col" className="px-4 py-3">Matches</th>
                    <th scope="col" className="px-4 py-3">Brier</th>
                    <th scope="col" className="px-4 py-3">Log loss</th>
                    <th scope="col" className="px-4 py-3">Accuracy</th>
                    <th scope="col" className="px-4 py-3">ECE</th>
                  </tr>
                </thead>
                <tbody>
                  {vetoTrackOrder.map((track) => {
                    const evaluation = vetoReport.holdout[track];
                    return (
                      <tr key={track} className="border-t border-slate-200 dark:border-slate-800">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-slate-950 dark:text-white">{vetoTrackLabels[track]}</th>
                        <td className="px-4 py-3 font-mono">{evaluation.metrics.n.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono">{decimal(evaluation.metrics.brier)}</td>
                        <td className="px-4 py-3 font-mono">{decimal(evaluation.metrics.logLoss)}</td>
                        <td className="px-4 py-3 font-mono">{evaluation.accuracyDecisionInformative ? percent(evaluation.metrics.accuracy) : "Suppressed\u2020"}</td>
                        <td className="px-4 py-3 font-mono">{decimal(evaluation.metrics.ece)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
              † {vetoReport.methodology.neutralAccuracyPolicy.reason} Neutral Brier and log loss remain meaningful.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {vetoReport.methodology.preVetoPoolEloDefinition}
            </p>
          </div>

          <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Series win rate by regret-gap band</h3>
              <p className="mt-2 text-sm leading-6">Observed lower-regret-team win rates with a 50% reference. Hollow bars have fewer than 30 matches; the pattern is not monotonic and is not causal.</p>
              <PickBanOutcomeChart data={vetoOutcomeBands} />
            </div>
            <div className="min-w-0">
              <h3 id="regret-band-table-title" className="text-xl font-semibold text-slate-950 dark:text-white">Exact series association values</h3>
              <p className="mt-2 text-sm leading-6">Intervals resample the {lowerRegretOutcome.uncertainty.blockCount} observed events as clusters. Band upper bounds are exclusive.</p>
              <div tabIndex={0} aria-label="Scrollable exact series outcome table by regret gap" className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full min-w-[620px] text-sm" aria-labelledby="regret-band-table-title">
                  <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th scope="col" className="px-4 py-3">Regret gap</th>
                      <th scope="col" className="px-4 py-3">Matches</th>
                      <th scope="col" className="px-4 py-3">Wins</th>
                      <th scope="col" className="px-4 py-3">Win rate</th>
                      <th scope="col" className="px-4 py-3">Event-cluster 95% interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vetoReport.associations.regretGapBands.map((band) => {
                      const interval95 = band.uncertainty.interval95;
                      if (band.rate === null || interval95 === null) return null;
                      return (
                        <tr key={band.lowerInclusive} className="border-t border-slate-200 dark:border-slate-800">
                          <th scope="row" className="px-4 py-3 text-left font-medium">{regretBandLabel(band.lowerInclusive, band.upperExclusive)}</th>
                          <td className="px-4 py-3 font-mono">{band.n.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono">{band.successes.toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono">{percent(band.rate)}</td>
                          <td className="px-4 py-3 font-mono">{percent(interval95.lower95)} to {percent(interval95.upper95)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 id="picked-map-title" className="text-2xl font-semibold text-slate-950 dark:text-white">Exploratory BO3 picked-map outcomes</h3>
            <p className="mt-3 max-w-4xl leading-7">
              Of {pickedMapCoverage.totalPickDecisions.toLocaleString()} holdout pick decisions, {pickedMapCoverage.included.toLocaleString()} guaranteed-played BO3 picks were included. {pickedMapCoverage.excludedNonBo3.toLocaleString()} BO5 picks were excluded and {pickedMapCoverage.excludedUnresolvedOutcome.toLocaleString()} outcomes were unresolved. These rates are exploratory, visibly non-monotonic, and do not validate the greedy rule.
            </p>
            <div tabIndex={0} aria-label="Scrollable exploratory BO3 picked-map outcomes table" className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm" aria-labelledby="picked-map-title">
                <thead className="border-y border-slate-200 text-left text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Pick regret</th>
                    <th scope="col" className="px-4 py-3">Included picks</th>
                    <th scope="col" className="px-4 py-3">Map wins</th>
                    <th scope="col" className="px-4 py-3">Observed win rate</th>
                    <th scope="col" className="px-4 py-3">Event-cluster 95% interval</th>
                  </tr>
                </thead>
                <tbody>
                  {pickedMapOutcomeBands.map((band) => (
                    <tr key={band.lowerInclusive} className="border-b border-slate-200 dark:border-slate-800">
                      <th scope="row" className="px-4 py-3 text-left font-medium">{regretBandLabel(band.lowerInclusive, band.upperExclusive)}</th>
                      <td className="px-4 py-3 font-mono">{band.n.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{band.successes.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{percent(band.rate)}</td>
                      <td className="px-4 py-3 font-mono">{percent(band.interval95.lower95)} to {percent(band.interval95.upper95)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p><strong>Interpretation boundary.</strong> Stored rating-history model version: <span className="font-mono">{vetoReport.manifest.ratingHistoryModelVersion}</span>. The database replay uses recorded match completion time as its cutoff proxy because start time is not stored, while explicitly excluding ratings produced by the target match. Source-less history is accepted only for exact 1000-point January 1 UTC hard resets: this snapshot contains {vetoRatingSourceQuality.sourceLessRatingsMatchingHardResetSignature.toLocaleString()} such resets out of {vetoRatingSourceQuality.ratingsWithoutSourceMatchId.toLocaleString()} source-less rows and {vetoRatingSourceQuality.sourceLessRatingsOutsideHardResetSignature.toLocaleString()} outside the signature. Generation and replay fail closed for every outside row because target-series exclusion cannot otherwise be proven. Greedy regret is observational and omits side choice, preparation, roster plans, and private strategy. Ban values and unchosen sequences remain counterfactual; their outcomes are not observed. Event-cluster intervals cover sampled events, not model-selection, counterfactual, timestamp, or source-coverage uncertainty.</p>
            <Button asChild variant="outline" className="mt-4 border-amber-700 text-amber-950 hover:bg-amber-100 dark:border-amber-300 dark:text-amber-100 dark:hover:bg-amber-950">
              <Link href="/pick-ban">Open pick/ban model alignment</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="quality-title" className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 id="quality-title" className="text-3xl font-bold text-slate-950 dark:text-white">Data quality and provenance</h2>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-white p-4 dark:bg-slate-900"><dt className="text-sm text-slate-600 dark:text-slate-300">Accepted</dt><dd className="mt-1 text-2xl font-semibold">{report.dataQuality.acceptedRows.toLocaleString()}</dd></div>
              <div className="rounded-lg bg-white p-4 dark:bg-slate-900"><dt className="text-sm text-slate-600 dark:text-slate-300">Rejected</dt><dd className="mt-1 text-2xl font-semibold">{report.dataQuality.rejectedRows.toLocaleString()}</dd></div>
              <div className="rounded-lg bg-white p-4 dark:bg-slate-900"><dt className="text-sm text-slate-600 dark:text-slate-300">Series ID coverage</dt><dd className="mt-1 text-2xl font-semibold">{percent(report.dataQuality.seriesIdCoverage.rate)}</dd></div>
              <div className="rounded-lg bg-white p-4 dark:bg-slate-900"><dt className="text-sm text-slate-600 dark:text-slate-300">Roster proxy coverage</dt><dd className="mt-1 text-2xl font-semibold">{percent(report.dataQuality.rosterCoverage.rate)}</dd></div>
            </dl>
            {report.manifest.sourceExtraction ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-semibold text-slate-950 dark:text-white">Extraction universe</h3>
                <p className="mt-2 leading-6">{report.manifest.sourceExtraction.scope}.</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div><dt className="text-slate-600 dark:text-slate-300">All map rows</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.totalMaps.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-600 dark:text-slate-300">Processed</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.processedMaps.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-600 dark:text-slate-300">Unprocessed</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.unprocessedMaps.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-600 dark:text-slate-300">Missing completion time</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.mapsWithoutCompletedAt.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-600 dark:text-slate-300">Processed, missing time</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.processedMapsWithoutCompletedAt.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-600 dark:text-slate-300">Required-team join loss</dt><dd className="font-mono font-semibold">{report.manifest.sourceExtraction.processedRowsExcludedByRequiredTeamJoins.toLocaleString()}</dd></div>
                </dl>
                <p className="mt-4 text-xs leading-5 text-slate-600 dark:text-slate-300">These counts describe the database snapshot, not events absent from the historical source records or ingestion results.</p>
              </div>
            ) : null}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950 dark:text-white">Limitations that remain</h3>
            <ul className="mt-4 list-disc space-y-3 pl-5 leading-7">{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            <p className="mt-4 text-sm">VLR.gg is the historical third-party source. Automated updates are currently paused, and tracked-event scope plus delayed corrections can affect coverage. The public dataset panel reports the last successful ingestion separately from full-pipeline health.</p>
          </div>
        </section>

        <section className="rounded-2xl bg-green-700 p-8 text-white">
          <h2 className="text-3xl font-bold">Decision boundary</h2>
          <p className="mt-3 max-w-4xl leading-7 text-green-50">This evidence argues against silently shipping a new formula. The runner did not change production parameters or adopt its challenger. A future adoption decision should pre-register the candidate and wait for a new untouched period or rolling-origin confirmation.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Button asChild variant="secondary"><Link href="/predictions">Open predictions</Link></Button><Button asChild variant="outline" className="border-green-200 text-white hover:bg-white hover:text-green-800"><Link href="/math-blog">Read the mathematical walkthrough</Link></Button></div>
        </section>
      </div>
    </article>
  );
}
