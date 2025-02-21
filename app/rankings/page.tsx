'use client';

import { useState, useEffect } from 'react';
import { TeamMapData } from '@/types/elo';
import { MAP_POOL } from '@/lib/constants/maps';
import { MAP_IMAGES } from "@/lib/constants/images";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TEAM_LOGOS } from "@/lib/constants/images";
import { cn } from "@/lib/utils";

export default function RankingsPage() {
  const [mapRankings, setMapRankings] = useState<Record<string, TeamMapData[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rankings')
      .then(res => res.json())
      .then(data => {
        setMapRankings(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  const sortedMaps = [...MAP_POOL.active.sort(), ...MAP_POOL.inactive.sort()];

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-purple-600 dark:text-purple-400 font-display">
        Current Map Rankings
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {sortedMaps.map((mapName) => {
          const rankings = mapRankings[mapName] || [];
          const isActive = MAP_POOL.active.includes(mapName);
          
          return (
            <div key={mapName} className="bg-card rounded-lg overflow-hidden shadow-lg">
              <div className="relative h-24 w-full">
                <Image
                  src={MAP_IMAGES[mapName as keyof typeof MAP_IMAGES]}
                  alt={mapName}
                  fill
                  className="object-contain"
                />
              </div>
              <div className={cn(
                "px-4 py-2 text-center font-medium border-y",
                isActive 
                  ? "bg-green-500/20 text-green-500 border-green-500/20" 
                  : "bg-secondary text-secondary-foreground border-secondary"
              )}>
                {isActive ? "Active" : "Inactive"}
              </div>
              <ScrollArea className="h-[400px] w-full border-t p-4">
                <div className="space-y-2">
                  {rankings.length > 0 ? (
                    rankings.map((team, index) => (
                      <div 
                        key={team.teamId} 
                        className="flex justify-between items-center p-2 bg-muted rounded"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">
                            {index + 1}.
                          </span>
                          <div className="relative w-6 h-6">
                            <Image
                              src={TEAM_LOGOS[team.teamSlug as keyof typeof TEAM_LOGOS] || team.logoUrl}
                              alt={`${team.teamName} `}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="font-medium">
                            {team.teamName}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {Math.round(Number(team.rating))}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      Map hasn&apos;t been played this season
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
} 