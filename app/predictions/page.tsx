'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapSelection } from "@/components/predictions/map-selection";
import { MatchResults } from "@/components/predictions/match-results";
import { calculateWinProbability, calculateBo3MatchProbability, calculateBo5MatchProbability } from '@/lib/predictions/calculations';
import { MAP_POOL } from '@/lib/constants/maps';
import { getOptimalMapSelection } from '@/lib/predictions/map-selection';
import { MapSelectionProcess } from "@/components/predictions/map-selection-process";
import { TEAM_LOGOS } from "@/lib/constants/images";
import Image from "next/image";

interface TeamElo {
  teamId: number;
  teamName: string;
  teamSlug: string;
  rating: string;
  mapName: string;
}

export default function PredictionsPage() {
  const [team1, setTeam1] = useState<string>('');
  const [team2, setTeam2] = useState<string>('');
  const [matchType, setMatchType] = useState<'BO3' | 'BO5' | 'BO5_ADV'>('BO3');
  const [autoMapSelection, setAutoMapSelection] = useState(false);
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [eloData, setEloData] = useState<TeamElo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapBans, setMapBans] = useState<{ team1: string[], team2: string[] }>({ team1: [], team2: [] });

  const requiredMaps = matchType === 'BO3' ? 3 : 5;

  useEffect(() => {
    fetch('/api/current-elo')
      .then(res => res.json())
      .then(data => {
        setEloData(data);
        setLoading(false);
      });
  }, []);

  const availableTeams = Array.from(new Set(eloData.map(d => d.teamSlug))).sort();
  const availableMaps = autoMapSelection 
    ? MAP_POOL.active
    : [...MAP_POOL.active, ...MAP_POOL.inactive];

  const handleMapSelect = (index: number, mapName: string) => {
    const newMaps = [...selectedMaps];
    newMaps[index] = mapName;
    setSelectedMaps(newMaps);
  };

  // Calculate individual map probabilities
  const mapProbabilities = selectedMaps.map(map => {
    const team1Elo = eloData.find(d => d.teamSlug === team1 && d.mapName === map);
    const team2Elo = eloData.find(d => d.teamSlug === team2 && d.mapName === map);
    
    if (!team1Elo || !team2Elo) return [0.5, 0.5] as [number, number];
    
    return calculateWinProbability(
      Number(team1Elo.rating),
      Number(team2Elo.rating)
    );
  });

  // Calculate match probability considering map order
  const calculateOrderedMatchProbability = () => {
    if (selectedMaps.length !== requiredMaps) return [0.5, 0.5] as [number, number];

    if (matchType === 'BO3') {
      // Map 1 & 2 are guaranteed, Map 3 only if 1-1
      const [p1team1] = mapProbabilities[0];
      const [p2team1] = mapProbabilities[1];
      const [p3team1] = mapProbabilities[2];

      // Probability of winning 2-0
      const win2_0 = p1team1 * p2team1;
      // Probability of winning 2-1
      const win2_1 = p1team1 * (1-p2team1) * p3team1 + (1-p1team1) * p2team1 * p3team1;
      
      const totalWinProb = win2_0 + win2_1;
      return [totalWinProb, 1 - totalWinProb] as [number, number];
    } else {
      // Similar logic for BO5, but more combinations
      // ... implement BO5 probability calculation
      return calculateBo5MatchProbability(mapProbabilities);
    }
  };

  const matchProbability = calculateOrderedMatchProbability();

  // Handle auto map selection
  useEffect(() => {
    if (autoMapSelection && team1 && team2) {
      const team1Probs = MAP_POOL.active.reduce((acc, map) => {
        const team1Elo = eloData.find(d => d.teamSlug === team1 && d.mapName === map);
        const team2Elo = eloData.find(d => d.teamSlug === team2 && d.mapName === map);
        
        // Default 50% probability if no data exists
        const [prob1] = team1Elo && team2Elo 
          ? calculateWinProbability(Number(team1Elo.rating), Number(team2Elo.rating))
          : [0.5, 0.5];
        
        acc[map] = { probability: prob1, map };
        return acc;
      }, {} as Record<string, { probability: number; map: string; }>);

      const team2Probs = MAP_POOL.active.reduce((acc, map) => {
        const team1Elo = eloData.find(d => d.teamSlug === team1 && d.mapName === map);
        const team2Elo = eloData.find(d => d.teamSlug === team2 && d.mapName === map);
        
        // Default 50% probability if no data exists
        const [, prob2] = team1Elo && team2Elo 
          ? calculateWinProbability(Number(team1Elo.rating), Number(team2Elo.rating))
          : [0.5, 0.5];
        
        acc[map] = { probability: prob2, map };
        return acc;
      }, {} as Record<string, { probability: number; map: string; }>);

      const { selectedMaps: optimalMaps, bans } = getOptimalMapSelection(
        MAP_POOL.active,
        team1Probs,
        team2Probs,
        matchType
      );

      setSelectedMaps(optimalMaps);
      setMapBans(bans);
    } else {
      // Reset maps when switching to manual
      setSelectedMaps([]);
      setMapBans({ team1: [], team2: [] });
    }
  }, [team1, team2, matchType, autoMapSelection, eloData]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold mb-4">Match Predictions</h1>
      
      {/* Combined Parameters Card */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex flex-col items-center space-y-4">
            <CardTitle>Match Parameters</CardTitle>
            {/* Team VS Display */}
            <div className="flex flex-col sm:flex-row items-center w-full gap-4">
              <div className="flex-1 flex flex-col sm:flex-row sm:justify-end items-center gap-3">
                <Select onValueChange={setTeam1} value={team1}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select team 1">
                      {team1 && (
                        <div className="flex items-center gap-2">
                          <div className="relative w-6 h-6 shrink-0">
                            <Image
                              src={TEAM_LOGOS[team1 as keyof typeof TEAM_LOGOS]}
                              alt={team1}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="truncate font-medium">{team1}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((team) => (
                      <SelectItem key={team} value={team}>
                        <div className="flex items-center gap-2">
                          <div className="relative w-4 h-4 shrink-0">
                            <Image
                              src={TEAM_LOGOS[team as keyof typeof TEAM_LOGOS]}
                              alt={team}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="truncate">{team}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {team1 && (
                  <div className="relative w-12 h-12">
                    <Image
                      src={TEAM_LOGOS[team1 as keyof typeof TEAM_LOGOS]}
                      alt={team1}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </div>
              
              <div className="text-2xl font-bold px-4">VS</div>
              
              <div className="flex-1 flex flex-col sm:flex-row sm:justify-start items-center gap-3">
                {team2 && (
                  <div className="relative w-12 h-12">
                    <Image
                      src={TEAM_LOGOS[team2 as keyof typeof TEAM_LOGOS]}
                      alt={team2}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <Select onValueChange={setTeam2} value={team2}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select team 2">
                      {team2 && (
                        <div className="flex items-center gap-2">
                          <div className="relative w-6 h-6 shrink-0">
                            <Image
                              src={TEAM_LOGOS[team2 as keyof typeof TEAM_LOGOS]}
                              alt={team2}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="truncate font-medium">{team2}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((team) => (
                      <SelectItem key={team} value={team}>
                        <div className="flex items-center gap-2">
                          <div className="relative w-4 h-4 shrink-0">
                            <Image
                              src={TEAM_LOGOS[team as keyof typeof TEAM_LOGOS]}
                              alt={team}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="truncate">{team}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8">
            {/* Match Settings */}
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-12">
              <div className="flex items-center gap-3">
                <label htmlFor="match-type" className="text-sm font-medium whitespace-nowrap">Match Type:</label>
                <Select onValueChange={(value) => setMatchType(value as 'BO3' | 'BO5' | 'BO5_ADV')} value={matchType}>
                  <SelectTrigger id="match-type" className="w-[180px]">
                    <SelectValue placeholder="Select match type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BO3">Best of 3</SelectItem>
                    <SelectItem value="BO5">Best of 5</SelectItem>
                    <SelectItem value="BO5_ADV">Best of 5 (Advantage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="auto-maps"
                  checked={autoMapSelection}
                  onCheckedChange={(checked) => setAutoMapSelection(checked as boolean)}
                />
                <label htmlFor="auto-maps" className="text-sm font-medium">
                  Auto Map Selection
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map Selection */}
      {team1 && team2 && (
        <MapSelection
          matchType={matchType}
          selectedMaps={selectedMaps}
          onMapSelect={handleMapSelect}
          availableMaps={availableMaps}
          autoSelection={autoMapSelection}
        />
      )}

      {/* Map Selection Process */}
      {autoMapSelection && team1 && team2 && selectedMaps.length > 0 && (
        <MapSelectionProcess
          matchType={matchType}
          selectedMaps={selectedMaps}
          team1={team1}
          team2={team2}
          bans={mapBans}
        />
      )}

      {/* Results */}
      {team1 && team2 && selectedMaps.length > 0 && (
        <MatchResults
          team1={team1}
          team2={team2}
          selectedMaps={selectedMaps}
          mapProbabilities={mapProbabilities}
          matchProbability={matchProbability}
        />
      )}
    </div>
  );
} 