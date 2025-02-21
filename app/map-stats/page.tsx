'use client';

import { useState, useEffect } from 'react';
import { MapStatsChart } from '@/components/charts/map-stats-chart';
import { Card } from "@/components/ui/card";
import { TeamMapData } from '@/types/elo';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MAP_POOL } from '@/lib/constants/maps';
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import Image from 'next/image';
import { TEAM_LOGOS } from "@/lib/constants/images";
import { SeasonSelector } from '@/components/season-selector';

interface TeamItem {
  id: string;
  name: string;
  slug: string;
  logo: string;
}

interface ChartDropZone {
  id: number;
  teams: TeamItem[];
}

export default function MapStatsPage() {
  const [numCharts, setNumCharts] = useState(1);
  const [data, setData] = useState<TeamMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isTeamListVisible, setIsTeamListVisible] = useState(true);
  const [dropZones, setDropZones] = useState<ChartDropZone[]>([{ id: 0, teams: [] }]);
  const [selectedSeason, setSelectedSeason] = useState<number>();

  useEffect(() => {
    setLoading(true);
    const maps = includeInactive 
      ? [...MAP_POOL.active, ...MAP_POOL.inactive]
      : MAP_POOL.active;

    fetch(`/api/current-elo?maps=${maps.join(',')}&seasonId=${selectedSeason || ''}`)
      .then(res => res.json())
      .then(data => {
        console.log('Raw API response:', data);
        setData(data);
        setLoading(false);
      });
  }, [includeInactive, selectedSeason]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && over.id.toString().startsWith('chart-')) {
      const chartIndex = parseInt(over.id.toString().split('-')[1]);
      const team = active.data.current as TeamItem;
      
      setDropZones(zones => zones.map((zone, idx) => {
        if (idx === chartIndex && !zone.teams.find(t => t.slug === team.slug)) {
          return { ...zone, teams: [...zone.teams, team] };
        }
        return zone;
      }));
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="container mx-auto p-4 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <SeasonSelector onSeasonChange={setSelectedSeason} />
          
          <input 
            type="range" 
            min="1" 
            max="4" 
            value={numCharts} 
            onChange={(e) => {
              const newNum = parseInt(e.target.value);
              setNumCharts(newNum);
              setDropZones(zones => {
                if (newNum > zones.length) {
                  return [...zones, ...Array(newNum - zones.length).fill(null).map((_, i) => ({
                    id: zones.length + i,
                    teams: []
                  }))];
                }
                return zones.slice(0, newNum);
              });
            }}
            className="w-[180px]"
          />
          <span>{numCharts} {numCharts === 1 ? 'Chart' : 'Charts'}</span>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="includeInactive"
              checked={includeInactive}
              onCheckedChange={(checked) => setIncludeInactive(checked as boolean)}
            />
            <Label htmlFor="includeInactive">Include inactive maps</Label>
          </div>
        </div>

        {/* Charts Grid */}
        <div className={`grid gap-4 ${
          numCharts === 1 ? 'grid-cols-1' : 
          numCharts === 2 ? 'grid-cols-1 md:grid-cols-2' :
          'grid-cols-1 md:grid-cols-2'
        }`}>
          {dropZones.map((zone, index) => (
            <ChartDropZone 
              key={zone.id} 
              index={index} 
              teams={zone.teams} 
              data={data} 
              setDropZones={setDropZones}
            />
          ))}
        </div>

        {/* Team List */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t">
          <Button
            variant="ghost"
            className="w-full py-2"
            onClick={() => setIsTeamListVisible(!isTeamListVisible)}
          >
            {isTeamListVisible ? <ChevronDown /> : <ChevronUp />}
          </Button>
          
          {isTeamListVisible && (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[300px] overflow-y-auto">
              {Array.from(new Set(data.map(d => d.teamSlug)))
                .sort()
                .map(teamSlug => {
                  const teamData = data.find(d => d.teamSlug === teamSlug)!;
                  return (
                    <DraggableTeam
                      key={teamSlug}
                      team={{
                        id: teamSlug,
                        name: teamData.teamName,
                        slug: teamData.teamSlug,
                        logo: TEAM_LOGOS[teamData.teamSlug as keyof typeof TEAM_LOGOS]
                      }}
                    />
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </DndContext>
  );
}

function ChartDropZone({ 
  index, 
  teams, 
  data, 
  setDropZones 
}: { 
  index: number; 
  teams: TeamItem[]; 
  data: TeamMapData[]; 
  setDropZones: React.Dispatch<React.SetStateAction<ChartDropZone[]>>; 
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `chart-${index}`,
  });

  return (
    <Card 
      ref={setNodeRef}
      className={`p-4 ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex justify-end mb-2">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setDropZones(zones => 
            zones.map((zone, idx) => 
              idx === index ? { ...zone, teams: [] } : zone
            )
          )}
        >
          Clear
        </Button>
      </div>
      {teams.length > 0 ? (
        <MapStatsChart 
          data={data}
          selectedTeams={teams.map(t => t.slug)}
        />
      ) : (
        <div className="w-full max-w-[500px] mx-auto aspect-[4/3] flex items-center justify-center border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">Drag and Drop to populate</p>
        </div>
      )}
    </Card>
  );
}

function DraggableTeam({ team }: { team: TeamItem }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: team.id,
    data: team
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 p-2 border rounded cursor-move hover:bg-accent"
    >
      <div className="relative w-8 h-8">
        <Image
          src={team.logo}
          alt={team.name}
          fill
          className="object-contain"
        />
      </div>
      <span className="truncate">{team.name}</span>
    </div>
  );
} 