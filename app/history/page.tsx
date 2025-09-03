'use client';

import { HistoryFilters } from "@/components/filters/history-filters";
import { EloHistoryChart } from "@/components/charts/elo-history-chart";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { TeamData, EloHistoryData } from "@/types/elo";
import { Season } from "@/db/schema";
import { debounce } from 'lodash';
import { getTeamRegion } from "@/lib/constants/regions";
import { UPCOMING_TOURNAMENT_QUALIFIED_TEAMS, UPCOMING_TOURNAMENT_NAME } from "@/lib/constants/tournaments";
import { useIsMobile } from "@/hooks/use-mobile";

type ViewType = 'byTeam' | 'byMap';

export default function HistoryPage() {
  const [viewType, setViewType] = useState<ViewType>('byTeam');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [data, setData] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number>();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [showUpcomingTournamentOnly, setShowUpcomingTournamentOnly] = useState(false);
  const isMobile = useIsMobile();

  // Fetch initial data with current season
  useEffect(() => {
    setLoading(true);
    // First get seasons to find active season
    fetch('/api/seasons')
      .then(res => res.json())
      .then(seasonsData => {
        setSeasons(seasonsData);
        const activeSeason = seasonsData.find((s: Season) => s.is_active);
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

          // Default selection on initial load for 'byTeam' view
          if (viewType === 'byTeam') {
            const teamNameToSelect = "100 Thieves";
            let teamToSelect = groupedData.find(t => t.teamName === teamNameToSelect);

            // Fallback to the first team alphabetically if the preferred team isn't found
            if (!teamToSelect && groupedData.length > 0) {
              teamToSelect = [...groupedData].sort((a, b) => a.teamName.localeCompare(b.teamName))[0];
            }

            if (teamToSelect) {
              const teamMaps = teamToSelect.data.map(d => d.mapName);
              const uniqueMaps = Array.from(new Set(teamMaps));
              
              setSelectedMaps(uniqueMaps);
              const newTeams = uniqueMaps.map(map => `${map}-${teamToSelect.teamName}`);
              setSelectedTeams(newTeams);
            }
          }
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
    const qualifiedTeamsData = data.filter(team => UPCOMING_TOURNAMENT_QUALIFIED_TEAMS.includes(team.teamSlug));
    const sourceData = showUpcomingTournamentOnly ? qualifiedTeamsData : data;

    if (viewType === 'byMap') {
      const mapToSelect = 'Haven';
      
      if (showUpcomingTournamentOnly) {
          const qualifiedTeamsOnMap = sourceData.filter(team => team.data.some(d => d.mapName === mapToSelect));

          if (qualifiedTeamsOnMap.length > 0) {
              setSelectedMaps([mapToSelect]);
              setSelectedTeams(qualifiedTeamsOnMap.map(team => `${mapToSelect}-${team.teamName}`));
          } else {
              setSelectedTeams([]);
              setSelectedMaps([]);
          }
      } else {
          // When switching to byMap view, default to Haven and Americas
          const regionToSelect = 'Americas';
          
          const teamsInRegion = sourceData
            .filter(team => getTeamRegion(team.teamSlug) === regionToSelect)
            .filter(team => team.data.some(d => d.mapName === mapToSelect));

          if (teamsInRegion.length > 0) {
            setSelectedMaps([mapToSelect]);
            setSelectedTeams(teamsInRegion.map(team => `${mapToSelect}-${team.teamName}`));
          } else {
            // Fallback if no teams in Americas played on Haven
            setSelectedTeams([]);
            setSelectedMaps([]);
          }
      }
    } else { // byTeam
      // When switching to byTeam view, clear map selections and repopulate with default
      setSelectedMaps([]);
      
      const teamNameToSelect = "100 Thieves";
      let teamToSelect = sourceData.find(t => t.teamName === teamNameToSelect);

      if (!teamToSelect && sourceData.length > 0) {
        teamToSelect = [...sourceData].sort((a, b) => a.teamName.localeCompare(b.teamName))[0];
      }

      if (teamToSelect) {
        const teamMaps = teamToSelect.data.map(d => d.mapName);
        const uniqueMaps = Array.from(new Set(teamMaps));
        
        setSelectedMaps(uniqueMaps);
        setSelectedTeams(uniqueMaps.map(map => `${map}-${teamToSelect.teamName}`));
      } else {
        setSelectedTeams([]);
      }
    }
  }, [viewType, data, showUpcomingTournamentOnly]);

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

  const generateChartDescription = () => {
    const season = seasons.find(s => s.id === selectedSeason);
    const seasonName = season ? season.year : '';

    if (viewType === 'byTeam') {
        const teamNames = Array.from(new Set(selectedTeams.map(t => t.split('-')[1])));
        if (teamNames.length === 0) return 'Select a team to get started';
        return `${seasonName} - ${teamNames.join(', ')}`;
    }

    if (viewType === 'byMap') {
        if (selectedMaps.length === 0) return 'Select a map to get started';

        if (showUpcomingTournamentOnly) {
            return `${seasonName} - ${selectedMaps.join(', ')} - ${UPCOMING_TOURNAMENT_NAME} Teams Only`;
        }

        const selectedRegions = Array.from(new Set(selectedTeams.map(teamKey => {
            const teamName = teamKey.split('-')[1];
            const team = data.find(t => t.teamName === teamName);
            return team ? getTeamRegion(team.teamSlug) : 'Unknown';
        }))).sort();

        return `${seasonName} - ${selectedMaps.join(', ')} - ${selectedRegions.join(', ')}`;
    }

    return '';
  };

  const chartDescription = useMemo(generateChartDescription, [
    viewType,
    selectedTeams,
    selectedMaps,
    seasons,
    selectedSeason,
    data,
    showUpcomingTournamentOnly,
  ]);

  const mainContentClass = isMobile
    ? "px-4 flex-1"
    : `px-4 flex-1 transition-all duration-300`;

  if (loading) {
    return (
      <div className="relative">
        <div className="flex min-h-[calc(100vh-12rem)]">
          {!isMobile && (
            <div className="sticky top-16 self-start h-[calc(100vh-4rem)] flex-shrink-0 bg-background overflow-y-auto scrollbar-hide">
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
                showUpcomingTournamentOnly={showUpcomingTournamentOnly}
                setShowUpcomingTournamentOnly={setShowUpcomingTournamentOnly}
                seasons={seasons}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
              />
            </div>
          )}

          <div className={mainContentClass}>
            <h1 className="text-2xl md:text-4xl font-bold text-green-500 dark:text-green-400 font-display text-center mb-8">
              Elo Rating History
            </h1>
            <h2 className="text-lg font-semibold text-center mb-4 text-muted-foreground">{chartDescription}</h2>
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
      <div className="flex min-h-[calc(100vh-12rem)]">
        {!isMobile && (
          <div className="sticky top-16 self-start h-[calc(100vh-4rem)] flex-shrink-0 bg-background overflow-y-auto scrollbar-hide">
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
              showUpcomingTournamentOnly={showUpcomingTournamentOnly}
              setShowUpcomingTournamentOnly={setShowUpcomingTournamentOnly}
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
            />
          </div>
        )}
        
        {isMobile && (
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
            showUpcomingTournamentOnly={showUpcomingTournamentOnly}
            setShowUpcomingTournamentOnly={setShowUpcomingTournamentOnly}
            seasons={seasons}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
          />
        )}

        <div className={mainContentClass}>
          <h1 className="text-2xl md:text-4xl font-bold text-green-500 dark:text-green-400 font-display text-center mb-8">
            Elo Rating History
          </h1>
          <h2 className="text-lg font-semibold text-center mb-4 text-muted-foreground">{chartDescription}</h2>
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

