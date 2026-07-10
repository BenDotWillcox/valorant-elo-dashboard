import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  parseBacktestCsv,
  runTemporalBacktest,
  type TemporalSplitConfig,
} from "../../lib/elo/backtest";

const split: TemporalSplitConfig = {
  trainEndExclusive: "2024-02-01T00:00:00.000Z",
  validationEndExclusive: "2024-03-01T00:00:00.000Z",
  testEndExclusive: "2024-04-01T00:00:00.000Z",
};

function fixtureCsv(): string {
  const header =
    '"match_id","match_timestamp","winning_team","losing_team","winning_team_score","losing_team_score","map","region","event","league"';
  const dates = [
    "2024-01-01 00:00:00",
    "2024-01-08 00:00:00",
    "2024-01-15 00:00:00",
    "2024-01-22 00:00:00",
    "2024-02-01 00:00:00",
    "2024-02-08 00:00:00",
    "2024-02-15 00:00:00",
    "2024-02-22 00:00:00",
    "2024-03-01 00:00:00",
    "2024-03-08 00:00:00",
    "2024-03-15 00:00:00",
    "2024-03-22 00:00:00",
  ];
  const rows = dates.map((date, index) => {
    const alphaWins = index % 3 !== 1;
    return [
      index + 1,
      `"${date}"`,
      `"${alphaWins ? "Alpha" : "Beta"}"`,
      `"${alphaWins ? "Beta" : "Alpha"}"`,
      13,
      9,
      `"${index % 2 === 0 ? "Ascent" : "Bind"}"`,
      '"Test"',
      '"Fixture"',
      '"VCT"',
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

describe("temporal backtest pipeline", () => {
  test("parses CSV and computes test metrics only after within-run validation selection", () => {
    const parsed = parseBacktestCsv(fixtureCsv());
    const options = {
      split,
      bootstrapIterations: 10,
      bootstrapSeed: 7,
      manifest: {
        generatedAt: "2026-07-09T00:00:00.000Z",
        dataSha256: "fixture-data",
        configSha256: "fixture-config",
        sourceDescriptor: "inline test fixture",
        sourceSnapshotSha256: null,
        sourceSnapshotFileSha256: null,
        sourceSnapshotExportedAt: null,
        evaluatedModelVersion: "fixture-model-v1",
        sourceCodeSha256: "fixture-source",
        sourceFiles: ["fixture.ts"],
        gitCommit: null,
        gitWorkingTree: "dirty" as const,
        provenanceCapturedAt: "2026-07-09T00:00:00.000Z",
        provenanceCapturePoint: "before input reads and artifact writes" as const,
        sourceExtraction: null,
      },
    };
    const result = runTemporalBacktest(parsed, options);

    assert.deepEqual(result.split.counts, { train: 4, validation: 4, test: 4 });
    assert.equal(result.selection.testEvaluationPassesWithinRun, 1);
    assert.equal(result.selection.candidateTestMetricsPublished, false);
    assert.ok(result.selection.selectedChallengerId);
    assert.equal(result.conclusion.productionModelChanged, false);
    const frozenProduction = result.finalModels.find(
      (model) => model.role === "pre-holdout-frozen-production"
    );
    assert.ok(frozenProduction);
    assert.equal(frozenProduction.model.ratingScale, 2000);
    assert.equal(frozenProduction.model.predictionScale, 1000);
    assert.equal(
      frozenProduction.provenance.repositoryCommit,
      "2f134f187c0717dbfcf18b1a07c4eccbef94dcdb"
    );
    assert.deepEqual(
      frozenProduction.provenance.sourceBlobs.map((source) => source.gitBlob),
      [
        "cdf7c5361a88a1099049058181e986fde4cc8f29",
        "11343604323dcf6ea414d2215e75be7327d9e533",
        "0c3d10548e2ef966dd831dcafaa9636378562d14",
      ]
    );
    assert.ok(frozenProduction.validation.pairedDeltaVsPlainElo);
    assert.ok(frozenProduction.test.pairedDeltaVsPlainElo);
    assert.deepEqual(
      result.references.preHoldoutFrozenProductionMapElo,
      frozenProduction.model
    );
    assert.equal(
      result.evaluationContext.preHoldoutFrozenProductionConfiguration
        .predatesTestStart,
      false
    );
    assert.match(result.selection.rule, /experimental map-Elo candidates only/);
    assert.equal(
      result.experiments.find((item) => item.family === "roster-regression")?.status,
      "unavailable"
    );
    for (const experiment of result.experiments) {
      for (const candidate of experiment.candidates) {
        assert.equal("test" in candidate, false);
        assert.equal(candidate.model.predictionScale, 1000);
      }
    }
    assert.deepEqual(result, runTemporalBacktest(parsed, options));
  });
});
