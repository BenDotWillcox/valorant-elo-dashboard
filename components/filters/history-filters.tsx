import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamData } from "@/types/elo";
import { useState } from "react";
import { TEAM_REGIONS, getTeamRegion } from "@/lib/constants/regions";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { MAP_COLORS } from "@/lib/constants/colors";

interface HistoryFiltersProps {
  data: TeamData[];
  viewType: 'byTeam' | 'byMap';
  setViewType: (type: 'byTeam' | 'byMap') => void;
  selectedTeams: string[];
  setSelectedTeams: (teams: string[]) => void;
  selectedMaps: string[];
  setSelectedMaps: (maps: string[]) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function HistoryFilters({
  data,
  viewType,
  setViewType,
  selectedTeams,
  setSelectedTeams,
  selectedMaps,
  setSelectedMaps,
  isCollapsed,
  setIsCollapsed,
}: HistoryFiltersProps) {
  const [expandedMaps, setExpandedMaps] = useState<string[]>([]);
  const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleMap = (mapName: string) => {
    setExpandedMaps(prev => 
      prev.includes(mapName) ? prev.filter(m => m !== mapName) : [...prev, mapName]
    );
  };

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => 
      prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
    );
  };

  // Group teams by map and region
  const mapTeams = data.reduce((acc: Record<string, Record<string, TeamData[]>>, team) => {
    team.data.forEach(point => {
      if (!acc[point.mapName]) {
        acc[point.mapName] = {};
      }
      const region = getTeamRegion(team.teamSlug);
      if (!acc[point.mapName][region]) {
        acc[point.mapName][region] = [];
      }
      if (!acc[point.mapName][region].find(t => t.teamId === team.teamId)) {
        acc[point.mapName][region].push(team);
      }
    });
    return acc;
  }, {});

  // Get all unique teams from the data
  const allTeams = data?.reduce((acc: Array<{name: string, slug: string, region: string}>, team) => {
    if (!acc.some(t => t.slug === team.teamSlug)) {
      acc.push({
        name: team.teamName,
        slug: team.teamSlug,
        region: getTeamRegion(team.teamSlug)
      });
    }
    return acc;
  }, []) || [];

  const handleTeamSelect = (teamName: string) => {
    // Clear previous selections
    setSelectedTeams([]);
    setSelectedMaps([]);
    
    // Get all maps this team has played
    const team = data.find(t => t.teamName === teamName);
    if (team) {
      const teamMaps = team.data.map(d => d.mapName);
      const uniqueMaps = Array.from(new Set(teamMaps));
      
      // Select all maps and create team-map combinations
      setSelectedMaps(uniqueMaps);
      const newTeams = uniqueMaps.map(map => `${map}-${teamName}`);
      setSelectedTeams(newTeams);
    }
  };

  return (
    <div className={`
      fixed md:relative
      bottom-0 left-0 md:top-0 md:bottom-auto
      h-screen
      w-full md:w-auto
      z-50 md:z-auto
      border-r bg-background 
      transition-all duration-300
      ${isCollapsed ? 'translate-y-[calc(100%-3rem)] md:translate-y-0' : 'translate-y-0'}
      md:${isCollapsed ? 'w-12' : 'w-80'}
    `}>
      <div className="p-4 flex justify-between items-center border-b">
        {!isCollapsed && <h3 className="font-semibold">Filters</h3>}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <span className="md:hidden">
            {isCollapsed ? <ChevronUp /> : <ChevronDown />}
          </span>
          <span className="hidden md:inline">
            {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </span>
        </Button>
      </div>

      {!isCollapsed && (
        <div className="p-4">
          <RadioGroup
            value={viewType}
            onValueChange={(value) => {
              setViewType(value as 'byTeam' | 'byMap');
              // Clear selections when switching views
              setSelectedTeams([]);
              setSelectedMaps([]);
            }}
            className="mb-6 space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="byMap" id="byMap" />
              <Label htmlFor="byMap">Compare By Map</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="byTeam" id="byTeam" />
              <Label htmlFor="byTeam">Compare By Team</Label>
            </div>
          </RadioGroup>

          {viewType === 'byTeam' ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2">Select Team</Label>
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search teams..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md bg-background"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <ScrollArea className="h-[200px] border rounded-md">
                      <div className="p-2 space-y-1">
                        {data
                          ?.sort((a, b) => a.teamName.localeCompare(b.teamName))
                          .filter(team => team.teamName.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map(team => (
                            <div
                              key={team.teamId}
                              className={`px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent ${
                                selectedTeams.some(t => t.includes(team.teamName)) ? 'bg-accent' : ''
                              }`}
                              onClick={() => {
                                handleTeamSelect(team.teamName);
                              }}
                            >
                              {team.teamName}
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {selectedTeams.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2">Select Maps</Label>
                    <div className="space-y-2 mt-2">
                      {Object.keys(MAP_COLORS).sort().map(mapName => (
                        <div key={mapName} className="flex items-center space-x-2">
                          <Checkbox
                            id={`map-${mapName}`}
                            checked={selectedMaps.includes(mapName)}
                            onCheckedChange={(checked) => {
                              const teamName = selectedTeams[0].split('-')[1];
                              if (checked) {
                                setSelectedMaps([...selectedMaps, mapName]);
                                setSelectedTeams([...selectedTeams, `${mapName}-${teamName}`]);
                              } else {
                                setSelectedMaps(selectedMaps.filter(m => m !== mapName));
                                setSelectedTeams(selectedTeams.filter(t => !t.startsWith(`${mapName}-`)));
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`map-${mapName}`}
                            className="flex items-center gap-2"
                          >
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: MAP_COLORS[mapName as keyof typeof MAP_COLORS] }}
                            />
                            {mapName}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {Object.entries(mapTeams).sort().map(([mapName, regions]) => (
                <div key={mapName} className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 h-6 w-6"
                      onClick={() => toggleMap(mapName)}
                    >
                      {expandedMaps.includes(mapName) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </Button>
                    <Checkbox
                      id={`map-${mapName}`}
                      checked={selectedMaps.includes(mapName)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedMaps([...selectedMaps, mapName]);
                          // Add all teams from all regions for this map
                          const allTeams = Object.values(regions).flat();
                          const mapTeamNames = allTeams.map(t => `${mapName}-${t.teamName}`);
                          setSelectedTeams([...selectedTeams, ...mapTeamNames]);
                        } else {
                          setSelectedMaps(selectedMaps.filter(m => m !== mapName));
                          setSelectedTeams(selectedTeams.filter(t => !t.startsWith(`${mapName}-`)));
                        }
                      }}
                    />
                    <Label htmlFor={`map-${mapName}`} className="font-medium flex-grow">
                      {mapName}
                    </Label>
                  </div>

                  {expandedMaps.includes(mapName) && (
                    <div className="ml-8 space-y-2">
                      {Object.entries(regions).sort().map(([region, teams]) => (
                        <div key={`${mapName}-${region}`} className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-6 w-6"
                              onClick={() => toggleRegion(region)}
                            >
                              {expandedRegions.includes(region) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </Button>
                            <Checkbox
                              id={`${mapName}-${region}`}
                              checked={teams.every(team => selectedTeams.includes(`${mapName}-${team.teamName}`))}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const regionTeamNames = teams.map(t => `${mapName}-${t.teamName}`);
                                  setSelectedTeams([...selectedTeams, ...regionTeamNames]);
                                  if (!selectedMaps.includes(mapName)) {
                                    setSelectedMaps([...selectedMaps, mapName]);
                                  }
                                } else {
                                  setSelectedTeams(selectedTeams.filter(t => 
                                    !teams.some(team => t === `${mapName}-${team.teamName}`)
                                  ));
                                }
                              }}
                            />
                            <Label htmlFor={`${mapName}-${region}`} className="font-medium">
                              {region}
                            </Label>
                          </div>

                          {expandedRegions.includes(region) && (
                            <div className="ml-8 space-y-1">
                              {teams.sort((a, b) => a.teamName.localeCompare(b.teamName)).map(team => (
                                <div key={`${mapName}-${team.teamId}`} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${mapName}-${team.teamSlug}`}
                                    checked={selectedTeams.includes(`${mapName}-${team.teamName}`)}
                                    onCheckedChange={(checked) => {
                                      const teamKey = `${mapName}-${team.teamName}`;
                                      if (checked) {
                                        setSelectedTeams([...selectedTeams, teamKey]);
                                        if (!selectedMaps.includes(mapName)) {
                                          setSelectedMaps([...selectedMaps, mapName]);
                                        }
                                      } else {
                                        setSelectedTeams(selectedTeams.filter(t => t !== teamKey));
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`${mapName}-${team.teamSlug}`}>
                                    {team.teamName}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 md:hidden -z-10" 
          onClick={() => setIsCollapsed(true)}
        />
      )}
    </div>
  );
} 