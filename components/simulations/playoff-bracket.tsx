'use client';

import React from 'react';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import './bracket.css';

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

const MatchItem = ({ line }: { line?: 'up' | 'down' | 'straight' }) => {
    return (
        <div className="bracket-item">
            <div className={`bracket-item-team mod-first`}>
                <TeamDisplay slug={null} />
            </div>
            <div className={`bracket-item-team`}>
                <TeamDisplay slug={null} />
            </div>
            {line && <div className={`bracket-item-line mod-${line}`}></div>}
        </div>
    )
};

const FinalMatchItem = () => {
    return (
        <div className="bracket-item">
            <div className={`bracket-item-team mod-first`}>
                <TeamDisplay slug={null} />
            </div>
            <div className={`bracket-item-team`}>
                <TeamDisplay slug={null} />
            </div>
        </div>
    )
}

export function PlayoffBracket() {
    return (
        <div className="event-brackets-container">
            <div className="bracket-container mod-upper">
                {/* Upper Quarterfinals */}
                <div className="bracket-col">
                    <div className="bracket-col-label">Upper Quarterfinals</div>
                    <div className="bracket-row"><MatchItem line="down" /></div>
                    <div className="bracket-row"><MatchItem line="up" /></div>
                    <div className="bracket-row"><MatchItem line="down" /></div>
                    <div className="bracket-row"><MatchItem line="up" /></div>
                </div>

                {/* Upper Semifinals */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Upper Semifinals</div>
                    <div className="bracket-row"><MatchItem line="down" /></div>
                    <div className="bracket-row"><MatchItem line="up" /></div>
                </div>

                {/* Upper Final */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Upper Final</div>
                    <div className="bracket-row"><FinalMatchItem /></div>
                </div>

                {/* Grand Final */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Grand Final</div>
                    <div className="bracket-row"><FinalMatchItem /></div>
                </div>
            </div>

            <div className="bracket-container mod-lower">
                {/* Lower Round 1 */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Lower Round 1</div>
                    <div className="bracket-row mod-spacing"><MatchItem line="straight" /></div>
                    <div className="bracket-row"><MatchItem line="straight" /></div>
                </div>

                {/* Lower Round 2 */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Lower Round 2</div>
                    <div className="bracket-row"><MatchItem line="down" /></div>
                    <div className="bracket-row"><MatchItem line="up" /></div>
                </div>

                {/* Lower Round 3 */}
                <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Lower Round 3</div>
                    <div className="bracket-row"><MatchItem line="straight" /></div>
                </div>

                 {/* Lower Final */}
                 <div className="bracket-col mod-center">
                    <div className="bracket-col-label">Lower Final</div>
                    <div className="bracket-row"><FinalMatchItem /></div>
                </div>
            </div>
        </div>
    );
}
