import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateExpectedWinProbability,
  calculateMapEloUpdate,
} from "../../lib/elo/elo-calculator";
import {
  calculateBo3MatchProbability,
  calculateBo5MatchProbability,
  calculateWinProbability,
} from "../../lib/predictions/calculations";

const EPSILON = 1e-12;

describe("Elo-to-prediction pipeline", () => {
  test("turns historical map results into consistent BO3 and BO5 forecasts", () => {
    const scorelines = [
      [13, 11],
      [13, 9],
      [13, 7],
      [13, 4],
      [13, 0],
    ] as const;

    const mapProbabilities = scorelines.map(([winnerScore, loserScore]) => {
      const updatedRatings = calculateMapEloUpdate(
        1000,
        1000,
        winnerScore,
        loserScore
      );
      const prediction = calculateWinProbability(
        updatedRatings.winnerRating,
        updatedRatings.loserRating
      );
      const eloProbability = calculateExpectedWinProbability(
        updatedRatings.winnerRating,
        updatedRatings.loserRating
      );

      assert.ok(prediction[0] > 0.5);
      assert.ok(Math.abs(prediction[0] + prediction[1] - 1) < EPSILON);
      assert.ok(Math.abs(prediction[0] - eloProbability) < EPSILON);

      return prediction;
    });

    for (let index = 1; index < mapProbabilities.length; index += 1) {
      assert.ok(mapProbabilities[index][0] > mapProbabilities[index - 1][0]);
    }

    const bo3 = calculateBo3MatchProbability(mapProbabilities.slice(0, 3));
    const bo5 = calculateBo5MatchProbability(mapProbabilities);

    assert.ok(bo3[0] > 0.5);
    assert.ok(bo5[0] > 0.5);
    assert.ok(Math.abs(bo3[0] + bo3[1] - 1) < EPSILON);
    assert.ok(Math.abs(bo5[0] + bo5[1] - 1) < EPSILON);
  });
});
