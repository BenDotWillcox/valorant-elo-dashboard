'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TitleOddsChart } from '@/components/simulations/title-odds-chart';
import { RoundReachHeatmap } from '@/components/simulations/round-reach-heatmap';
import { PairwiseMatrix } from '@/components/simulations/pairwise-matrix';
import { GSLGroupBracket } from '@/components/simulations/gsl-group-bracket';
import { VCT_CHAMPIONS_2025_SEEDING } from '@/lib/simulation/tournament-formats/vct-champions-2025';

interface SimulationResult {
  team: string;
  teamName: string;
  championships: number;
  finalist: number;
  top3: number;
  top4: number;
  top6: number;
  top8: number;
}

interface EloRating {
  teamSlug: string;
  mapName: string;
  rating: string;
}

export default function SimulationsPage() {
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [numSimulations, setNumSimulations] = useState(0);
  const [eloData, setEloData] = useState<Record<string, Record<string, number>> | null>(null);
  const [activeStage, setActiveStage] = useState('groups');
  const [activeGroup, setActiveGroup] = useState('groupA');
  const [completedWinners, setCompletedWinners] = useState<Record<string, string>>({
    'groupA-M1': 'PRX',
    'groupA-M2': 'GX',
    'groupB-M1': 'MIBR',
    'groupB-M2': 'FNC',
    'groupC-M1': 'DRX',
    'groupC-M2': 'NRG',
    'groupD-M1': 'TH',
    'groupD-M2': 'T1'
  });

  useEffect(() => {
    fetch('/api/current-elo')
        .then(res => res.json())
        .then(data => {
            const eloByTeam: Record<string, Record<string, number>> = {};
            data.forEach((item: EloRating) => {
                if (!eloByTeam[ item.teamSlug]) {
                    eloByTeam[item.teamSlug] = {};
                }
                eloByTeam[item.teamSlug][item.mapName] = parseFloat(item.rating);
            });
            setEloData(eloByTeam);
        });
  }, []);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          completedWinners
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
      } else {
        console.error("Simulation API Error:", data.error || 'Unknown error');
        setResults([]);
      }
    } catch (error) {
      console.error("Failed to run simulation:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Tournament Simulations
      </h1>

      <Card className="w-full border border-black dark:border-white">
        <CardHeader>
          <CardTitle>VCT Champions 2025 Monte Carlo Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center space-y-4">
            <p>
              Run a Monte Carlo simulation of the upcoming VCT Champions 2025 tournament. 
              This will simulate the tournament 10,000 times based on current map Elo ratings to predict the outcome.
              The simulation will automatically use the results of any matches that have already been completed.
            </p>
            <Button onClick={runSimulation} disabled={loading}>
              {loading ? 'Running Simulation...' : 'Run Fresh Simulation'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full border border-black dark:border-white">
        <CardHeader>
            <div className="flex border-b border-gray-700">
                <button onClick={() => setActiveStage('groups')} className={`px-4 py-2 ${activeStage === 'groups' ? 'border-b-2 border-green-500' : ''}`}>Group Stage</button>
                <button onClick={() => setActiveStage('playoffs')} className={`px-4 py-2 ${activeStage === 'playoffs' ? 'border-b-2 border-green-500' : ''}`}>Playoffs</button>
            </div>
            {activeStage === 'groups' && (
                <div className="flex justify-center pt-4">
                    <button onClick={() => setActiveGroup('groupA')} className={`px-3 py-1 ${activeGroup === 'groupA' ? 'bg-gray-700 rounded' : ''}`}>Group A</button>
                    <button onClick={() => setActiveGroup('groupB')} className={`px-3 py-1 ${activeGroup === 'groupB' ? 'bg-gray-700 rounded' : ''}`}>Group B</button>
                    <button onClick={() => setActiveGroup('groupC')} className={`px-3 py-1 ${activeGroup === 'groupC' ? 'bg-gray-700 rounded' : ''}`}>Group C</button>
                    <button onClick={() => setActiveGroup('groupD')} className={`px-3 py-1 ${activeGroup === 'groupD' ? 'bg-gray-700 rounded' : ''}`}>Group D</button>
                </div>
            )}
        </CardHeader>
        <CardContent>
            {activeStage === 'groups' && (
                <GSLGroupBracket 
                    groupName={activeGroup}
                    seeding={VCT_CHAMPIONS_2025_SEEDING}
                    completedWinners={completedWinners}
                />
            )}
            {activeStage === 'playoffs' && (
                <div className="text-center p-8">Playoff bracket display is not yet implemented.</div>
            )}
        </CardContent>
      </Card>
      
      {results.length > 0 && (
        <>
            <Card className="w-full border border-black dark:border-white">
                <CardHeader>
                    <CardTitle>Championship Odds</CardTitle>
                </CardHeader>
                <CardContent>
                    <TitleOddsChart data={results} />
                </CardContent>
            </Card>

            <Card className="w-full border border-black dark:border-white">
            <CardHeader>
                <CardTitle>Round Reach Probabilities</CardTitle>
            </CardHeader>
            <CardContent>
                <RoundReachHeatmap data={results} />
            </CardContent>
            </Card>

            <Card className="w-full border border-black dark:border-white">
                <CardHeader>
                    <CardTitle>Pairwise Win Probabilities (Bo3)</CardTitle>
                </CardHeader>
                <CardContent>
                    <PairwiseMatrix data={results} eloData={eloData} />
                </CardContent>
            </Card>
        </>
      )}
    </div>
  );
} 