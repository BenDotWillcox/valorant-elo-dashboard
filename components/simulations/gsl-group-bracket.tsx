'use client';

import React from 'react';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import './bracket.css';
import { calculateBo3MatchWinProb } from '@/lib/predictions/client-match-simulation';

interface BracketProps {
  groupName: string;
  seeding: Record<string, string>;
  completedWinners: Record<string, string>;
  eloData: Record<string, Record<string, number>> | null;
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

export function GSLGroupBracket({ groupName, seeding, completedWinners, eloData }: BracketProps) {
    const resolveTeam = (placeholder: string | null): string | null => {
        if (!placeholder) return null;
        if (placeholder.includes("seed")) return seeding[placeholder] ?? null;

        const [type, matchId] = placeholder.split('-');
        const fullMatchId = `${groupName}-${matchId}`;

        if (type === 'winner') return completedWinners[fullMatchId] ?? null;

        if (type === 'loser') {
            const winner = completedWinners[fullMatchId];
            if (!winner) return null;

            let team1: string | null = null, team2: string | null = null;
            if (fullMatchId.endsWith('M1')) {
                team1 = resolveTeam(`${groupName}-seed1`);
                team2 = resolveTeam(`${groupName}-seed4`);
            } else if (fullMatchId.endsWith('M2')) {
                team1 = resolveTeam(`${groupName}-seed2`);
                team2 = resolveTeam(`${groupName}-seed3`);
            } else if (fullMatchId.endsWith('WM')) {
                team1 = resolveTeam(`winner-M1`);
                team2 = resolveTeam(`winner-M2`);
            } else if (fullMatchId.endsWith('EM')) {
                team1 = resolveTeam(`loser-M1`);
                team2 = resolveTeam(`loser-M2`);
            } else if (fullMatchId.endsWith('DM')) {
                team1 = resolveTeam('loser-WM');
                team2 = resolveTeam('winner-EM');
            }
            return winner === team1 ? team2 : team1;
        }
        return placeholder;
    };

    const matches = {
        'M1': { team1: resolveTeam(`${groupName}-seed1`), team2: resolveTeam(`${groupName}-seed4`), winner: resolveTeam('winner-M1') },
        'M2': { team1: resolveTeam(`${groupName}-seed2`), team2: resolveTeam(`${groupName}-seed3`), winner: resolveTeam('winner-M2') },
        'WM': { team1: resolveTeam('winner-M1'), team2: resolveTeam('winner-M2'), winner: resolveTeam('winner-WM') },
        'EM': { team1: resolveTeam('loser-M1'), team2: resolveTeam('loser-M2'), winner: resolveTeam('winner-EM') },
        'DM': { team1: resolveTeam('loser-WM'), team2: resolveTeam('winner-EM'), winner: resolveTeam('winner-DM') }
    };

    const calculateProb = (team1: string | null, team2: string | null) => {
        if (!team1 || !team2 || !eloData) return { prob1: 0.5, prob2: 0.5 };
        const prob1 = calculateBo3MatchWinProb(team1, team2, eloData);
        return { prob1, prob2: 1 - prob1 };
    }

    const matchesWithProbs = {
        M1: { ...matches.M1, probs: calculateProb(matches.M1.team1, matches.M1.team2) },
        M2: { ...matches.M2, probs: calculateProb(matches.M2.team1, matches.M2.team2) },
        WM: { ...matches.WM, probs: calculateProb(matches.WM.team1, matches.WM.team2) },
        EM: { ...matches.EM, probs: calculateProb(matches.EM.team1, matches.EM.team2) },
        DM: { ...matches.DM, probs: calculateProb(matches.DM.team1, matches.DM.team2) },
    };

    const MatchItem = ({ team1, team2, winner, probs, line }: { team1: string | null, team2: string | null, winner: string | null, probs: { prob1: number, prob2: number }, line?: 'up' | 'down' | 'straight' }) => {
        const prob1Text = `${(probs.prob1 * 100).toFixed(0)}%`;
        const prob2Text = `${(probs.prob2 * 100).toFixed(0)}%`;
        
        const team1BackgroundStyle = !winner && team1 && team2 ? {
            background: `linear-gradient(to right, rgba(72, 187, 120, 0.2) ${prob1Text}, transparent ${prob1Text})`
        } : {};

        const team2BackgroundStyle = !winner && team1 && team2 ? {
            background: `linear-gradient(to right, rgba(72, 187, 120, 0.2) ${prob2Text}, transparent ${prob2Text})`
        } : {};

        return (
            <div className="bracket-item">
                <div 
                    className={`bracket-item-team mod-first ${winner && winner === team1 ? 'mod-winner' : ''}`}
                    style={team1BackgroundStyle}
                >
                    <TeamDisplay slug={team1} />
                    {!winner && team1 && team2 && <span className="bracket-team-percentage">{prob1Text}</span>}
                </div>
                <div 
                    className={`bracket-item-team ${winner && winner === team2 ? 'mod-winner' : ''}`}
                    style={team2BackgroundStyle}
                >
                    <TeamDisplay slug={team2} />
                    {!winner && team1 && team2 && <span className="bracket-team-percentage">{prob2Text}</span>}
                </div>
                {line && <div className={`bracket-item-line mod-${line}`}></div>}
            </div>
        )
    };

    return (
        <div className="event-brackets-container">
          <div className="bracket-container mod-upper">
            {/* Column 1: Opening */}
            <div className="bracket-col">
              <div className="bracket-col-label">Opening</div>
              <div className="bracket-row">
                <MatchItem team1={matchesWithProbs.M1.team1} team2={matchesWithProbs.M1.team2} winner={matchesWithProbs.M1.winner} probs={matchesWithProbs.M1.probs} line="down" />
              </div>
              <div className="bracket-row">
                <MatchItem team1={matchesWithProbs.M2.team1} team2={matchesWithProbs.M2.team2} winner={matchesWithProbs.M2.winner} probs={matchesWithProbs.M2.probs} line="up" />
              </div>
            </div>
    
            {/* Column 2: Winner's */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Winner&apos;s</div>
              <div className="bracket-row">
                <MatchItem team1={matchesWithProbs.WM.team1} team2={matchesWithProbs.WM.team2} winner={matchesWithProbs.WM.winner} probs={matchesWithProbs.WM.probs} line="straight" />
              </div>
            </div>
    
            {/* Column 3: Qualified */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Qualified</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team ${matchesWithProbs.WM.winner ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matchesWithProbs.WM.winner} />
                  </div>
                </div>
              </div>
            </div>
          </div>
    
          <div className="bracket-container mod-lower">
            {/* Column 1: Elimination */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Elimination</div>
              <div className="bracket-row">
                <MatchItem team1={matchesWithProbs.EM.team1} team2={matchesWithProbs.EM.team2} winner={matchesWithProbs.EM.winner} probs={matchesWithProbs.EM.probs} line="straight" />
              </div>
            </div>
    
            {/* Column 2: Decider */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Decider</div>
              <div className="bracket-row">
                <MatchItem team1={matchesWithProbs.DM.team1} team2={matchesWithProbs.DM.team2} winner={matchesWithProbs.DM.winner} probs={matchesWithProbs.DM.probs} line="straight" />
              </div>
            </div>
    
            {/* Column 3: Qualified */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Qualified</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team ${matchesWithProbs.DM.winner ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matchesWithProbs.DM.winner} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    );
}
