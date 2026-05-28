'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CalendarDays, Loader2, RefreshCcw, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { getTournamentConfig } from '@/lib/simulation/tournament-formats';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { RoundReachHeatmap } from './round-reach-heatmap';
import { TitleOddsChart } from './title-odds-chart';
import { InteractiveSwissStage } from './interactive-swiss-stage';
import { InteractivePlayoffBracket } from './interactive-playoff-bracket';
import Image from 'next/image';

interface SimulationResult {
  team: string;
  teamName: string;
  championships: number;
  finalist: number;
  top3: number;
  top4: number;
  top6: number;
  top8: number;
  top12: number;
}

const TOURNAMENT_ID = 'vct-masters-london-2026';
const FIXED_SIMULATION_COUNT = 10000;

interface UpcomingTournamentViewProps {
  tournamentId?: string;
}

export function UpcomingTournamentView({ tournamentId = TOURNAMENT_ID }: UpcomingTournamentViewProps) {
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swissQualified, setSwissQualified] = useState<string[]>([]);
  const [activeTournamentTab, setActiveTournamentTab] = useState('swiss');
  const tournamentConfig = useMemo(() => getTournamentConfig(tournamentId), [tournamentId]);

  const autoQualified = useMemo(
    () => tournamentConfig?.teams.filter((team) => team.group === 'auto') ?? [],
    [tournamentConfig]
  );

  const fetchSimulation = useCallback(async () => {
    if (!tournamentConfig) {
      setError(`Missing tournament config for ${tournamentId}`);
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch(
        `/api/simulation?tournamentId=${tournamentId}&simulations=${FIXED_SIMULATION_COUNT}`
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? 'Failed to run simulation');
        setResults(null);
        return;
      }

      const body = await response.json();
      setResults(body.results);
    } catch {
      setError('Failed to run simulation');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentConfig, tournamentId]);

  useEffect(() => {
    fetchSimulation();
  }, [fetchSimulation]);

  useEffect(() => {
    setSwissQualified([]);
  }, [tournamentId]);

  const handleSwissQualifiedChange = useCallback((qualified: string[]) => {
    setSwissQualified((current) => (
      current.join('|') === qualified.join('|') ? current : qualified
    ));
  }, []);

  if (!tournamentConfig) {
    return (
      <Card className="border border-red-500/50 bg-red-900/10">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">Missing tournament config</p>
            <p className="text-sm text-muted-foreground">
              Add `{tournamentId}` to the tournament format registry.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-black dark:border-white">
        <CardHeader>
          <CardTitle className="text-2xl">{tournamentConfig.name}</CardTitle>
          <CardDescription className="flex flex-wrap gap-4 mt-2">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              Starts {new Date(tournamentConfig.startDate).toLocaleDateString('en-US')}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {tournamentConfig.teams.length} teams
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Swiss + 8-team double elimination
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{FIXED_SIMULATION_COUNT.toLocaleString()} simulations (fixed)</span>
            <Button variant="outline" onClick={fetchSimulation} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              Re-run
            </Button>
          </div>

          <div className="space-y-4">
            <Card className="border border-black dark:border-white">
              <CardHeader>
                <CardTitle className="text-base">Auto-Qualified (Playoff Seeds)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  These teams skip Swiss and start directly in the 8-team playoff bracket.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {autoQualified.map((team) => (
                    <span key={team.slug} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                      {TEAM_LOGOS[team.slug as keyof typeof TEAM_LOGOS] ? (
                        <Image
                          src={TEAM_LOGOS[team.slug as keyof typeof TEAM_LOGOS]}
                          alt={`${team.name} logo`}
                          width={20}
                          height={20}
                          className="shrink-0 object-contain"
                        />
                      ) : null}
                      {team.name} ({team.slug})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {tournamentConfig.format === 'swiss-double-elim' && (
              <div className="rounded-lg border border-black p-4 dark:border-white">
                <Tabs value={activeTournamentTab} onValueChange={setActiveTournamentTab} className="w-full">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="swiss">Swiss Stage</TabsTrigger>
                    <TabsTrigger value="playoffs">Playoff Bracket</TabsTrigger>
                  </TabsList>
                  <div className={activeTournamentTab === 'swiss' ? 'mt-4' : 'hidden'}>
                    <InteractiveSwissStage
                      tournament={tournamentConfig}
                      onQualifiedChange={handleSwissQualifiedChange}
                    />
                  </div>
                  <div className={activeTournamentTab === 'playoffs' ? 'mt-4' : 'hidden'}>
                    <InteractivePlayoffBracket
                      tournament={tournamentConfig}
                      swissQualified={swissQualified.length === 4 ? swissQualified : []}
                    />
                  </div>
                </Tabs>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="border border-black dark:border-white">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Running Monte Carlo simulation...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border border-red-500/50 bg-red-900/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">Unable to run simulation</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {results && !loading && !error && (
        <Card className="border border-black dark:border-white">
          <CardHeader>
            <CardTitle>Simulation Results</CardTitle>
            <CardDescription>
              Live Monte Carlo projections based on current map ELO data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="heatmap" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="heatmap">Round Probabilities</TabsTrigger>
                <TabsTrigger value="chart">Championship Odds</TabsTrigger>
              </TabsList>
              <TabsContent value="heatmap" className="mt-4">
                <RoundReachHeatmap data={results} teamCount={results.length} />
              </TabsContent>
              <TabsContent value="chart" className="mt-4">
                <TitleOddsChart data={results} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
