import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  PLAIN_ELO_BASELINE,
  PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
  bootstrapIntervals,
  generatePrequentialPredictions,
  marginMultiplier,
  normalizeBacktestRows,
  type ModelConfig,
  type RawBacktestRow,
  type TemporalSplitConfig,
  wilsonInterval,
} from "../../lib/elo/backtest";

const split: TemporalSplitConfig = {
  trainEndExclusive: "2024-02-01T00:00:00.000Z",
  validationEndExclusive: "2024-03-01T00:00:00.000Z",
  testEndExclusive: "2024-04-01T00:00:00.000Z",
};

function row(
  id: number,
  completedAt: string,
  winner = "Alpha",
  loser = "Beta",
  overrides: Partial<RawBacktestRow> = {}
): RawBacktestRow {
  return {
    sourceRowNumber: id + 1,
    sourceRowId: String(id),
    seriesId: `series-${Math.ceil(id / 2)}`,
    completedAt,
    gameNumber: id % 2 || 2,
    mapName: "Ascent",
    winnerTeamId: winner,
    winnerTeamName: winner,
    loserTeamId: loser,
    loserTeamName: loser,
    winnerScore: 13,
    loserScore: 9,
    ...overrides,
  };
}

describe("backtest row contracts", () => {
  test("orders chronologically and orients team A without using the winner", () => {
    const parsed = normalizeBacktestRows(
      [
        row(2, "2024-01-02T00:00:00Z", "Alpha", "Beta"),
        row(1, "2024-01-01T00:00:00Z", "Beta", "Alpha"),
      ],
      "db"
    );

    assert.deepEqual(parsed.rows.map((map) => map.sourceRowId), ["1", "2"]);
    assert.equal(parsed.rows[0].teamAId, "alpha");
    assert.equal(parsed.rows[0].teamBId, "beta");
    assert.equal(parsed.rows[0].teamAWon, false);
    assert.equal(parsed.rows[1].teamAId, "alpha");
    assert.equal(parsed.rows[1].teamAWon, true);
  });

  test("rejects missing, invalid, and duplicate map rows with explicit counts", () => {
    const valid = row(1, "2024-01-01T00:00:00Z");
    const parsed = normalizeBacktestRows(
      [
        valid,
        { ...valid, sourceRowNumber: 3, sourceRowId: "2" },
        row(3, "2024-01-03T00:00:00Z", "Alpha", "Beta", { mapName: "" }),
        row(4, "2024-01-04T00:00:00Z", "Alpha", "Beta", {
          winnerScore: 13,
          loserScore: 13,
        }),
      ],
      "csv"
    );

    assert.equal(parsed.quality.acceptedRows, 1);
    assert.equal(parsed.quality.issueCounts.duplicate_map, 1);
    assert.equal(parsed.quality.issueCounts.missing_required, 1);
    assert.equal(parsed.quality.issueCounts.invalid_value, 1);
    assert.equal(parsed.quality.rejectedRows, 3);
  });
});

describe("prequential timing and uncertainty", () => {
  test("predicts every map at a timestamp before applying any result", () => {
    const parsed = normalizeBacktestRows(
      [
        row(1, "2024-01-01T00:00:00Z"),
        row(2, "2024-01-01T00:00:00Z", "Alpha", "Beta", { mapName: "Bind" }),
        row(3, "2024-01-02T00:00:00Z"),
      ],
      "db"
    );
    const predictions = generatePrequentialPredictions(
      parsed.rows,
      PLAIN_ELO_BASELINE,
      split
    );

    assert.equal(predictions[0].probabilityTeamA, 0.5);
    assert.equal(predictions[1].probabilityTeamA, 0.5);
    assert.ok(predictions[2].probabilityTeamA > 0.5);
    assert.equal(predictions[2].ratingTeamA, 1032);
    assert.equal(predictions[2].ratingTeamB, 968);
  });

  test("produces deterministic block-bootstrap and Wilson intervals", () => {
    const parsed = normalizeBacktestRows(
      [
        row(1, "2024-01-01T00:00:00Z"),
        row(2, "2024-01-02T00:00:00Z", "Beta", "Alpha"),
        row(3, "2024-01-03T00:00:00Z"),
      ],
      "db"
    );
    const predictions = generatePrequentialPredictions(
      parsed.rows,
      PLAIN_ELO_BASELINE,
      split
    );

    assert.deepEqual(
      bootstrapIntervals(predictions, 20, 42),
      bootstrapIntervals(predictions, 20, 42)
    );
    const interval = wilsonInterval(7, 10)!;
    assert.ok(interval.lower95 < 0.7 && interval.upper95 > 0.7);
  });

  test("replays the frozen production forecast at scale 1000 while updating ratings at scale 2000", () => {
    const parsed = normalizeBacktestRows(
      [
        row(1, "2024-01-01T00:00:00Z"),
        row(2, "2024-01-02T00:00:00Z"),
        row(3, "2024-01-03T00:00:00Z"),
      ],
      "db"
    );
    const predictions = generatePrequentialPredictions(
      parsed.rows,
      PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO,
      split
    );
    const config = PRE_HOLDOUT_FROZEN_PRODUCTION_MAP_ELO;
    const margin = marginMultiplier(4, config.marginFormula, config.marginScale);
    const firstChange = config.kFactor * margin * 0.5;
    const ratingAfterFirst = config.initialRating + firstChange;
    const opponentAfterFirst = config.initialRating - firstChange;
    const forecastProbability =
      1 /
      (1 +
        10 **
          ((opponentAfterFirst - ratingAfterFirst) / config.predictionScale));
    const updateExpectedProbability =
      1 /
      (1 +
        10 ** ((opponentAfterFirst - ratingAfterFirst) / config.ratingScale));
    const secondChange =
      config.kFactor * margin * (1 - updateExpectedProbability);

    assert.equal(config.predictionScale, 1000);
    assert.equal(config.ratingScale, 2000);
    assert.ok(
      Math.abs(predictions[1].rawProbabilityTeamA - forecastProbability) < 1e-12
    );
    assert.ok(
      Math.abs(predictions[2].ratingTeamA! - (ratingAfterFirst + secondChange)) <
        1e-10
    );
    assert.ok(
      Math.abs(
        predictions[2].ratingTeamA! -
          (ratingAfterFirst + config.kFactor * margin * (1 - forecastProbability))
      ) > 1
    );
  });

  test("applies season carry once for every elapsed annual boundary", () => {
    const parsed = normalizeBacktestRows(
      [
        row(1, "2023-01-10T00:00:00Z"),
        row(2, "2025-01-10T00:00:00Z"),
      ],
      "db"
    );
    const extendedSplit = {
      trainEndExclusive: "2024-01-01T00:00:00.000Z",
      validationEndExclusive: "2026-01-01T00:00:00.000Z",
      testEndExclusive: "2027-01-01T00:00:00.000Z",
    };
    const predictionsForCarry = (seasonCarry: number) =>
      generatePrequentialPredictions(
        parsed.rows,
        {
          ...PLAIN_ELO_BASELINE,
          id: `season-carry-${seasonCarry}`,
          label: `Season carry ${seasonCarry}`,
          seasonCarry,
        },
        extendedSplit
      );
    const predictions = predictionsForCarry(0.5);

    // The first equal-rating win moves Alpha +16. Two missed boundaries retain
    // 0.5² of that deviation, so the next pre-match rating must be 1004.
    assert.equal(predictions[1].ratingTeamA, 1004);
    assert.equal(predictions[1].ratingTeamB, 996);
    assert.equal(predictionsForCarry(0)[1].ratingTeamA, 1000);
    assert.equal(predictionsForCarry(0)[1].ratingTeamB, 1000);
    assert.equal(predictionsForCarry(1)[1].ratingTeamA, 1016);
    assert.equal(predictionsForCarry(1)[1].ratingTeamB, 984);
  });

  test("rejects non-finite season carry values", () => {
    const parsed = normalizeBacktestRows(
      [row(1, "2024-01-01T00:00:00Z")],
      "db"
    );

    for (const seasonCarry of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () =>
          generatePrequentialPredictions(
            parsed.rows,
            {
              ...PLAIN_ELO_BASELINE,
              id: "invalid-season-carry",
              label: "Invalid season carry",
              seasonCarry,
            },
            split
          ),
        /seasonCarry/
      );
    }
  });

  test("rejects non-positive and non-finite forecast scales", () => {
    const parsed = normalizeBacktestRows(
      [row(1, "2024-01-01T00:00:00Z")],
      "db"
    );

    for (const predictionScale of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      assert.throws(
        () =>
          generatePrequentialPredictions(
            parsed.rows,
            {
              ...PLAIN_ELO_BASELINE,
              id: "invalid-prediction-scale",
              label: "Invalid prediction scale",
              predictionScale,
            },
            split
          ),
        /predictionScale/
      );
    }
  });

  test("applies every unseen roster revision to a dormant map rating", () => {
    const alphaRoster1 = ["a1", "a2", "a3", "a4", "a5"];
    const alphaRoster2 = ["a1", "a2", "a3", "a4", "a6"];
    const alphaRoster3 = ["a1", "a2", "a3", "a6", "a7"];
    const betaRoster = ["b1", "b2", "b3", "b4", "b5"];
    const withRosters = (
      id: number,
      completedAt: string,
      mapName: string,
      alphaRoster: string[]
    ) =>
      row(id, completedAt, "Alpha", "Beta", {
        mapName,
        winnerRosterPlayerIds: alphaRoster,
        loserRosterPlayerIds: betaRoster,
      });
    const parsed = normalizeBacktestRows(
      [
        withRosters(1, "2024-01-01T00:00:00Z", "Ascent", alphaRoster1),
        withRosters(2, "2024-01-02T00:00:00Z", "Bind", alphaRoster2),
        withRosters(3, "2024-01-03T00:00:00Z", "Bind", alphaRoster3),
        withRosters(4, "2024-01-04T00:00:00Z", "Ascent", alphaRoster3),
      ],
      "db"
    );
    const rosterConfig: ModelConfig = {
      ...PLAIN_ELO_BASELINE,
      id: "roster-revision-test",
      label: "Roster revision test",
      ratingScope: "map",
      rosterRegressionStrength: 1,
    };
    const predictions = generatePrequentialPredictions(parsed.rows, rosterConfig, split);

    // Alpha's original Ascent deviation is +16. Each 4/5-retained roster
    // transition must be applied, yielding 16 × 0.8 × 0.8 = 10.24.
    assert.ok(Math.abs(predictions[3].ratingTeamA! - 1010.24) < 1e-10);
    assert.equal(predictions[3].ratingTeamB, 984);
  });
});
