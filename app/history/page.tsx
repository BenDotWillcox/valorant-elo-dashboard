'use client';

import { HistoryFilters } from "@/components/filters/history-filters";
import { EloHistoryChart } from "@/components/charts/elo-history-chart";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { TeamData, EloHistoryData } from "@/types/elo";
import { SeasonSelector } from "@/components/season-selector";
import { Season } from "@/db/schema";
import { debounce } from 'lodash';

type ViewType = 'byTeam' | 'byMap';

export default function HistoryPage() {
  const [viewType, setViewType] = useState<ViewType>('byTeam');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [data, setData] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number>();

  // Fetch initial data with current season
  useEffect(() => {
    setLoading(true);
    // First get seasons to find active season
    fetch('/api/seasons')
      .then(res => res.json())
      .then(seasons => {
        const activeSeason = seasons.find((s: Season) => s.is_active);
        if (activeSeason) {
          setSelectedSeason(activeSeason.id);
          // Then fetch data for active season
          return fetch(`/api/elo-history?seasonId=${activeSeason.id}`);
        }
      })
      .then(res => res?.json())
      .then(data => {
        if (data) {
          const groupedData = processData(data);
          setData(groupedData);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });
  }, []); // Empty dependency array for initial load

  // Add this effect to handle view type changes
  useEffect(() => {
    if (viewType === 'byMap') {
      // When switching to byMap view, clear team selections but keep map selections
      setSelectedTeams([]);
    } else {
      // When switching to byTeam view, clear map selections
      setSelectedMaps([]);
    }
  }, [viewType]);

  // Modify handleSeasonChange to not reset selections
  const handleSeasonChange = useCallback((data: EloHistoryData[]) => {
    const groupedData = processData(data);
    setData(groupedData);
    setLoading(false);
  }, []);

  // Add debounced callback
  const debouncedHandleSeasonChange = useMemo(
    () => debounce((data: EloHistoryData[]) => handleSeasonChange(data), 300),
    [handleSeasonChange]
  );

  // Then update the useEffect
  useEffect(() => {
    if (!selectedSeason) return;
    
    setLoading(true);
    fetch(`/api/elo-history?seasonId=${selectedSeason}`)
      .then(res => res.json())
      .then(data => debouncedHandleSeasonChange(data))
      .catch(error => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });

    return () => {
      debouncedHandleSeasonChange.cancel();
    };
  }, [selectedSeason, debouncedHandleSeasonChange]);

  if (loading) {
    return (
      <div className="relative">
        <div className="container mx-auto p-4">
          <div className="flex items-center mb-8">
            <div className="w-64 opacity-0 flex-shrink-0">
              {/* Empty div to balance layout */}
            </div>
            <h1 className="flex-1 text-2xl md:text-4xl font-bold text-purple-600 dark:text-purple-400 font-display text-center">
              Elo Rating History
            </h1>
            <div className="w-64 flex-shrink-0 flex justify-end">
              <SeasonSelector onSeasonChange={setSelectedSeason} />
            </div>
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)]">
          <div className="w-64 flex-shrink-0 border-r fixed left-0 top-[64px] bottom-0 bg-background overflow-y-auto scrollbar-hide">
            <HistoryFilters
              data={data}
              viewType={viewType}
              setViewType={setViewType}
              selectedTeams={selectedTeams}
              setSelectedTeams={setSelectedTeams}
              selectedMaps={selectedMaps}
              setSelectedMaps={setSelectedMaps}
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
            />
          </div>

          <div className="flex-1 pl-72 pr-4">
            <EloHistoryChart
              data={data}
              viewType={viewType}
              selectedTeams={selectedTeams}
              selectedMaps={selectedMaps}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="container mx-auto p-4">
        <div className="flex items-center mb-8">
          <div className="w-64 opacity-0 flex-shrink-0">
            {/* Empty div to balance layout */}
          </div>
          <h1 className="flex-1 text-2xl md:text-4xl font-bold text-purple-600 dark:text-purple-400 font-display text-center">
            Elo Rating History
          </h1>
          <div className="w-64 flex-shrink-0 flex justify-end">
            <SeasonSelector onSeasonChange={setSelectedSeason} />
          </div>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-12rem)]">
        <div className="w-64 flex-shrink-0 border-r fixed left-0 top-[64px] bottom-0 bg-background overflow-y-auto scrollbar-hide">
          <HistoryFilters
            data={data}
            viewType={viewType}
            setViewType={setViewType}
            selectedTeams={selectedTeams}
            setSelectedTeams={setSelectedTeams}
            selectedMaps={selectedMaps}
            setSelectedMaps={setSelectedMaps}
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
          />
        </div>

        <div className="flex-1 pl-72 pr-4">
          <EloHistoryChart
            data={data}
            viewType={viewType}
            selectedTeams={selectedTeams}
            selectedMaps={selectedMaps}
          />
        </div>
      </div>
    </div>
  );
}

function processData(data: EloHistoryData[]): TeamData[] {
  // Sort data by date first to ensure chronological order
  const sortedData = [...data].sort((a, b) => 
    new Date(a.ratingDate).getTime() - new Date(b.ratingDate).getTime()
  );

  console.log('Processing data points:', sortedData.length);

  const groupedData = sortedData.reduce((acc: Record<string, TeamData>, item: EloHistoryData) => {
    if (!acc[item.teamId]) {
      console.log(`Creating new team entry for ${item.teamName} (${item.teamId})`);
      acc[item.teamId] = {
        teamId: item.teamId,
        teamName: item.teamName,
        teamSlug: item.teamSlug,
        data: []
      };
    }

    const currentDate = new Date(item.ratingDate).getTime();
    const prevPoint = acc[item.teamId].data[acc[item.teamId].data.length - 1];

    // Add step point (if not first point and dates are different)
    if (prevPoint && prevPoint.ratingDate !== currentDate) {
      acc[item.teamId].data.push({
        ...prevPoint,
        ratingDate: currentDate - 1,
        isInterpolated: true
      });
    }

    // Add actual point
    acc[item.teamId].data.push({
      rating: item.rating,
      ratingDate: currentDate,
      opponent: item.opponentName,
      score: item.isWinner 
        ? `${item.winnerScore}-${item.loserScore}`
        : `${item.loserScore}-${item.winnerScore}`,
      mapName: item.mapName,
      prevRating: 1000,
      teamName: item.teamName,
      opponentName: item.opponentName
    });

    return acc;
  }, {});

  // Fix debug logging types
  Object.entries(groupedData).forEach(([, team]: [string, TeamData]) => {
    console.log(`Team ${team.teamName}: ${team.data.length} points`);
    team.data.sort((a, b) => a.ratingDate - b.ratingDate);
  });

  return Object.values(groupedData);
}

