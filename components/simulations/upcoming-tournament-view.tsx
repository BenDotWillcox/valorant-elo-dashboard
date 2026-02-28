'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CalendarDays, Loader2, RefreshCcw, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTournamentConfig } from '@/lib/simulation/tournament-formats';
import { RoundReachHeatmap } from './round-reach-heatmap';
import { TitleOddsChart } from './title-odds-chart';

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

const TOURNAMENT_ID = 'vct-masters-santiago-2026';
const tournamentConfig = getTournamentConfig(TOURNAMENT_ID);
const SIMULATION_OPTIONS = ['10000', '25000', '50000', '100000'];

export function UpcomingTournamentView() {
  const [numSimulations, setNumSimulations] = useState('25000');
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoQualified = useMemo(
    () => tournamentConfig?.teams.filter((team) => team.group === 'auto') ?? [],
    []
  );

  const swissTeams = useMemo(
    () => tournamentConfig?.teams.filter((team) => team.group === 'swiss') ?? [],
    []
  );

  const swissQualificationOdds = useMemo(() => {
    if (!results) return [];

    return swissTeams
      .map((team) => {
        const teamResult = results.find((result) => result.team === team.slug);
        return {
          slug: team.slug,
          name: team.name,
          playoffOdds: teamResult?.top8 ?? 0,
        };
      })
      .sort((a, b) => b.playoffOdds - a.playoffOdds);
  }, [results, swissTeams]);

  const fetchSimulation = useCallback(async () => {
    if (!tournamentConfig) {
      setError(`Missing tournament config for ${TOURNAMENT_ID}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/simulation?tournamentId=${TOURNAMENT_ID}&simulations=${numSimulations}`
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
  }, [numSimulations]);

  useEffect(() => {
    fetchSimulation();
  }, [fetchSimulation]);

  if (!tournamentConfig) {
    return (
      <Card className="border border-red-500/50 bg-red-900/10">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">Missing tournament config</p>
            <p className="text-sm text-muted-foreground">
              Add `{TOURNAMENT_ID}` to the tournament format registry.
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-40">
              <Select value={numSimulations} onValueChange={setNumSimulations}>
                <SelectTrigger>
                  <SelectValue placeholder="Simulations" />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATION_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {Number(value).toLocaleString()} sims
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchSimulation} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              Re-run
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
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
                    <span key={team.slug} className="rounded-md border px-2 py-1 text-sm">
                      {team.name} ({team.slug})
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-black dark:border-white">
              <CardHeader>
                <CardTitle className="text-base">Swiss Teams: Playoff Qualification Odds</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  `Top 8` percentage is used as Swiss-to-playoff qualification probability.
                </p>
                {results ? (
                  <div className="mt-3 space-y-1 text-sm">
                    {swissQualificationOdds.map((team) => (
                      <div key={team.slug} className="flex items-center justify-between">
                        <span>
                          {team.name} ({team.slug})
                        </span>
                        <span className="font-medium">{team.playoffOdds.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
