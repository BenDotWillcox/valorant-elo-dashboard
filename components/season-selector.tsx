"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useState, useCallback, useEffect } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

  const handleSeasonChange = useCallback((seasonId: string) => {
    const season = seasons.find(s => s.id === parseInt(seasonId));
    if (season) {
      setSelectedSeason(season);
      onSeasonChange(season.id);
    }
  }, [seasons, onSeasonChange]);

  useEffect(() => {
    fetch('/api/seasons')
      .then(res => res.json())
      .then(data => {
        setSeasons(data);
        const activeSeason = data.find((s: Season) => s.isActive);
        if (activeSeason) {
          setSelectedSeason(activeSeason);
          onSeasonChange(activeSeason.id);
        } else if (data.length > 0) {
          setSelectedSeason(data[0]);
          onSeasonChange(data[0].id);
        }
      });
  }, [onSeasonChange]);

  if (!selectedSeason) {
    return null; // or a loading state
  }

  return (
    <Select
      value={selectedSeason.id.toString()}
      onValueChange={handleSeasonChange}
    >
      <SelectTrigger className="w-fit min-w-[120px] rounded-full text-sm font-medium border-black dark:border-white bg-transparent transition-all duration-200 will-change-transform focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Select a season" />
      </SelectTrigger>
      <SelectContent>
        {seasons.map((season) => (
          <SelectItem key={season.id} value={season.id.toString()}>
            <div className="flex items-center gap-2">
              <span>{season.year}</span>
              {season.isActive && <Badge variant="outline">Active</Badge>}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 