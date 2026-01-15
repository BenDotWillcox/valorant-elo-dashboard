import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, Trophy } from 'lucide-react';

export default function SimulationsPage() {
  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Tournament Simulations
      </h1>

      <Card className="w-full border border-black dark:border-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            VCT 2026 Tournament Simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center">
            <CalendarClock className="h-16 w-16 text-muted-foreground" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Tournament Format TBD</h2>
              <p className="text-muted-foreground max-w-md">
                The 2026 VCT season is underway, but the next major tournament format 
                has not yet been announced. Check back once the format is revealed and 
                teams have qualified.
              </p>
            </div>
            <div className="text-sm text-muted-foreground border border-dashed border-gray-600 rounded-lg p-4 max-w-sm">
              <p>
                Monte Carlo simulations will return once we know the bracket structure, 
                seeding, and participating teams.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 