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
  ReferenceArea,
} from "recharts";
import { PlayerKfData } from "./player-graph-section";
import { format } from "date-fns";
import { Season } from "@/db/schema/seasons-schema";
import { useMemo } from "react";
import { tournaments } from "@/lib/constants/tournaments";

const getTournamentColor = (name: string): string => {
  if (name.includes("LOCK//IN")) return "rgba(75, 192, 192, 0.2)";
  if (name.includes("Masters")) return "rgba(153, 102, 255, 0.2)";
  if (name.includes("Champions")) return "rgba(255, 99, 132, 0.2)";
  return "rgba(128, 128, 128, 0.1)";
};

const legendItems = [
  { name: "LOCK//IN", color: "rgba(75, 192, 192, 0.2)" },
  { name: "Masters", color: "rgba(153, 102, 255, 0.2)" },
  { name: "Champions", color: "rgba(255, 99, 132, 0.2)" },
];

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
  seasons: Season[];
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

export function PlayerVpmChart({
  players,
  data,
  xAxis,
  seasons,
}: PlayerVpmChartProps) {
  const {
    compressedTicks,
    tickLabelMap,
    totalSeasonDuration,
    compressDate,
  } = useMemo(() => {
    if (!seasons || seasons.length === 0 || xAxis === "games") {
      return {
        compressedTicks: [],
        tickLabelMap: new Map(),
        totalSeasonDuration: 0,
        compressDate: () => null,
      };
    }

    const sortedSeasons = [...seasons].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    let cumulativeDuration = 0;
    const seasonMap = sortedSeasons.map((season) => {
      const startDate = new Date(season.start_date);
      const endDate = season.end_date
        ? new Date(season.end_date)
        : new Date();
      const duration = endDate.getTime() - startDate.getTime();
      const seasonInfo = {
        startDate,
        endDate,
        duration,
        cumulativeOffset: cumulativeDuration,
      };
      cumulativeDuration += duration;
      return seasonInfo;
    });

    const totalSeasonDuration = cumulativeDuration;

    const compressedTicks = seasonMap.map((s) => s.cumulativeOffset);
    const tickLabelMap = new Map<number, string>();
    seasonMap.forEach((s) => {
      tickLabelMap.set(s.cumulativeOffset, format(s.startDate, "MMM yyyy"));
    });

    const compressDate = (date: Date): number | null => {
      if (!date) return null;
      const time = date.getTime();

      for (const season of seasonMap) {
        if (
          time >= season.startDate.getTime() &&
          time <= season.endDate.getTime()
        ) {
          const timeIntoSeason = time - season.startDate.getTime();
          return season.cumulativeOffset + timeIntoSeason;
        }
      }
      return null;
    };

    return {
      compressedTicks,
      tickLabelMap,
      totalSeasonDuration,
      compressDate,
    };
  }, [seasons, xAxis]);

  const internationalTournamentAreas = useMemo(() => {
    if (xAxis !== "date") {
      return [];
    }

    return Object.entries(tournaments)
      .filter(
        ([_name, t]) =>
          t.region === "International" && t.start_date && t.end_date
      )
      .map(([name, t]) => {
        const x1 = compressDate(t.start_date!);
        const x2 = compressDate(t.end_date!);
        return {
          x1,
          x2,
          name,
          color: getTournamentColor(name),
        };
      })
      .filter((area) => area.x1 !== null && area.x2 !== null);
  }, [xAxis, compressDate]);

  const allData = players.flatMap((p) => data[p.id] || []);

  const xDomain: [string | number, string | number] =
    xAxis === "games"
      ? [0, "dataMax"]
      : [0, totalSeasonDuration];

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

  const processedData = useMemo(() => {
    return players.reduce((acc, player) => {
      const playerData = data[player.id] || [];

      if (xAxis === "date") {
        const mappedData = playerData
          .map((d) => ({
            ...d,
            gameDate: d.gameDate ? compressDate(new Date(d.gameDate)) : null,
          }))
          .filter((d) => d.gameDate !== null);
        acc[player.id] = mappedData;
      } else {
        acc[player.id] = playerData.map((d) => ({ ...d, gameDate: null }));
      }
      return acc;
    }, {} as { [playerId: number]: ProcessedPlayerKfData[] });
  }, [players, data, xAxis, compressDate]);

  return (
    <>
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
            ticks={xAxis === "games" ? gameTicks : compressedTicks}
            tickFormatter={(tick) => {
              if (xAxis === "date") {
                return tickLabelMap.get(tick as number) ?? "";
              }
              return tick;
            }}
            allowDecimals={false}
          >
            <Label
              value={
                xAxis === "games"
                  ? "Career Game Number"
                  : "Date (Compressed Timeline)"
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
          {internationalTournamentAreas.map((area, i) => (
            <ReferenceArea
              key={i}
              x1={area.x1!}
              x2={area.x2!}
              stroke="none"
              fill={area.color}
            />
          ))}
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
      {xAxis === "date" && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            marginTop: "10px",
          }}
        >
          {legendItems.map((item) => (
            <div key={item.name} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: item.color,
                  marginRight: "8px",
                  border: "1px solid rgba(128,128,128,0.5)",
                }}
              />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
