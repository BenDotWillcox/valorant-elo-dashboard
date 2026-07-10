export const PICK_BAN_INITIAL_RATING = 1000;

export type PickBanAction = "pick" | "ban" | "decider";

export type PickBanVetoInput = {
  orderIndex: number;
  action: string;
  mapName: string;
  teamId: number | null;
};

export type PickBanMapRating = {
  mapName: string;
  rating: number;
};

export type ScoredPickBanStep = {
  vetoOrder: number;
  action: "pick" | "ban";
  mapName: string;
  teamId: number;
  eloLost: number;
  cumulativeEloLost: number;
  optimalChoice: string;
  availableMaps: string[];
};

export type PickBanScore = {
  steps: ScoredPickBanStep[];
  team1CumulativeEloLost: number;
  team2CumulativeEloLost: number;
};

type ScorePickBanVetoSequenceInput = {
  team1Id: number;
  team2Id: number;
  vetoes: PickBanVetoInput[];
  team1Ratings: PickBanMapRating[];
  team2Ratings: PickBanMapRating[];
};

function assertValidTeamId(teamId: number, label: string) {
  if (!Number.isSafeInteger(teamId) || teamId <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function buildRatingLookup(ratings: PickBanMapRating[], label: string) {
  const lookup = new Map<string, number>();

  for (const { mapName, rating } of ratings) {
    if (!mapName || mapName.trim() !== mapName) {
      throw new Error(`${label} contains an invalid map name.`);
    }
    if (!Number.isFinite(rating)) {
      throw new Error(`${label} rating for ${mapName} must be finite.`);
    }
    if (lookup.has(mapName)) {
      throw new Error(`${label} contains duplicate ratings for ${mapName}.`);
    }
    lookup.set(mapName, rating);
  }

  return lookup;
}

function validateVetoSequence(
  vetoes: PickBanVetoInput[],
  team1Id: number,
  team2Id: number
) {
  if (vetoes.length === 0) {
    throw new Error("Veto sequence must contain at least one step.");
  }

  const orderIndexes = new Set<number>();
  const mapNames = new Set<string>();
  let previousOrder = Number.NEGATIVE_INFINITY;
  let actionableSteps = 0;
  let deciders = 0;

  for (let index = 0; index < vetoes.length; index += 1) {
    const veto = vetoes[index];

    if (!Number.isSafeInteger(veto.orderIndex) || veto.orderIndex <= 0) {
      throw new Error(`Veto order ${veto.orderIndex} must be a positive integer.`);
    }
    if (orderIndexes.has(veto.orderIndex)) {
      throw new Error(`Veto order ${veto.orderIndex} is duplicated.`);
    }
    if (veto.orderIndex <= previousOrder) {
      throw new Error("Veto steps must be ordered by strictly increasing order_index.");
    }
    if (veto.orderIndex !== index + 1) {
      throw new Error("Veto order_index values must be contiguous from 1 through N.");
    }
    orderIndexes.add(veto.orderIndex);
    previousOrder = veto.orderIndex;

    if (!veto.mapName || veto.mapName.trim() !== veto.mapName) {
      throw new Error(`Veto order ${veto.orderIndex} has an invalid map name.`);
    }
    if (mapNames.has(veto.mapName)) {
      throw new Error(`Map ${veto.mapName} appears more than once in the veto sequence.`);
    }
    mapNames.add(veto.mapName);

    if (veto.action !== "pick" && veto.action !== "ban" && veto.action !== "decider") {
      throw new Error(`Veto order ${veto.orderIndex} has unsupported action ${veto.action}.`);
    }

    if (veto.action === "decider") {
      deciders += 1;
      if (veto.teamId !== null) {
        throw new Error(`Decider at veto order ${veto.orderIndex} must not have an acting team.`);
      }
      if (index !== vetoes.length - 1) {
        throw new Error("The decider must be the final veto step.");
      }
      continue;
    }

    actionableSteps += 1;
    if (veto.teamId !== team1Id && veto.teamId !== team2Id) {
      throw new Error(
        `Veto order ${veto.orderIndex} actor must be one of the match teams.`
      );
    }
  }

  if (deciders > 1) {
    throw new Error("Veto sequence cannot contain more than one decider.");
  }
  if (actionableSteps === 0) {
    throw new Error("Veto sequence must contain at least one pick or ban.");
  }
}

function ratingForMap(lookup: Map<string, number>, mapName: string) {
  return lookup.get(mapName) ?? PICK_BAN_INITIAL_RATING;
}

function advantageForMap(
  actingTeamRatings: Map<string, number>,
  opponentRatings: Map<string, number>,
  mapName: string
) {
  return ratingForMap(actingTeamRatings, mapName) - ratingForMap(opponentRatings, mapName);
}

function findOptimalChoice(
  action: "pick" | "ban",
  actingTeamRatings: Map<string, number>,
  opponentRatings: Map<string, number>,
  availableMaps: string[]
) {
  if (availableMaps.length === 0) {
    throw new Error(`Cannot score a ${action} with no available maps.`);
  }

  let optimalMap = availableMaps[0];
  let optimalAdvantage = advantageForMap(
    actingTeamRatings,
    opponentRatings,
    optimalMap
  );

  for (const mapName of availableMaps.slice(1)) {
    const advantage = advantageForMap(actingTeamRatings, opponentRatings, mapName);
    const isBetter = action === "pick"
      ? advantage > optimalAdvantage
      : advantage < optimalAdvantage;

    if (isBetter) {
      optimalMap = mapName;
      optimalAdvantage = advantage;
    }
  }

  return { mapName: optimalMap, advantage: optimalAdvantage };
}

export function scorePickBanVetoSequence({
  team1Id,
  team2Id,
  vetoes,
  team1Ratings,
  team2Ratings,
}: ScorePickBanVetoSequenceInput): PickBanScore {
  assertValidTeamId(team1Id, "team1Id");
  assertValidTeamId(team2Id, "team2Id");
  if (team1Id === team2Id) {
    throw new Error("Match teams must be distinct.");
  }

  validateVetoSequence(vetoes, team1Id, team2Id);

  const team1RatingLookup = buildRatingLookup(team1Ratings, "Team 1");
  const team2RatingLookup = buildRatingLookup(team2Ratings, "Team 2");
  const cumulativeEloLost = new Map<number, number>([
    [team1Id, 0],
    [team2Id, 0],
  ]);
  const steps: ScoredPickBanStep[] = [];
  let availableMaps = vetoes.map((veto) => veto.mapName);

  for (const veto of vetoes) {
    if (veto.action === "decider") {
      continue;
    }

    const action = veto.action as "pick" | "ban";
    const teamId = veto.teamId as number;
    const actingTeamRatings = teamId === team1Id ? team1RatingLookup : team2RatingLookup;
    const opponentRatings = teamId === team1Id ? team2RatingLookup : team1RatingLookup;
    const optimal = findOptimalChoice(
      action,
      actingTeamRatings,
      opponentRatings,
      availableMaps
    );
    const actualAdvantage = advantageForMap(
      actingTeamRatings,
      opponentRatings,
      veto.mapName
    );
    const eloLost = action === "pick"
      ? optimal.advantage - actualAdvantage
      : actualAdvantage - optimal.advantage;
    const nextCumulativeEloLost = (cumulativeEloLost.get(teamId) ?? 0) + eloLost;

    cumulativeEloLost.set(teamId, nextCumulativeEloLost);
    steps.push({
      vetoOrder: veto.orderIndex,
      action,
      mapName: veto.mapName,
      teamId,
      eloLost,
      cumulativeEloLost: nextCumulativeEloLost,
      optimalChoice: optimal.mapName,
      availableMaps: [...availableMaps],
    });

    availableMaps = availableMaps.filter((mapName) => mapName !== veto.mapName);
  }

  return {
    steps,
    team1CumulativeEloLost: cumulativeEloLost.get(team1Id) ?? 0,
    team2CumulativeEloLost: cumulativeEloLost.get(team2Id) ?? 0,
  };
}
