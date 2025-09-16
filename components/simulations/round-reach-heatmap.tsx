'use client';

import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import { useState, useMemo } from 'react';

interface SimulationResult {
    team: string;
    teamName: string;
    championships: number;
    finalist: number;
    top3: number;
    top4: number;
    top6: number;
    top8: number;
}

interface RoundReachHeatmapProps {
    data: SimulationResult[];
}

type SortKey = keyof Omit<SimulationResult, 'team' | 'teamName'>;

const ROUNDS: { key: SortKey; label: string }[] = [
    { key: 'top8', label: 'Top 8' },
    { key: 'top6', label: 'Top 6' },
    { key: 'top4', label: 'Top 4' },
    { key: 'top3', label: 'Top 3' },
    { key: 'finalist', label: 'Finals' },
    { key: 'championships', label: 'Champion' },
];

export function RoundReachHeatmap({ data }: RoundReachHeatmapProps) {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'championships', direction: 'desc' });

    const sortedData = useMemo(() => {
        const sortableData = [...data];
        sortableData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
        return sortableData;
    }, [data, sortConfig]);

    const requestSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const getColorStyle = (prob: number) => {
        const p = prob / 100;
        // Interpolate between a dark green and a bright green
        const startColor = [28, 69, 50]; // ~ green-800
        const endColor = [34, 197, 94]; // ~ green-500

        const r = Math.round(startColor[0] * (1 - p) + endColor[0] * p);
        const g = Math.round(startColor[1] * (1 - p) + endColor[1] * p);
        const b = Math.round(startColor[2] * (1 - p) + endColor[2] * p);
        
        return { backgroundColor: `rgb(${r}, ${g}, ${b})` };
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800">
                    <tr>
                        <th scope="col" className="sticky top-0 left-0 z-20 bg-gray-800 py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Team</th>
                        {ROUNDS.map(round => (
                            <th key={round.key} scope="col" className="sticky top-0 z-10 bg-gray-800 px-3 py-3.5 text-center text-sm font-semibold text-white cursor-pointer" onClick={() => requestSort(round.key)}>
                                {round.label}
                                {sortConfig.key === round.key && (
                                    <span>{sortConfig.direction === 'desc' ? ' ▼' : ' ▲'}</span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-900">
                    {sortedData.map(team => (
                        <tr key={team.team}>
                            <td className="sticky left-0 bg-gray-900 whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">
                                <div className="flex items-center gap-2">
                                    <div className="relative w-6 h-6 shrink-0">
                                        <Image
                                            src={TEAM_LOGOS[team.team as keyof typeof TEAM_LOGOS]}
                                            alt={team.teamName}
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span>{team.teamName}</span>
                                </div>
                            </td>
                            {ROUNDS.map(round => (
                                <td key={round.key} className="p-4 text-center" style={getColorStyle(team[round.key])}>
                                    {(team[round.key]).toFixed(1)}%
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
