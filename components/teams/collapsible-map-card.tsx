"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Image from "next/image";
import { TEAM_LOGOS, getAgentImage } from "@/lib/constants/images";
import { MAP_POOL } from "@/lib/constants/maps";

interface MapStat {
  map_name: string;
  elo_rating: number;
  wins: number;
  losses: number;
  total_matches: number;
}

interface MapStreak {
  longest_win_streak: number;
  longest_loss_streak: number;
  current_streak: number;
  current_streak_type: 'W' | 'L';
}

interface MapResult {
  id: number;
  winner_team_id: number;
  loser_team_id: number;
  winner_rounds: number;
  loser_rounds: number;
  completed_at: string;
  event_name: string;
  winner_team_name: string;
  loser_team_name: string;
  opponent_team_name: string;
  opponent_team_slug: string;
  opponent_team_logo: string | null;
  team_score: number;
  opponent_score: number;
  is_win: boolean;
}

interface CollapsibleMapCardProps {
  map: MapStat;
  index: number;
  streaks: MapStreak | undefined;
  lastComp: string[];
  teamId: number;
  teamName: string;
  teamSlug: string;
}

export function CollapsibleMapCard({ map, index, streaks, lastComp, teamId, teamName, teamSlug }: CollapsibleMapCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<MapResult[]>([]);
  const [loading, setLoading] = useState(false);

  const isActive = MAP_POOL.active.includes(map.map_name);
  const winRate = map.total_matches > 0 ? (map.wins / map.total_matches * 100).toFixed(1) : '0.0';

  const handleToggle = async () => {
    if (!isOpen && results.length === 0) {
      setLoading(true);
      try {
        const response = await fetch(`/api/teams/${teamId}/map-results?map=${encodeURIComponent(map.map_name)}`);
        const data = await response.json();
        if (data.status === "success") {
          setResults(data.data || []);
        }
      } catch (error) {
        console.error("Error fetching map results:", error);
      } finally {
        setLoading(false);
      }
    }
    setIsOpen(!isOpen);
  };

  const getOpponentLogo = (opponentLogo: string | null, opponentName: string) => {
    if (opponentLogo) return opponentLogo;
    
    // Try to find team logo by name
    const teamSlug = opponentName.toLowerCase().replace(/\s+/g, '-');
    return TEAM_LOGOS[teamSlug as keyof typeof TEAM_LOGOS] || null;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="p-6 hover:shadow-lg transition-shadow">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full p-0 h-auto hover:bg-transparent"
            onClick={handleToggle}
          >
            <div className="flex items-center gap-6 w-full">
              {/* Rank */}
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-lg flex-shrink-0">
                {index + 1}
              </div>
              
              {/* Map Name & Basic Stats */}
              <div className="w-80 flex-shrink-0">
                <h3 className="font-bold text-xl">{map.map_name}</h3>
                <div className="flex items-center space-x-3 text-sm text-muted-foreground mt-1">
                  <span className="font-medium">{map.wins}W - {map.losses}L</span>
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50"></div>
                  <span>{winRate}% win rate</span>
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50"></div>
                  <span>{map.total_matches} matches</span>
                </div>
              </div>

              {/* Last Played Composition */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground font-medium mb-2">LAST PLAYED COMP</div>
                <div className="flex items-center gap-2">
                  {lastComp.length > 0 ? (
                    lastComp.map((agent, agentIndex) => {
                      const agentImage = getAgentImage(agent);
                      return (
                        <div key={agentIndex} className="relative w-10 h-10 rounded-lg overflow-hidden border border-border/50">
                          {agentImage ? (
                            <Image
                              src={agentImage}
                              alt={agent}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                              <span className="text-xs font-medium text-muted-foreground">
                                {agent.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-muted-foreground">No recent data</span>
                  )}
                </div>
              </div>
              
              {/* Streak Stats */}
              <div className="flex items-center gap-6 flex-shrink-0">
                {/* Current Streak */}
                <div className="text-center">
                  <div className={`text-2xl font-bold ${
                    streaks?.current_streak_type === 'W' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {streaks ? `${streaks.current_streak}${streaks.current_streak_type}` : '0W'}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">CURRENT</div>
                </div>
                
                {/* Longest Win Streak */}
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600">
                    {streaks ? `${streaks.longest_win_streak}W` : '0W'}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">BEST</div>
                </div>
                
                {/* Longest Loss Streak */}
                <div className="text-center">
                  <div className="text-sm font-bold text-red-600">
                    {streaks ? `${streaks.longest_loss_streak}L` : '0L'}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">WORST</div>
                </div>
              </div>
              
              {/* ELO & Badge */}
              <div className="flex items-center gap-4 flex-shrink-0 ml-8 w-48">
                <div className="text-right flex-1">
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {Math.round(map.elo_rating)}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">ELO</div>
                  </div>
                </div>
                <div className="w-16 flex justify-center">
                  <Badge 
                    variant={isActive ? "default" : "secondary"}
                    className={`px-3 py-1 text-xs font-medium ${
                      isActive 
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                        : "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                    }`}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              {/* Chevron */}
              <div className="flex-shrink-0">
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-6 pt-6 border-t border-border">
            {loading ? (
              <div className="text-center text-muted-foreground py-4">
                Loading recent results...
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Recent Results</h4>
                {results.map((result) => (
                  <div key={result.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-3">
                      {/* Team Logo */}
                      <div className="w-8 h-8 relative">
                        <Image
                          src={getOpponentLogo(result.opponent_team_logo, result.opponent_team_name) || "/images/teams/default.png"}
                          alt={result.opponent_team_name}
                          fill
                          className="object-contain rounded"
                        />
                      </div>
                      
                      {/* Opponent Name */}
                      <div>
                        <div className="font-medium">{result.opponent_team_name}</div>
                        <div className="text-xs text-muted-foreground">{result.event_name}</div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-lg font-bold">{result.team_score}</div>
                        <div className="text-xs text-muted-foreground">{teamSlug.toUpperCase()}</div>
                      </div>
                      <div className="text-muted-foreground">-</div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{result.opponent_score}</div>
                        <div className="text-xs text-muted-foreground">{result.opponent_team_slug.toUpperCase()}</div>
                      </div>
                      
                      {/* Win/Loss Badge */}
                      <Badge 
                        variant={result.is_win ? "default" : "destructive"}
                        className="ml-2"
                      >
                        {result.is_win ? "W" : "L"}
                      </Badge>
                    </div>

                    {/* Date */}
                    <div className="text-right text-sm text-muted-foreground">
                      {new Date(result.completed_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No recent results found for {map.map_name}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
