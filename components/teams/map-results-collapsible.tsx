"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { TEAM_LOGOS } from "@/lib/constants/images";

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
  opponent_team_logo: string | null;
  team_score: number;
  opponent_score: number;
  is_win: boolean;
}

interface MapResultsCollapsibleProps {
  mapName: string;
  teamId: number;
  teamName: string;
}

export function MapResultsCollapsible({ mapName, teamId, teamName }: MapResultsCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<MapResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!isOpen && results.length === 0) {
      setLoading(true);
      try {
        const response = await fetch(`/api/teams/${teamId}/map-results?map=${encodeURIComponent(mapName)}`);
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
    <div className="mt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {loading ? "Loading..." : "Recent Results"}
      </Button>

      {isOpen && (
        <Card className="mt-2">
          <CardContent className="p-4">
            {results.length > 0 ? (
              <div className="space-y-3">
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
                        <div className="text-xs text-muted-foreground">{teamName}</div>
                      </div>
                      <div className="text-muted-foreground">-</div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{result.opponent_score}</div>
                        <div className="text-xs text-muted-foreground">{result.opponent_team_name}</div>
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
                No recent results found for {mapName}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
