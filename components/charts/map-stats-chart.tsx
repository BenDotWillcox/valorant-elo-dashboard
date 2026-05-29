'use client';

import Image from 'next/image';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';
import { TeamMapData } from '@/types/elo';
import { TEAM_COLORS, TEAM_SLUG_TO_COLOR } from '@/lib/constants/colors';
import { TEAM_LOGOS } from '@/lib/constants/images';

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
      logoUrl: TEAM_LOGOS[teamSlug as keyof typeof TEAM_LOGOS] || teamData.logoUrl,
      color: TEAM_SLUG_TO_COLOR[teamSlug] || TEAM_COLORS[teamData.teamName as keyof typeof TEAM_COLORS] || '#888',
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
    <div className="w-full max-w-[500px] mx-auto">
      <div className="mb-2 flex flex-wrap items-center justify-center gap-3">
        {allTeamMapData.map(team => (
          <div key={team!.teamSlug} className="flex items-center gap-2 text-xs font-medium">
            <span
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background p-0.5 shadow-sm"
              style={{ borderColor: team!.color }}
            >
              {team!.logoUrl ? (
                <Image
                  src={team!.logoUrl}
                  alt={`${team!.teamName} logo`}
                  width={22}
                  height={22}
                  className="h-full w-full rounded-full object-contain"
                />
              ) : null}
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background"
                style={{ backgroundColor: team!.color }}
              />
            </span>
            <span className="max-w-[120px] truncate">{team!.teamName}</span>
          </div>
        ))}
      </div>
      <div className="aspect-[4/3]">
        <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis 
            dataKey="map" 
            tick={{ fill: '#9aa0a6', fontSize: '12px' }}
          />
          {allTeamMapData.map(team => (
            <Radar
              key={team!.teamSlug}
              name={team!.teamName}
              dataKey={team!.teamName}
              stroke={team!.color}
              fill={team!.color}
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
    </div>
  );
} 
