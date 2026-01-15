'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HistoricalTournamentView, HistoricalSimulationData } from './historical-tournament-view';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { TournamentConfig } from '@/lib/simulation/tournament-formats';

interface TournamentSelectorProps {
  tournaments: TournamentConfig[];
}

export function TournamentSelector({ tournaments }: TournamentSelectorProps) {
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [simulationData, setSimulationData] = useState<HistoricalSimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTournament) {
      setSimulationData(null);
      return;
    }

    async function fetchSimulationData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/simulations/${selectedTournament}.json`);
        if (!response.ok) {
          if (response.status === 404) {
            setError(`Simulation data not yet generated for this tournament. Run: npm run generate:simulation ${selectedTournament}`);
          } else {
            setError('Failed to load simulation data');
          }
          setSimulationData(null);
          return;
        }

        const data = await response.json();
        setSimulationData(data);
      } catch {
        setError('Failed to load simulation data');
        setSimulationData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchSimulationData();
  }, [selectedTournament]);

  return (
    <div className="space-y-6">
      <div className="max-w-xs">
        <Select value={selectedTournament} onValueChange={setSelectedTournament}>
          <SelectTrigger>
            <SelectValue placeholder="Select a tournament..." />
          </SelectTrigger>
          <SelectContent>
            {tournaments.map((tournament) => (
              <SelectItem key={tournament.id} value={tournament.id}>
                {tournament.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <Card className="border border-black dark:border-white">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading simulation data...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border border-red-500/50 bg-red-900/10">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">Unable to load simulation</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {simulationData && !loading && !error && (
        <HistoricalTournamentView data={simulationData} />
      )}
    </div>
  );
}
