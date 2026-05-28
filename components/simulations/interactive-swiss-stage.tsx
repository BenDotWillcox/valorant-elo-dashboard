'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { TEAM_LOGOS } from '@/lib/constants/images';
import type { TournamentConfig } from '@/lib/simulation/tournament-formats';
import { MatchComparisonActions } from './match-comparison-actions';

interface InteractiveSwissStageProps {
  tournament: TournamentConfig;
  onQualifiedChange?: (qualified: string[]) => void;
}

interface PickMatch {
  id: string;
  round: number;
  bracket: '0-0' | '1-0' | '0-1' | '1-1';
  label: string;
  team1: string | null;
  team2: string | null;
}

interface TeamRecord {
  wins: number;
  losses: number;
}

const bracketLabels: Record<PickMatch['bracket'], string> = {
  '0-0': 'Opening Matches',
  '1-0': '1-0 Matches',
  '0-1': '0-1 Matches',
  '1-1': '1-1 Deciders',
};

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

function pairTeams(teams: string[], idPrefix: string, round: number, bracket: PickMatch['bracket']): PickMatch[] {
  return [
    {
      id: `${idPrefix}-1`,
      round,
      bracket,
      label: 'Match 1',
      team1: teams[0] ?? null,
      team2: teams[1] ?? null,
    },
    {
      id: `${idPrefix}-2`,
      round,
      bracket,
      label: 'Match 2',
      team1: teams[2] ?? null,
      team2: teams[3] ?? null,
    },
  ];
}

function getLoser(match: PickMatch, winner: string | undefined): string | null {
  if (!winner || !match.team1 || !match.team2) return null;
  return winner === match.team1 ? match.team2 : match.team1;
}

function TeamRow({
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
          <Image src={logo} alt={slug ?? 'Team logo'} width={22} height={22} className="shrink-0 object-contain" />
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
  onPick,
}: {
  match: PickMatch;
  winner?: string;
  onPick: (match: PickMatch, winner: string) => void;
}) {
  const disabled = !match.team1 || !match.team2;

  return (
    <div className="overflow-hidden rounded-md border border-black/20 bg-background shadow-sm dark:border-white/20">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>{match.label}</span>
        <span className="flex items-center gap-2">
          <MatchComparisonActions team1={match.team1} team2={match.team2} defaultMatchType="BO3" />
          <span>{match.bracket}</span>
        </span>
      </div>
      <TeamRow
        slug={match.team1}
        selected={winner === match.team1}
        disabled={disabled}
        ariaLabel={`Pick ${match.team1 ?? 'TBD'} in ${match.bracket} ${match.label}`}
        onClick={() => match.team1 && onPick(match, match.team1)}
      />
      <TeamRow
        slug={match.team2}
        selected={winner === match.team2}
        disabled={disabled}
        ariaLabel={`Pick ${match.team2 ?? 'TBD'} in ${match.bracket} ${match.label}`}
        onClick={() => match.team2 && onPick(match, match.team2)}
      />
    </div>
  );
}

export function InteractiveSwissStage({ tournament, onQualifiedChange }: InteractiveSwissStageProps) {
  const [picks, setPicks] = useState<Record<string, string>>({});

  const swissTeams = useMemo(() => {
    const seededTeams: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const team = tournament.seeding[`swiss-seed${i}`];
      if (team) seededTeams.push(team);
    }
    return seededTeams;
  }, [tournament.seeding]);

  const round1Matches = useMemo<PickMatch[]>(
    () => [
      { id: 'swiss-pick-r1-1', round: 1, bracket: '0-0', label: 'Match 1', team1: swissTeams[0] ?? null, team2: swissTeams[7] ?? null },
      { id: 'swiss-pick-r1-2', round: 1, bracket: '0-0', label: 'Match 2', team1: swissTeams[1] ?? null, team2: swissTeams[6] ?? null },
      { id: 'swiss-pick-r1-3', round: 1, bracket: '0-0', label: 'Match 3', team1: swissTeams[2] ?? null, team2: swissTeams[5] ?? null },
      { id: 'swiss-pick-r1-4', round: 1, bracket: '0-0', label: 'Match 4', team1: swissTeams[3] ?? null, team2: swissTeams[4] ?? null },
    ],
    [swissTeams]
  );

  const round1Complete = round1Matches.every((match) => picks[match.id]);
  const round1Winners = round1Matches.map((match) => picks[match.id]).filter(Boolean);
  const round1Losers = round1Matches.map((match) => getLoser(match, picks[match.id])).filter(Boolean) as string[];

  const round2WinnersMatches = useMemo(() => {
    if (!round1Complete) return pairTeams([], 'swiss-pick-r2-10', 2, '1-0');
    return pairTeams(seededShuffle(round1Winners, `1-0:${round1Winners.join('|')}`), 'swiss-pick-r2-10', 2, '1-0');
  }, [round1Complete, round1Winners]);

  const round2LosersMatches = useMemo(() => {
    if (!round1Complete) return pairTeams([], 'swiss-pick-r2-01', 2, '0-1');
    return pairTeams(seededShuffle(round1Losers, `0-1:${round1Losers.join('|')}`), 'swiss-pick-r2-01', 2, '0-1');
  }, [round1Complete, round1Losers]);

  const round2Matches = useMemo(
    () => [...round2WinnersMatches, ...round2LosersMatches],
    [round2WinnersMatches, round2LosersMatches]
  );
  const round2Complete = round2Matches.every((match) => picks[match.id]);
  const qualifiedFromRound2 = useMemo(
    () => round2WinnersMatches.map((match) => picks[match.id]).filter(Boolean),
    [picks, round2WinnersMatches]
  );
  const eliminatedFromRound2 = useMemo(
    () => round2LosersMatches.map((match) => getLoser(match, picks[match.id])).filter(Boolean) as string[],
    [picks, round2LosersMatches]
  );
  const round3Pool = useMemo(
    () => [
      ...round2WinnersMatches.map((match) => getLoser(match, picks[match.id])).filter(Boolean),
      ...round2LosersMatches.map((match) => picks[match.id]).filter(Boolean),
    ] as string[],
    [picks, round2WinnersMatches, round2LosersMatches]
  );

  const round3Matches = useMemo(() => {
    if (!round2Complete) return pairTeams([], 'swiss-pick-r3-11', 3, '1-1');
    return pairTeams(seededShuffle(round3Pool, `1-1:${round3Pool.join('|')}`), 'swiss-pick-r3-11', 3, '1-1');
  }, [round2Complete, round3Pool]);

  const qualified = useMemo(
    () => [
      ...qualifiedFromRound2,
      ...round3Matches.map((match) => picks[match.id]).filter(Boolean),
    ],
    [picks, qualifiedFromRound2, round3Matches]
  );
  const eliminated = useMemo(
    () => [
      ...eliminatedFromRound2,
      ...round3Matches.map((match) => getLoser(match, picks[match.id])).filter(Boolean),
    ] as string[],
    [eliminatedFromRound2, picks, round3Matches]
  );

  const records = useMemo(() => {
    const currentRecords = new Map<string, TeamRecord>();
    swissTeams.forEach((team) => currentRecords.set(team, { wins: 0, losses: 0 }));

    [...round1Matches, ...round2Matches, ...round3Matches].forEach((match) => {
      const winner = picks[match.id];
      const loser = getLoser(match, winner);
      if (!winner || !loser) return;
      currentRecords.get(winner)!.wins += 1;
      currentRecords.get(loser)!.losses += 1;
    });

    return currentRecords;
  }, [picks, round1Matches, round2Matches, round3Matches, swissTeams]);

  const handlePick = (match: PickMatch, winner: string) => {
    setPicks((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([matchId]) => {
          const knownMatch = [...round1Matches, ...round2Matches, ...round3Matches].find((item) => item.id === matchId);
          return knownMatch && knownMatch.round <= match.round;
        })
      );

      next[match.id] = winner;
      return next;
    });
  };

  const resetPicks = () => setPicks({});

  const qualifiedKey = qualified.join('|');

  useEffect(() => {
    onQualifiedChange?.(qualified);
  }, [onQualifiedChange, qualified, qualifiedKey]);

  const renderMatches = (matches: PickMatch[]) => (
    <div className="space-y-3">
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Swiss Stage Picker</CardTitle>
          <CardDescription>Pick winners to advance teams through Swiss, qualify at 2 wins, and eliminate at 2 losses.</CardDescription>
        </div>
        <Button variant="outline" onClick={resetPicks} className="w-fit">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Round 1</h3>
              <div className="text-xs text-muted-foreground">{bracketLabels['0-0']}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {round1Matches.map((match) => (
                <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Round 2</h3>
              <div className="text-xs text-muted-foreground">Winners move to qualification matches; losers move to elimination matches.</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">{bracketLabels['1-0']}</div>
                {renderMatches(round2WinnersMatches)}
              </div>
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">{bracketLabels['0-1']}</div>
                {renderMatches(round2LosersMatches)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Round 3</h3>
              <div className="text-xs text-muted-foreground">{bracketLabels['1-1']}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {round3Matches.map((match) => (
                <MatchCard key={match.id} match={match} winner={picks[match.id]} onPick={handlePick} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-md border p-3">
            <h3 className="mb-2 text-sm font-semibold">Records</h3>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:grid-cols-1">
              {swissTeams.map((team) => {
                const record = records.get(team);
                return (
                  <div key={team} className="flex items-center justify-between rounded border px-2 py-1">
                    <span>{team}</span>
                    <span className="font-medium">{record?.wins ?? 0}-{record?.losses ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-md border border-green-500/50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-green-600 dark:text-green-400">Qualified</h3>
              <div className="space-y-1 text-sm">
                {qualified.length ? qualified.map((team) => <div key={team}>{team}</div>) : <div className="text-muted-foreground">TBD</div>}
              </div>
            </div>

            <div className="rounded-md border border-red-500/50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">Eliminated</h3>
              <div className="space-y-1 text-sm">
                {eliminated.length ? eliminated.map((team) => <div key={team}>{team}</div>) : <div className="text-muted-foreground">TBD</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
