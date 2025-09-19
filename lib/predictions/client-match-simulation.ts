import { MAP_POOL } from "@/lib/constants/maps";
import { getOptimalMapSelection } from "./map-selection";

export interface MapProbabilities {
    [key: string]: { probability: number; map: string; };
}

function calculateWinProbability(elo1: number, elo2: number): [number, number] {
    const prob1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 1000));
    return [prob1, 1 - prob1];
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

    const { selectedMaps } = getOptimalMapSelection(maps, team1Probs, team2Probs, 'BO3');
    const mapWinProbs = selectedMaps.map(map => calculateWinProbability(team1Elo[map] || 1000, team2Elo[map] || 1000)[0]);
    
    const [p1, p2, p3] = mapWinProbs;
    return (p1 * p2) + (p1 * (1 - p2) * p3) + ((1 - p1) * p2 * p3);
} 