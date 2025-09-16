export interface MapProbabilities {
  [key: string]: {
    probability: number;
    map: string;
  };
}

interface MapSelectionResult {
  selectedMaps: string[];
  bans: {
    team1: string[];
    team2: string[];
  };
}

export function getOptimalMapSelection(
  maps: string[],
  team1Probabilities: MapProbabilities,
  team2Probabilities: MapProbabilities,
  matchType: 'BO3' | 'BO5' | 'BO5_ADV'
): MapSelectionResult {
  const remainingMaps = new Set(maps);
  const selectedMaps: string[] = [];
  const bans = {
    team1: [] as string[],
    team2: [] as string[]
  };

  if (matchType === 'BO3') {
    // Team 1 Ban (worst win probability)
    const team1Ban = Object.values(team1Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = a.probability - b.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team1Ban) {
      remainingMaps.delete(team1Ban);
      bans.team1.push(team1Ban);
    }

    // Team 2 Ban
    const team2Ban = Object.values(team2Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = a.probability - b.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team2Ban) {
      remainingMaps.delete(team2Ban);
      bans.team2.push(team2Ban);
    }

    // Team 1 Pick (best win probability)
    const team1Pick = Object.values(team1Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = b.probability - a.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team1Pick) {
      remainingMaps.delete(team1Pick);
      selectedMaps.push(team1Pick);
    }

    // Team 2 Pick
    const team2Pick = Object.values(team2Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = b.probability - a.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team2Pick) {
      remainingMaps.delete(team2Pick);
      selectedMaps.push(team2Pick);
    }

    // Get the two worst remaining maps for each team for final bans
    const team1RemainingBan = Object.values(team1Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = a.probability - b.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team1RemainingBan) {
      remainingMaps.delete(team1RemainingBan);
      bans.team1.push(team1RemainingBan);
    }

    const team2RemainingBan = Object.values(team2Probabilities)
      .filter(p => remainingMaps.has(p.map))
      .sort((a, b) => {
        const probDiff = a.probability - b.probability;
        return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
      })[0]?.map;
    if (team2RemainingBan) {
      remainingMaps.delete(team2RemainingBan);
      bans.team2.push(team2RemainingBan);
    }

    // The last remaining map becomes the decider
    const finalMap = Array.from(remainingMaps)[0];
    if (finalMap) selectedMaps.push(finalMap);
  } else {
    if (matchType === 'BO5_ADV') {
      // Team 1 gets two bans first (advantage)
      const team1Ban1 = Object.values(team1Probabilities)
        .filter(p => remainingMaps.has(p.map))
        .sort((a, b) => {
          const probDiff = a.probability - b.probability;
          return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
        })[0]?.map;
      if (team1Ban1) {
        remainingMaps.delete(team1Ban1);
        bans.team1.push(team1Ban1);
      }

      const team1Ban2 = Object.values(team1Probabilities)
        .filter(p => remainingMaps.has(p.map))
        .sort((a, b) => {
          const probDiff = a.probability - b.probability;
          return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
        })[0]?.map;
      if (team1Ban2) {
        remainingMaps.delete(team1Ban2);
        bans.team1.push(team1Ban2);
      }

      // Alternating picks for the remaining maps
      let team1Turn = true;
      while (selectedMaps.length < 5 && remainingMaps.size > 0) {
        const currentProbs = team1Turn ? team1Probabilities : team2Probabilities;
        const nextPick = Object.values(currentProbs)
          .filter(p => remainingMaps.has(p.map))
          .sort((a, b) => {
            const probDiff = b.probability - a.probability;
            return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
          })[0]?.map;
        if (nextPick) {
          remainingMaps.delete(nextPick);
          selectedMaps.push(nextPick);
        }
        team1Turn = !team1Turn;
      }
    } else {
      // Original BO5 logic
      // Team 1 Ban
      const team1Ban = Object.values(team1Probabilities)
        .filter(p => remainingMaps.has(p.map))
        .sort((a, b) => {
          const probDiff = a.probability - b.probability;
          return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
        })[0]?.map;
      if (team1Ban) {
        remainingMaps.delete(team1Ban);
        bans.team1.push(team1Ban);
      }

      // Team 2 Ban
      const team2Ban = Object.values(team2Probabilities)
        .filter(p => remainingMaps.has(p.map))
        .sort((a, b) => {
          const probDiff = a.probability - b.probability;
          return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
        })[0]?.map;
      if (team2Ban) {
        remainingMaps.delete(team2Ban);
        bans.team2.push(team2Ban);
      }

      // Alternating picks
      let team1Turn = true;
      while (selectedMaps.length < 5 && remainingMaps.size > 0) {
        const currentProbs = team1Turn ? team1Probabilities : team2Probabilities;
        const nextPick = Object.values(currentProbs)
          .filter(p => remainingMaps.has(p.map))
          .sort((a, b) => {
            const probDiff = b.probability - a.probability;
            return probDiff === 0 ? a.map.localeCompare(b.map) : probDiff;
          })[0]?.map;
        if (nextPick) {
          remainingMaps.delete(nextPick);
          selectedMaps.push(nextPick);
        }
        team1Turn = !team1Turn;
      }
    }
  }

  return { selectedMaps, bans };
} 