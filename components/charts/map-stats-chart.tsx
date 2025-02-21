'use client';

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';
import { TeamMapData } from '@/types/elo';
import { TEAM_COLORS } from '@/lib/constants/colors';

interface MapStatsChartProps {
  data: TeamMapData[];
  selectedTeams: string[];
}

export function MapStatsChart({ data, selectedTeams }: MapStatsChartProps) {
  if (!selectedTeams.length) return null;

  const allTeamMapData = selectedTeams.map(teamSlug => {
    const teamData = data.find(d => d.teamSlug === teamSlug);
    if (!teamData) return null;

    const teamMaps = new Set(
      data
        .filter(d => d.teamSlug === teamSlug)
        .map(d => d.mapName)
    );

    const teamMapData = Array.from(teamMaps).reduce((acc: Record<string, number>, mapName) => {
      const mapData = data.find(d => d.teamSlug === teamSlug && d.mapName === mapName);
      if (mapData) {
        acc[mapName] = parseFloat(mapData.rating);
      }
      return acc;
    }, {});

    return {
      teamSlug,
      teamName: teamData.teamName,
      data: teamMapData
    };
  }).filter(Boolean);

  const allMaps = new Set(
    allTeamMapData.flatMap(team => Object.keys(team!.data))
  );

  const chartData = Array.from(allMaps)
    .sort((a, b) => a.localeCompare(b))
    .map(map => ({
      map,
      ...Object.fromEntries(
        allTeamMapData.map(team => [team!.teamName, team!.data[map] || 0])
      )
    }));

  return (
    <div className="w-full max-w-[500px] mx-auto aspect-[4/3]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis 
            dataKey="map" 
            tick={{ fill: '#888', fontSize: '12px' }}
          />
          {allTeamMapData.map(team => (
            <Radar
              key={team!.teamSlug}
              name={team!.teamName}
              dataKey={team!.teamName}
              stroke={TEAM_COLORS[team!.teamName as keyof typeof TEAM_COLORS] || '#888'}
              fill={TEAM_COLORS[team!.teamName as keyof typeof TEAM_COLORS] || '#888'}
              fillOpacity={0.3}
            />
          ))}
          <Tooltip 
            formatter={(value: number, name: string) => [Math.round(value), name]}
            labelFormatter={(label) => label}
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px'
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
} 