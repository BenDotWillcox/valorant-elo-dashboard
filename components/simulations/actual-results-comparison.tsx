'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import { Trophy, Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ActualResults {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top4: string[];
  top6?: string[];
  top8?: string[];
  top12?: string[];
}

interface ActualResultsComparisonProps {
  simulationResults: SimulationResult[];
  actualResults: ActualResults;
}

export function ActualResultsComparison({
  simulationResults,
  actualResults,
}: ActualResultsComparisonProps) {
  // Sort by championship odds
  const sortedResults = [...simulationResults].sort((a, b) => b.championships - a.championships);

  // Find actual winner in predictions
  const winnerPrediction = sortedResults.find((r) => r.team === actualResults.winner);
  const winnerRank = winnerPrediction ? sortedResults.indexOf(winnerPrediction) + 1 : -1;

  // Find runner-up in predictions
  const runnerUpPrediction = sortedResults.find((r) => r.team === actualResults.runnerUp);
  const runnerUpRank = runnerUpPrediction ? sortedResults.indexOf(runnerUpPrediction) + 1 : -1;

  // Calculate prediction accuracy
  const top4Predicted = sortedResults.slice(0, 4).map((r) => r.team);
  const top4Correct = top4Predicted.filter((team) => actualResults.top4.includes(team)).length;

  const getTeamLogo = (slug: string) => TEAM_LOGOS[slug as keyof typeof TEAM_LOGOS];
  const getTeamName = (slug: string) => sortedResults.find((r) => r.team === slug)?.teamName ?? slug;

  const getRankIndicator = (predictedRank: number, actualPosition: number) => {
    if (predictedRank === actualPosition) {
      return { icon: Minus, color: 'text-gray-400', label: 'As predicted' };
    } else if (predictedRank < actualPosition) {
      return { icon: TrendingDown, color: 'text-red-400', label: 'Underperformed' };
    } else {
      return { icon: TrendingUp, color: 'text-green-400', label: 'Overperformed' };
    }
  };

  return (
    <Card className="border border-black dark:border-white bg-gradient-to-br from-gray-900 to-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-400" />
          Prediction vs Reality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Winner Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Actual Winner */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-yellow-900/30 to-yellow-700/20 border border-yellow-600/50">
            <div className="text-sm text-yellow-400 font-medium mb-2 flex items-center gap-1">
              <Trophy className="h-4 w-4" />
              Actual Winner
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12">
                {getTeamLogo(actualResults.winner) && (
                  <Image
                    src={getTeamLogo(actualResults.winner)}
                    alt={actualResults.winner}
                    fill
                    className="object-contain"
                  />
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-white">
                  {getTeamName(actualResults.winner)}
                </div>
                <div className="text-sm text-gray-400">
                  Predicted: #{winnerRank} ({winnerPrediction?.championships.toFixed(1)}% odds)
                </div>
              </div>
            </div>
          </div>

          {/* Runner-up */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-gray-700/30 to-gray-600/20 border border-gray-500/50">
            <div className="text-sm text-gray-300 font-medium mb-2">Runner-up</div>
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12">
                {getTeamLogo(actualResults.runnerUp) && (
                  <Image
                    src={getTeamLogo(actualResults.runnerUp)}
                    alt={actualResults.runnerUp}
                    fill
                    className="object-contain"
                  />
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-white">
                  {getTeamName(actualResults.runnerUp)}
                </div>
                <div className="text-sm text-gray-400">
                  Predicted: #{runnerUpRank} ({runnerUpPrediction?.championships.toFixed(1)}% odds)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top 4 Comparison */}
        <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
          <div className="text-sm text-gray-300 font-medium mb-3">
            Top 4 Prediction Accuracy: {top4Correct}/4 correct
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {actualResults.top4.map((team, index) => {
              const prediction = sortedResults.find((r) => r.team === team);
              const predictedRank = prediction ? sortedResults.indexOf(prediction) + 1 : -1;
              const indicator = getRankIndicator(predictedRank, index + 1);
              const Icon = indicator.icon;

              return (
                <div
                  key={team}
                  className={cn(
                    'p-3 rounded-lg border flex flex-col items-center gap-2',
                    top4Predicted.includes(team)
                      ? 'bg-green-900/20 border-green-600/50'
                      : 'bg-red-900/20 border-red-600/50'
                  )}
                >
                  <div className="text-xs text-gray-400">#{index + 1}</div>
                  <div className="relative w-8 h-8">
                    {getTeamLogo(team) && (
                      <Image
                        src={getTeamLogo(team)}
                        alt={team}
                        fill
                        className="object-contain"
                      />
                    )}
                  </div>
                  <div className="text-sm font-medium text-white text-center">
                    {getTeamName(team)}
                  </div>
                  <div className={cn('flex items-center gap-1 text-xs', indicator.color)}>
                    <Icon className="h-3 w-3" />
                    <span>Pred: #{predictedRank}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Biggest Surprises */}
        <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
          <div className="text-sm text-gray-300 font-medium mb-3">Model Accuracy Highlights</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Biggest overperformers */}
            <div>
              <div className="text-xs text-green-400 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Exceeded Expectations
              </div>
              <div className="space-y-2">
                {actualResults.top4
                  .map((team) => {
                    const prediction = sortedResults.find((r) => r.team === team);
                    const predictedRank = prediction ? sortedResults.indexOf(prediction) + 1 : 100;
                    const actualRank = actualResults.top4.indexOf(team) + 1;
                    return { team, predictedRank, actualRank, diff: predictedRank - actualRank };
                  })
                  .filter((t) => t.diff > 0)
                  .sort((a, b) => b.diff - a.diff)
                  .slice(0, 2)
                  .map(({ team, predictedRank, actualRank }) => (
                    <div key={team} className="flex items-center gap-2 text-sm">
                      <div className="relative w-5 h-5">
                        {getTeamLogo(team) && (
                          <Image
                            src={getTeamLogo(team)}
                            alt={team}
                            fill
                            className="object-contain"
                          />
                        )}
                      </div>
                      <span className="text-gray-300">{getTeamName(team)}</span>
                      <span className="text-green-400">
                        #{predictedRank} → #{actualRank}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Biggest underperformers (predicted top 4 but didn't make it) */}
            <div>
              <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                Below Expectations
              </div>
              <div className="space-y-2">
                {top4Predicted
                  .filter((team) => !actualResults.top4.includes(team))
                  .slice(0, 2)
                  .map((team) => {
                    const predictedRank = top4Predicted.indexOf(team) + 1;
                    return (
                      <div key={team} className="flex items-center gap-2 text-sm">
                        <div className="relative w-5 h-5">
                          {getTeamLogo(team) && (
                            <Image
                              src={getTeamLogo(team)}
                              alt={team}
                              fill
                              className="object-contain"
                            />
                          )}
                        </div>
                        <span className="text-gray-300">{getTeamName(team)}</span>
                        <span className="text-red-400">Predicted #{predictedRank}, missed top 4</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
