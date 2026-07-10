import type {
  PickBanBacktestInput,
  PickBanBacktestOptions,
  RawPickBanMatch,
  RawPickBanVeto,
} from "../../lib/elo/pick-ban-backtest";

export const PICK_BAN_TEST_MAPS = [
  "Ascent",
  "Bind",
  "Haven",
  "Lotus",
  "Split",
  "Sunset",
  "Icebox",
] as const;

const ALPHA_RATINGS: Record<(typeof PICK_BAN_TEST_MAPS)[number], number> = {
  Ascent: 1200,
  Bind: 1150,
  Haven: 1100,
  Lotus: 1050,
  Split: 1000,
  Sunset: 950,
  Icebox: 900,
};

export const PICK_BAN_TEST_OPTIONS: PickBanBacktestOptions = {
  split: {
    trainEndExclusive: "2024-04-01T00:00:00.000Z",
    validationEndExclusive: "2024-06-01T00:00:00.000Z",
    testEndExclusive: "2024-08-01T00:00:00.000Z",
  },
  bootstrapIterations: 25,
  bootstrapSeed: 12345,
};

function vetoesFor(
  variant: "alpha-lower-regret" | "beta-lower-regret"
): RawPickBanVeto[] {
  const steps =
    variant === "alpha-lower-regret"
      ? [
          ["ban", "Icebox", "alpha", null],
          ["ban", "Split", "beta", null],
          ["pick", "Ascent", "alpha", 1],
          ["pick", "Sunset", "beta", 2],
          ["ban", "Lotus", "alpha", null],
          ["ban", "Bind", "beta", null],
          ["decider", "Haven", null, null],
        ]
      : [
          ["ban", "Ascent", "alpha", null],
          ["ban", "Bind", "beta", null],
          ["pick", "Split", "alpha", 1],
          ["pick", "Icebox", "beta", 2],
          ["ban", "Sunset", "alpha", null],
          ["ban", "Haven", "beta", null],
          ["decider", "Lotus", null, null],
        ];
  return steps.map(([action, mapName, teamId, resultedGameNumber], index) => ({
    orderIndex: index + 1,
    action: String(action),
    mapName: String(mapName),
    teamId: teamId === null ? null : String(teamId),
    resultedGameNumber:
      resultedGameNumber === null ? null : Number(resultedGameNumber),
  }));
}

export function makePickBanMatch(
  matchId: string,
  startedAt: string,
  winner: "alpha" | "beta",
  variant: "alpha-lower-regret" | "beta-lower-regret"
): RawPickBanMatch {
  const vetoes = vetoesFor(variant);
  const selected = vetoes.filter(
    (veto) => veto.action === "pick" || veto.action === "decider"
  );
  return {
    matchId,
    startedAt,
    event: `Event ${matchId}`,
    region: "Test",
    bestOf: 3,
    team1Id: "alpha",
    team2Id: "beta",
    team1Score: winner === "alpha" ? 2 : 0,
    team2Score: winner === "beta" ? 2 : 0,
    vetoes,
    playedMaps: selected.slice(0, 2).map((veto, index) => ({
      gameNumber: index + 1,
      mapName: veto.mapName,
      winnerTeamId: winner,
    })),
  };
}

export function makePickBanBacktestInput(): PickBanBacktestInput {
  const matches = [
    makePickBanMatch(
      "train-1",
      "2024-01-15T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    ),
    makePickBanMatch(
      "train-2",
      "2024-02-15T12:00:00.000Z",
      "beta",
      "beta-lower-regret"
    ),
    makePickBanMatch(
      "train-3",
      "2024-03-15T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    ),
    makePickBanMatch(
      "validation-1",
      "2024-04-15T12:00:00.000Z",
      "beta",
      "beta-lower-regret"
    ),
    makePickBanMatch(
      "validation-2",
      "2024-05-15T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    ),
    makePickBanMatch(
      "test-1",
      "2024-06-15T12:00:00.000Z",
      "alpha",
      "alpha-lower-regret"
    ),
    makePickBanMatch(
      "test-2",
      "2024-07-15T12:00:00.000Z",
      "beta",
      "beta-lower-regret"
    ),
  ];
  const eloRatings = PICK_BAN_TEST_MAPS.flatMap((mapName, index) => [
    {
      ratingId: `alpha-${index}`,
      teamId: "alpha",
      mapName,
      rating: ALPHA_RATINGS[mapName],
      ratingDate: "2024-01-01T00:00:00.000Z",
      sourceMatchId: "prior",
    },
    {
      ratingId: `beta-${index}`,
      teamId: "beta",
      mapName,
      rating: 1000,
      ratingDate: "2024-01-01T00:00:00.000Z",
      sourceMatchId: "prior",
    },
  ]);
  return { matches, eloRatings };
}

export function reverseSourceTeamOrder(input: PickBanBacktestInput): PickBanBacktestInput {
  return {
    eloRatings: input.eloRatings.map((rating) => ({ ...rating })),
    matches: input.matches.map((match) => ({
      ...match,
      team1Id: match.team2Id,
      team2Id: match.team1Id,
      team1Score: match.team2Score,
      team2Score: match.team1Score,
      vetoes: match.vetoes.map((veto) => ({ ...veto })),
      playedMaps: match.playedMaps.map((map) => ({ ...map })),
    })),
  };
}
