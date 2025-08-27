'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { format } from 'date-fns';
import { InfoTooltip } from '@/components/ui/tooltip';

interface UpsetCarouselProps {
  title: string;
  data: {
    match_date: string;
    winner_name: string;
    winner_slug: string;
    winner_logo: string;
    loser_name: string;
    loser_slug: string;
    loser_logo: string;
    map_name: string;
    winner_score: number;
    loser_score: number;
    winner_elo: number;
    loser_elo: number;
  }[];
}

export function UpsetCarousel({ title, data }: UpsetCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => setCurrentIndex((currentIndex + 1) % data.length);
  const prev = () => setCurrentIndex((currentIndex - 1 + data.length) % data.length);

  if (!data.length) return null;

  const upset = data[currentIndex];

  return (
    <div className="bg-card/70 backdrop-blur rounded-xl shadow-lg border border-border/60">
      <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center justify-center">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <InfoTooltip content="Most unexpected victories based on the Elo rating difference between teams" />
        </div>
        <div className="text-lg font-bold text-foreground">#{currentIndex + 1}</div>
      </div>
      <div className="relative p-6">
        <button 
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full border border-border/60 bg-background/60 hover:bg-foreground/10 backdrop-blur"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="relative px-8">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-4">
            {(() => {
                const date = upset.match_date ? new Date(upset.match_date) : null;
                return date && !isNaN(date.getTime())
                  ? format(date, 'MMMM d, yyyy')
                  : 'Unknown date';
              })()}
            </div>

            <div className="grid grid-cols-[minmax(0,2fr)_auto_minmax(0,2fr)] items-center gap-4 mb-4">
              <div className="flex flex-col items-end">
                <div className="flex items-center justify-end gap-2 min-w-0">
                  <span className="text-lg font-medium truncate">{upset.winner_name}</span>
                  <div className="relative w-8 h-8 flex-shrink-0">
                    <Image
                      src={TEAM_LOGOS[upset.winner_slug as keyof typeof TEAM_LOGOS] || upset.winner_logo}
                      alt={upset.winner_name}
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground pr-10">
                  {Math.round(upset.winner_elo)} Elo
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground px-2">vs</div>
              <div className="flex flex-col items-start">
                <div className="flex items-center justify-start gap-2 min-w-0">
                  <div className="relative w-8 h-8 flex-shrink-0">
                    <Image
                      src={TEAM_LOGOS[upset.loser_slug as keyof typeof TEAM_LOGOS] || upset.loser_logo}
                      alt={upset.loser_name}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <span className="text-lg font-medium truncate">{upset.loser_name}</span>
                </div>
                <div className="text-sm text-muted-foreground pl-10">
                  {Math.round(upset.loser_elo)} Elo
                </div>
              </div>
            </div>

            <div className="text-lg text-muted-foreground mb-1">{upset.map_name}</div>
            <div className="text-3xl font-bold mb-2">{upset.winner_score} - {upset.loser_score}</div>
            <div className="text-sm font-medium text-purple-500">
              {Math.round(upset.loser_elo) - Math.round(upset.winner_elo)} Elo Difference
            </div>
          </div>
        </div>

        <button 
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full border border-border/60 bg-background/60 hover:bg-foreground/10 backdrop-blur"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
} 