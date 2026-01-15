'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TitleOddsChart } from './title-odds-chart';
import { RoundReachHeatmap } from './round-reach-heatmap';
import { ActualResultsComparison } from './actual-results-comparison';
import { CalendarDays, Users, BarChart3, Trophy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface SimulationResult {
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

export interface ActualResults {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top4: string[];
  top6?: string[];
  top8?: string[];
  top12?: string[];
}

export interface HistoricalSimulationData {
  tournamentId: string;
  tournamentName: string;
  simulatedAt: string;
  eloSnapshotDate: string;
  numSimulations: number;
  results: SimulationResult[];
  actualResults?: ActualResults;
}

interface HistoricalTournamentViewProps {
  data: HistoricalSimulationData;
}

export function HistoricalTournamentView({ data }: HistoricalTournamentViewProps) {
  const snapshotDate = new Date(data.eloSnapshotDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Tournament Info Header */}
      <Card className="border border-black dark:border-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="h-6 w-6 text-yellow-500" />
            {data.tournamentName}
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-4 mt-2">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              ELO Snapshot: {snapshotDate}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {data.results.length} teams
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              {data.numSimulations.toLocaleString()} simulations
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Actual Results Comparison (if available) */}
      {data.actualResults && (
        <ActualResultsComparison
          simulationResults={data.results}
          actualResults={data.actualResults}
        />
      )}

      {/* Simulation Results */}
      <Card className="border border-black dark:border-white">
        <CardHeader>
          <CardTitle>Simulation Results</CardTitle>
          <CardDescription>
            Monte Carlo simulation probabilities based on pre-tournament ELO ratings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="heatmap" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="heatmap">Round Probabilities</TabsTrigger>
              <TabsTrigger value="chart">Championship Odds</TabsTrigger>
            </TabsList>
            <TabsContent value="heatmap" className="mt-4">
              <RoundReachHeatmap data={data.results} teamCount={data.results.length} />
            </TabsContent>
            <TabsContent value="chart" className="mt-4">
              <TitleOddsChart data={data.results} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
