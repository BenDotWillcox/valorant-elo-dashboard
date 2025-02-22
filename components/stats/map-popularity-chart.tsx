'use client';

import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import { format, subDays, addDays } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { MAP_COLORS } from "@/lib/constants/colors";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import { InfoTooltip } from "@/components/ui/tooltip";
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

interface MapPopularityProps {
  onDateChange: (startDate: Date, endDate: Date) => void;
  data: {
    date: string;
    mapName: string;
    percentage: number;
  }[];
}

// Create an interface for the transformed data
interface TransformedData {
  date: string;
  [key: string]: string | number;  // For dynamic map names
}

// Create an interface for the tooltip props
interface TooltipProps {
  payload?: {
    value: number | null;
    name: string;
    dataKey: string;
  }[] | null;  // Make it nullable
}

export function MapPopularityChart({ data, onDateChange }: MapPopularityProps) {
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date>(subDays(endDate, 30));

  const handleStartDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      setStartDate(newDate);
      setEndDate(addDays(newDate, 30));
      onDateChange(newDate, addDays(newDate, 30));
    }
  };

  const handleEndDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      setEndDate(newDate);
      setStartDate(subDays(newDate, 30));
      onDateChange(subDays(newDate, 30), newDate);
    }
  };

  // Update the reduce function
  const transformedData = data.reduce((acc: Record<string, TransformedData>, curr) => {
    const date = curr.date.split('T')[0];
    if (!acc[date]) {
      acc[date] = { date };
    }
    acc[date][curr.mapName] = curr.percentage;
    return acc;
  }, {} as Record<string, TransformedData>);

  const chartData = Object.values(transformedData)
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
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold">Map Play Percentage</h2>
          <InfoTooltip content="Shows the percentage of matches played on each map over a 30-day rolling window. Use the date picker to explore different time periods." />
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(startDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={handleStartDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="self-center">→</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(endDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={handleEndDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ChartContainer config={config} className="aspect-[2/1]">
        <LineChart
          data={chartData}
          margin={{
            top: 16,
            right: 16,
            bottom: 40,
            left: 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => format(new Date(value), "MMM d")}
            tickMargin={8}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            ticks={chartData
              .filter((_, i) => i % 5 === 0)
              .map(d => d.date)}
          />
          <YAxis
            tickFormatter={(value) => `${value.toFixed(0)}%`}
            tickMargin={8}
            tickLine={false}
            axisLine={false}
            domain={[0, 40]}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value: ValueType, name: NameType, props: TooltipProps): JSX.Element => {
                  if (props?.payload && Array.isArray(props.payload)) {
                    props.payload.sort((a, b) => ((b.value ?? 0) - (a.value ?? 0)));
                  }
                  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
                  return (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: MAP_COLORS[name as keyof typeof MAP_COLORS] }} 
                      />
                      <span>{name}:</span>
                      <span>{numValue === undefined || numValue === null ? '0%' : `${numValue.toFixed(1)}%`}</span>
                    </div>
                  );
                }}
                labelFormatter={(label: string) => format(new Date(label.split('T')[0]), "MMM d, yyyy")}
              />
            }
          />
          <Legend verticalAlign="top" height={40} />
          {Object.entries(MAP_COLORS).map(([map, color]) => (
            <Line
              key={map}
              type="monotone"
              dataKey={map}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
} 