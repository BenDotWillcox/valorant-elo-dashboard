import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  PICK_BAN_INITIAL_RATING,
  scorePickBanVetoSequence,
  type PickBanVetoInput,
} from "../../lib/elo/pick-ban-policy";
import { ratingBeforePickBanCutoff } from "../../lib/elo/pick-ban-rating-history";

const team1Id = 1;
const team2Id = 2;

function score(vetoes: PickBanVetoInput[]) {
  return scorePickBanVetoSequence({
    team1Id,
    team2Id,
    vetoes,
    team1Ratings: [
      { mapName: "Ascent", rating: 1100 },
      { mapName: "Haven", rating: 900 },
    ],
    team2Ratings: [
      { mapName: "Ascent", rating: 1000 },
      { mapName: "Bind", rating: 1050 },
    ],
  });
}

describe("pick/ban policy", () => {
  test("scores picks and bans with an explicit 1000 cold-start rating", () => {
    assert.equal(PICK_BAN_INITIAL_RATING, 1000);

    const result = score([
      { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
      { orderIndex: 2, action: "pick", mapName: "Haven", teamId: team2Id },
      { orderIndex: 3, action: "decider", mapName: "Bind", teamId: null },
    ]);

    assert.deepEqual(result, {
      steps: [
        {
          vetoOrder: 1,
          action: "ban",
          mapName: "Ascent",
          teamId: team1Id,
          eloLost: 200,
          cumulativeEloLost: 200,
          optimalChoice: "Haven",
          availableMaps: ["Ascent", "Haven", "Bind"],
        },
        {
          vetoOrder: 2,
          action: "pick",
          mapName: "Haven",
          teamId: team2Id,
          eloLost: 0,
          cumulativeEloLost: 0,
          optimalChoice: "Haven",
          availableMaps: ["Haven", "Bind"],
        },
      ],
      team1CumulativeEloLost: 200,
      team2CumulativeEloLost: 0,
    });
  });

  test("breaks equal-Elo choices by stable veto-map order", () => {
    const result = scorePickBanVetoSequence({
      team1Id,
      team2Id,
      vetoes: [
        { orderIndex: 1, action: "pick", mapName: "Bind", teamId: team1Id },
        { orderIndex: 2, action: "ban", mapName: "Ascent", teamId: team2Id },
      ],
      team1Ratings: [],
      team2Ratings: [],
    });

    assert.equal(result.steps[0].optimalChoice, "Bind");
    assert.equal(result.steps[0].eloLost, 0);
  });

  test("rejects duplicate, out-of-order, and gapped veto order indexes", () => {
    assert.throws(
      () => score([
        { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        { orderIndex: 1, action: "pick", mapName: "Haven", teamId: team2Id },
      ]),
      /duplicated/
    );
    assert.throws(
      () => score([
        { orderIndex: 2, action: "ban", mapName: "Ascent", teamId: team1Id },
        { orderIndex: 1, action: "pick", mapName: "Haven", teamId: team2Id },
      ]),
      /contiguous|strictly increasing/
    );
    assert.throws(
      () => score([
        { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        { orderIndex: 3, action: "pick", mapName: "Haven", teamId: team2Id },
      ]),
      /contiguous/
    );
  });

  test("rejects duplicate maps, unsupported actions, and invalid actors", () => {
    assert.throws(
      () => score([
        { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        { orderIndex: 2, action: "pick", mapName: "Ascent", teamId: team2Id },
      ]),
      /appears more than once/
    );
    assert.throws(
      () => score([
        { orderIndex: 1, action: "protect", mapName: "Ascent", teamId: team1Id },
      ]),
      /unsupported action/
    );
    assert.throws(
      () => score([
        { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: 999 },
      ]),
      /one of the match teams/
    );
    assert.throws(
      () => score([
        { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        { orderIndex: 2, action: "decider", mapName: "Haven", teamId: team2Id },
      ]),
      /must not have an acting team/
    );
  });

  test("rejects non-finite and duplicate rating inputs", () => {
    assert.throws(
      () => scorePickBanVetoSequence({
        team1Id,
        team2Id,
        vetoes: [
          { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        ],
        team1Ratings: [{ mapName: "Ascent", rating: Number.NaN }],
        team2Ratings: [],
      }),
      /finite/
    );
    assert.throws(
      () => scorePickBanVetoSequence({
        team1Id,
        team2Id,
        vetoes: [
          { orderIndex: 1, action: "ban", mapName: "Ascent", teamId: team1Id },
        ],
        team1Ratings: [
          { mapName: "Ascent", rating: 1000 },
          { mapName: "Ascent", rating: 1001 },
        ],
        team2Ratings: [],
      }),
      /duplicate ratings/
    );
  });

  test("excludes ratings produced by earlier maps in the target series", () => {
    const cutoff = new Date("2025-06-10T20:00:00.000Z");
    const history = [
      {
        id: 1,
        rating: 940,
        ratingDate: new Date("2025-05-01T12:00:00.000Z"),
        sourceMatchId: 41,
      },
      {
        id: 2,
        rating: 1030,
        ratingDate: new Date("2025-06-10T19:15:00.000Z"),
        sourceMatchId: 99,
      },
    ];

    assert.equal(ratingBeforePickBanCutoff(history, 99, cutoff), 940);
    assert.equal(
      ratingBeforePickBanCutoff(history.slice(1), 99, cutoff),
      PICK_BAN_INITIAL_RATING
    );
  });

  test("accepts only exact hard resets when a history row has no source match", () => {
    const cutoff = new Date("2025-06-10T20:00:00.000Z");
    const reset = {
      id: 1,
      rating: 1000,
      ratingDate: new Date("2025-01-01T00:00:00.000Z"),
      sourceMatchId: null,
    };

    assert.equal(ratingBeforePickBanCutoff([reset], 99, cutoff), 1000);

    for (const unsafe of [
      { ...reset, rating: 1001 },
      {
        ...reset,
        ratingDate: new Date("2025-01-01T00:00:01.000Z"),
      },
    ]) {
      assert.throws(
        () => ratingBeforePickBanCutoff([unsafe], 99, cutoff),
        /source-less Elo rating row\(s\).*target-series exclusion cannot be proven/
      );
    }
  });
});
