"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PickBanOutcomePoint = {
  label: string;
  n: number;
  rate: number;
  lower95: number;
  upper95: number;
};

const percentTick = (value: number) => `${Math.round(value * 100)}%`;
const exactPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function PickBanOutcomeChart({ data }: { data: PickBanOutcomePoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    barLabel: `${exactPercent(point.rate)} · n=${point.n.toLocaleString()}`,
  }));

  return (
    <div
      role="img"
      aria-label="Observational bar chart of lower-regret-team series win rate by regret-gap band, with exact percentages, sample sizes, and a fifty-percent reference line. Hollow muted bars have fewer than thirty series. This chart shows association and does not establish that lower regret caused wins."
      className="h-[380px] w-full text-slate-700 dark:text-slate-200"
    >
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 34, right: 18, bottom: 28, left: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
            <XAxis
              dataKey="label"
              interval={0}
              height={48}
              tickMargin={8}
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
              formatter={(_value, _name, item) => {
                const point = item.payload as PickBanOutcomePoint;
                return [
                  `${exactPercent(point.rate)} (95% CI ${exactPercent(point.lower95)}–${exactPercent(point.upper95)}; n=${point.n.toLocaleString()})`,
                  "Lower-regret team win rate",
                ];
              }}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #475569",
                color: "#f8fafc",
              }}
            />
            <ReferenceLine
              y={0.5}
              stroke="currentColor"
              strokeDasharray="6 5"
              label={{ value: "50%", fill: "currentColor", position: "insideTopRight" }}
            />
            <Bar
              dataKey="rate"
              name="Lower-regret team win rate"
              stroke="#1d4ed8"
              radius={[5, 5, 0, 0]}
              isAnimationActive={false}
            >
              {chartData.map((point) => {
                const smallSample = point.n < 30;
                return (
                  <Cell
                    key={point.label}
                    fill={smallSample ? "transparent" : "#3b82f6"}
                    fillOpacity={smallSample ? 0 : 0.82}
                    stroke={smallSample ? "#94a3b8" : "#1d4ed8"}
                    strokeWidth={smallSample ? 2 : 1}
                    strokeDasharray={smallSample ? "4 3" : undefined}
                  />
                );
              })}
              <LabelList
                dataKey="barLabel"
                position="top"
                offset={8}
                fill="currentColor"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
