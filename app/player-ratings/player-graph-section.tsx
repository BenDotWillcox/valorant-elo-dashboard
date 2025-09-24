"use client";

import { useState, useEffect } from "react";
import { PlayerSearch } from "./player-search";
import { PlayerVpmChart } from "./player-vpm-chart";
import { getPlayerKfData } from "@/actions/players-actions";
import { getPlayerByIgn } from "@/actions/players-actions";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getSeasonsAction } from "@/actions/seasons-actions";
import { Season } from "@/db/schema/seasons-schema";

export type PlayerKfData = {
  gameNum: number;
  gameDate: string | null;
  y: number | null;
  smoothMean: number | null;
  smoothStd: number | null;
};

type Player = {
  id: number;
  ign: string;
};

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE"];

export function PlayerGraphSection() {
  const [playersData, setPlayersData] = useState<{
    [playerId: number]: PlayerKfData[];
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [xAxis, setXAxis] = useState<"games" | "date">("games");
  const [seasons, setSeasons] = useState<Season[]>([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      const seasonsRes = await getSeasonsAction();
      if (seasonsRes.status === "success" && Array.isArray(seasonsRes.data)) {
        setSeasons(seasonsRes.data);
      }

      const defaultPlayer = await getPlayerByIgn("Zekken");
      if (defaultPlayer) {
        setSelectedPlayers([defaultPlayer]);
        const data = await getPlayerKfData(defaultPlayer.id);
        setPlayersData({ [defaultPlayer.id]: data });
      }
      setIsLoading(false);
    };

    fetchInitialData();
  }, []);

  const handlePlayerAdded = async (player: Player) => {
    if (selectedPlayers.length >= 5) return;
    setSelectedPlayers((prev) => [...prev, player]);
    const data = await getPlayerKfData(player.id);
    setPlayersData((prev) => ({ ...prev, [player.id]: data }));
  };

  const handlePlayerRemoved = (playerId: number) => {
    setSelectedPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setPlayersData((prev) => {
      const newData = { ...prev };
      delete newData[playerId];
      return newData;
    });
  };

  return (
    <div className="mb-8">
      <p className="text-sm text-muted-foreground mb-2">Max 5 players</p>
      <PlayerSearch
        players={selectedPlayers}
        onPlayerAdded={handlePlayerAdded}
        onPlayerRemoved={handlePlayerRemoved}
      />
      <div className="mt-4">
        <h2 className="text-2xl font-bold mb-2 text-center">
          Career VPM Progression
        </h2>
        <div className="flex justify-center flex-wrap gap-4 mb-4">
          {selectedPlayers.map((player, index) => (
            <div key={player.id} className="flex items-center">
              <span
                className="w-4 h-4 mr-2"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              ></span>
              <span>{player.ign}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center mb-4">
          <ToggleGroup
            type="single"
            value={xAxis}
            onValueChange={(value) => {
              if (value) setXAxis(value as "games" | "date");
            }}
          >
            <ToggleGroupItem value="games">Career Games</ToggleGroupItem>
            <ToggleGroupItem value="date">Game Date</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {isLoading ? (
          <p>Loading chart...</p>
        ) : selectedPlayers.length > 0 ? (
          <PlayerVpmChart
            players={selectedPlayers}
            data={playersData}
            xAxis={xAxis}
            seasons={seasons}
          />
        ) : (
          <p>Select a player to see their performance graph.</p>
        )}
      </div>
    </div>
  );
}
