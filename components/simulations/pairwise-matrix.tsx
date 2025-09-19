'use client';

import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import { MAP_POOL } from "@/lib/constants/maps";
import { calculateBo3MatchWinProb } from '@/lib/predictions/client-match-simulation';

// --- Client-side Prediction Logic ---

interface MapProbabilities {
    [key: string]: { probability: number; map: string; };
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
