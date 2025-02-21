'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { format, subDays } from 'date-fns';
import { StatCarousel } from '@/components/stats/stat-carousel';
import { PerfectGamesScroll } from '@/components/stats/perfect-games-scroll';
import { UpsetCarousel } from '@/components/stats/upset-carousel';
import { MapPopularityChart } from '@/components/stats/map-popularity-chart';

interface Team {
  seasonYear: number;
  teamName: string;
  teamSlug: string;
  logoUrl: string;
  globalRating: number;
  peakDate?: string;
  lowestDate?: string;
}

interface MapSpecialist {
  seasonYear: number;
  teamName: string;
  teamSlug: string;
  logoUrl: string;
  mapName: string;
  mapOffset: number;
}

interface Streak {
  start_date: string;
  end_date: string;
  team_name: string;
  team_slug: string;
  logo_url: string;
  map_name: string;
  streak_length: number;
  avg_margin: number;
}

interface MapRating {
  teamName: string;
  teamSlug: string;
  mapName: string;
  effectiveRating: number;
  achievedAt: string;
  seasonYear: number;
}

export default function HallOfFamePage() {
  const [upsets, setUpsets] = useState([]);
  const [winStreaks, setWinStreaks] = useState<Streak[]>([]);
  const [loseStreaks, setLoseStreaks] = useState<Streak[]>([]);
  const [perfectGames, setPerfectGames] = useState([]);
  const [greatestTeams, setGreatestTeams] = useState<Team[]>([]);
  const [worstTeams, setWorstTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapPopularity, setMapPopularity] = useState([]);
  const [selectedStartDate, setSelectedStartDate] = useState(subDays(new Date(), 30));
  const [selectedEndDate, setSelectedEndDate] = useState(new Date());
  const [topMaps, setTopMaps] = useState<MapRating[]>([]);
  const [worstMaps, setWorstMaps] = useState<MapRating[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/hall-of-fame/upsets').then(res => res.json()),
      fetch('/api/hall-of-fame/win-streaks').then(res => res.json()),
      fetch('/api/hall-of-fame/lose-streaks').then(res => res.json()),
      fetch('/api/hall-of-fame/perfect-games').then(res => res.json()),
      fetch('/api/hall-of-fame/greatest-teams').then(res => res.json()),
      fetch('/api/hall-of-fame/worst-teams').then(res => res.json()),
      fetch('/api/hall-of-fame/top-maps').then(res => res.json()),
      fetch('/api/hall-of-fame/worst-maps').then(res => res.json()),
    ]).then(([ups, streaks, loseStreaks, perfect, greatest, worstTeams, topMaps, worstMaps]) => {
      setUpsets(ups);
      setWinStreaks(streaks);
      setLoseStreaks(loseStreaks);
      setPerfectGames(perfect);
      setGreatestTeams(greatest);
      setWorstTeams(worstTeams);
      setTopMaps(topMaps);
      setWorstMaps(worstMaps);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams({
        startDate: selectedStartDate.toISOString(),
        endDate: selectedEndDate.toISOString()
      });
      
      const response = await fetch(`/api/stats/map-popularity?${params}`);
      const data = await response.json();
      setMapPopularity(data);
    };

    fetchData();
  }, [selectedStartDate, selectedEndDate]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-purple-600 dark:text-purple-400 font-display">
        Hall of Fame
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 auto-rows-auto">
        {/* Top Row - Best Performers */}
        <StatCarousel title="Greatest Teams" tooltip="Teams that achieved the highest global Elo ratings across all seasons" data={greatestTeams} renderContent={(team) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              Season {team.seasonYear}
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="relative w-8 h-8">
                <Image
                  src={TEAM_LOGOS[team.teamSlug as keyof typeof TEAM_LOGOS] || team.logoUrl}
                  alt={team.teamName}
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-medium">{team.teamName}</span>
            </div>

            <div className="text-sm text-muted-foreground mb-1">Peak Elo</div>
            <div className="text-3xl font-bold mb-1">{Math.round(Number(team.globalRating))}</div>
            <div className="text-sm text-muted-foreground">
              {team.peakDate ? format(new Date(team.peakDate), 'MMMM d, yyyy') : ''}
            </div>
          </div>
        )} />
        <StatCarousel 
          title="Top Map Performances" 
          tooltip="Highest team ratings achieved on specific maps"
          data={topMaps}
          renderContent={(map) => (
            <div className="text-center">
              <div className="text-lg font-bold mb-4">
                {map.mapName}
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="relative w-8 h-8">
                  <Image
                    src={TEAM_LOGOS[map.teamSlug as keyof typeof TEAM_LOGOS]}
                    alt={map.teamName}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-medium">{map.teamName}</span>
              </div>

              <div className="text-sm text-muted-foreground mb-1">Peak Elo</div>
              <div className="text-3xl font-bold mb-1">{Math.round(map.effectiveRating)}</div>
              <div className="text-sm text-muted-foreground">
                {map.achievedAt ? format(new Date(map.achievedAt.split('T')[0]), 'MMMM d, yyyy') : ''}
              </div>
            </div>
          )}
        />
        <StatCarousel title="Longest Win Streaks" tooltip="Teams with the longest consecutive win streaks on a single map" data={winStreaks} renderContent={(streak) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              {format(new Date(streak.start_date), 'MMMM d, yyyy')} - {format(new Date(streak.end_date), 'MMMM d, yyyy')}
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="relative w-8 h-8">
                <Image
                  src={TEAM_LOGOS[streak.team_slug as keyof typeof TEAM_LOGOS] || streak.logo_url}
                  alt={streak.team_name}
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-medium">{streak.team_name}</span>
            </div>

            <div className="text-lg text-muted-foreground mb-1">{streak.map_name}</div>
            <div className="text-3xl font-bold mb-2">{streak.streak_length} Maps</div>
            <div className="text-sm font-medium text-green-500">
              +{Number(streak.avg_margin).toFixed(1)} Rounds/Map
            </div>
          </div>
        )} />

        {/* Second Row - Worst Performers */}
        <StatCarousel title="Worst Teams" tooltip="Teams that hit the lowest global Elo ratings across all seasons" data={worstTeams} renderContent={(team) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              Season {team.seasonYear}
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="relative w-8 h-8">
                <Image
                  src={TEAM_LOGOS[team.teamSlug as keyof typeof TEAM_LOGOS] || team.logoUrl}
                  alt={team.teamName}
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-medium">{team.teamName}</span>
            </div>

            <div className="text-sm text-muted-foreground mb-1">Lowest Elo</div>
            <div className="text-3xl font-bold mb-1">{Math.round(Number(team.globalRating))}</div>
            <div className="text-sm text-muted-foreground">
              {team.lowestDate ? format(new Date(team.lowestDate.split('T')[0]), 'MMMM d, yyyy') : ''}
            </div>
          </div>
        )} />
        <StatCarousel 
          title="Worst Map Performances" 
          tooltip="Lowest team ratings achieved on specific maps"
          data={worstMaps}
          renderContent={(map) => (
            <div className="text-center">
              <div className="text-lg font-bold mb-4">
                {map.mapName}
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="relative w-8 h-8">
                  <Image
                    src={TEAM_LOGOS[map.teamSlug as keyof typeof TEAM_LOGOS]}
                    alt={map.teamName}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-medium">{map.teamName}</span>
              </div>

              <div className="text-sm text-muted-foreground mb-1">Lowest Elo</div>
              <div className="text-3xl font-bold mb-1">{Math.round(map.effectiveRating)}</div>
              <div className="text-sm text-muted-foreground">
                {map.achievedAt ? format(new Date(map.achievedAt.split('T')[0]), 'MMMM d, yyyy') : ''}
              </div>
            </div>
          )}
        />
        <StatCarousel title="Longest Losing Streaks" tooltip="Teams with the longest consecutive loss streaks on a single map" data={loseStreaks} renderContent={(streak) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              {format(new Date(streak.start_date), 'MMMM d, yyyy')} - {format(new Date(streak.end_date), 'MMMM d, yyyy')}
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="relative w-8 h-8">
                <Image
                  src={TEAM_LOGOS[streak.team_slug as keyof typeof TEAM_LOGOS] || streak.logo_url}
                  alt={streak.team_name}
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-medium">{streak.team_name}</span>
            </div>

            <div className="text-lg text-muted-foreground mb-1">{streak.map_name}</div>
            <div className="text-3xl font-bold mb-2">{streak.streak_length} Maps</div>
            <div className="text-sm font-medium text-red-500">
              {Number(streak.avg_margin).toFixed(1)} Rounds/Map
            </div>
          </div>
        )} />

        {/* Map Stats Section */}
        <div className="xl:col-span-3">
          <MapPopularityChart data={mapPopularity} onDateChange={(start, end) => {
            setSelectedStartDate(start);
            setSelectedEndDate(end);
          }} />
        </div>

        {/* Upsets Section */}
        <div className="xl:col-span-3">
          <UpsetCarousel title="Biggest Upsets" data={upsets} />
        </div>

        {/* Perfect Games Section */}
        <div className="xl:col-span-3">
          <PerfectGamesScroll data={perfectGames} />
        </div>
      </div>
    </div>
  );
} 