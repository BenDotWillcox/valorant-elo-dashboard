"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type ReliabilityPoint = {
  predicted: number;
  observed: number;
  n: number;
  bin: string;
  lower95: number;
  upper95: number;
};

export type ReliabilitySeries = {
  id: string;
  label: string;
  color: string;
  points: ReliabilityPoint[];
};

export type ConfidencePoint = {
  band: string;
  accuracy: number;
  meanConfidence: number;
  n: number;
  lower95: number;
  upper95: number;
};

export type MapSamplePoint = {
  mapName: string;
  n: number;
};

const percentTick = (value: number) => `${Math.round(value * 100)}%`;

export function ReliabilityChart({ series }: { series: ReliabilitySeries[] }) {
  const legendSymbols = ["◆", "●", "■", "▲"];
  const scatterShapes = ["diamond", "circle", "square", "triangle"] as const;

  return (
    <div
      role="img"
      aria-label="Reliability plot comparing mean predicted win probability with observed win rate for plain Elo, the pre-holdout frozen production model, the analysis-time production model, and the validation-selected experimental challenger."
      className="h-[430px] w-full text-slate-700 dark:text-slate-200 sm:h-[400px]"
    >
      <div aria-hidden="true" className="h-full w-full">
        <ul className="flex min-h-16 flex-wrap content-start gap-x-4 gap-y-2 pt-3 text-xs">
          {series.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <span
                className="inline-block w-3 shrink-0 text-center text-sm leading-none"
                style={{ color: item.color }}
              >
                {legendSymbols[index] ?? "●"}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
        <div className="h-[345px] sm:h-[325px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 18, bottom: 24, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            type="number"
            dataKey="predicted"
            name="Mean predicted"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={percentTick}
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
            label={{ value: "Mean predicted probability", position: "insideBottom", offset: -14, fill: "currentColor" }}
          />
          <YAxis
            type="number"
            dataKey="observed"
            name="Observed win rate"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={percentTick}
            width={48}
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
            label={{ value: "Observed win rate", angle: -90, position: "insideLeft", fill: "currentColor" }}
          />
          <ZAxis type="number" dataKey="n" name="Maps" range={[45, 180]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value, name) => {
              if (name === "Maps") return [Number(value).toLocaleString(), name];
              return [`${(Number(value) * 100).toFixed(1)}%`, name];
            }}
            contentStyle={{ background: "#0f172a", border: "1px solid #475569", color: "#f8fafc" }}
          />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
            stroke="currentColor"
            strokeDasharray="6 5"
            label={{ value: "Ideal", fill: "currentColor", position: "insideTopRight" }}
          />
          {series.map((item, index) => (
            <Scatter
              key={item.id}
              name={item.label}
              data={item.points}
              fill={item.color}
              stroke={item.color}
              line={{ stroke: item.color, strokeDasharray: index === 0 ? "6 4" : undefined }}
              shape={scatterShapes[index] ?? "circle"}
              isAnimationActive={false}
            />
          ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function ConfidenceAccuracyChart({ data }: { data: ConfidencePoint[] }) {
  return (
    <div
      role="img"
      aria-label="Bar chart of pre-holdout frozen production-model prediction accuracy by confidence band, with sample-size labels and a fifty-percent reference line. Bars with fewer than thirty maps are muted."
      className="h-[340px] w-full text-slate-700 dark:text-slate-200"
    >
      <div aria-hidden="true" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 18, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            dataKey="band"
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={percentTick}
            width={48}
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
          />
          <Tooltip
            formatter={(value, name) => [
              name === "Maps" ? Number(value).toLocaleString() : `${(Number(value) * 100).toFixed(1)}%`,
              name,
            ]}
            contentStyle={{ background: "#0f172a", border: "1px solid #475569", color: "#f8fafc" }}
          />
          <ReferenceLine
            y={0.5}
            stroke="currentColor"
            strokeDasharray="6 5"
            label={{ value: "50%", fill: "currentColor", position: "insideTopRight" }}
          />
          <Bar
            dataKey="accuracy"
            name="Accuracy"
            stroke="#14532d"
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((point) => (
              <Cell
                key={point.band}
                fill={point.n < 30 ? "#94a3b8" : "#16a34a"}
              />
            ))}
            <LabelList
              dataKey="n"
              position="top"
              fill="currentColor"
              formatter={(value: unknown) => `n=${String(value)}`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MapSampleChart({ data }: { data: MapSamplePoint[] }) {
  return (
    <div
      role="img"
      aria-label="Horizontal bar chart showing final chronological test sample size for each Valorant map."
      className="h-[430px] w-full text-slate-700 dark:text-slate-200"
    >
      <div aria-hidden="true" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 18, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            allowDecimals={false}
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
          />
          <YAxis
            type="category"
            dataKey="mapName"
            width={72}
            tick={{ fill: "currentColor" }}
            axisLine={{ stroke: "currentColor" }}
            tickLine={{ stroke: "currentColor" }}
          />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), "Maps"]}
            contentStyle={{ background: "#0f172a", border: "1px solid #475569", color: "#f8fafc" }}
          />
          <Bar
            dataKey="n"
            name="Maps"
            fill="#16a34a"
            stroke="#14532d"
            radius={[0, 5, 5, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
