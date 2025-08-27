'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';

interface StatCarouselProps<T> {
  title: string;
  tooltip?: string;
  data: T[];
  renderContent: (item: T) => React.ReactNode;
}

export function StatCarousel<T>({ title, tooltip, data, renderContent }: StatCarouselProps<T>) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => setCurrentIndex((currentIndex + 1) % data.length);
  const prev = () => setCurrentIndex((currentIndex - 1 + data.length) % data.length);

  if (!data.length) return null;

  const item = data[currentIndex];

  return (
    <div className="bg-card/70 backdrop-blur rounded-xl shadow-lg border border-border/60">
      <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center justify-center">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {tooltip && <InfoTooltip content={tooltip} />}
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
            {renderContent(item)}
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