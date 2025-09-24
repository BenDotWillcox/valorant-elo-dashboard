"use client";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Label,
} from "recharts";
import { PlayerKfData } from "./player-graph-section";
import { format } from "date-fns";

type Player = {
  id: number;
  ign: string;
};

type ProcessedPlayerKfData = Omit<PlayerKfData, "gameDate"> & {
  gameDate: number | null;
};

type PlayerVpmChartProps = {
  players: Player[];
  data: { [playerId: number]: PlayerKfData[] };
  xAxis: "games" | "date";
};

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE"];

const getGameTicks = (maxGames: number) => {
  if (maxGames <= 0) return [0];
  if (maxGames <= 50) {
    return [0, 10, 20, 30, 40, 50];
  }
  if (maxGames <= 200) {
    const ticks = [];
    for (let i = 0; i <= maxGames; i += 25) {
      ticks.push(i);
    }
    return ticks;
  }
  const ticks = [];
  for (let i = 0; i <= maxGames; i += 50) {
    ticks.push(i);
  }
  return ticks;
};

const dateTicks = [
  new Date("2023-02-14").getTime(),
  new Date("2024-02-17").getTime(),
  new Date("2025-01-11").getTime(),
];

export function PlayerVpmChart({
  players,
  data,
  xAxis,
}: PlayerVpmChartProps) {
  const allData = players.flatMap((p) => data[p.id] || []);

  const xDomain: [string | number, string | number] =
    xAxis === "games"
      ? [0, "dataMax"]
      : [dateTicks[0], dateTicks[dateTicks.length - 1]];

  const gameTicks =
    xAxis === "games"
      ? getGameTicks(Math.max(...allData.map((d) => d.gameNum)))
      : [];

  let minSmoothMean = -1.5;
  let maxSmoothMean = 1.5;

  const allSmoothMeans = players.flatMap((player) =>
    (data[player.id] || [])
      .map((d) => d.smoothMean)
      .filter((m): m is number => m !== null)
  );

  if (allSmoothMeans.length > 0) {
    minSmoothMean = Math.min(minSmoothMean, ...allSmoothMeans);
    maxSmoothMean = Math.max(maxSmoothMean, ...allSmoothMeans);
  }

  const yDomain: [number, number] = [minSmoothMean, maxSmoothMean];

  const processedData = players.reduce((acc, player) => {
    let playerData = data[player.id] || [];

    if (xAxis === "date") {
      playerData = playerData.filter((d) => d.gameDate);
    }

    const mappedData = playerData.map((d) => ({
      ...d,
      gameDate: d.gameDate ? new Date(d.gameDate).getTime() : null,
    }));
    acc[player.id] = mappedData;
    return acc;
  }, {} as { [playerId: number]: ProcessedPlayerKfData[] });

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart
        margin={{
          top: 20,
          right: 30,
          left: 30,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey={xAxis === "games" ? "gameNum" : "gameDate"}
          domain={xDomain}
          ticks={xAxis === "games" ? gameTicks : dateTicks}
          tickFormatter={(tick) => {
            if (xAxis === "date") {
              return format(new Date(tick), "yyyy-MM-dd");
            }
            return tick;
          }}
          allowDecimals={false}
        >
          <Label
            value={
              xAxis === "games" ? "Career Game Number" : "Date"
            }
            offset={-15}
            position="insideBottom"
          />
        </XAxis>
        <YAxis domain={yDomain} allowDataOverflow={true}>
          <Label
            value="VPM (per 24 rounds)"
            angle={-90}
            position="insideLeft"
            style={{ textAnchor: "middle" }}
          />
        </YAxis>
        {players.map((player, index) => (
          <Scatter
            key={`${player.id}-scatter`}
            data={processedData[player.id]}
            dataKey="y"
            fill={COLORS[index % COLORS.length]}
            fillOpacity={0.3}
            name={player.ign}
          />
        ))}
        {players.map((player, index) => (
          <Line
            key={`${player.id}-line`}
            data={processedData[player.id]}
            type="monotone"
            dataKey="smoothMean"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={2}
            dot={false}
            name={player.ign}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
