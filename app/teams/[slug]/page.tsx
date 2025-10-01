import { getTeamBySlugAction, getTeamMapStatsAction, getTeamRecentRosterAction, getTeamHistoricalEloAction, getTeamTournamentWinsAction, getTeamMapStreaksAction, getTeamLastPlayedCompsAction } from "@/actions/teams-actions";
import { TEAM_LOGOS, getAgentImage, TROUPHY_IMAGES } from "@/lib/constants/images";
import { getTeamRegion } from "@/lib/constants/regions";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapsibleMapCard } from "@/components/teams/collapsible-map-card";

interface TeamPageProps {
  params: {
    slug: string;
  };
}

interface MapStat {
  map_name: string;
  elo_rating: number;
  wins: number;
  losses: number;
  total_matches: number;
}

interface RosterPlayer {
  player_id: number;
  ign: string;
  name: string | null;
  vpm: number | null;
  last_game_date: string | null;
  last_game_num: number | null;
  most_played_agent: string;
  team_games: number;
}

interface HistoricalEloRecord {
  map_name: string;
  elo_rating: number;
  date: string;
}

interface HistoricalData {
  best: HistoricalEloRecord | null;
  worst: HistoricalEloRecord | null;
}

interface TournamentDetail {
  tournament_name: string;
  tournament_type: string;
  region: string;
  completed_at: string;
}

interface TournamentWins {
  international_wins: number;
  domestic_wins: number;
  total_wins: number;
  champions_wins: number;
  masters_wins: number;
  tournament_details: TournamentDetail[];
}

interface MapStreak {
  longest_win_streak: number;
  longest_loss_streak: number;
  current_streak: number;
  current_streak_type: 'W' | 'L';
}

export default async function TeamPage({ params }: TeamPageProps) {
  const teamResult = await getTeamBySlugAction(params.slug);
  
  if (teamResult.status !== "success" || !teamResult.data) {
    notFound();
  }

  const team = teamResult.data;
  const region = getTeamRegion(team.slug || '');
  const logoPath = team.slug ? TEAM_LOGOS[team.slug as keyof typeof TEAM_LOGOS] : null;

  // Get team map statistics
  const mapStatsResult = await getTeamMapStatsAction(team.id);
  const mapStats: MapStat[] = mapStatsResult.status === "success" && mapStatsResult.data ? mapStatsResult.data : [];

  // Get team recent roster
  const rosterResult = await getTeamRecentRosterAction(team.id);
  const roster: RosterPlayer[] = rosterResult.status === "success" && rosterResult.data ? rosterResult.data : [];

  // Get historical ELO data
  const historicalResult = await getTeamHistoricalEloAction(team.id);
  const historicalData: HistoricalData = historicalResult.status === "success" && historicalResult.data ? historicalResult.data : { best: null, worst: null };

  // Get tournament wins data
  const tournamentResult = await getTeamTournamentWinsAction(team.id);
  const tournamentWins: TournamentWins = tournamentResult.status === "success" && tournamentResult.data ? tournamentResult.data : { international_wins: 0, domestic_wins: 0, total_wins: 0, champions_wins: 0, masters_wins: 0, tournament_details: [] };

  // Get map streaks data
  const streaksResult = await getTeamMapStreaksAction(team.id);
  const mapStreaks: Record<string, MapStreak> = streaksResult.status === "success" && streaksResult.data ? streaksResult.data : {};

  // Get last played compositions data
  const compsResult = await getTeamLastPlayedCompsAction(team.id);
  const lastPlayedComps: Record<string, string[]> = compsResult.status === "success" && compsResult.data ? compsResult.data : {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Modern Dashboard Header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Content Area - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {team.name}
                </h1>
                <div className="flex items-center gap-3 mt-3">
                  <Badge variant="outline" className="text-sm">
                    {region} Region
                  </Badge>
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/50"></div>
                  <Image src={`/images/trophies/${region}.png`} alt="region trophy" width={32} height={32} className="w-8 h-8" />
                </div>
              </div>
              
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-2xl font-bold">
                    {mapStats.reduce((acc, map) => acc + map.wins + map.losses, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Maps Played</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold">
                    {mapStats.reduce((acc, map) => acc + map.wins, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Wins</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold">
                    {mapStats.reduce((acc, map) => acc + map.losses, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Losses</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold">
                    {mapStats.length > 0 ? 
                      Math.round((mapStats.reduce((acc, map) => acc + map.wins, 0) / 
                        (mapStats.reduce((acc, map) => acc + map.wins, 0) + mapStats.reduce((acc, map) => acc + map.losses, 0))) * 100) : 0}%
                  </div>
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                </Card>
              </div>

              {/* Recent Roster Section */}
              {roster.length > 0 && (
                <div className="space-y-4 mt-16">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">Recent Roster</h3>
                    <p className="text-muted-foreground text-sm">
                      5 most recently played players with their VPM ratings
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {roster.map((player) => (
                      <Card key={player.player_id} className="p-4 hover:shadow-lg transition-shadow">
                        <div className="space-y-3">
                          {/* Player Info */}
                          <div className="text-center">
                            <h4 className="font-bold text-lg">{player.ign}</h4>
                            {player.name && (
                              <p className="text-sm text-muted-foreground">{player.name}</p>
                            )}
                          </div>

                          {/* VPM Rating */}
                          <div className="text-center">
                            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                              {player.vpm ? player.vpm.toFixed(2) : 'N/A'}
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">VPM RATING</div>
                          </div>

                          {/* Agent Background */}
                          <div className="relative h-16 rounded-lg overflow-hidden">
                            {(() => {
                              const agentImage = getAgentImage(player.most_played_agent);
                              return agentImage;
                            })() ? (
                              <>
                                <Image
                                  src={getAgentImage(player.most_played_agent)!}
                                  alt={player.most_played_agent}
                                  fill
                                  className="object-cover opacity-20"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xs font-bold text-white drop-shadow-lg">
                                    {player.most_played_agent}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="h-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {player.most_played_agent}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Additional Stats */}
                          <div className="text-center text-xs text-muted-foreground">
                            {player.last_game_num && (
                              <div>
                                <div>{player.last_game_num} career maps</div>
                                {player.team_games > 0 && (
                                  <div className="text-muted-foreground/70">
                                    ({player.team_games} maps with {team.slug.toUpperCase()})
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - 1/3 width */}
          <div className="lg:col-span-1">
            <Card className="h-full p-6">
              <div className="flex flex-col items-center text-center space-y-6">
                {logoPath && (
                  <div className="w-32 h-32 relative">
                    <div className="w-full h-full rounded-2xl border-4 border-primary/20 bg-gradient-to-br from-card to-muted/50 p-4 shadow-lg">
                      <Image
                        src={logoPath}
                        alt={`${team.name} logo`}
                        fill
                        className="object-contain rounded-xl"
                      />
                    </div>
                  </div>
                )}
                
                {/* Trophy Badges */}
                {tournamentWins.tournament_details.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                    {tournamentWins.tournament_details.map((tournament, index) => {
                      // Determine trophy image based on tournament type and region
                      let trophyKey: keyof typeof TROUPHY_IMAGES;
                      if (tournament.tournament_type === 'Champions') {
                        trophyKey = 'Champions';
                      } else if (tournament.tournament_type === 'Masters') {
                        trophyKey = 'Masters';
                      } else {
                        // For domestic tournaments, use region-specific trophy
                        trophyKey = tournament.region as keyof typeof TROUPHY_IMAGES;
                      }

                      const trophyImage = TROUPHY_IMAGES[trophyKey];
                      
                      return (
                        <div
                          key={index}
                          className="relative group cursor-pointer"
                          title={tournament.tournament_name}
                        >
                          <div className="w-8 h-8 relative">
                            <Image
                              src={trophyImage}
                              alt={`${tournament.tournament_type} trophy`}
                              fill
                              className="object-contain transition-transform group-hover:scale-110"
                            />
                          </div>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {tournament.tournament_name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">{team.name} Team Overview</h2>
                </div>

                {/* Current Season Stats */}
                <div className="w-full">
                  <div className="flex items-center mb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent flex-1"></div>
                    <h3 className="text-sm font-semibold text-foreground px-3 bg-card rounded-md border">Current Season</h3>
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent flex-1"></div>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      // Use all maps instead of just active maps
                      const allElos = mapStats.map(map => map.elo_rating);
                      
                      // Calculate average ELO
                      const avgElo = allElos.length > 0 
                        ? allElos.reduce((sum, elo) => sum + elo, 0) / allElos.length 
                        : 0;
                      
                      // Calculate standard deviation
                      const variance = allElos.length > 0 
                        ? allElos.reduce((sum, elo) => sum + Math.pow(elo - avgElo, 2), 0) / allElos.length 
                        : 0;
                      const stdDev = Math.sqrt(variance);
                      
                      // Find best and worst maps
                      const bestMap = mapStats.length > 0 ? mapStats[0] : null;
                      const worstMap = mapStats.length > 0 ? mapStats[mapStats.length - 1] : null;
                      
                      return (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Avg ELO</span>
                            <span className="text-sm font-medium">
                              {allElos.length > 0 ? Math.round(avgElo) : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">ELO Std Dev</span>
                            <span className="text-sm font-medium">
                              {allElos.length > 0 ? Math.round(stdDev) : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Best Map</span>
                            <span className="text-sm font-medium">
                              {bestMap ? `${bestMap.map_name} (${Math.round(bestMap.elo_rating)})` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Worst Map</span>
                            <span className="text-sm font-medium">
                              {worstMap ? `${worstMap.map_name} (${Math.round(worstMap.elo_rating)})` : 'N/A'}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Historical Data */}
                <div className="w-full">
                  <div className="flex items-center mb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent flex-1"></div>
                    <h3 className="text-sm font-semibold text-foreground px-3 bg-card rounded-md border">Historical Data</h3>
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent flex-1"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Peak ELO</span>
                      <span className="text-sm font-medium">
                        {historicalData.best ? (
                          <div className="text-right">
                            <div>{historicalData.best.map_name} ({Math.round(historicalData.best.elo_rating)})</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(historicalData.best.date).toLocaleDateString()}
                            </div>
                          </div>
                        ) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Lowest ELO</span>
                      <span className="text-sm font-medium">
                        {historicalData.worst ? (
                          <div className="text-right">
                            <div>{historicalData.worst.map_name} ({Math.round(historicalData.worst.elo_rating)})</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(historicalData.worst.date).toLocaleDateString()}
                            </div>
                          </div>
                        ) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tournaments Won</span>
                      <span className="text-sm font-medium">
                        <div className="text-right">
                          <div>{tournamentWins.total_wins} total</div>
                          <div className="text-xs text-muted-foreground">
                            {tournamentWins.champions_wins} champions, {tournamentWins.masters_wins} masters, {tournamentWins.domestic_wins} domestic
                          </div>
                        </div>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Map Rankings Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Map Performance</h2>
            <p className="text-muted-foreground">
              Current season ELO ratings and match records by map
            </p>
          </div>
          
          <div className="grid gap-4">
            {mapStats.length > 0 ? (
              mapStats.map((map: MapStat, index: number) => {
                const streaks = mapStreaks[map.map_name];
                const lastComp = lastPlayedComps[map.map_name] || [];
                
                return (
                  <CollapsibleMapCard
                    key={map.map_name}
                    map={map}
                    index={index}
                    streaks={streaks}
                    lastComp={lastComp}
                    teamId={team.id}
                    teamSlug={team.slug || ''}
                  />
                );
              })
            ) : (
              <Card className="p-12">
                <div className="text-center text-muted-foreground">
                  <p className="text-lg">No map statistics available for this team.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
