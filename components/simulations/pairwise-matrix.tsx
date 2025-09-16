'use client';

import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import { MAP_POOL } from "@/lib/constants/maps";

// --- Client-side Prediction Logic ---

interface MapProbabilities {
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

function calculateBo3MatchWinProb(team1Slug: string, team2Slug: string, eloData: Record<string, Record<string, number>>): number {
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

const getColorStyle = (prob: number) => {
    const p = prob / 100;
    // Interpolate from red to green through yellow
    const r = p > 0.5 ? Math.round(255 - 255 * (p - 0.5) * 2) : 255;
    const g = p < 0.5 ? Math.round(255 * p * 2) : 255;
    return { backgroundColor: `rgba(${r}, ${g}, 0, 0.5)` };
};

// --- Component ---

interface SimulationResult {
    team: string;
    teamName: string;
}
  
interface PairwiseMatrixProps {
    data: SimulationResult[];
    eloData: Record<string, Record<string, number>> | null;
}

export function PairwiseMatrix({ data, eloData }: PairwiseMatrixProps) {

    if (!data || !eloData) {
        return null;
    }

    const teams = data.map(d => ({ slug: d.team, name: d.teamName }));

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
                <thead>
                    <tr>
                        <th className="sticky left-0 bg-gray-800 p-2 border border-gray-700"></th>
                        {teams.map(team => (
                            <th key={team.slug} className="p-2 border border-gray-700">
                                <div className="relative w-8 h-8 mx-auto">
                                    <Image
                                        src={TEAM_LOGOS[team.slug as keyof typeof TEAM_LOGOS]}
                                        alt={team.name}
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {teams.map(rowTeam => (
                        <tr key={rowTeam.slug}>
                            <th className="sticky left-0 bg-gray-800 p-2 border border-gray-700">
                                <div className="relative w-8 h-8 mx-auto">
                                    <Image
                                        src={TEAM_LOGOS[rowTeam.slug as keyof typeof TEAM_LOGOS]}
                                        alt={rowTeam.name}
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            </th>
                            {teams.map(colTeam => {
                                if (rowTeam.slug === colTeam.slug) {
                                    return <td key={colTeam.slug} className="p-4 text-center border border-gray-700 bg-gray-700">-</td>;
                                }
                                const winProb = calculateBo3MatchWinProb(rowTeam.slug, colTeam.slug, eloData) * 100;
                                return (
                                    <td key={colTeam.slug} className="p-4 text-center border border-gray-700" style={getColorStyle(winProb)}>
                                        {winProb.toFixed(1)}%
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
