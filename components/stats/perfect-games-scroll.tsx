'use client';

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import Image from 'next/image';
import { TEAM_LOGOS, TeamSlug } from '@/lib/constants/images';
import { format } from 'date-fns';

interface Game {
  winnerSlug: TeamSlug;
  winnerName: string;
  winnerLogo: string;
  loserName: string;
  loserSlug: string;
  mapName: string;
  matchDate: string;
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
          {data.map((game) => (
            <div 
              key={`${game.winnerSlug}-${game.loserSlug}-${game.matchDate}`}
              className="flex-none w-64 p-2 mr-2 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="relative w-6 h-6">
                  <Image
                    src={TEAM_LOGOS[game.winnerSlug] || game.winnerLogo}
                    alt={game.winnerName}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="font-medium">{game.winnerName}</span>
              </div>
              <div className="text-sm text-muted-foreground">vs {game.loserName}</div>
              <div className="text-sm text-muted-foreground">{game.mapName}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {format(new Date(game.matchDate), 'MMM d, yyyy')}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
} 