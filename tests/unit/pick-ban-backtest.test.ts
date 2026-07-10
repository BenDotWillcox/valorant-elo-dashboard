import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  runPickBanTemporalBacktest,
  type PickBanBacktestInput,
  type RawPickBanMatch,
} from "../../lib/elo/pick-ban-backtest";
import {
  PICK_BAN_TEST_MAPS,
  PICK_BAN_TEST_OPTIONS,
  makePickBanBacktestInput,
  makePickBanMatch,
  reverseSourceTeamOrder,
} from "../fixtures/pick-ban-backtest-fixture";

function cloneInput(input: PickBanBacktestInput): PickBanBacktestInput {
  return structuredClone(input);
}

describe("pick/ban temporal outcome backtest", () => {
  test("uses strict pre-match, same-season ratings and excludes target-match ratings", () => {
    const clean = makePickBanBacktestInput();
    const cleanResult = runPickBanTemporalBacktest(clean, PICK_BAN_TEST_OPTIONS);
    const contaminated = cloneInput(clean);
    for (const mapName of PICK_BAN_TEST_MAPS) {
      contaminated.eloRatings.push(
        {
          ratingId: `same-time-alpha-${mapName}`,
          teamId: "alpha",
          mapName,
          rating: 1,
          ratingDate: "2024-06-15T12:00:00.000Z",
          sourceMatchId: "other",
        },
        {
          ratingId: `same-time-beta-${mapName}`,
          teamId: "beta",
          mapName,
          rating: 5000,
          ratingDate: "2024-06-15T12:00:00.000Z",
          sourceMatchId: "other",
        },
        {
          ratingId: `target-alpha-${mapName}`,
          teamId: "alpha",
          mapName,
          rating: 1,
          ratingDate: "2024-06-01T00:00:00.000Z",
          sourceMatchId: "test-1",
        },
        {
          ratingId: `old-season-beta-${mapName}`,
          teamId: "beta",
          mapName,
          rating: 5000,
          ratingDate: "2023-12-31T23:59:59.000Z",
          sourceMatchId: "old",
        }
      );
    }

    const contaminatedResult = runPickBanTemporalBacktest(
      contaminated,
      PICK_BAN_TEST_OPTIONS
    );
    const cleanPrediction = cleanResult.predictions.test.find(
      (prediction) => prediction.matchId === "test-1"
    )!;
    const contaminatedPrediction = contaminatedResult.predictions.test.find(
      (prediction) => prediction.matchId === "test-1"
    )!;
    assert.deepEqual(
      contaminatedPrediction.probabilities,
      cleanPrediction.probabilities
    );
    assert.equal(contaminatedResult.coldStartCoverage.coldStartLookups, 0);
  });

  test("orders numeric rating ids numerically and missing ids by stable source ordinal", () => {
    const clean = runPickBanTemporalBacktest(
      makePickBanBacktestInput(),
      PICK_BAN_TEST_OPTIONS
    );
    const numericIds = makePickBanBacktestInput();
    numericIds.eloRatings.push(
      {
        ratingId: "10",
        teamId: "alpha",
        mapName: "Ascent",
        rating: 1500,
        ratingDate: "2024-03-20T00:00:00.000Z",
        sourceMatchId: "prior-10",
      },
      {
        ratingId: "9",
        teamId: "alpha",
        mapName: "Ascent",
        rating: 700,
        ratingDate: "2024-03-20T00:00:00.000Z",
        sourceMatchId: "prior-9",
      }
    );
    const numericResult = runPickBanTemporalBacktest(
      numericIds,
      PICK_BAN_TEST_OPTIONS
    );
    const reorderedNumericResult = runPickBanTemporalBacktest(
      { ...numericIds, eloRatings: [...numericIds.eloRatings].reverse() },
      PICK_BAN_TEST_OPTIONS
    );
    const cleanProbability = clean.predictions.test[0].probabilities.selectedMapSeriesElo;
    const numericProbability =
      numericResult.predictions.test[0].probabilities.selectedMapSeriesElo;
    assert.ok(numericProbability > cleanProbability);
    assert.equal(
      reorderedNumericResult.predictions.test[0].probabilities.selectedMapSeriesElo,
      numericProbability
    );

    const missingIds = makePickBanBacktestInput();
    missingIds.eloRatings.push(
      {
        sourceOrdinal: 10,
        teamId: "alpha",
        mapName: "Haven",
        rating: 1450,
        ratingDate: "2024-03-21T00:00:00.000Z",
      },
      {
        sourceOrdinal: 9,
        teamId: "alpha",
        mapName: "Haven",
        rating: 750,
        ratingDate: "2024-03-21T00:00:00.000Z",
      }
    );
    const missingFirst = runPickBanTemporalBacktest(
      missingIds,
      PICK_BAN_TEST_OPTIONS
    );
    const missingSecond = runPickBanTemporalBacktest(
      { ...missingIds, eloRatings: [...missingIds.eloRatings].reverse() },
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(
      missingSecond.predictions.test[0].probabilities.selectedMapSeriesElo,
      missingFirst.predictions.test[0].probabilities.selectedMapSeriesElo
    );
    assert.ok(
      missingFirst.predictions.test[0].probabilities.selectedMapSeriesElo >
        cleanProbability
    );
  });

  test("requires offset-qualified timestamp strings", () => {
    const dateInput = makePickBanBacktestInput();
    dateInput.matches[0].startedAt = new Date(dateInput.matches[0].startedAt);
    dateInput.eloRatings[0].ratingDate = new Date(dateInput.eloRatings[0].ratingDate);
    assert.equal(
      runPickBanTemporalBacktest(dateInput, PICK_BAN_TEST_OPTIONS).dataQuality
        .rejectedMatches,
      0
    );

    const input = makePickBanBacktestInput();
    const invalidTimestamp = makePickBanMatch(
      "invalid-timezone",
      "2024-07-20T12:00:00",
      "alpha",
      "alpha-lower-regret"
    );
    input.matches.push(invalidTimestamp);
    input.eloRatings.push({
      teamId: "alpha",
      mapName: "Ascent",
      rating: 2000,
      ratingDate: "2024-03-01T00:00:00",
    });
    const result = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    assert.equal(result.dataQuality.rejectedMatches, 1);
    assert.equal(result.dataQuality.issueCounts.missing_required, 1);
    assert.equal(result.dataQuality.ratingRows.invalid, 1);
    assert.throws(
      () =>
        runPickBanTemporalBacktest(input, {
          ...PICK_BAN_TEST_OPTIONS,
          split: {
            ...PICK_BAN_TEST_OPTIONS.split,
            trainEndExclusive: "2024-04-01T00:00:00",
          },
        }),
      /valid timestamp/
    );
  });

  test("falls back to preregistered identity calibration when fitting is unsafe", () => {
    const result = runPickBanTemporalBacktest(
      makePickBanBacktestInput(),
      PICK_BAN_TEST_OPTIONS
    );
    for (const fit of [
      result.coefficients.validation.selectedMap,
      result.coefficients.validation.selectedMapPlusRegret,
      result.coefficients.test.selectedMap,
      result.coefficients.test.selectedMapPlusRegret,
    ]) {
      assert.equal(fit.status, "identity-fallback");
      assert.equal(fit.fallbackReason, "insufficient_rows");
      assert.equal(fit.intercept, 0);
      assert.equal(fit.selectedMapLogit, 1);
      assert.equal(fit.converged, false);
    }
    for (const prediction of [
      ...result.predictions.validation,
      ...result.predictions.test,
    ]) {
      assert.equal(
        prediction.probabilities.calibratedSelectedMap,
        prediction.probabilities.selectedMapSeriesElo
      );
      assert.equal(
        prediction.probabilities.calibratedSelectedMapPlusRegret,
        prediction.probabilities.selectedMapSeriesElo
      );
    }
    for (const interval of Object.values(
      result.pairedHoldoutDeltaRegretVsCalibratedSelectedMap
    )) {
      assert.equal(interval.estimate, 0);
      assert.equal(interval.lower95, 0);
      assert.equal(interval.upper95, 0);
    }

    const singleClass = makePickBanBacktestInput();
    singleClass.matches = [
      ...Array.from({ length: 20 }, (_, index) =>
        makePickBanMatch(
          `single-class-${index}`,
          new Date(Date.UTC(2024, 0, index + 2)).toISOString(),
          "alpha",
          index % 2 === 0 ? "alpha-lower-regret" : "beta-lower-regret"
        )
      ),
      ...singleClass.matches.filter((match) =>
        String(match.matchId).startsWith("validation-") ||
        String(match.matchId).startsWith("test-")
      ),
    ];
    const singleClassResult = runPickBanTemporalBacktest(
      singleClass,
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(
      singleClassResult.coefficients.validation.selectedMap.status,
      "identity-fallback"
    );
    assert.equal(
      singleClassResult.coefficients.validation.selectedMap.fallbackReason,
      "insufficient_outcome_variation"
    );

    const mixedClass = makePickBanBacktestInput();
    mixedClass.matches = [
      ...Array.from({ length: 24 }, (_, index) =>
        makePickBanMatch(
          `mixed-class-${index}`,
          new Date(Date.UTC(2024, 0, index + 2)).toISOString(),
          index % 4 < 2 ? "alpha" : "beta",
          index % 2 === 0 ? "alpha-lower-regret" : "beta-lower-regret"
        )
      ),
      ...mixedClass.matches.filter((match) =>
        String(match.matchId).startsWith("validation-") ||
        String(match.matchId).startsWith("test-")
      ),
    ];
    const mixedClassResult = runPickBanTemporalBacktest(
      mixedClass,
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(
      mixedClassResult.coefficients.validation.selectedMap.status,
      "fitted"
    );
    assert.equal(
      mixedClassResult.coefficients.validation.selectedMap.fallbackReason,
      null
    );
    assert.equal(
      mixedClassResult.coefficients.validation.selectedMap.converged,
      true
    );

    const constantRegret = makePickBanBacktestInput();
    constantRegret.matches = [
      ...Array.from({ length: 24 }, (_, index) =>
        makePickBanMatch(
          `constant-regret-train-${index}`,
          new Date(Date.UTC(2024, 0, index + 2)).toISOString(),
          index % 2 === 0 ? "alpha" : "beta",
          "alpha-lower-regret"
        )
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        makePickBanMatch(
          `constant-regret-validation-${index}`,
          new Date(Date.UTC(2024, 3, index + 2)).toISOString(),
          index % 2 === 0 ? "alpha" : "beta",
          "alpha-lower-regret"
        )
      ),
      ...constantRegret.matches.filter((match) =>
        String(match.matchId).startsWith("test-")
      ),
    ];
    const constantRegretResult = runPickBanTemporalBacktest(
      constantRegret,
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(
      constantRegretResult.coefficients.test.selectedMap.status,
      "fitted"
    );
    assert.equal(
      constantRegretResult.coefficients.test.selectedMapPlusRegret.status,
      "selected-map-fallback"
    );
    assert.equal(
      constantRegretResult.coefficients.test.selectedMapPlusRegret.fallbackReason,
      "insufficient_feature_variation"
    );
    for (const prediction of constantRegretResult.predictions.test) {
      assert.equal(
        prediction.probabilities.calibratedSelectedMapPlusRegret,
        prediction.probabilities.calibratedSelectedMap
      );
    }
    for (const interval of Object.values(
      constantRegretResult.pairedHoldoutDeltaRegretVsCalibratedSelectedMap
    )) {
      assert.equal(interval.estimate, 0);
      assert.equal(interval.lower95, 0);
      assert.equal(interval.upper95, 0);
    }
  });

  test("freezes final coefficients and probabilities before reading test labels", () => {
    const original = makePickBanBacktestInput();
    const flipped = cloneInput(original);
    for (const match of flipped.matches.filter((row) =>
      String(row.matchId).startsWith("test-")
    )) {
      [match.team1Score, match.team2Score] = [match.team2Score, match.team1Score];
      match.playedMaps = match.playedMaps.map((map) => ({
        ...map,
        winnerTeamId: map.winnerTeamId === "alpha" ? "beta" : "alpha",
      }));
    }

    const first = runPickBanTemporalBacktest(original, PICK_BAN_TEST_OPTIONS);
    const second = runPickBanTemporalBacktest(flipped, PICK_BAN_TEST_OPTIONS);
    assert.deepEqual(second.coefficients, first.coefficients);
    assert.deepEqual(
      second.predictions.test.map((prediction) => prediction.probabilities),
      first.predictions.test.map((prediction) => prediction.probabilities)
    );
    assert.notDeepEqual(
      second.predictions.test.map((prediction) => prediction.teamAWon),
      first.predictions.test.map((prediction) => prediction.teamAWon)
    );
  });

  test("is invariant to reversed source team order", () => {
    const input = makePickBanBacktestInput();
    const normal = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    const reversed = runPickBanTemporalBacktest(
      reverseSourceTeamOrder(input),
      PICK_BAN_TEST_OPTIONS
    );
    assert.deepEqual(reversed, normal);
    assert.ok(
      normal.predictions.test.every(
        (prediction) =>
          prediction.teamAId === "alpha" && prediction.teamBId === "beta"
      )
    );
  });

  test("rejects duplicate, gapped, and unsupported veto pools with stable counts", () => {
    const input = makePickBanBacktestInput();
    const duplicateOrder = makePickBanMatch(
      "invalid-order",
      "2024-07-20T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    );
    duplicateOrder.vetoes[1].orderIndex = 1;
    const duplicateMap = makePickBanMatch(
      "invalid-map",
      "2024-07-21T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    );
    duplicateMap.vetoes[1].mapName = duplicateMap.vetoes[0].mapName;
    const shortPool = makePickBanMatch(
      "invalid-pool",
      "2024-07-22T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    );
    shortPool.vetoes.pop();

    const invalidRows = [duplicateOrder, duplicateMap, shortPool];
    const first = runPickBanTemporalBacktest(
      { ...input, matches: [...input.matches, ...invalidRows] },
      PICK_BAN_TEST_OPTIONS
    );
    const second = runPickBanTemporalBacktest(
      { ...input, matches: [...invalidRows].reverse().concat(input.matches) },
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(first.dataQuality.rejectedMatches, 3);
    assert.equal(first.dataQuality.issueCounts.duplicate_veto_order, 1);
    assert.equal(first.dataQuality.issueCounts.gapped_veto_order, 1);
    assert.equal(first.dataQuality.issueCounts.duplicate_veto_map, 1);
    assert.equal(first.dataQuality.issueCounts.unsupported_map_pool, 2);
    assert.deepEqual(second.dataQuality, first.dataQuality);
  });

  test("rejects non-alternating actors and unresolved resulted game numbers", () => {
    const input = makePickBanBacktestInput();
    const alternateStarter = cloneInput(input);
    alternateStarter.matches[0].vetoes = alternateStarter.matches[0].vetoes.map(
      (veto) => ({
        ...veto,
        teamId:
          veto.teamId === "alpha"
            ? "beta"
            : veto.teamId === "beta"
              ? "alpha"
              : null,
      })
    );
    assert.equal(
      runPickBanTemporalBacktest(alternateStarter, PICK_BAN_TEST_OPTIONS)
        .dataQuality.rejectedMatches,
      0
    );

    const repeatedActor = makePickBanMatch(
      "invalid-actors",
      "2024-07-23T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    );
    repeatedActor.vetoes[1].teamId = repeatedActor.vetoes[0].teamId;
    const unresolvedGame = makePickBanMatch(
      "invalid-resulted-game",
      "2024-07-24T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    );
    unresolvedGame.vetoes.at(-1)!.resultedGameNumber = 3;
    const result = runPickBanTemporalBacktest(
      {
        ...input,
        matches: [...input.matches, repeatedActor, unresolvedGame],
      },
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(result.dataQuality.rejectedMatches, 2);
    assert.equal(result.dataQuality.issueCounts.invalid_veto_sequence, 1);
    assert.equal(result.dataQuality.issueCounts.invalid_played_map, 1);
  });

  test("publishes holdout regret and observed picked-map association metrics", () => {
    const result = runPickBanTemporalBacktest(
      makePickBanBacktestInput(),
      PICK_BAN_TEST_OPTIONS
    );
    assert.deepEqual(result.split.counts, { train: 3, validation: 2, test: 2 });
    assert.equal(result.associations.lowerRegretTeamHoldout.n, 2);
    assert.equal(result.associations.lowerRegretTeamHoldout.holdoutMatches, 2);
    assert.equal(result.associations.lowerRegretTeamHoldout.regretTiesExcluded, 0);
    assert.equal(result.associations.lowerRegretTeamHoldout.inclusionRate, 1);
    assert.equal(
      result.associations.lowerRegretTeamHoldout.holdoutMatchesWithColdStart,
      0
    );
    assert.equal(
      result.associations.lowerRegretTeamHoldout.includedMatchesWithColdStart,
      0
    );
    assert.equal(result.associations.lowerRegretTeamHoldout.wins, 2);
    assert.equal(result.associations.lowerRegretTeamHoldout.winRate, 1);
    assert.equal(
      result.associations.lowerRegretTeamHoldout.uncertainty.blockCount,
      2
    );
    assert.equal(
      result.associations.lowerRegretTeamHoldout.uncertainty.interval95,
      null
    );
    assert.deepEqual(result.associations.pickedMapOutcomeCoverage, {
      totalPickDecisions: 4,
      eligibleGuaranteedPlayedBo3Picks: 4,
      included: 4,
      excluded: 0,
      excludedNonBo3: 0,
      excludedUnresolvedOutcome: 0,
    });

    const highRegretPickedMaps =
      result.associations.observedPickedMapWinRatesByRegretBand.find(
        (band) => band.lowerInclusive === 100
      )!;
    assert.equal(highRegretPickedMaps.n, 1);
    assert.equal(highRegretPickedMaps.successes, 0);
    assert.equal(highRegretPickedMaps.rate, 0);
    assert.equal(highRegretPickedMaps.uncertainty.interval95, null);
    assert.equal(result.conclusion.causal, false);
    assert.ok(
      Number.isFinite(
        result.pairedHoldoutDeltaRegretVsCalibratedSelectedMap.logLoss.estimate
      )
    );
  });

  test("uses deterministic event-cluster association intervals with five blocks", () => {
    const input = makePickBanBacktestInput();
    input.matches.push(
      makePickBanMatch(
        "test-3",
        "2024-07-16T12:00:00.000Z",
        "alpha",
        "alpha-lower-regret"
      ),
      makePickBanMatch(
        "test-4",
        "2024-07-17T12:00:00.000Z",
        "beta",
        "beta-lower-regret"
      ),
      makePickBanMatch(
        "test-5",
        "2024-07-18T12:00:00.000Z",
        "alpha",
        "alpha-lower-regret"
      )
    );
    const first = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    const reversed = runPickBanTemporalBacktest(
      { ...input, matches: [...input.matches].reverse() },
      PICK_BAN_TEST_OPTIONS
    );
    const lowerRegret = first.associations.lowerRegretTeamHoldout;
    assert.equal(lowerRegret.uncertainty.blockCount, 5);
    assert.ok(lowerRegret.uncertainty.interval95);
    assert.ok(lowerRegret.uncertainty.interval95!.lower95 >= 0);
    assert.ok(lowerRegret.uncertainty.interval95!.upper95 <= 1);
    const zeroRegretPickedMaps =
      first.associations.observedPickedMapWinRatesByRegretBand[0];
    assert.equal(zeroRegretPickedMaps.uncertainty.blockCount, 5);
    assert.ok(zeroRegretPickedMaps.uncertainty.interval95);
    assert.deepEqual(reversed.associations, first.associations);
  });

  test("reports explicit 1000 cold starts", () => {
    const input = makePickBanBacktestInput();
    input.eloRatings = input.eloRatings.filter(
      (rating) => !(rating.teamId === "beta" && rating.mapName === "Icebox")
    );
    const result = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    assert.equal(result.coldStartCoverage.coldStartLookups, input.matches.length);
    assert.equal(result.coldStartCoverage.matchesWithColdStart, input.matches.length);
    assert.ok(result.coldStartCoverage.coldStartRate > 0);

    const allCold = makePickBanBacktestInput();
    allCold.eloRatings = [];
    const allColdResult = runPickBanTemporalBacktest(
      allCold,
      PICK_BAN_TEST_OPTIONS
    );
    assert.equal(
      allColdResult.associations.lowerRegretTeamHoldout.holdoutMatchesWithColdStart,
      2
    );
    assert.equal(
      allColdResult.associations.lowerRegretTeamHoldout.regretTiesExcluded,
      2
    );
    assert.equal(
      allColdResult.associations.lowerRegretTeamHoldout.includedMatches,
      0
    );
    assert.equal(
      allColdResult.associations.lowerRegretTeamHoldout.inclusionRate,
      0
    );
  });

  test("supports the standard seven-map BO5 sequence", () => {
    const input = makePickBanBacktestInput();
    const makeBo5 = (
      matchId: string,
      startedAt: string,
      winner: "alpha" | "beta"
    ): RawPickBanMatch => {
      const steps = [
        ["ban", "Icebox", "alpha", null],
        ["ban", "Ascent", "beta", null],
        ["pick", "Bind", "alpha", 1],
        ["pick", "Sunset", "beta", 2],
        ["pick", "Haven", "alpha", 3],
        ["pick", "Split", "beta", null],
        ["decider", "Lotus", null, null],
      ] as const;
      const vetoes = steps.map(([action, mapName, teamId, game], index) => ({
        orderIndex: index + 1,
        action,
        mapName,
        teamId,
        resultedGameNumber: game,
      }));
      return {
        matchId,
        startedAt,
        bestOf: 5,
        event: `BO5 ${matchId}`,
        team1Id: "alpha",
        team2Id: "beta",
        team1Score: winner === "alpha" ? 3 : 0,
        team2Score: winner === "beta" ? 3 : 0,
        vetoes,
        playedMaps: vetoes
          .filter((veto) => veto.action === "pick")
          .slice(0, 3)
          .map((veto, index) => ({
            gameNumber: index + 1,
            mapName: veto.mapName,
            winnerTeamId: winner,
          })),
      };
    };
    input.matches = [
      makeBo5("bo5-train", "2024-02-01T00:00:00.000Z", "alpha"),
      makeBo5("bo5-validation", "2024-04-15T00:00:00.000Z", "beta"),
      makeBo5("bo5-test", "2024-06-15T00:00:00.000Z", "alpha"),
    ];
    const result = runPickBanTemporalBacktest(input, PICK_BAN_TEST_OPTIONS);
    assert.equal(result.dataQuality.rejectedMatches, 0);
    assert.deepEqual(result.split.counts, { train: 1, validation: 1, test: 1 });
    assert.deepEqual(result.associations.pickedMapOutcomeCoverage, {
      totalPickDecisions: 4,
      eligibleGuaranteedPlayedBo3Picks: 0,
      included: 0,
      excluded: 4,
      excludedNonBo3: 4,
      excludedUnresolvedOutcome: 0,
    });
  });
});
