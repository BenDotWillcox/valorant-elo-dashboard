import { MAP_POOL } from "@/lib/constants/maps";

export interface MapProbabilities {
    [key: string]: { probability: number; map: string; };
}

function calculateWinProbability(elo1: number, elo2: number): [number, number] {
    const prob1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 1000));
    return [prob1, 1 - prob1];
}

function getOptimalMapSelection(
    maps: string[],
    team1Probabilities: MapProbabilities,
    team2Probabilities: MapProbabilities,
) {
    const remainingMaps = new Set(maps);
    const selectedMaps: string[] = [];
    
    const team1Ban = Object.values(team1Probabilities).filter(p => remainingMaps.has(p.map)).sort((a,b) => a.probability - b.probability)[0].map;
    remainingMaps.delete(team1Ban);
  
    const team2Ban = Object.values(team2Probabilities).filter(p => remainingMaps.has(p.map)).sort((a,b) => a.probability - b.probability)[0].map;
    remainingMaps.delete(team2Ban);
  
    const team1Pick = Object.values(team1Probabilities).filter(p => remainingMaps.has(p.map)).sort((a,b) => b.probability - a.probability)[0].map;
    remainingMaps.delete(team1Pick);
    selectedMaps.push(team1Pick);
  
    const team2Pick = Object.values(team2Probabilities).filter(p => remainingMaps.has(p.map)).sort((a,b) => b.probability - a.probability)[0].map;
    remainingMaps.delete(team2Pick);
    selectedMaps.push(team2Pick);
  
    selectedMaps.push(Array.from(remainingMaps)[0]);
  
    return { selectedMaps };
}

export function calculateBo3MatchWinProb(team1Slug: string, team2Slug: string, eloData: Record<string, Record<string, number>>): number {
    if (!eloData || !eloData[team1Slug] || !eloData[team2Slug]) return 0.5;

    const team1Elo = eloData[team1Slug];
    const team2Elo = eloData[team2Slug];
    const maps = MAP_POOL.active;

    const team1Probs = maps.reduce((acc, map) => {
        const [prob1] = calculateWinProbability(team1Elo[map] || 1000, team2Elo[map] || 1000);
        acc[map] = { probability: prob1, map };
        return acc;
    }, {} as MapProbabilities);

    const team2Probs = maps.reduce((acc, map) => {
        const [, prob2] = calculateWinProbability(team1Elo[map] || 1000, team2Elo[map] || 1000);
        acc[map] = { probability: prob2, map };
        return acc;
    }, {} as MapProbabilities);

    const { selectedMaps } = getOptimalMapSelection(maps, team1Probs, team2Probs);
    const mapWinProbs = selectedMaps.map(map => calculateWinProbability(team1Elo[map] || 1000, team2Elo[map] || 1000)[0]);
    
    const [p1, p2, p3] = mapWinProbs;
    return (p1 * p2) + (p1 * (1 - p2) * p3) + ((1 - p1) * p2 * p3);
} 