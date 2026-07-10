import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { RawPickBanEloRating } from "../../lib/elo/pick-ban-backtest";
import {
  assertSourceLessPickBanRatingsAreAuditable,
  classifySourceLessPickBanRatings,
  isSourceLessPickBanHardResetRating,
} from "../../lib/elo/pick-ban-rating-provenance";

function rating(
  overrides: Partial<RawPickBanEloRating> = {}
): RawPickBanEloRating {
  return {
    ratingId: "1",
    teamId: "team-1",
    mapName: "Ascent",
    rating: 1000,
    ratingDate: "2025-01-01T00:00:00.000000Z",
    sourceMatchId: null,
    ...overrides,
  };
}

describe("pick/ban snapshot rating provenance", () => {
  test("accepts only source-less rows matching the exact hard-reset signature", () => {
    const reset = rating();
    const resetDate = rating({
      ratingId: "2",
      ratingDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    const sourced = rating({
      ratingId: "3",
      rating: 1245,
      ratingDate: "2025-04-10T12:00:00.000000Z",
      sourceMatchId: "match-9",
    });

    assert.equal(isSourceLessPickBanHardResetRating(reset), true);
    assert.equal(isSourceLessPickBanHardResetRating(resetDate), true);
    assert.deepEqual(classifySourceLessPickBanRatings([reset, resetDate, sourced]), {
      ratingsWithoutSourceMatchId: 2,
      sourceLessRatingsMatchingHardResetSignature: 2,
      sourceLessRatingsOutsideHardResetSignature: 0,
    });
    assert.doesNotThrow(() =>
      assertSourceLessPickBanRatingsAreAuditable(
        [reset, resetDate, sourced],
        "Test snapshot"
      )
    );
  });

  test("rejects source-less non-reset rows because target-series exclusion is unprovable", () => {
    const wrongRating = rating({ rating: 1000.01 });
    const wrongDay = rating({
      ratingId: "2",
      ratingDate: "2025-01-02T00:00:00.000000Z",
    });
    const wrongTime = rating({
      ratingId: "3",
      ratingDate: "2025-01-01T00:00:01.000000Z",
    });

    assert.deepEqual(
      classifySourceLessPickBanRatings([wrongRating, wrongDay, wrongTime]),
      {
        ratingsWithoutSourceMatchId: 3,
        sourceLessRatingsMatchingHardResetSignature: 0,
        sourceLessRatingsOutsideHardResetSignature: 3,
      }
    );
    assert.throws(
      () =>
        assertSourceLessPickBanRatingsAreAuditable(
          [wrongRating, wrongDay, wrongTime],
          "Test snapshot"
        ),
      /3 source-less Elo rating row\(s\).*target-series exclusion cannot be proven/
    );
  });
});
