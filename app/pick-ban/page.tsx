"use client";

import { useEffect, useState, Fragment } from "react";
import { getPickBanAnalysisAction } from "@/actions/pick-ban-analysis-actions";
import { getEventNamesAction } from "@/actions/matches-actions";
import { getTeamsAction } from "@/actions/teams-actions";
import { getVetoStatsAction } from "@/actions/veto-stats-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import Image from "next/image";
import { MAP_COLORS } from "@/lib/constants/colors";

type PickBanAnalysisData = {
  team_id: number;
  team_name: string;
  team_logo: string | null;
  average_elo_lost: number;
  matches_analyzed: number;
};


type VetoStat = { map_name: string; count: number };
type VetoStatsData = {
    firstBanRate: VetoStat[];
    firstPickRate: VetoStat[];
    opponentFirstBanRate: VetoStat[];
    opponentFirstPickRate: VetoStat[];
};
type Team = { id: number, name: string };

function VetoStatsChart({ title, data }: { title: string; data: VetoStat[] }) {
    const total = data.reduce((acc, curr) => acc + curr.count, 0);
    const sortedData = [...data].sort((a, b) => b.count - a.count);
    const chartData = sortedData.map(d => ({ 
        ...d, 
        percentage: total > 0 ? (d.count / total) * 100 : 0,
        fill: MAP_COLORS[d.map_name as keyof typeof MAP_COLORS] || 'hsl(var(--primary))'
    }));
    const chartHeight = Math.max(200, data.length * 30);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={chartData} layout="vertical" margin={{ right: 60 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="map_name" width={80} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} interval={0} />
                        <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                            <LabelList
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                dataKey={(entry: any) => entry.count > 0 ? `${entry.count} (${entry.percentage.toFixed(1)}%)` : ''}
                                position="right" 
                                style={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

function VetoAnalysisSection() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [eventNames, setEventNames] = useState<string[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<string>();
    const [selectedEvent, setSelectedEvent] = useState<string>("all");
    const [stats, setStats] = useState<VetoStatsData>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getTeamsAction().then(res => res.status === 'success' && setTeams(res.data as Team[]));
        getEventNamesAction().then(res => res.status === 'success' && setEventNames(res.data as string[]));
    }, []);

    useEffect(() => {
        if (!selectedTeam) return;
        setLoading(true);
        setSelectedEvent("all");
        getEventNamesAction(parseInt(selectedTeam)).then(res => res.status === 'success' && setEventNames(res.data as string[]));

        const filters = {
            teamId: parseInt(selectedTeam),
            eventName: undefined,
        };
        getVetoStatsAction(filters).then(res => {
            if (res.status === 'success') {
                setStats(res.data as VetoStatsData);
            }
            setLoading(false);
        });
    }, [selectedTeam]);

    useEffect(() => {
        if (!selectedTeam) return;
        setLoading(true);
        const filters = {
            teamId: parseInt(selectedTeam),
            eventName: selectedEvent === "all" ? undefined : selectedEvent,
        };
        getVetoStatsAction(filters).then(res => {
            if (res.status === 'success') {
                setStats(res.data as VetoStatsData);
            }
            setLoading(false);
        });
    }, [selectedEvent]);

    return (
        <div className="mb-12">
            <h2 className="text-3xl font-bold text-center mb-4">Veto Tendencies</h2>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select a Team" /></SelectTrigger>
                    <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                    <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select an Event" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {eventNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {loading && <p>Loading stats...</p>}
            {stats && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <VetoStatsChart title="First Ban Rate" data={stats.firstBanRate} />
                    <VetoStatsChart title="First Pick Rate" data={stats.firstPickRate} />
                    <VetoStatsChart title="Opponent First Ban Rate" data={stats.opponentFirstBanRate} />
                    <VetoStatsChart title="Opponent First Pick Rate" data={stats.opponentFirstPickRate} />
                </div>
            )}
        </div>
    );
}


export default function PickBanPage() {
  const [analysisData, setAnalysisData] = useState<PickBanAnalysisData[]>([]);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEventNamesAction().then((result) => {
      if (result.status === "success") {
        setEventNames(result.data as string[]);
      }
    });
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const filters = {
        eventName: selectedEvent === "all" ? undefined : selectedEvent,
      };
      const result = await getPickBanAnalysisAction(filters);
      if (result.status === "success") {
        setAnalysisData(result.data as PickBanAnalysisData[]);
      }
      setLoading(false);
    };

    fetchData();
  }, [selectedEvent]);

  const handleRowClick = (teamId: number) => {
    setExpandedTeam(expandedTeam === teamId ? null : teamId);
  };

  return (
    <div className="container mx-auto p-4">
      <VetoAnalysisSection />

      <div className="flex flex-col items-center mb-8">
        <h1 className="text-4xl font-bold text-center">Pick/Ban Elo Efficiency</h1>
        <p className="text-center text-muted-foreground mt-2 max-w-2xl">
          This page analyzes each team&apos;s pick/ban phase by comparing their choices to the optimal choices based on map Elo ratings.
          &quot;Average Elo Lost&quot; represents how many Elo points a team loses, on average, compared to a perfect pick/ban sequence. A lower number is better.
        </p>
        <div className="mt-4 w-full max-w-xs">
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger>
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {eventNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Average Elo Lost</TableHead>
                <TableHead className="text-right">Matches Analyzed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysisData.map((row, index) => (
                <Fragment key={row.team_id}>
                  <TableRow onClick={() => handleRowClick(row.team_id)} className="cursor-pointer">
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="flex items-center">
                      {row.team_logo && (
                        <Image
                          src={row.team_logo}
                          alt={row.team_name}
                          width={24}
                          height={24}
                          className="mr-2"
                        />
                      )}
                      {row.team_name}
                    </TableCell>
                    <TableCell className="text-right">{row.average_elo_lost.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{row.matches_analyzed}</TableCell>
                  </TableRow>
                  {expandedTeam === row.team_id && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Card>
                          <CardHeader>
                            <CardTitle>Elo Lost Over Time for {row.team_name}</CardTitle>
                          </CardHeader>
                        </Card>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
} 