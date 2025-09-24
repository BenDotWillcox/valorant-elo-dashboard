"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { getPlayerRatings } from "@/actions/vpm-actions";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  useEffect(() => {
    startTransition(async () => {
      const ratings = await getPlayerRatings({ minGames: minMaps });

      const vpms = ratings
        .map((r) => r.vpm)
        .filter((v) => v !== null) as number[];
      if (vpms.length > 0) {
        setVpmRange({ min: Math.min(...vpms), max: Math.max(...vpms) });
      } else {
        setVpmRange({ min: 0, max: 0 });
      }

      const rankedRatings = ratings.map((row, index) => ({
        ...row,
        rank: index + 1,
      }));
      setData(rankedRatings);
    });
  }, [minMaps]);

  const handleMinMapsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
    setMinMaps(value);
  };

  const getVpmColor = (vpm: number | null): string => {
    if (vpm === null || vpmRange.min === vpmRange.max) {
      return "inherit";
    }
    const percentage = (vpm - vpmRange.min) / (vpmRange.max - vpmRange.min);
    const hue = percentage * 120; // 0=red, 60=yellow, 120=green
    return `hsl(${hue}, 80%, 45%)`;
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
      <div className="border rounded-lg h-[700px] overflow-y-auto relative">
        <Table>
          <TableHeader className="sticky top-0 bg-white dark:bg-gray-950">
            <TableRow>
              <TableHead className="w-[80px]">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Current VPM</TableHead>
              <TableHead>Career Maps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (
              data.map((player) => (
                <TableRow key={player.rank}>
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
                  <TableCell style={{ color: getVpmColor(player.vpm) }}>
                    {formatVpm(player.vpm)}
                  </TableCell>
                  <TableCell>{player.mapsPlayed}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
