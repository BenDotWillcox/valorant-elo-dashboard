import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateExpectedWinProbability,
  calculateMapEloUpdate,
  DEFAULT_MAP_CONFIG,
  type MapEloConfig,
} from "../../lib/elo/elo-calculator";

const changeFor = (
  winnerRating: number,
  loserRating: number,
  winnerScore: number,
  loserScore: number,
  config: MapEloConfig = DEFAULT_MAP_CONFIG
) =>
  calculateMapEloUpdate(
    winnerRating,
    loserRating,
    winnerScore,
    loserScore,
    config
  ).winnerRating - winnerRating;

describe("calculateExpectedWinProbability", () => {
  test("is symmetric and monotonic", () => {
    const even = calculateExpectedWinProbability(1000, 1000);
    const favorite = calculateExpectedWinProbability(1200, 1000);
    const underdog = calculateExpectedWinProbability(1000, 1200);

    assert.equal(even, 0.5);
    assert.ok(favorite > even);
    assert.ok(underdog < even);
    assert.ok(Math.abs(favorite + underdog - 1) < 1e-12);
  });

  test("rejects non-finite ratings and a non-positive scale", () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => calculateExpectedWinProbability(invalid, 1000), /finite/);
      assert.throws(() => calculateExpectedWinProbability(1000, invalid), /finite/);
      assert.throws(() => calculateExpectedWinProbability(1000, 1000, invalid), /finite/);
    }

    assert.throws(() => calculateExpectedWinProbability(1000, 1000, 0), /greater than zero/);
    assert.throws(() => calculateExpectedWinProbability(1000, 1000, -1), /greater than zero/);
  });
});

describe("calculateMapEloUpdate", () => {
  test("preserves the two-team rating sum", () => {
    const before = 1187.25 + 934.75;
    const after = calculateMapEloUpdate(1187.25, 934.75, 13, 9);

    assert.ok(Math.abs(after.winnerRating + after.loserRating - before) < 1e-10);
    assert.ok(after.winnerRating > 1187.25);
    assert.ok(after.loserRating < 934.75);
    assert.ok(Number.isFinite(after.winnerRating));
    assert.ok(Number.isFinite(after.loserRating));
  });

  test("does not mutate the supplied configuration", () => {
    const config = Object.freeze({ ...DEFAULT_MAP_CONFIG, kFactor: 32 });
    const before = { ...config };

    calculateMapEloUpdate(1000, 1000, 13, 11, config);

    assert.deepEqual(config, before);
  });

  test("moves ratings monotonically with score margin", () => {
    const close = changeFor(1000, 1000, 13, 11);
    const clear = changeFor(1000, 1000, 13, 7);
    const shutout = changeFor(1000, 1000, 13, 0);

    assert.ok(close > 0);
    assert.ok(clear > close);
    assert.ok(shutout > clear);
  });

  test("rewards an upset more than an expected win", () => {
    const favoriteWin = changeFor(1200, 800, 13, 9);
    const upset = changeFor(800, 1200, 13, 9);

    assert.ok(upset > favoriteWin);
  });

  test("scales monotonically with K and allows a zero-K no-op", () => {
    const zeroK = calculateMapEloUpdate(1000, 1000, 13, 9, {
      ...DEFAULT_MAP_CONFIG,
      kFactor: 0,
    });
    const lowK = changeFor(1000, 1000, 13, 9, {
      ...DEFAULT_MAP_CONFIG,
      kFactor: 20,
    });
    const highK = changeFor(1000, 1000, 13, 9, {
      ...DEFAULT_MAP_CONFIG,
      kFactor: 40,
    });

    assert.deepEqual(zeroK, { winnerRating: 1000, loserRating: 1000 });
    assert.ok(highK > lowK);
    assert.ok(Math.abs(highK / lowK - 2) < 1e-12);
  });

  test("rejects tied, reversed, fractional, negative, and non-finite scores", () => {
    assert.throws(() => calculateMapEloUpdate(1000, 1000, 13, 13), /greater than loserScore/);
    assert.throws(() => calculateMapEloUpdate(1000, 1000, 11, 13), /greater than loserScore/);
    assert.throws(() => calculateMapEloUpdate(1000, 1000, 13.5, 11), /integers/);
    assert.throws(() => calculateMapEloUpdate(1000, 1000, 13, -1), /zero or greater/);
    assert.throws(() => calculateMapEloUpdate(1000, 1000, Number.NaN, 11), /finite/);
  });

  test("rejects non-finite ratings", () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => calculateMapEloUpdate(invalid, 1000, 13, 11), /finite/);
      assert.throws(() => calculateMapEloUpdate(1000, invalid, 13, 11), /finite/);
    }
  });

  test("rejects invalid configuration values", () => {
    const invalidConfigs: Array<[Partial<MapEloConfig>, RegExp]> = [
      [{ initialRating: Number.NaN }, /initialRating.*finite/],
      [{ ratingScale: 0 }, /ratingScale.*greater than zero/],
      [{ ratingScale: -1 }, /ratingScale.*greater than zero/],
      [{ ratingScale: Number.POSITIVE_INFINITY }, /ratingScale.*finite/],
      [{ kFactor: -1 }, /kFactor.*zero or greater/],
      [{ kFactor: Number.NaN }, /kFactor.*finite/],
      [{ marginScale: -1 }, /marginScale.*zero or greater/],
      [{ marginScale: Number.POSITIVE_INFINITY }, /marginScale.*finite/],
    ];

    for (const [override, message] of invalidConfigs) {
      assert.throws(
        () =>
          calculateMapEloUpdate(1000, 1000, 13, 11, {
            ...DEFAULT_MAP_CONFIG,
            ...override,
          }),
        message
      );
    }
  });
});
