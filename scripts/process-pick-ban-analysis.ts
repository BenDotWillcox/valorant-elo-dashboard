import { db } from "../db/db";
import { matchesTable } from "../db/schema/matches-schema";
import { matchVetoesTable } from "../db/schema/match-vetoes-schema";
import { matchVetoAnalysisTable } from "../db/schema/match-veto-analysis-schema";
import { eq, sql, and, notInArray } from "drizzle-orm";
import { getEloRatingsAtTime } from "../db/queries/elo-ratings-queries";

type TeamMapElo = { team_id: number; map_name: string; elo: number };

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


async function processPickBanAnalysis() {
  console.log("Starting pick/ban analysis processing...");

  const processedMatchesQuery = await db.selectDistinct({ matchId: matchVetoAnalysisTable.matchId }).from(matchVetoAnalysisTable);
  const processedMatchIds = processedMatchesQuery.map(m => m.matchId);

  console.log(`Found ${processedMatchIds.length} already processed matches. Skipping them.`);

  const allMatches = await db.select().from(matchesTable).where(and(
    sql`id IN (SELECT match_id FROM match_vetoes)`,
    processedMatchIds.length > 0 ? notInArray(matchesTable.id, processedMatchIds) : undefined
  ));

  console.log(`Found ${allMatches.length} new matches to process.`);
  
  for (const match of allMatches) {
    const team1Id = match.team1_id;
    const team2Id = match.team2_id;

    if (!team1Id || !team2Id || !match.completed_at) continue;

    const vetoes = await db.select().from(matchVetoesTable).where(eq(matchVetoesTable.match_id, match.id)).orderBy(matchVetoesTable.order_index);
    if (vetoes.length === 0) continue;

    const team1ElosData = await getEloRatingsAtTime(team1Id, match.completed_at);
    const team2ElosData = await getEloRatingsAtTime(team2Id, match.completed_at);

    const team1Elos = team1ElosData.map(e => ({ team_id: team1Id, map_name: e.map_name, elo: parseFloat(e.elo_rating) }));
    const team2Elos = team2ElosData.map(e => ({ team_id: team2Id, map_name: e.map_name, elo: parseFloat(e.elo_rating) }));
    
    let availableMaps = vetoes.map(v => v.map_name);
    let team1CumulativeEloLost = 0;
    let team2CumulativeEloLost = 0;

    for (let i = 0; i < vetoes.length; i++) {
      const veto = vetoes[i];
      if (!veto.team_id || veto.action === 'decider') continue;
      
      const isTeam1 = veto.team_id === team1Id;
      const actingTeamElos = isTeam1 ? team1Elos : team2Elos;
      const opponentElos = isTeam1 ? team2Elos : team1Elos;
      
      let eloLost = 0;
      let optimalChoice = '';

      if (veto.action === 'pick') {
        const optimal = findOptimalPick(actingTeamElos, opponentElos, availableMaps);
        optimalChoice = optimal.map;
        if (veto.map_name !== optimal.map) {
            const actualPickElo = actingTeamElos.find(e => e.map_name === veto.map_name)?.elo ?? 1000;
            const opponentActualPickElo = opponentElos.find(e => e.map_name === veto.map_name)?.elo ?? 1000;
            const actualAdvantage = actualPickElo - opponentActualPickElo;
            eloLost = optimal.advantage - actualAdvantage;
        }
      } else if (veto.action === 'ban') {
        const optimal = findOptimalBan(actingTeamElos, opponentElos, availableMaps);
        optimalChoice = optimal.map;
        if (veto.map_name !== optimal.map) {
            const actualBanElo = actingTeamElos.find(e => e.map_name === veto.map_name)?.elo ?? 1000;
            const opponentActualBanElo = opponentElos.find(e => e.map_name === veto.map_name)?.elo ?? 1000;
            const actualAdvantage = actualBanElo - opponentActualBanElo;
            eloLost = actualAdvantage - optimal.advantage;
        }
      }

      if (isTeam1) {
        team1CumulativeEloLost += eloLost;
      } else {
        team2CumulativeEloLost += eloLost;
      }

      await db.insert(matchVetoAnalysisTable).values({
        matchId: match.id,
        teamId: veto.team_id,
        vetoOrder: i + 1,
        action: veto.action as 'pick' | 'ban',
        mapName: veto.map_name,
        eloLost: eloLost,
        cumulativeEloLost: isTeam1 ? team1CumulativeEloLost : team2CumulativeEloLost,
        optimalChoice: optimalChoice,
        availableMaps: [...availableMaps],
      });
      
      availableMaps = availableMaps.filter(map => map !== veto.map_name);
    }
    console.log(`Match ${match.id}: Team 1 Elo Lost: ${team1CumulativeEloLost.toFixed(2)}, Team 2 Elo Lost: ${team2CumulativeEloLost.toFixed(2)}`);
  }

  console.log("Successfully processed pick/ban analysis for all matches.");
}

processPickBanAnalysis().catch(console.error);
