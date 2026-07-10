import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { runPickBanTemporalBacktest } from "../../lib/elo/pick-ban-backtest";
import {
  PICK_BAN_TEST_OPTIONS,
  makePickBanBacktestInput,
} from "../fixtures/pick-ban-backtest-fixture";

describe("pick/ban backtest pipeline", () => {
  test("replays deterministically and publishes every outcome contract", () => {
    const input = makePickBanBacktestInput();
    const first = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    const second = runPickBanTemporalBacktest(
      structuredClone(input),
      PICK_BAN_TEST_OPTIONS
    );

    assert.deepEqual(second, first);
    assert.equal(first.schemaVersion, "1.0.0");
    assert.deepEqual(first.split.counts, { train: 3, validation: 2, test: 2 });
    assert.equal(first.predictions.validation.length, 2);
    assert.equal(first.predictions.test.length, 2);
    assert.deepEqual(Object.keys(first.validation), [
      "neutral",
      "preVetoPoolElo",
      "selectedMapSeriesElo",
      "calibratedSelectedMap",
      "calibratedSelectedMapPlusRegret",
    ]);
    assert.equal(first.holdout.neutral.metrics.n, 2);
    assert.equal(first.holdout.neutral.accuracyDecisionInformative, false);
    assert.equal(first.methodology.neutralAccuracyPolicy.displayPolicy, "suppress");
    assert.match(first.methodology.preVetoPoolEloDefinition, /mean-map plug-in/i);
    assert.equal(first.coefficients.validation.selectedMap.trainingRows, 3);
    assert.equal(
      first.coefficients.validation.selectedMap.status,
      "identity-fallback"
    );
    assert.equal(first.coefficients.test.selectedMap.trainingRows, 5);
    assert.equal(
      first.pairedHoldoutDeltaRegretVsCalibratedSelectedMap.brier.iterations,
      PICK_BAN_TEST_OPTIONS.bootstrapIterations
    );
    assert.equal(first.conclusion.causal, false);
  });
});
