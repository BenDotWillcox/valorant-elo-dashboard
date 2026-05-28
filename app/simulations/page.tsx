import { TournamentSelector } from '@/components/simulations/tournament-selector';
import { getSimulationTournaments } from '@/lib/simulation/tournament-formats';

export default function SimulationsPage() {
  const tournaments = getSimulationTournaments();
  const defaultTournamentId = tournaments[0]?.id;

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Tournament Simulations
      </h1>

      <TournamentSelector tournaments={tournaments} defaultTournamentId={defaultTournamentId} />
    </div>
  );
} 
