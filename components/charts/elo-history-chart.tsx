'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TeamLogoDot } from "@/components/charts/team-logo-dot";
import { TEAM_COLORS, MAP_COLORS } from "@/lib/constants/colors";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { TeamData, EloHistoryData, EloDataPoint } from "@/types/elo";
/* eslint-enable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import { EloTooltip } from "./elo-tooltip";
import { useIsMobile } from '@/hooks/use-mobile';

interface EloHistoryChartProps {
  data: TeamData[];
  selectedTeams: string[];
  selectedMaps: string[];
  viewType: 'byTeam' | 'byMap';
}

interface TooltipPayload {
  value: number;
  name: string;
  payload: EloDataPoint;  // Use EloDataPoint directly since it has score as string
}

export function EloHistoryChart({ data, selectedTeams, selectedMaps, viewType }: EloHistoryChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    payload: TooltipPayload;
    coords: { x: number; y: number };
  } | null>(null);
  const isMobile = useIsMobile();

  const handlePointMouseEnter = (event: React.MouseEvent, payload: EloDataPoint) => {
    const rect = (event.target as Element).getBoundingClientRect();
    setHoveredPoint({
      payload: {
        value: payload.rating,
        name: payload.teamName,
        payload: payload
      },
      coords: {
        x: rect.left + rect.width / 2,
        y: rect.top
      }
    });
  };

  const handlePointMouseLeave = () => {
    setHoveredPoint(null);
  };

  const getEloRange = (data: TeamData[]) => {
    const allRatings = data.flatMap(team => 
      team.data.map(d => d.rating)
    );
    return {
      min: Math.floor(Math.min(...allRatings, 0) / 200) * 200,
      max: Math.ceil(Math.max(...allRatings) / 200) * 200
    };
  };

  function getDateTicks(selectedData: { ratingDate: number }[]) {
    if (!selectedData.length) return [];
    const dates = selectedData.map(d => d.ratingDate);
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    
    const ticks = [];
    let currentDate = minDate;
    while (currentDate <= maxDate) {
      ticks.push(currentDate);
      currentDate += 14 * 24 * 60 * 60 * 1000;
    }
    return ticks;
  }

  // Get all selected data points
  const selectedData = selectedTeams.flatMap(teamKey => {
    const [mapName, teamName] = teamKey.split('-');
    const teamData = data.find(t => t.teamName === teamName);
    
    if (!teamData) return [];

    // For byTeam view, filter by both team and map
    if (viewType === 'byTeam') {
      return teamData.data.filter(d => d.mapName === mapName);
    }
    
    // For byMap view, show all data points for the selected maps for this team
    return teamData.data.filter(d => d.mapName === mapName && selectedMaps.includes(d.mapName));
  });

  const eloRange = getEloRange(data); // Keep global range for y-axis
  const ticks = Array.from(
    { length: (eloRange.max - eloRange.min) / 200 + 1 },
    (_, i) => eloRange.min + (i * 200)
  );

  return (
    <div className="relative h-[400px] md:h-[600px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          margin={{ 
            top: 20, 
            right: isMobile ? 20 : 110, 
            left: 10,  // Add some left margin for the y-axis
            bottom: 60 // Increased bottom margin for rotated labels
          }} 
          onMouseLeave={handlePointMouseLeave}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#333"
          />
          <XAxis 
            type="number"
            dataKey="ratingDate"
            domain={selectedData.length ? ['dataMin', 'dataMax'] : ['auto', 'auto']}
            scale="time"
            tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
            ticks={getDateTicks(selectedData)}
            interval={0}
            stroke="#888"
            tick={{ 
              fill: '#888',
              fontSize: '0.75rem', // Smaller font on mobile
            }}
            angle={-45} // Rotate labels
            textAnchor="end"
            height={60} // Increase height for rotated labels
          />
          <YAxis 
            domain={[eloRange.min, eloRange.max]}
            ticks={ticks}
            tickFormatter={(value) => Math.round(value).toString()}
            stroke="#888"
            tick={{ 
              fill: '#888',
              fontSize: '0.75rem'
            }}
            width={45} // Slightly wider to ensure numbers don't get cut off
          />
          <Tooltip 
            content={({ payload }) => {
              if (!payload?.length || payload[0].payload.isInterpolated) return null;
              // ... rest of tooltip code
            }}
          />
          {selectedTeams.map(teamKey => {
            const [mapName, teamName] = teamKey.split('-');
            const teamData = data
              .find(t => t.teamName === teamName)
              ?.data.filter(d => d.mapName === mapName)
              // Filter out games that are within 45 minutes of each other or have no Elo change
              .reduce((acc: EloDataPoint[], d: EloDataPoint) => {
                if (acc.length === 0) {
                  acc.push({
                    rating: d.rating,
                    ratingDate: d.ratingDate,
                    opponent: d.opponent,
                    score: d.score,
                    mapName: d.mapName,
                    prevRating: 1000,
                    isDataPoint: true,
                    teamName: d.teamName,
                    opponentName: d.opponentName
                  });
                  return acc;
                }
                
                const prevGame = acc[acc.length - 1];
                const timeDiff = new Date(d.ratingDate).getTime() - new Date(prevGame.ratingDate).getTime();
                const minDiff = 45 * 60 * 1000;
                const eloDiff = Math.abs(d.rating - prevGame.rating);
                
                if (timeDiff > minDiff && eloDiff > 0) {
                  acc.push({
                    rating: d.rating,
                    ratingDate: d.ratingDate,
                    opponent: d.opponent,
                    score: d.score,
                    mapName: d.mapName,
                    prevRating: prevGame.rating,
                    teamName: d.teamName,
                    opponentName: d.opponentName,
                    isDataPoint: true
                  });
                }
                return acc;
              }, []);

            return (
              <Line 
                key={teamKey}
                data={teamData}
                type="stepAfter"
                dataKey="rating"
                stroke={viewType === 'byMap' 
                  ? TEAM_COLORS[teamName as keyof typeof TEAM_COLORS] 
                  : MAP_COLORS[mapName as keyof typeof MAP_COLORS]}
                name={viewType === 'byMap' 
                  ? `${teamName} - ${mapName}` 
                  : mapName}
                strokeWidth={Math.max(2, 4 - (selectedTeams.length * 0.3))}
                dot={viewType === 'byMap' ? (
                  (props) => (
                    <TeamLogoDot 
                      {...props}
                      teamSlug={data.find(t => t.teamName === teamName)?.teamSlug || ''} 
                      totalSelected={selectedTeams.length}
                      viewType={viewType}
                      mapName={mapName}
                      onMouseEnter={handlePointMouseEnter}
                      onMouseLeave={handlePointMouseLeave}
                    />
                  )
                ) : (
                  (props) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={Math.max(4, 6 - (selectedTeams.length * 0.4))}
                      fill={MAP_COLORS[mapName as keyof typeof MAP_COLORS]}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => handlePointMouseEnter(e, props.payload as EloDataPoint)}
                      onMouseLeave={handlePointMouseLeave}
                    />
                  )
                )}
                activeDot={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {hoveredPoint && (
        <EloTooltip 
          active={true}
          payload={[{ payload: hoveredPoint.payload }]}
          teamColors={TEAM_COLORS}
          coordinate={hoveredPoint.coords}
        />
      )}
    </div>
  );
} 