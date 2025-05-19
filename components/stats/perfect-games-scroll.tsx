'use client';

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import Image from 'next/image';
import { TEAM_LOGOS, TeamSlug } from '@/lib/constants/images';
import { format } from 'date-fns';

interface Game {
  winner_slug?: TeamSlug | null;
  winner_name?: string | null;
  winner_logo?: string | null;
  loser_name?: string | null;
  loser_slug?: string | null;
  map_name?: string | null;
  match_date?: string | null;
}

interface PerfectGamesProps {
  data: Game[];
}

export function PerfectGamesScroll({ data }: PerfectGamesProps) {
  return (
    <div className="bg-card rounded-lg overflow-hidden shadow-lg">
      <div className="px-4 py-2 bg-muted border-b">
        <h3 className="font-semibold">13-0 Club</h3>
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex p-4">
          {data.map((game, index) => {
            console.log(`Perfect Game Data [${index}]:`, game);
            
            const key = `perfect-game-${index}-${game.winner_slug || 'no-winner-slug'}-${game.loser_slug || 'no-loser-slug'}-${game.match_date || 'no-match-date'}`;
            
            const winnerLogoSrc = (game.winner_slug && TEAM_LOGOS[game.winner_slug as keyof typeof TEAM_LOGOS]) 
                                ? TEAM_LOGOS[game.winner_slug as keyof typeof TEAM_LOGOS] 
                                : game.winner_logo || '/images/valorant-logo.png';

            return (
              <div 
                key={key}
                className="flex-none w-64 p-2 mr-2 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative w-6 h-6">
                    <Image
                      src={winnerLogoSrc}
                      alt={game.winner_name || 'Winner logo'}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <span className="font-medium">{game.winner_name || 'Unknown Team'}</span>
                </div>
                <div className="text-sm text-muted-foreground">vs {game.loser_name || 'Unknown Team'}</div>
                <div className="text-sm text-muted-foreground">{game.map_name || 'Unknown Map'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {(() => {
                    const dateStr = game.match_date;
                    if (dateStr) {
                      const date = new Date(dateStr);
                      if (!isNaN(date.getTime())) {
                        return format(date, 'MMM d, yyyy');
                      }
                    }
                    return 'Unknown date';
                  })()}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
} 