"use client";

import { useEffect, useState, Fragment, useRef } from "react";
import { getPickBanAnalysisAction } from "@/actions/pick-ban-analysis-actions";
import { getEventNamesAction } from "@/actions/matches-actions";
import { getTeamsAction } from "@/actions/teams-actions";
import { getVetoStatsAction } from "@/actions/veto-stats-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import Image from "next/image";
import Link from "next/link";
import { MAP_COLORS } from "@/lib/constants/colors";
import { TEAM_LOGOS } from "@/lib/constants/images";
import { getTeamPickBanHistoryAction, getMatchVetoAnalysisAction, getMatchEloDataAction } from "@/actions/pick-ban-analysis-actions";
import { ChevronRight } from "lucide-react";
import { calculateWinProbability, calculateBo3MatchProbability, calculateBo5MatchProbability } from "@/lib/predictions/calculations";

type PickBanAnalysisData = {
  team_id: number;
  team_name: string;
  team_logo: string | null;
  team_slug: string | null;
  average_elo_lost: number;
  matches_analyzed: number;
};


type VetoAnalysisStep = {
  vetoOrder: number;
  action: string;
  mapName: string;
  eloLost: number;
  teamId: number;
  teamName: string;
  teamSlug: string | null;
  optimalChoice: string | null;
  availableMaps: string[] | null;
}

type VetoStat = { map_name: string; count: number };
type VetoStatsData = {
    firstBanRate: VetoStat[];
    firstPickRate: VetoStat[];
    opponentFirstBanRate: VetoStat[];
    opponentFirstPickRate: VetoStat[];
};
type Team = { id: number, name: string, slug: string | null };

type TeamHistoryData = {
  match_id: number;
  event_name: string;
  elo_lost: number;
  opponent_name: string | null;
  opponent_logo: string | null;
};

type TeamMapElo = { map_name: string; elo: number };
type MatchEloData = {
    team1Id: number;
    team2Id: number;
    bestOf: number | null;
    team1Elos: TeamMapElo[];
    team2Elos: TeamMapElo[];
};

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
                    <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ right: 60 }}>
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
    const [selectedEvent, setSelectedEvent] = useState<string>();
    const [stats, setStats] = useState<VetoStatsData>();
    const [loading, setLoading] = useState(false);
    const initialLoadHandled = useRef(false);

    // This effect handles the initial setup.
    useEffect(() => {
        getTeamsAction().then(res => {
            if (res.status === 'success') {
                const fetchedTeams = res.data as Team[];
                setTeams(fetchedTeams);
                const paperRex = fetchedTeams.find(t => t.name === 'Paper Rex');
                if (paperRex) {
                    setSelectedTeam(paperRex.id.toString());
                    setSelectedEvent("Valorant Champions 2025");
                } else {
                    setSelectedEvent("all"); // If no PRX, default to all events (and no team)
                }
            }
        });
    }, []);

    // This effect handles user changing the team selection.
    useEffect(() => {
        if (!selectedTeam) return;

        if (initialLoadHandled.current) {
            setSelectedEvent("all");
        } else {
            initialLoadHandled.current = true;
        }
    }, [selectedTeam]);

    // This is the main data fetching effect.
    useEffect(() => {
        // Don't fetch until we have a team and event.
        if (!selectedTeam || !selectedEvent) return;

        setLoading(true);

        // Parallelize both data fetches
        const filters = {
            teamId: parseInt(selectedTeam),
            eventName: selectedEvent === "all" ? undefined : selectedEvent,
        };

        Promise.all([
            getEventNamesAction(parseInt(selectedTeam)),
            getVetoStatsAction(filters),
        ]).then(([eventNamesRes, vetoStatsRes]) => {
            if (eventNamesRes.status === 'success') {
                setEventNames(eventNamesRes.data as string[]);
            }
            if (vetoStatsRes.status === 'success') {
                setStats(vetoStatsRes.data as VetoStatsData);
            }
            setLoading(false);
        });
    }, [selectedTeam, selectedEvent]);

    return (
        <div className="mb-12">
            <h2 className="text-3xl font-bold text-center mb-4">Veto Tendencies</h2>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger className="w-[250px]" aria-label="Select a team for veto tendencies"><SelectValue placeholder="Select a Team" /></SelectTrigger>
                    <SelectContent>
                        {teams.map(t => (
                            <SelectItem key={t.id} value={t.id.toString()}>
                                <div className="flex items-center gap-2">
                                    {t.slug && TEAM_LOGOS[t.slug as keyof typeof TEAM_LOGOS] && (
                                        <Image
                                            src={TEAM_LOGOS[t.slug as keyof typeof TEAM_LOGOS]}
                                            alt={t.name}
                                            width={20}
                                            height={20}
                                            className="object-contain"
                                        />
                                    )}
                                    <span>{t.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                    <SelectTrigger className="w-[250px]" aria-label="Filter veto tendencies by event"><SelectValue placeholder="Select an Event" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {eventNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-64 bg-card rounded-lg border p-4">
                            <div className="h-full bg-muted rounded" />
                        </div>
                    ))}
                </div>
            )}
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
  const [teamHistory, setTeamHistory] = useState<TeamHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [vetoAnalysis, setVetoAnalysis] = useState<VetoAnalysisStep[]>([]);
  const [vetoAnalysisLoading, setVetoAnalysisLoading] = useState(false);
  const [matchEloData, setMatchEloData] = useState<MatchEloData | null>(null);

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

  const handleRowClick = async (teamId: number) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null);
    } else {
      setExpandedTeam(teamId);
      setHistoryLoading(true);
      const filters = {
        eventName: selectedEvent === "all" ? undefined : selectedEvent,
      };
      const result = await getTeamPickBanHistoryAction(teamId, filters.eventName);
      if (result.status === "success") {
        setTeamHistory(result.data as TeamHistoryData[]);
      }
      setHistoryLoading(false);
    }
  };

  const handleMatchClick = async (matchId: number) => {
    if (expandedMatch === matchId) {
      setExpandedMatch(null);
    } else {
      setExpandedMatch(matchId);
      setVetoAnalysisLoading(true);
      
      // Parallelize both data fetches
      const [vetoResult, eloResult] = await Promise.all([
        getMatchVetoAnalysisAction(matchId),
        getMatchEloDataAction(matchId),
      ]);
      
      if (vetoResult.status === "success") {
        setVetoAnalysis(vetoResult.data as VetoAnalysisStep[]);
      }
      if (eloResult.status === "success") {
        setMatchEloData(eloResult.data as MatchEloData);
      }
      setVetoAnalysisLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4">
      <VetoAnalysisSection />

      <div className="flex flex-col items-center mb-8">
        <h1 className="text-4xl font-bold text-center">Pick/Ban Elo Model Alignment</h1>
        <p className="text-center text-muted-foreground mt-2 max-w-2xl">
          This page compares historical veto choices with the model&apos;s greedy map-Elo recommendation at each step.
          &quot;Average Model Regret&quot; is the Elo-gap difference between the observed choice and that recommendation; lower means closer model alignment.
          The leakage-safe rebuild uses ratings strictly before the recorded match completion cutoff, excludes ratings produced by that same match, and defaults a missing team/map rating to 1000; completion time is the proxy because match start is not stored.
          Ban comparisons are counterfactual because banned maps are not played. These rankings show model alignment, not proven coaching quality or causal win lift.{" "}
          <Link href="/methodology#veto-alignment" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
            Read the evaluation scope and limitations.
          </Link>
        </p>
        <div className="mt-4 w-full max-w-xs">
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger aria-label="Filter model-alignment rankings by event">
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
        <div className="rounded-md border bg-card animate-pulse">
          <div className="p-4 border-b bg-muted/50">
            <div className="grid grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 bg-muted rounded" />
              ))}
            </div>
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-4 border-b last:border-b-0">
              <div className="grid grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="h-4 bg-muted rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Average Model Regret (Elo)</TableHead>
                <TableHead className="text-right">Matches Analyzed</TableHead>
                <TableHead className="w-[40px]"><span className="sr-only">Details</span></TableHead>
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
                      {row.team_slug ? (
                        <Link 
                          href={`/teams/${row.team_slug}`}
                          className="hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.team_name}
                        </Link>
                      ) : (
                        row.team_name
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.average_elo_lost.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{row.matches_analyzed}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        aria-label={`${expandedTeam === row.team_id ? "Collapse" : "Expand"} match history for ${row.team_name}`}
                        aria-expanded={expandedTeam === row.team_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRowClick(row.team_id);
                        }}
                        className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={`transition-transform ${
                            expandedTeam === row.team_id ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                  {expandedTeam === row.team_id && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        {historyLoading ? (
                          <Card className="animate-pulse">
                            <CardHeader>
                              <div className="h-6 bg-muted rounded w-1/2" />
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 bg-muted rounded" />
                              ))}
                            </CardContent>
                          </Card>
                        ) : (
                          <Card>
                            <CardHeader>
                              <CardTitle>Match History for {row.team_name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Match</TableHead>
                                    <TableHead>Event</TableHead>
                                    <TableHead className="text-right">Model Regret (Elo)</TableHead>
                                    <TableHead className="w-[40px]"><span className="sr-only">Details</span></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teamHistory.map((match) => (
                                    <Fragment key={match.match_id}>
                                      <TableRow onClick={() => handleMatchClick(match.match_id)} className="cursor-pointer">
                                        <TableCell className="flex items-center">
                                          {match.opponent_logo && (
                                            <Image
                                              src={match.opponent_logo}
                                              alt={match.opponent_name ?? ''}
                                              width={24}
                                              height={24}
                                              className="mr-2"
                                            />
                                          )}
                                          vs {match.opponent_name}
                                        </TableCell>
                                        <TableCell>{match.event_name}</TableCell>
                                        <TableCell className="text-right">{match.elo_lost.toFixed(0)}</TableCell>
                                        <TableCell>
                                          <button
                                            type="button"
                                            aria-label={`${expandedMatch === match.match_id ? "Collapse" : "Expand"} veto details for the match against ${match.opponent_name ?? "unknown opponent"}`}
                                            aria-expanded={expandedMatch === match.match_id}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void handleMatchClick(match.match_id);
                                            }}
                                            className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          >
                                            <ChevronRight
                                              aria-hidden="true"
                                              className={`transition-transform ${
                                                expandedMatch === match.match_id ? "rotate-90" : ""
                                              }`}
                                            />
                                          </button>
                                        </TableCell>
                                      </TableRow>
                                      {expandedMatch === match.match_id && (
                                        <TableRow>
                                          <TableCell colSpan={4}>
                                            {vetoAnalysisLoading ? (
                                              <div className="p-4 animate-pulse">
                                                <div className="h-64 bg-muted rounded mb-4" />
                                                <div className="space-y-2">
                                                  {[1, 2, 3, 4, 5, 6].map((i) => (
                                                    <div key={i} className="h-12 bg-muted rounded" />
                                                  ))}
                                                </div>
                                              </div>
                                            ) : (
                                              <VetoProcessChart 
                                                teamId={expandedTeam!} 
                                                vetoData={vetoAnalysis} 
                                                matchEloData={matchEloData} 
                                              />
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </Fragment>
                                  ))}
                                </TableBody>
                              </Table>
                            </CardContent>
                          </Card>
                        )}
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

type ChartDataPoint = {
  step: string;
  eloAdvantage: number;
  eloSwing: number;
  optimalChoice: string | null;
  action: string;
  winProbability: number;
  winProbabilityDelta: number;
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ChartDataPoint }[] }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const eloAdvantage = data.eloAdvantage;
    const eloSwing = data.eloSwing;
    const winProbabilityDelta = data.winProbabilityDelta;

    let advantageColorStyle = {};
    if (eloAdvantage > 0) advantageColorStyle = { color: 'hsl(142.1 76.2% 41.2%)' };
    if (eloAdvantage < 0) advantageColorStyle = { color: 'hsl(0 84.2% 60.2%)' };

    let swingColorStyle = {};
    if (eloSwing > 0) swingColorStyle = { color: 'hsl(142.1 76.2% 41.2%)' };
    if (eloSwing < 0) swingColorStyle = { color: 'hsl(0 84.2% 60.2%)' };
    
    return (
      <div className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
        <p className="font-bold">{data.step}</p>
        {data.action !== 'start' && data.action !== 'decider' && (
            <p>
                Model-Regret Swing:{" "}
                <span className="font-bold" style={swingColorStyle}>
                    {eloSwing > 0 ? "+" : ""}
                    {eloSwing.toFixed(0)}
                </span>
            </p>
        )}
        <p>
          Cumulative Model-Regret Balance:{" "}
          <span className="font-bold" style={advantageColorStyle}>
            {eloAdvantage > 0 ? "+" : ""}
            {eloAdvantage}
          </span>
        </p>
        <p>
            Model Win Estimate:{" "}
            <span className="font-bold">
                {(data.winProbability * 100).toFixed(1)}%
                {Math.abs(winProbabilityDelta) > 0.0001 && (
                    <span className="text-muted-foreground ml-1 font-normal">
                        ({(winProbabilityDelta * 100) > 0 ? '+' : ''}{(winProbabilityDelta * 100).toFixed(1)}%)
                    </span>
                )}
            </span>
        </p>
        {data.optimalChoice && data.action !== 'decider' && (
            <p className="text-muted-foreground">Greedy recommendation: {data.optimalChoice}</p>
        )}
      </div>
    );
  }

  return null;
};

const CustomDot = (props: { cx?: number; cy?: number; payload?: ChartDataPoint; r?: number }) => {
  const { cx, cy, payload, r = 6 } = props;
  if (!payload) return null;
  const { eloSwing } = payload;

  let fill = "hsl(var(--primary))";
  if (eloSwing > 0) {
    fill = "hsl(142.1 76.2% 41.2%)"; // Green
  } else if (eloSwing < 0) {
    fill = "hsl(0 84.2% 60.2%)"; // Red
  }

  if (payload.step === 'Start' || eloSwing === 0) {
    fill = 'hsl(var(--muted-foreground))'
  }

  return <circle cx={cx} cy={cy} r={r} fill={fill} />;
};

function findOptimalPick(teamElos: TeamMapElo[], opponentElos: TeamMapElo[], availableMaps: string[]): { map: string; advantage: number } {
    let bestPick = '';
    let maxAdvantage = -Infinity;

    for (const map of availableMaps) {
        const teamElo = teamElos.find(e => e.map_name === map)?.elo ?? 1000;
        const opponentElo = opponentElos.find(e => e.map_name === map)?.elo ?? 1000;
        const eloAdvantage = teamElo - opponentElo;
        
        if (eloAdvantage > maxAdvantage) {
            maxAdvantage = eloAdvantage;
            bestPick = map;
        }
    }
    return { map: bestPick, advantage: maxAdvantage };
}

function findOptimalBan(teamElos: TeamMapElo[], opponentElos: TeamMapElo[], availableMaps: string[]): { map: string; advantage: number } {
    let bestBan = '';
    let minAdvantage = Infinity;

    for (const map of availableMaps) {
        const teamElo = teamElos.find(e => e.map_name === map)?.elo ?? 1000;
        const opponentElo = opponentElos.find(e => e.map_name === map)?.elo ?? 1000;
        const eloAdvantage = teamElo - opponentElo;

        if (eloAdvantage < minAdvantage) {
            minAdvantage = eloAdvantage;
            bestBan = map;
        }
    }
    return { map: bestBan, advantage: minAdvantage };
}

function VetoProcessChart({ teamId, vetoData, matchEloData }: { teamId: number, vetoData: VetoAnalysisStep[], matchEloData: MatchEloData | null }) {
  if (!matchEloData) return <p>Missing Elo data.</p>;

  const getTeamElos = (id: number) => {
    return id === matchEloData.team1Id ? matchEloData.team1Elos : matchEloData.team2Elos;
  }
  
  const initialAvailableMaps = vetoData[0]?.availableMaps || [];

  const simulateVeto = (stepsTaken: VetoAnalysisStep[]) => {
    if (matchEloData.bestOf !== 3 && matchEloData.bestOf !== 5) return 0.5;

    const bestOf = matchEloData.bestOf;
    let availableMaps = [...initialAvailableMaps];
    const pickedMaps: string[] = [];
    
    stepsTaken.forEach(step => {
        if (step.action === 'pick' && !pickedMaps.includes(step.mapName)) {
            pickedMaps.push(step.mapName);
        }
        availableMaps = availableMaps.filter(m => m !== step.mapName);
    });
    
    let currentStep = stepsTaken.length;
    
    const actionableVetoes = vetoData.filter(step => step.action !== 'decider');

    while (currentStep < actionableVetoes.length && availableMaps.length > 1) {
        const futureStep = actionableVetoes[currentStep];
        const actingTeamId = futureStep.teamId;
        const opponentTeamId = actingTeamId === matchEloData.team1Id ? matchEloData.team2Id : matchEloData.team1Id;
        const actingTeamElos = getTeamElos(actingTeamId);
        const opponentElos = getTeamElos(opponentTeamId);

        const stepAction = futureStep.action;

        let choice: string;
        if (stepAction === 'pick') {
            choice = findOptimalPick(actingTeamElos, opponentElos, availableMaps).map;
            pickedMaps.push(choice);
        } else { // It's a ban
            choice = findOptimalBan(actingTeamElos, opponentElos, availableMaps).map;
        }
        availableMaps = availableMaps.filter(m => m !== choice);
        currentStep++;
    }

    if (pickedMaps.length < bestOf && availableMaps.length === 1) {
        pickedMaps.push(availableMaps[0]);
    }

    if (pickedMaps.length !== bestOf) {
        console.error(`Simulation did not result in ${bestOf} maps:`, pickedMaps);
        return 0.5; // Return a neutral probability if simulation fails
    }

    const mapProbs: [number, number][] = pickedMaps.map(map => {
        const team1Elo = getTeamElos(matchEloData.team1Id).find(e => e.map_name === map)?.elo ?? 1000;
        const team2Elo = getTeamElos(matchEloData.team2Id).find(e => e.map_name === map)?.elo ?? 1000;
        return calculateWinProbability(team1Elo, team2Elo);
    });

    const matchProb = bestOf === 3
      ? calculateBo3MatchProbability(mapProbs)
      : calculateBo5MatchProbability(mapProbs);
    return teamId === matchEloData.team1Id ? matchProb[0] : matchProb[1];
  };

  let cumulativeEloAdvantage = 0;
  const dataPoints = vetoData.map((step, index) => {
    const winProbability = simulateVeto(vetoData.slice(0, index)); // Simulate with steps *before* the current one
    if (step.action === 'decider') {
        return {
            step: `Decider: ${step.mapName}`,
            eloAdvantage: Math.round(cumulativeEloAdvantage),
            winProbability: winProbability,
            eloSwing: 0,
            optimalChoice: null,
            action: step.action,
        };
    }
    const eloSwing = step.teamId === teamId ? -step.eloLost : step.eloLost;
    cumulativeEloAdvantage += eloSwing;
    const finalWinProbability = simulateVeto(vetoData.slice(0, index + 1)); // Simulate with steps *including* the current one
    return {
      step: `${step.vetoOrder}. ${step.teamSlug || step.teamName} ${step.action}s ${step.mapName}`,
      eloAdvantage: Math.round(cumulativeEloAdvantage),
      winProbability: finalWinProbability,
      eloSwing: eloSwing,
      optimalChoice: step.optimalChoice,
      action: step.action,
    };
  });

  const initialWinProbability = simulateVeto([]);
  const chartDataWithDeltas = [
    { step: "Start", eloAdvantage: 0, eloSwing: 0, optimalChoice: null, action: 'start', winProbability: initialWinProbability },
    ...dataPoints
  ].map((point, index, array) => {
    if (index === 0) {
      return { ...point, winProbabilityDelta: 0 };
    }
    const prevPoint = array[index - 1];
    const delta = point.winProbability - prevPoint.winProbability;
    return { ...point, winProbabilityDelta: delta };
  });

  const chartConfig = {
    eloAdvantage: {
      label: "Model-Regret Balance",
      color: "hsl(var(--primary))",
    },
     winProbability: {
       label: "Model Win Estimate",
       color: "hsl(142.1 70.2% 45.2%)",
     },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Veto Process Model-Regret View</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart
            accessibilityLayer
            data={chartDataWithDeltas}
            margin={{
              top: 5,
              right: 20,
              left: -10,
              bottom: 5,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="step"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
            />
            <YAxis yAxisId="left" tickFormatter={(value) => Math.round(value as number).toString()} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} domain={[0, 1]} />
            <ChartTooltip cursor={false} content={<CustomTooltip />} />
            <Line
              yAxisId="left"
              dataKey="eloAdvantage"
              type="monotone"
              stroke="var(--color-eloAdvantage)"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={<CustomDot r={8} />}
            />
             <Line
               yAxisId="right"
               dataKey="winProbability"
               type="monotone"
               stroke="var(--color-winProbability)"
               strokeWidth={2}
               dot={<CustomDot />}
               activeDot={<CustomDot r={8} />}
             />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
