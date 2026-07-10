"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import Image from "next/image";
import { getPlayerRatings } from "@/actions/vpm-actions";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlayerRating = {
  rank: number;
  ign: string | null;
  teamName: string | null;
  teamLogo: string | null;
  vpm: number | null;
  mapsPlayed: number | null;
};

export function PlayerRatingsTable() {
  const [minMaps, setMinMaps] = useState(50);
  const [data, setData] = useState<PlayerRating[]>([]);
  const [vpmRange, setVpmRange] = useState({ min: 0, max: 0 });
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PlayerRating;
    direction: "asc" | "desc";
  }>({ key: "vpm", direction: "desc" });

  useEffect(() => {
    startTransition(async () => {
      try {
        setLoadError(false);
        const ratings = await getPlayerRatings({ minGames: minMaps });

        const vpms = ratings
          .map((r) => r.vpm)
          .filter((v) => v !== null) as number[];
        if (vpms.length > 0) {
          setVpmRange({ min: Math.min(...vpms), max: Math.max(...vpms) });
        } else {
          setVpmRange({ min: 0, max: 0 });
        }

        const initialData = ratings.map((row) => ({
          ...row,
          rank: 0, // Rank will be assigned after sorting
        }));
        setData(initialData);
      } catch (error) {
        console.error("Unable to load player ratings.", error);
        setData([]);
        setVpmRange({ min: 0, max: 0 });
        setLoadError(true);
      }
    });
  }, [minMaps]);

  const sortedData = useMemo(() => {
    const sortableData = [...data];
    if (sortConfig !== null) {
      sortableData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || bValue === null) {
          if (aValue === null && bValue === null) return 0;
          return aValue === null ? 1 : -1;
        }

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    // Re-rank after sorting
    return sortableData.map((item, index) => ({ ...item, rank: index + 1 }));
  }, [data, sortConfig]);

  const requestSort = (key: keyof PlayerRating) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleMinMapsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
    setMinMaps(value);
  };

  const getVpmColor = (vpm: number | null): string => {
    if (vpm === null || vpmRange.min === vpmRange.max) {
      return "hsl(0, 0%, 25%)"; // A neutral gray with sufficient contrast for white text
    }
    const percentage = (vpm - vpmRange.min) / (vpmRange.max - vpmRange.min);
    const hue = percentage * 120; // 0=red, 60=yellow, 120=green
    // At 25% lightness, white text remains above the WCAG AA 4.5:1
    // contrast threshold across the entire red-to-green hue range.
    return `hsl(${hue}, 70%, 25%)`;
  };

  const formatVpm = (vpm: number | null): string => {
    if (vpm === null) return "N/A";
    const formatted = vpm.toFixed(3);
    return vpm > 0 ? `+${formatted}` : formatted;
  };

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <label
          htmlFor="min-maps"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Minimum Maps Played
        </label>
        <Input
          id="min-maps"
          type="number"
          value={minMaps}
          onChange={handleMinMapsChange}
          placeholder="e.g. 50"
          className="w-full"
        />
      </div>
      {loadError ? (
        <p role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Player ratings are temporarily unavailable. Please try again later.
        </p>
      ) : null}
      <div
        role="region"
        aria-label="Player ratings table"
        tabIndex={0}
        className="border rounded-lg h-[700px] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <table className="w-full caption-bottom text-sm relative">
          <caption className="sr-only">
            Player VPM ratings, current team, and career map count
          </caption>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[80px]">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort("vpm")}>
                  Current VPM
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Career Maps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell><div className="h-4 bg-muted rounded w-8" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-24" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-32" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-16" /></TableCell>
                    <TableCell><div className="h-4 bg-muted rounded w-12" /></TableCell>
                  </TableRow>
                ))}
              </>
            ) : (
              sortedData.map((player) => (
                <TableRow key={player.ign}>
                  <TableCell>{player.rank}</TableCell>
                  <TableCell>{player.ign}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      {player.teamLogo && (
                        <Image
                          src={player.teamLogo}
                          alt={player.teamName || "Team logo"}
                          width={24}
                          height={24}
                          className="mr-2"
                        />
                      )}
                      {player.teamName}
                    </div>
                  </TableCell>
                  <TableCell
                    style={{
                      backgroundColor: getVpmColor(player.vpm),
                    }}
                    className="text-white font-medium"
                  >
                    {formatVpm(player.vpm)}
                  </TableCell>
                  <TableCell>{player.mapsPlayed}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
