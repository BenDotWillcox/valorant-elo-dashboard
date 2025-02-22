"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useState, useCallback, useEffect } from "react"

interface Season {
  id: number;
  year: number;
  isActive: boolean;
}

interface SeasonSelectorProps {
  onSeasonChange: (seasonId: number) => void;
}

export function SeasonSelector({ onSeasonChange }: SeasonSelectorProps) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season>();

  // Memoize the season change handler
  const handleSeasonChange = useCallback((season: Season) => {
    setSelectedSeason(season);
    onSeasonChange(season.id);
  }, [onSeasonChange]);

  useEffect(() => {
    fetch('/api/seasons')
      .then(res => res.json())
      .then(data => {
        setSeasons(data);
        const activeSeason = data.find((s: Season) => s.isActive);
        if (activeSeason) {
          handleSeasonChange(activeSeason);
        }
      });
  }, [handleSeasonChange]); // Add handleSeasonChange to deps

  return (
    <div className="w-full overflow-auto">
      <div className="flex gap-3 p-1">
        {seasons.map((season) => (
          <button
            key={season.id}
            onClick={() => {
              handleSeasonChange(season);
            }}
            className={cn(
              "relative rounded-md px-4 py-2 text-sm font-medium transition-all",
              "hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/30 dark:hover:text-purple-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
              selectedSeason?.id === season.id && "ring-2 ring-purple-500 ring-offset-2",
              season.isActive
                ? "bg-purple-600 text-white shadow-sm dark:bg-purple-500"
                : "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
            )}
          >
            <span className="relative">
              {season.year}
              {season.isActive && (
                <Badge
                  className={cn(
                    "absolute -right-8 -top-4 z-10 px-1.5 py-0 text-xs shadow-sm",
                    "bg-white text-purple-700 border-purple-200",
                    "dark:bg-purple-900 dark:text-purple-200 dark:border-purple-800",
                  )}
                >
                  Active
                </Badge>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
} 