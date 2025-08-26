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
import { DndContext, DragEndEvent, useDraggable, useDroppable, DragOverlay, Active } from '@dnd-kit/core';
import Image from 'next/image';
import { TEAM_LOGOS } from "@/lib/constants/images";

interface TeamItem {
  id: string;
  name: string;
  slug: string;
  logo: string;
}

interface ChartDropZoneType {
  id: number;
  teams: TeamItem[];
}

export default function MapStatsPage() {
  const [numCharts, setNumCharts] = useState(1);
  const [data, setData] = useState<TeamMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isTeamListVisible, setIsTeamListVisible] = useState(true);
  const [dropZones, setDropZones] = useState<ChartDropZoneType[]>([{ id: 0, teams: [] }]);
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [allTeams, setAllTeams] = useState<TeamItem[]>([]);

  useEffect(() => {
    setLoading(true);
    const maps = includeInactive 
      ? [...MAP_POOL.active, ...MAP_POOL.inactive]
      : MAP_POOL.active;

    fetch(`/api/current-elo?maps=${maps.join(',')}&seasonId=`)
      .then(res => res.json())
      .then((apiData: TeamMapData[]) => {
        console.log('Raw API response for current ratings:', apiData);
        setData(apiData);
        
        const uniqueTeams = apiData.reduce((acc: TeamItem[], current) => {
          if (current.teamSlug && !acc.find(item => item.slug === current.teamSlug)) {
            acc.push({
              id: current.teamSlug, 
              name: current.teamName || 'Unknown Team',
              slug: current.teamSlug,
              logo: current.logoUrl || '/images/valorant-logo.png' 
            });
          }
          return acc;
        }, []).sort((a,b) => a.name.localeCompare(b.name));
        setAllTeams(uniqueTeams);
        setLoading(false);
      });
  }, [includeInactive]);

  const handleDragStart = (event: { active: Active }) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    
    if (over && over.id.toString().startsWith('chart-') && active.data.current) {
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
  
  const activeDragItem = activeId ? allTeams.find(team => team.id === activeId) : null;

  if (loading) return <div>Loading...</div>;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="container mx-auto p-4 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
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
            <ChartDropZoneComponent 
              key={zone.id} 
              index={index} 
              teams={zone.teams} 
              data={data} 
              setDropZones={setDropZones}
            />
          ))}
        </div>

        {/* Team List Toggle */}
        <Button 
          variant="outline" 
          onClick={() => setIsTeamListVisible(!isTeamListVisible)}
          className="w-full md:hidden"
        >
          {isTeamListVisible ? <ChevronUp className="mr-2" /> : <ChevronDown className="mr-2" />} 
          Toggle Team List
        </Button>

        {/* Team List - Draggable Teams */}
        {isTeamListVisible && (
          <Card className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-2">Teams (Drag to Chart)</h3>
            {allTeams.map(team => (
                <DraggableTeamComponent key={team.id} team={team} />
            ))}
          </Card>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <DraggableTeamComponent team={activeDragItem} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ChartDropZoneComponent({ 
  index, 
  teams, 
  data, 
  setDropZones 
}: { 
  index: number; 
  teams: TeamItem[]; 
  data: TeamMapData[]; 
  setDropZones: React.Dispatch<React.SetStateAction<ChartDropZoneType[]>>;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `chart-${index}`,
  });

  return (
    <Card 
      ref={setNodeRef}
      className={`p-4 relative ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      {/* Display dropped team logos */}
      {teams.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 z-10">
          {teams.map(team => (
            <div key={team.id} title={team.name} className="w-6 h-6 relative rounded-full overflow-hidden border border-muted">
              <Image 
                src={team.logo} 
                alt={team.name} 
                fill 
                className="object-contain" 
              />
            </div>
          ))}
        </div>
      )}

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

function DraggableTeamComponent({ team, isOverlay }: { team: TeamItem, isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: team.id,
    data: team
  });

  const style = transform && !isOverlay ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const overlayStyle = isOverlay ? {
    zIndex: 1000,
    boxShadow: '0 0 15px rgba(0,0,0,0.2)',
    cursor: 'grabbing'
  } : {};

  return (
    <div
      ref={setNodeRef}
      style={{...style, ...overlayStyle}}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 p-2 border rounded cursor-move hover:bg-accent bg-card"
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