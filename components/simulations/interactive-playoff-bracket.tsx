'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { TEAM_LOGOS } from '@/lib/constants/images';
import type { TournamentConfig } from '@/lib/simulation/tournament-formats';
import { MatchComparisonActions } from './match-comparison-actions';
import './bracket.css';

interface InteractivePlayoffBracketProps {
  tournament: TournamentConfig;
  swissQualified: string[];
}

interface PlayoffMatch {
  id: string;
  label: string;
  bracket: 'upper' | 'lower' | 'final';
  team1: string | null;
  team2: string | null;
  type: 'BO3' | 'BO5';
}

const playoffMatchDependents: Record<string, string[]> = {
  'ub-r1-1': ['ub-r2-1', 'lb-r1-1'],
  'ub-r1-2': ['ub-r2-1', 'lb-r1-1'],
  'ub-r1-3': ['ub-r2-2', 'lb-r1-2'],
  'ub-r1-4': ['ub-r2-2', 'lb-r1-2'],
  'ub-r2-1': ['ub-final', 'lb-r2-2'],
  'ub-r2-2': ['ub-final', 'lb-r2-1'],
  'ub-final': ['lb-final', 'grand-final'],
  'lb-r1-1': ['lb-r2-1'],
  'lb-r1-2': ['lb-r2-2'],
  'lb-r2-1': ['lb-r3-1'],
  'lb-r2-2': ['lb-r3-1'],
  'lb-r3-1': ['lb-final'],
  'lb-final': ['grand-final'],
  'grand-final': [],
};

function collectDependentMatchIds(matchId: string): Set<string> {
  const dependentIds = new Set<string>();
  const pending = [...(playoffMatchDependents[matchId] ?? [])];

  while (pending.length) {
    const dependentId = pending.pop()!;
    if (dependentIds.has(dependentId)) continue;

    dependentIds.add(dependentId);
    pending.push(...(playoffMatchDependents[dependentId] ?? []));
  }

  return dependentIds;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  let hash = 2166136261;

  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let i = shuffled.length - 1; i > 0; i--) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    const j = Math.abs(hash) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function getLoser(match: PlayoffMatch, winner: string | undefined): string | null {
  if (!winner || !match.team1 || !match.team2) return null;
  return winner === match.team1 ? match.team2 : match.team1;
}

function TeamButton({
  slug,
  selected,
  disabled,
  ariaLabel,
  onClick,
}: {
  slug: string | null;
  selected: boolean;
  disabled: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  const logo = slug ? TEAM_LOGOS[slug as keyof typeof TEAM_LOGOS] : null;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled || !slug}
      onClick={onClick}
      className={[
        'flex h-11 w-full items-center justify-between gap-3 border px-3 text-left text-sm transition-colors',
        selected ? 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300' : 'border-border bg-card hover:bg-muted',
        disabled || !slug ? 'cursor-not-allowed opacity-60 hover:bg-card' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="flex min-w-0 items-center gap-2">
        {logo ? (
          <Image src={logo} alt={`${slug} logo`} width={22} height={22} className="shrink-0 object-contain" />
        ) : (
          <span className="h-[22px] w-[22px] shrink-0 rounded border border-dashed" />
        )}
        <span className="truncate font-medium">{slug ?? 'TBD'}</span>
      </span>
      {selected ? <span className="text-xs font-semibold">W</span> : null}
    </button>
  );
}

function MatchCard({
  match,
  winner,
  className = '',
  onPick,
}: {
  match: PlayoffMatch;
  winner?: string;
  className?: string;
  onPick: (match: PlayoffMatch, winner: string) => void;
}) {
  const disabled = !match.team1 || !match.team2;

  return (
    <div className={`playoff-picker-match overflow-hidden rounded-md border border-black/20 bg-background shadow-sm dark:border-white/20 ${className}`}>
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>{match.label}</span>
        <span className="flex items-center gap-2">
          <MatchComparisonActions team1={match.team1} team2={match.team2} defaultMatchType={match.type} />
          <span>{match.type}</span>
        </span>
      </div>
      <TeamButton
        slug={match.team1}
        selected={winner === match.team1}
        disabled={disabled}
        ariaLabel={`Pick ${match.team1 ?? 'TBD'} in ${match.label}`}
        onClick={() => match.team1 && onPick(match, match.team1)}
      />
      <TeamButton
        slug={match.team2}
        selected={winner === match.team2}
        disabled={disabled}
        ariaLabel={`Pick ${match.team2 ?? 'TBD'} in ${match.label}`}
        onClick={() => match.team2 && onPick(match, match.team2)}
      />
    </div>
  );
}

export function InteractivePlayoffBracket({ tournament, swissQualified }: InteractivePlayoffBracketProps) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const bracketReady = swissQualified.length === 4;
  const swissQualifiedKey = swissQualified.join('|');

  useEffect(() => {
    setPicks({});
  }, [swissQualifiedKey]);

  const autoQualified = useMemo(
    () => [
      tournament.seeding['playoff-auto1'],
      tournament.seeding['playoff-auto2'],
      tournament.seeding['playoff-auto3'],
      tournament.seeding['playoff-auto4'],
    ].filter(Boolean),
    [tournament.seeding]
  );

  const upperRound1 = useMemo<PlayoffMatch[]>(() => {
    if (!bracketReady) {
      return Array.from({ length: 4 }, (_, index) => ({
        id: `ub-r1-${index + 1}`,
        label: `Upper Round 1 Match ${index + 1}`,
        bracket: 'upper',
        team1: null,
        team2: null,
        type: 'BO3',
      }));
    }

    const seed = `playoffs:${autoQualified.join('|')}:${swissQualified.join('|')}`;
    const shuffledAuto = seededShuffle(autoQualified, `${seed}:auto`);
    const shuffledSwiss = seededShuffle(swissQualified, `${seed}:swiss`);

    return shuffledAuto.map((team, index) => ({
      id: `ub-r1-${index + 1}`,
      label: `Upper Round 1 Match ${index + 1}`,
      bracket: 'upper',
      team1: team,
      team2: shuffledSwiss[index] ?? null,
      type: 'BO3',
    }));
  }, [autoQualified, bracketReady, swissQualified]);

  const matchById = (id: string, matches: PlayoffMatch[]) => matches.find((match) => match.id === id);
  const winnerOf = (id: string) => picks[id] ?? null;
  const loserOf = (id: string, matches: PlayoffMatch[]) => getLoser(matchById(id, matches)!, picks[id]);

  const upperRound2: PlayoffMatch[] = [
    { id: 'ub-r2-1', label: 'Upper Semifinal 1', bracket: 'upper', team1: winnerOf('ub-r1-1'), team2: winnerOf('ub-r1-2'), type: 'BO3' },
    { id: 'ub-r2-2', label: 'Upper Semifinal 2', bracket: 'upper', team1: winnerOf('ub-r1-3'), team2: winnerOf('ub-r1-4'), type: 'BO3' },
  ];

  const upperFinal: PlayoffMatch[] = [
    { id: 'ub-final', label: 'Upper Final', bracket: 'upper', team1: winnerOf('ub-r2-1'), team2: winnerOf('ub-r2-2'), type: 'BO3' },
  ];

  const lowerRound1: PlayoffMatch[] = [
    { id: 'lb-r1-1', label: 'Lower Round 1 Match 1', bracket: 'lower', team1: loserOf('ub-r1-1', upperRound1), team2: loserOf('ub-r1-2', upperRound1), type: 'BO3' },
    { id: 'lb-r1-2', label: 'Lower Round 1 Match 2', bracket: 'lower', team1: loserOf('ub-r1-3', upperRound1), team2: loserOf('ub-r1-4', upperRound1), type: 'BO3' },
  ];

  const lowerRound2: PlayoffMatch[] = [
    { id: 'lb-r2-1', label: 'Lower Round 2 Match 1', bracket: 'lower', team1: getLoser(upperRound2[1], picks['ub-r2-2']), team2: winnerOf('lb-r1-1'), type: 'BO3' },
    { id: 'lb-r2-2', label: 'Lower Round 2 Match 2', bracket: 'lower', team1: getLoser(upperRound2[0], picks['ub-r2-1']), team2: winnerOf('lb-r1-2'), type: 'BO3' },
  ];

  const lowerRound3: PlayoffMatch[] = [
    { id: 'lb-r3-1', label: 'Lower Round 3', bracket: 'lower', team1: winnerOf('lb-r2-1'), team2: winnerOf('lb-r2-2'), type: 'BO3' },
  ];

  const lowerFinal: PlayoffMatch[] = [
    { id: 'lb-final', label: 'Lower Final', bracket: 'lower', team1: getLoser(upperFinal[0], picks['ub-final']), team2: winnerOf('lb-r3-1'), type: 'BO5' },
  ];

  const grandFinal: PlayoffMatch[] = [
    { id: 'grand-final', label: 'Grand Final', bracket: 'final', team1: winnerOf('ub-final'), team2: winnerOf('lb-final'), type: 'BO5' },
  ];

  const handlePick = (match: PlayoffMatch, winner: string) => {
    setPicks((current) => {
      if (current[match.id] === winner) return current;

      const dependentIds = collectDependentMatchIds(match.id);
      const next = Object.fromEntries(
        Object.entries(current).filter(([matchId]) => !dependentIds.has(matchId))
      );

      next[match.id] = winner;
      return next;
    });
  };

  const renderConnectedColumn = (
    title: string,
    matches: PlayoffMatch[],
    options: { connector?: boolean; podPairs?: boolean; rows: 1 | 2 | 4 }
  ) => (
    <div
      className={`playoff-picker-round ${options.connector ? 'has-connector' : ''}`}
      data-rows={options.rows}
    >
      <h3 className="playoff-picker-round-title">{title}</h3>
      <div className="playoff-picker-round-lane">
        {options.podPairs ? (
          <>
            <div className="playoff-picker-pod has-pair">
              {matches.slice(0, 2).map((match) => (
                <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
              ))}
            </div>
            <div className="playoff-picker-pod has-pair">
              {matches.slice(2, 4).map((match) => (
                <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
              ))}
            </div>
          </>
        ) : (
          matches.map((match) => (
            <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Playoff Bracket Picker</CardTitle>
          <CardDescription>
            Complete the Swiss stage to fill the opening round. Each auto-qualified team is randomly paired with one Swiss qualifier.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => setPicks({})} className="w-fit">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {!bracketReady ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Waiting for four Swiss qualifiers before filling playoff matchups.
        </div>
      ) : null}

      <div className="space-y-6 overflow-x-auto pb-2">
        <div className="min-w-[980px] space-y-8">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Upper Bracket
            </p>
            <div className="playoff-picker-connected-section">
              {renderConnectedColumn('Upper Round 1', upperRound1, { connector: true, podPairs: true, rows: 4 })}
              {renderConnectedColumn('Upper Semifinals', upperRound2, { connector: true, rows: 2 })}
              {renderConnectedColumn('Upper Final', upperFinal, { connector: true, rows: 1 })}
              {renderConnectedColumn('Grand Final', grandFinal, { rows: 1 })}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Lower Bracket
            </p>
            <div className="playoff-picker-connected-section mod-lower">
              {renderConnectedColumn('Lower Round 1', lowerRound1, { connector: true, rows: 2 })}
              {renderConnectedColumn('Lower Round 2', lowerRound2, { connector: true, rows: 2 })}
              {renderConnectedColumn('Lower Round 3', lowerRound3, { connector: true, rows: 1 })}
              {renderConnectedColumn('Lower Final', lowerFinal, { rows: 1 })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
