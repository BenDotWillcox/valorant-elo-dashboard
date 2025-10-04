'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { format, subDays } from 'date-fns';
import { StatCarousel } from '@/components/stats/stat-carousel';
import { PerfectGamesScroll } from '@/components/stats/perfect-games-scroll';
import { UpsetCarousel } from '@/components/stats/upset-carousel';
import { MapPopularityChart } from '@/components/stats/map-popularity-chart';
import { Badge } from '@/components/ui/badge';
import { RecordBookSkeleton } from "@/components/skeletons/record-book-skeleton";

interface Team {
  season_year: number;
  team_name: string;
  team_slug: string;
  logo_url: string;
  rating: number;
  peak_date?: string;
  lowest_date?: string;
  map_name?: string;
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
  is_active: boolean;
}

interface TopPlayer {
  ign: string;
  teamName: string | null;
  teamLogo: string | null;
  vpm: number;
  mapsPlayed: number;
}

interface PeakPlayer {
  ign: string;
  teamName: string | null;
  teamLogo: string | null;
  peakVpm: number;
  gameDate: string;
}

export default function HallOfFamePage() {
  const [upsets, setUpsets] = useState([]);
  const [winStreaks, setWinStreaks] = useState<Streak[]>([]);
  const [loseStreaks, setLoseStreaks] = useState<Streak[]>([]);
  const [perfectGames, setPerfectGames] = useState([]);
  const [topMaps, setTopMaps] = useState<Team[]>([]);
  const [worstMaps, setWorstMaps] = useState<Team[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [peakPlayers, setPeakPlayers] = useState<PeakPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapPopularity, setMapPopularity] = useState([]);
  const [selectedStartDate, setSelectedStartDate] = useState(subDays(new Date(), 30));
  const [selectedEndDate, setSelectedEndDate] = useState(new Date());


  useEffect(() => {
    Promise.all([
      fetch('/api/hall-of-fame/upsets').then(res => res.json()),
      fetch('/api/hall-of-fame/win-streaks').then(res => res.json()),
      fetch('/api/hall-of-fame/lose-streaks').then(res => res.json()),
      fetch('/api/hall-of-fame/perfect-games').then(res => res.json()),
      fetch('/api/hall-of-fame/top-maps').then(res => res.json()),
      fetch('/api/hall-of-fame/worst-maps').then(res => res.json()),
      fetch('/api/hall-of-fame/top-players').then(res => res.json()),
      fetch('/api/hall-of-fame/peak-player-ratings').then(res => res.json()),
    ]).then(
      ([
        ups,
        streaks,
        loseStreaks,
        perfect,
        topMaps,
        worstMaps,
        players,
        peakPlayers,
      ]) => {
        setUpsets(ups);
        setWinStreaks(streaks);
        setLoseStreaks(loseStreaks);
        setPerfectGames(perfect);
        setTopMaps(topMaps);
        setWorstMaps(worstMaps);
        setTopPlayers(players);
        setPeakPlayers(peakPlayers);
        setLoading(false);
      }
    );
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

  if (loading) return <RecordBookSkeleton />;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Record Book
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 auto-rows-auto">
        <StatCarousel title="Strongest Maps" tooltip="Teams that achieved the highest Elo rating on a map across all seasons" data={topMaps} renderContent={(team) => {
          const ratingNumber = Number(team.rating);
          const displayRating = !isNaN(ratingNumber) ? Math.round(ratingNumber) : 'N/A';
          let displayPeakDate = 'Unknown date';
          if (team.peak_date) {
            const date = new Date(team.peak_date);
            if (!isNaN(date.getTime())) {
              displayPeakDate = format(date, 'MMMM d, yyyy');
            }
          }
          
          return (
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-4">
                Season {team.season_year}
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="relative w-8 h-8">
                  <Image
                    src={TEAM_LOGOS[team.team_slug as keyof typeof TEAM_LOGOS] || team.logo_url}
                    alt={team.team_name}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-medium">{team.team_name}</span>
              </div>

              <div className="text-lg font-bold mb-2">{team.map_name}</div>
              <div className="text-sm text-muted-foreground mb-1">Peak Elo</div>
              <div className="text-3xl font-bold mb-1">{displayRating}</div>
              <div className="text-sm text-muted-foreground">
                {displayPeakDate}
              </div>
            </div>
          );
        }} />

        <StatCarousel title="Longest Win Streaks" tooltip="Teams with the longest consecutive win streaks on a single map" data={winStreaks} renderContent={(streak) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              {format(new Date(streak.start_date), 'MMMM d, yyyy')} - {streak.is_active ? 'Present' : format(new Date(streak.end_date), 'MMMM d, yyyy')}
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

            <div className="text-lg font-bold mb-2">{streak.map_name}</div>
            <div className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
              {streak.streak_length} Maps
              {streak.is_active && <Badge variant="destructive">Active</Badge>}
            </div>
            <div className="text-sm font-medium text-green-500">
              +{Number(streak.avg_margin).toFixed(1)} Rounds/Map
            </div>
          </div>
        )} />
        
        <StatCarousel
          title="Peak Player Rating"
          tooltip="Highest VPM achieved in a single match by players with at least 50 maps played"
          data={peakPlayers}
          renderContent={(player) => (
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-4">
                {format(new Date(player.gameDate), 'MMMM d, yyyy')}
              </div>

              <div className="flex items-center justify-center gap-2 mb-4">
                {player.teamLogo && (
                  <div className="relative w-8 h-8">
                    <Image
                      src={
                        TEAM_LOGOS[
                          player.teamName as keyof typeof TEAM_LOGOS
                        ] || player.teamLogo
                      }
                      alt={player.teamName || player.ign}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <span className="text-xl font-medium">{player.ign}</span>
              </div>

              <div className="text-lg font-bold mb-2">
                {player.teamName || 'Free Agent'}
              </div>
              <div className="text-sm text-muted-foreground mb-1">
                Peak VPM
              </div>
              <div className="text-3xl font-bold mb-1">
                {player.peakVpm > 0 ? '+' : ''}
                {player.peakVpm.toFixed(3)}
              </div>
            </div>
          )}
        />

        <StatCarousel title="Weakest Maps" tooltip="Teams that hit the lowest Elo rating on a map across all seasons" data={worstMaps} renderContent={(team) => {
          const ratingNumber = Number(team.rating);
          const displayRating = !isNaN(ratingNumber) ? Math.round(ratingNumber) : 'N/A';
          let displayLowestDate = 'Unknown date';
          if (team.lowest_date) {
            const date = new Date(team.lowest_date.split('T')[0]); 
            if (!isNaN(date.getTime())) {
              displayLowestDate = format(date, 'MMMM d, yyyy');
            }
          }

          return (
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-4">
                Season {team.season_year}
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="relative w-8 h-8">
                  <Image
                    src={TEAM_LOGOS[team.team_slug as keyof typeof TEAM_LOGOS] || team.logo_url}
                    alt={team.team_name}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-medium">{team.team_name}</span>
              </div>

              <div className="text-lg font-bold mb-2">{team.map_name}</div>
              <div className="text-sm text-muted-foreground mb-1">Lowest Elo</div>
              <div className="text-3xl font-bold mb-1">{displayRating}</div>
              <div className="text-sm text-muted-foreground">
                {displayLowestDate}
              </div>
            </div>
          );
        }} />
        
        <StatCarousel title="Longest Losing Streaks" tooltip="Teams with the longest consecutive loss streaks on a single map" data={loseStreaks} renderContent={(streak) => (
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
              {format(new Date(streak.start_date), 'MMMM d, yyyy')} - {streak.is_active ? 'Present' : format(new Date(streak.end_date), 'MMMM d, yyyy')}
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

            <div className="text-lg font-bold mb-2">{streak.map_name}</div>
            <div className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
              {streak.streak_length} Maps
              {streak.is_active && <Badge variant="destructive">Active</Badge>}
            </div>
            <div className="text-sm font-medium text-red-500">
              {Number(streak.avg_margin).toFixed(1)} Rounds/Map
            </div>
          </div>
        )} />

        <StatCarousel
          title="Current Top Players"
          tooltip="Top players by VPM (Valorant Plus Minus) The average round margin added per 24 rounds. Players must have played at least 50 maps to be included."
          data={topPlayers}
          renderContent={(player) => (
            <div className="text-center"> 
              <div className="text-sm text-muted-foreground mb-4">
                {player.mapsPlayed} Maps Played
              </div>

              <div className="flex items-center justify-center gap-2 mb-4">
                {player.teamLogo && (
                  <div className="relative w-8 h-8">
                    <Image
                      src={
                        TEAM_LOGOS[
                          player.teamName as keyof typeof TEAM_LOGOS
                        ] || player.teamLogo
                      }
                      alt={player.teamName || player.ign}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <span className="text-xl font-medium">{player.ign}</span>
              </div>

              <div className="text-lg font-bold mb-2">
                {player.teamName || 'Free Agent'}
              </div>
              <div className="text-sm text-muted-foreground mb-1">
                +/- Valorant Plus Minus
              </div>
              <div className="text-3xl font-bold mb-1">
                {player.vpm > 0 ? '+' : ''}{player.vpm.toFixed(3)}
              </div>
            </div>
          )}
        />

        {/* Map Stats Section */}
        <div className="md:col-span-2 xl:col-span-3">
          <MapPopularityChart data={mapPopularity} onDateChange={(range) => {
            if (range?.from) {
              setSelectedStartDate(range.from);
            }
            if (range?.to) {
              setSelectedEndDate(range.to);
            }
          }} />
        </div>

        {/* Upsets Section */}
        <div className="xl:col-span-3">
          <UpsetCarousel title="Biggest Upsets" data={upsets} />
        </div>

        {/* Perfect Games Section */}
        <div className="md:col-span-2 xl:col-span-3">
          <PerfectGamesScroll data={perfectGames} />
        </div>
      </div>
    </div>
  );
} 