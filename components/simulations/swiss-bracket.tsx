'use client';

import React, { useMemo } from 'react';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import './bracket.css';
import { calculateBo3MatchWinProb } from '@/lib/predictions/client-match-simulation';

interface SwissMatch {
  team1: string;
  team2: string;
  winner: string | null;
  round: number;
  matchNumber: number;
  id: string;
  type: "BO3" | "BO5";
  bracket: string;
}

interface TeamRecord {
  team: string;
  wins: number;
  losses: number;
  seed: number;
}

interface SwissBracketProps {
  stageName: string;
  eloData: Record<string, Record<string, number>> | null;
  matches: SwissMatch[];
  standings: TeamRecord[];
  qualified: string[];
  eliminated: string[];
}

const TeamDisplay = ({ slug }: { slug: string | null }) => {
  if (!slug) return <div className="bracket-team-name">TBD</div>;
  const logo = TEAM_LOGOS[slug as keyof typeof TEAM_LOGOS];
  return (
    <>
      {logo && <Image src={logo} alt={slug} width={24} height={24} className="bracket-team-logo" />}
      <span className="bracket-team-name">{slug}</span>
    </>
  );
};

const RecordBadge = ({ wins, losses, isQualified, isEliminated }: { 
  wins: number; 
  losses: number; 
  isQualified: boolean; 
  isEliminated: boolean;
}) => {
  let className = "swiss-record-badge";
  if (isQualified) className += " mod-qualified";
  else if (isEliminated) className += " mod-eliminated";
  
  return <span className={className}>{wins}-{losses}</span>;
};

export function SwissBracket({ 
  stageName, 
  eloData,
  matches,
  standings,
  qualified,
  eliminated 
}: SwissBracketProps) {
  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped = new Map<number, SwissMatch[]>();
    for (const match of matches) {
      if (!grouped.has(match.round)) {
        grouped.set(match.round, []);
      }
      grouped.get(match.round)!.push(match);
    }
    return grouped;
  }, [matches]);

  const calculateProb = (team1: string | null, team2: string | null) => {
    if (!team1 || !team2 || !eloData) return { prob1: 0.5, prob2: 0.5 };
    const prob1 = calculateBo3MatchWinProb(team1, team2, eloData);
    return { prob1, prob2: 1 - prob1 };
  };

  const MatchItem = ({ match }: { match: SwissMatch }) => {
    const probs = calculateProb(match.team1, match.team2);
    const prob1Text = `${(probs.prob1 * 100).toFixed(0)}%`;
    const prob2Text = `${(probs.prob2 * 100).toFixed(0)}%`;

    const team1BackgroundStyle = !match.winner && match.team1 && match.team2 ? {
      background: `linear-gradient(to right, rgba(72, 187, 120, 0.2) ${prob1Text}, transparent ${prob1Text})`
    } : {};

    const team2BackgroundStyle = !match.winner && match.team1 && match.team2 ? {
      background: `linear-gradient(to right, rgba(72, 187, 120, 0.2) ${prob2Text}, transparent ${prob2Text})`
    } : {};

    const isTeam1Qualified = qualified.includes(match.team1);
    const isTeam2Qualified = qualified.includes(match.team2);
    const isTeam1Eliminated = eliminated.includes(match.team1);
    const isTeam2Eliminated = eliminated.includes(match.team2);

    return (
      <div className="bracket-item swiss-match">
        <div className="swiss-match-type">{match.type}</div>
        <div 
          className={`bracket-item-team mod-first ${match.winner === match.team1 ? 'mod-winner' : ''} ${isTeam1Qualified ? 'mod-qualified' : ''} ${isTeam1Eliminated ? 'mod-eliminated' : ''}`}
          style={team1BackgroundStyle}
        >
          <TeamDisplay slug={match.team1} />
          {!match.winner && match.team1 && match.team2 && (
            <span className="bracket-team-percentage">{prob1Text}</span>
          )}
        </div>
        <div 
          className={`bracket-item-team ${match.winner === match.team2 ? 'mod-winner' : ''} ${isTeam2Qualified ? 'mod-qualified' : ''} ${isTeam2Eliminated ? 'mod-eliminated' : ''}`}
          style={team2BackgroundStyle}
        >
          <TeamDisplay slug={match.team2} />
          {!match.winner && match.team1 && match.team2 && (
            <span className="bracket-team-percentage">{prob2Text}</span>
          )}
        </div>
      </div>
    );
  };

  const rounds = Array.from(matchesByRound.keys()).sort((a, b) => a - b);

  // Labels for each bracket type
  const bracketLabels: Record<string, string> = {
    "0-0": "Opening Matches",
    "1-0": "Winners Match (2-0 Qualifies)",
    "0-1": "Elimination Match (0-2 Eliminated)",
    "1-1": "Decider Match",
  };

  return (
    <div className="swiss-bracket-container">
      {/* Rounds */}
      <div className="swiss-rounds">
        {rounds.map((round) => {
          const roundMatches = matchesByRound.get(round) || [];
          
          // Group by bracket
          const matchesByBracket = new Map<string, SwissMatch[]>();
          for (const match of roundMatches) {
            if (!matchesByBracket.has(match.bracket)) {
              matchesByBracket.set(match.bracket, []);
            }
            matchesByBracket.get(match.bracket)!.push(match);
          }

          // Sort brackets: higher wins first
          const sortedBrackets = Array.from(matchesByBracket.entries()).sort((a, b) => {
            const [winsA, lossesA] = a[0].split('-').map(Number);
            const [winsB, lossesB] = b[0].split('-').map(Number);
            if (winsB !== winsA) return winsB - winsA;
            return lossesA - lossesB;
          });

          return (
            <div key={round} className="swiss-round">
              <div className="bracket-col-label">Round {round}</div>
              {sortedBrackets.map(([bracket, bracketMatches]) => (
                <div key={bracket} className="swiss-bracket-group">
                  <div className="swiss-bracket-label">
                    {bracketLabels[bracket] || `${bracket} Bracket`}
                  </div>
                  {bracketMatches.map((match) => (
                    <div key={match.id} className="swiss-match-wrapper">
                      <MatchItem match={match} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Final Standings */}
      <div className="swiss-standings">
        <div className="bracket-col-label">Final Standings</div>
        <div className="swiss-standings-list">
          {standings.map((team, index) => {
            const isQualified = qualified.includes(team.team);
            const isEliminated = eliminated.includes(team.team);
            return (
              <div 
                key={team.team} 
                className={`swiss-standing-item ${isQualified ? 'mod-qualified' : ''} ${isEliminated ? 'mod-eliminated' : ''}`}
              >
                <span className="swiss-standing-rank">{index + 1}.</span>
                <TeamDisplay slug={team.team} />
                <RecordBadge 
                  wins={team.wins} 
                  losses={team.losses} 
                  isQualified={isQualified}
                  isEliminated={isEliminated}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
