'use client';

import { LineChart, Line } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { MAP_COLORS } from "@/lib/constants/colors";
import { InfoTooltip } from "@/components/ui/tooltip";

interface MapRatingRangeProps {
  data: {
    date: string;
    mapName: string;
    highestRating: number;
    lowestRating: number;
  }[];
}

export function MapRatingRangeChart({ data }: MapRatingRangeProps) {
  const chartData = data.reduce((acc: Record<string, { date: string; [key: string]: string | number }>, curr) => {
    const date = curr.date.split('T')[0];
    if (!acc[date]) {
      acc[date] = { date };
    }
    acc[date][`${curr.mapName}-high`] = curr.highestRating;
    acc[date][`${curr.mapName}-low`] = curr.lowestRating;
    return acc;
  }, {} as Record<string, { date: string; [key: string]: string | number }>);

  const transformedData = Object.values(chartData)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const config = Object.entries(MAP_COLORS).reduce(
    (acc, [key, color]) => {
      acc[key] = {
        label: key,
        color: color,
      };
      return acc;
    },
    {} as Record<string, { label: string; color: string }>,
  );

  return (
    <div className="w-full space-y-4 rounded-lg border p-4">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold">Map Rating Ranges</h2>
        <InfoTooltip content="Shows the highest and lowest team ratings achieved on each map over time" />
      </div>

      <ChartContainer config={config} className="aspect-[2/1]">
        <LineChart data={transformedData}>
          {Object.entries(MAP_COLORS).map(([map, color]) => (
            <>
              <Line
                key={`${map}-high`}
                type="monotone"
                dataKey={`${map}-high`}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
              <Line
                key={`${map}-low`}
                type="monotone"
                dataKey={`${map}-low`}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
              />
            </>
          ))}
          {/* ... rest of chart components */}
        </LineChart>
      </ChartContainer>
    </div>
  );
} 