import { History } from 'lucide-react';
import { TournamentSelector } from '@/components/simulations/tournament-selector';
import { getHistoricalTournaments } from '@/lib/simulation/tournament-formats';

export default function SimulationsPage() {
  const historicalTournaments = getHistoricalTournaments();

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Tournament Simulations
      </h1>

      {historicalTournaments.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Historical Tournament Simulations</h2>
          </div>
          <p className="text-muted-foreground">
            View pre-computed Monte Carlo simulations from past VCT tournaments using historical ELO data.
          </p>
          <TournamentSelector tournaments={historicalTournaments} />
        </div>
      )}
    </div>
  );
} 