'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/constants/images';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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
    <div className="bg-card rounded-lg overflow-hidden shadow-lg">
      <div className="px-4 py-2 bg-muted border-b flex items-center justify-between">
        <div className="flex items-center justify-center">
          <h3 className="font-semibold">{title}</h3>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
        <div className="text-lg font-bold text-purple-500">#{currentIndex + 1}</div>
      </div>
      <div className="relative p-6">
        <button 
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-muted hover:bg-accent"
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
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-muted hover:bg-accent"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
} 