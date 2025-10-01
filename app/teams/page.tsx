import { getTeamsAction } from "@/actions/teams-actions";
import { TEAM_REGIONS, getTeamRegion } from "@/lib/constants/regions";
import { TEAM_LOGOS } from "@/lib/constants/images";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamsPage() {
  const teamsResult = await getTeamsAction();
  
  if (teamsResult.status !== "success" || !teamsResult.data) {
    return <div>Error loading teams</div>;
  }

  const teams = teamsResult.data;
  
  // Group teams by region
  const teamsByRegion = teams.reduce((acc: Record<string, typeof teams>, team: typeof teams[number]) => {
    const region = getTeamRegion(team.slug || '');
    if (!acc[region]) {
      acc[region] = [];
    }
    acc[region].push(team);
    return acc;
  }, {} as Record<string, typeof teams>);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-center mb-2">Teams</h1>
        <p className="text-muted-foreground text-center">
          Explore all Valorant teams organized by region
        </p>
      </div>

      <div className="space-y-8">
        {Object.entries(TEAM_REGIONS).map(([regionName, teamSlugs]) => {
          const regionTeams = teamsByRegion[regionName] || [];
          
          return (
            <div key={regionName}>
              <h2 className="text-2xl font-semibold mb-4 text-center">{regionName}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {regionTeams.map((team: typeof teams[number]) => {
                  const logoPath = team.slug ? TEAM_LOGOS[team.slug as keyof typeof TEAM_LOGOS] : null;
                  
                  return (
                    <Link key={team.id} href={`/teams/${team.slug}`}>
                      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex flex-col items-center space-y-3">
                            {logoPath && (
                              <div className="w-16 h-16 relative">
                                <Image
                                  src={logoPath}
                                  alt={`${team.name} logo`}
                                  fill
                                  className="object-contain"
                                />
                              </div>
                            )}
                            <div className="text-center">
                              <h3 className="font-medium text-sm">{team.name}</h3>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
