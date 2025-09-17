'use client';

import React from 'react';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import './bracket.css';

interface BracketProps {
  groupName: string;
  seeding: Record<string, string>;
  completedWinners: Record<string, string>;
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

export function GSLGroupBracket({ groupName, seeding, completedWinners }: BracketProps) {
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

    return (
        <div className="event-brackets-container">
          <div className="bracket-container mod-upper">
            {/* Column 1: Opening */}
            <div className="bracket-col">
              <div className="bracket-col-label">Opening</div>
              <div className="bracket-row mod-1">
                <div className="bracket-item">
                  <div className={`bracket-item-team mod-first ${matches.M1.winner === matches.M1.team1 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.M1.team1} />
                  </div>
                  <div className={`bracket-item-team ${matches.M1.winner === matches.M1.team2 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.M1.team2} />
                  </div>
                  <div className="bracket-item-line mod-down"></div>
                </div>
              </div>
              <div className="bracket-row mod-2">
                <div className="bracket-item">
                  <div className={`bracket-item-team mod-first ${matches.M2.winner === matches.M2.team1 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.M2.team1} />
                  </div>
                  <div className={`bracket-item-team ${matches.M2.winner === matches.M2.team2 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.M2.team2} />
                  </div>
                  <div className="bracket-item-line mod-up"></div>
                </div>
              </div>
            </div>
    
            {/* Column 2: Winner's */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Winner&apos;s</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team mod-first ${matches.WM.winner && matches.WM.winner === matches.WM.team1 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.WM.team1} />
                  </div>
                  <div className={`bracket-item-team ${matches.WM.winner && matches.WM.winner === matches.WM.team2 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.WM.team2} />
                  </div>
                  <div className="bracket-item-line mod-straight"></div>
                </div>
              </div>
            </div>
    
            {/* Column 3: Qualified */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Qualified</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team ${matches.WM.winner ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.WM.winner} />
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
                <div className="bracket-item">
                  <div className={`bracket-item-team mod-first ${matches.EM.winner && matches.EM.winner === matches.EM.team1 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.EM.team1} />
                  </div>
                  <div className={`bracket-item-team ${matches.EM.winner && matches.EM.winner === matches.EM.team2 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.EM.team2} />
                  </div>
                  <div className="bracket-item-line mod-straight"></div>
                </div>
              </div>
            </div>
    
            {/* Column 2: Decider */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Decider</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team mod-first ${matches.DM.winner && matches.DM.winner === matches.DM.team1 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.DM.team1} />
                  </div>
                  <div className={`bracket-item-team ${matches.DM.winner && matches.DM.winner === matches.DM.team2 ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.DM.team2} />
                  </div>
                  <div className="bracket-item-line mod-straight"></div>
                </div>
              </div>
            </div>
    
            {/* Column 3: Qualified */}
            <div className="bracket-col mod-center">
              <div className="bracket-col-label">Qualified</div>
              <div className="bracket-row">
                <div className="bracket-item">
                  <div className={`bracket-item-team ${matches.DM.winner ? 'mod-winner' : ''}`}>
                    <TeamDisplay slug={matches.DM.winner} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    );
}
