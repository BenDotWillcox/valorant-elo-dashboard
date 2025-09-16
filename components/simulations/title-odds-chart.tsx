'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from 'recharts';
import { TEAM_LOGOS } from '@/lib/constants/images';
import Image from 'next/image';
import { TEAM_SLUG_TO_COLOR } from '@/lib/constants/colors';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface SimulationResult {
  team: string;
  teamName: string;
  championships: number;
}

interface TitleOddsChartProps {
  data: SimulationResult[];
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      return (
        <div className="bg-gray-800 text-white p-2 rounded border border-gray-600">
          <p className="font-bold">{label}</p>
          <p>Championship Odds: {typeof value === 'number' ? value.toFixed(2) : value}%</p>
        </div>
      );
    }
    return null;
};

interface CustomYAxisTickProps {
    x?: number;
    y?: number;
    payload?: {
        value: string;
    };
}

const CustomYAxisTick = (props: CustomYAxisTickProps) => {
    const { x, y, payload } = props;

    if (!x || !y || !payload) return null;

    const teamSlug = payload.value;
    const logoSrc = TEAM_LOGOS[teamSlug as keyof typeof TEAM_LOGOS];

    if (!logoSrc) return null;

    return (
        <g transform={`translate(${x - 40}, ${y})`}>
            <foreignObject width="24" height="24" y={-12}>
                <div style={{ width: 24, height: 24, position: 'relative' }}>
                    <Image
                      src={logoSrc}
                      alt={teamSlug}
                      fill
                      style={{ objectFit: 'contain' }}
                    />
                </div>
            </foreignObject>
        </g>
    );
};

export function TitleOddsChart({ data }: TitleOddsChartProps) {
  const sortedData = [...data].sort((a, b) => b.championships - a.championships);

  return (
    <div style={{ width: '100%', height: 800 }}>
        <ResponsiveContainer>
            <BarChart
                data={sortedData}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                <XAxis 
                    type="number" 
                    domain={[0, 40]} 
                    ticks={[0, 10, 20, 30, 40]} 
                    stroke="#A0AEC0"
                    tickFormatter={(tick) => `${tick}%`}
                />
                <YAxis dataKey="team" type="category" width={80} stroke="#A0AEC0" tick={<CustomYAxisTick />} />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                    dataKey="championships" 
                >
                    {sortedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={TEAM_SLUG_TO_COLOR[entry.team as keyof typeof TEAM_SLUG_TO_COLOR] || '#48BB78'} />
                    ))}
                    <LabelList 
                        dataKey="championships" 
                        position="right" 
                        offset={10}
                        formatter={(value: number) => `${value.toFixed(2)}%`}
                        style={{ fill: '#A0AEC0', fontSize: '14px' }}
                    />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
  );
}
