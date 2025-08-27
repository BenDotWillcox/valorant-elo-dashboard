"use client"

import * as React from "react"
// import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Season } from "@/db/schema"

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeason: number | undefined;
  onSeasonChange: (seasonId: number) => void;
}

export function SeasonSelector({ seasons, selectedSeason, onSeasonChange }: SeasonSelectorProps) {

  const handleSeasonChange = (seasonId: string) => {
    onSeasonChange(parseInt(seasonId));
  };

  if (!selectedSeason) {
    return null; // or a loading state
  }

  return (
    <Select
      value={selectedSeason.toString()}
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
              {season.is_active && <Badge variant="outline">Active</Badge>}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 