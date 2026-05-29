'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calculator, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapSelection } from '@/components/predictions/map-selection';
import { MatchResults } from '@/components/predictions/match-results';
import { MapStatsChart } from '@/components/charts/map-stats-chart';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { MAP_POOL } from '@/lib/constants/maps';
import { calculateBo3MatchProbability, calculateBo5MatchProbability, calculateWinProbability } from '@/lib/predictions/calculations';
import { getOptimalMapSelection } from '@/lib/predictions/map-selection';
import type { TeamMapData } from '@/types/elo';
import Image from 'next/image';

interface MatchComparisonActionsProps {
  team1: string | null;
  team2: string | null;
  defaultMatchType?: 'BO3' | 'BO5';
}

type EloData = Record<string, Record<string, number>>;

function buildEloData(data: TeamMapData[]): EloData {
  return data.reduce((acc, row) => {
    if (!row.teamSlug || !row.mapName) return acc;
    if (!acc[row.teamSlug]) acc[row.teamSlug] = {};
    acc[row.teamSlug][row.mapName] = Number(row.rating);
    return acc;
  }, {} as EloData);
}

function getAutoMaps(team1: string, team2: string, matchType: 'BO3' | 'BO5', eloData: EloData) {
  const team1Elo = eloData[team1];
  const team2Elo = eloData[team2];

  if (!team1Elo || !team2Elo) {
    return MAP_POOL.active.slice(0, matchType === 'BO3' ? 3 : 5);
  }

  const team1Probs = MAP_POOL.active.reduce((acc, map) => {
    const [probability] = calculateWinProbability(team1Elo[map] ?? 1000, team2Elo[map] ?? 1000);
    acc[map] = { probability, map };
    return acc;
  }, {} as Record<string, { probability: number; map: string }>);

  const team2Probs = MAP_POOL.active.reduce((acc, map) => {
    const [, probability] = calculateWinProbability(team1Elo[map] ?? 1000, team2Elo[map] ?? 1000);
    acc[map] = { probability, map };
    return acc;
  }, {} as Record<string, { probability: number; map: string }>);

  return getOptimalMapSelection(MAP_POOL.active, team1Probs, team2Probs, matchType).selectedMaps;
}

export function MatchComparisonActions({
  team1,
  team2,
  defaultMatchType = 'BO3',
}: MatchComparisonActionsProps) {
  const [predictionOpen, setPredictionOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [data, setData] = useState<TeamMapData[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchType, setMatchType] = useState<'BO3' | 'BO5'>(defaultMatchType);
  const [autoMapSelection, setAutoMapSelection] = useState(true);
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [activeMapsOnly, setActiveMapsOnly] = useState(true);
  const canCompare = Boolean(team1 && team2);

  useEffect(() => {
    setMatchType(defaultMatchType);
  }, [defaultMatchType, team1, team2]);

  useEffect(() => {
    if (!canCompare || (!predictionOpen && !chartOpen) || data.length > 0) return;

    setLoading(true);
    const maps = [...MAP_POOL.active, ...MAP_POOL.inactive];
    fetch(`/api/current-elo?maps=${maps.join(',')}&seasonId=`)
      .then((response) => response.json())
      .then((apiData: TeamMapData[]) => setData(apiData))
      .finally(() => setLoading(false));
  }, [canCompare, chartOpen, data.length, predictionOpen]);

  const eloData = useMemo(() => buildEloData(data), [data]);

  useEffect(() => {
    if (!team1 || !team2 || data.length === 0) return;
    if (autoMapSelection) {
      setSelectedMaps(getAutoMaps(team1, team2, matchType, eloData));
    } else {
      setSelectedMaps([]);
    }
  }, [autoMapSelection, data.length, eloData, matchType, team1, team2]);

  const mapProbabilities = useMemo(() => {
    if (!team1 || !team2) return [];

    return selectedMaps.map((map) => {
      const team1Elo = eloData[team1]?.[map] ?? 1000;
      const team2Elo = eloData[team2]?.[map] ?? 1000;
      return calculateWinProbability(team1Elo, team2Elo);
    });
  }, [eloData, selectedMaps, team1, team2]);

  const matchProbability = useMemo<[number, number]>(() => {
    if (mapProbabilities.length < (matchType === 'BO3' ? 3 : 5)) return [0.5, 0.5];
    return matchType === 'BO3'
      ? calculateBo3MatchProbability(mapProbabilities)
      : calculateBo5MatchProbability(mapProbabilities);
  }, [mapProbabilities, matchType]);

  const chartData = useMemo(() => {
    if (!activeMapsOnly) return data;
    return data.filter((row) => MAP_POOL.active.includes(row.mapName));
  }, [activeMapsOnly, data]);

  const handleMapSelect = (index: number, mapName: string) => {
    setSelectedMaps((current) => {
      const next = [...current];
      next[index] = mapName;
      return next;
    });
  };

  const handlePredictionOpenChange = (open: boolean) => {
    setPredictionOpen(open);
    if (open) {
      setAutoMapSelection(true);
    }
  };

  if (!canCompare) return null;

  return (
    <div className="flex items-center gap-1">
      <Dialog open={predictionOpen} onOpenChange={handlePredictionOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Open match prediction for ${team1} vs ${team2}`}
          >
            <Calculator className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{team1} vs {team2} Prediction</DialogTitle>
            <DialogDescription>Edit match type or maps to compare outcomes before picking a winner.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading map Elo...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-black p-4 dark:border-white">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
                    <div className="flex items-center gap-3">
                      <label htmlFor={`match-type-${team1}-${team2}`} className="text-sm font-medium whitespace-nowrap">
                        Match Type:
                      </label>
                      <Select value={matchType} onValueChange={(value) => setMatchType(value as 'BO3' | 'BO5')}>
                        <SelectTrigger id={`match-type-${team1}-${team2}`} className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BO3">Best of 3</SelectItem>
                          <SelectItem value="BO5">Best of 5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`auto-maps-${team1}-${team2}`}
                        checked={autoMapSelection}
                        onCheckedChange={(checked) => setAutoMapSelection(Boolean(checked))}
                      />
                      <label htmlFor={`auto-maps-${team1}-${team2}`} className="text-sm font-medium">
                        Auto Map Selection
                      </label>
                    </div>
                  </div>

                  <div className="flex w-full flex-col items-center gap-4 sm:flex-row">
                    <div className="flex flex-1 flex-col items-center gap-3 sm:flex-row sm:justify-end">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        {TEAM_LOGOS[team1 as keyof typeof TEAM_LOGOS] ? (
                          <Image
                            src={TEAM_LOGOS[team1 as keyof typeof TEAM_LOGOS]}
                            alt={`${team1} logo`}
                            width={36}
                            height={36}
                            className="object-contain"
                          />
                        ) : null}
                        <span className="font-semibold">{team1}</span>
                      </div>
                    </div>

                    <div className="px-4 text-2xl font-bold">VS</div>

                    <div className="flex flex-1 flex-col items-center gap-3 sm:flex-row sm:justify-start">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        {TEAM_LOGOS[team2 as keyof typeof TEAM_LOGOS] ? (
                          <Image
                            src={TEAM_LOGOS[team2 as keyof typeof TEAM_LOGOS]}
                            alt={`${team2} logo`}
                            width={36}
                            height={36}
                            className="object-contain"
                          />
                        ) : null}
                        <span className="font-semibold">{team2}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <MapSelection
                matchType={matchType}
                selectedMaps={selectedMaps}
                onMapSelect={handleMapSelect}
                availableMaps={[...MAP_POOL.active, ...MAP_POOL.inactive]}
                autoSelection={autoMapSelection}
              />

              {team1 && team2 && selectedMaps.length === (matchType === 'BO3' ? 3 : 5) ? (
                <MatchResults
                  team1={team1}
                  team2={team2}
                  selectedMaps={selectedMaps}
                  mapProbabilities={mapProbabilities}
                  matchProbability={matchProbability}
                />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Open map pool chart for ${team1} vs ${team2}`}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{team1} vs {team2} Map Pool</DialogTitle>
            <DialogDescription>Compare current map Elo ratings across the selected map pool.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading map Elo...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`active-maps-only-${team1}-${team2}`}
                  checked={activeMapsOnly}
                  onCheckedChange={(checked) => setActiveMapsOnly(Boolean(checked))}
                />
                <label htmlFor={`active-maps-only-${team1}-${team2}`} className="text-sm font-medium">
                  Active maps only
                </label>
              </div>
              <MapStatsChart data={chartData} selectedTeams={[team1!, team2!]} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
