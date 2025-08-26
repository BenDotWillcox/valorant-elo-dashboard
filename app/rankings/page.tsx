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
      <h1 className="text-4xl font-bold mb-8 text-center text-green-500 dark:text-green-400 font-display">
        Current Map Rankings
      </h1>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-8">
        {sortedMaps.map((mapName) => {
          const rankings = mapRankings[mapName] || [];
          const isActive = MAP_POOL.active.includes(mapName);
          
          return (
            <div key={mapName} className="bg-card rounded-lg overflow-hidden shadow-lg">
              <div className="relative w-full aspect-[32/9]">
                <Image
                  src={MAP_IMAGES[mapName as keyof typeof MAP_IMAGES]}
                  alt={mapName}
                  fill
                  className="object-contain"
                />
              </div>
              <div className={cn(
                "px-4 py-2 text-center font-medium",
                isActive 
                  ? "bg-green-500/20 text-green-500" 
                  : "bg-secondary text-secondary-foreground"
              )}>
                {isActive ? "Active" : "Inactive"}
              </div>
              <ScrollArea className="h-[400px] w-full p-4">
                <div className="space-y-2">
                  {rankings.length > 0 ? (
                    rankings.map((team, index) => (
                      <div 
                        key={team.teamId} 
                        className="flex justify-between items-center p-2 rounded bg-neutral-300 dark:bg-muted/60 border border-neutral-400/60 dark:border-border/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-medium flex-shrink-0">
                            {index + 1}.
                          </span>
                          <div className="relative w-6 h-6 flex-shrink-0">
                            <Image
                              src={TEAM_LOGOS[team.teamSlug as keyof typeof TEAM_LOGOS] || team.logoUrl}
                              alt={`${team.teamName} `}
                              fill
                              className="object-contain"
                            />
                          </div>
                          <span className="font-medium truncate">
                            {team.teamName}
                          </span>
                        </div>
                        <span className="text-black dark:text-white flex-shrink-0">
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