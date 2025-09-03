'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Image from "next/image";
import { TEAM_LOGOS } from "@/lib/constants/images";
import { cn } from "@/lib/utils";

interface MatchResultsProps {
  team1: string;
  team2: string;
  selectedMaps: string[];
  mapProbabilities: [number, number][];
  matchProbability: [number, number];
}

export function MatchResults({ 
  team1, 
  team2, 
  selectedMaps, 
  mapProbabilities, 
  matchProbability 
}: MatchResultsProps) {
  return (
    <Card className="border border-black dark:border-white">
      <CardHeader>
        <CardTitle>Match Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Team vs Team Header */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-16 h-16">
              <Image
                src={TEAM_LOGOS[team1 as keyof typeof TEAM_LOGOS]}
                alt={team1}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-lg font-medium">{team1}</span>
          </div>
          <span className="text-2xl font-bold">vs</span>
          <div className="flex items-center gap-2">
            <div className="relative w-16 h-16">
              <Image
                src={TEAM_LOGOS[team2 as keyof typeof TEAM_LOGOS]}
                alt={team2}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-lg font-medium">{team2}</span>
          </div>
        </div>

        {/* Overall Match Probability */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className={cn(
            "p-4 rounded-lg",
            matchProbability[0] > matchProbability[1] ? "bg-green-500/10" : "bg-red-500/10"
          )}>
            <div className="text-2xl font-bold">
              {(matchProbability[0] * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">
              {team1} Win Probability
            </div>
          </div>
          <div className={cn(
            "p-4 rounded-lg",
            matchProbability[1] > matchProbability[0] ? "bg-green-500/10" : "bg-red-500/10"
          )}>
            <div className="text-2xl font-bold">
              {(matchProbability[1] * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">
              {team2} Win Probability
            </div>
          </div>
        </div>

        {/* Map Probabilities Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Map</TableHead>
              <TableHead className="text-right">{team1}</TableHead>
              <TableHead className="text-right">{team2}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedMaps.map((map, index) => (
              <TableRow key={map}>
                <TableCell>{map}</TableCell>
                <TableCell className="text-right">
                  {(mapProbabilities[index][0] * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right">
                  {(mapProbabilities[index][1] * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
} 