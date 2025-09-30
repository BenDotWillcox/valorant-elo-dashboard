import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { getEloRatingsAtTime } from "@/db/queries/elo-ratings-queries";
import { matchPickBanAnalysisTable } from "@/db/schema/match-pick-ban-analysis-schema";
import { notInArray, eq } from "drizzle-orm";

async function processPickBanAnalysis() {
  console.log("Starting pick/ban analysis processing...");

  // 1. Get IDs of already processed matches
  const processedMatchesQuery = await db.selectDistinct({ match_id: matchPickBanAnalysisTable.match_id }).from(matchPickBanAnalysisTable);
  const processedMatchIds = processedMatchesQuery.map(m => m.match_id);

  console.log(`Found ${processedMatchIds.length} already processed matches. Skipping them.`);

  // 2. Get all matches that are NOT in the processed set
  const unprocessedMatches = processedMatchIds.length > 0
    ? await db
        .select()
        .from(matchesTable)
        .where(notInArray(matchesTable.id, processedMatchIds))
    : await db.select().from(matchesTable);

  console.log(`Found ${unprocessedMatches.length} new matches to process.`);

  for (const match of unprocessedMatches) {
    if (!match.team1_id || !match.team2_id || !match.completed_at) {
      continue;
    }

    const vetoes = await db
      .select()
      .from(matchVetoesTable)
      .where(eq(matchVetoesTable.match_id, match.id))
      .orderBy(matchVetoesTable.order_index);

    if (vetoes.length < 7) { // Loosen constraint slightly for flexibility
      continue;
    }

    const team1Elo = await getEloRatingsAtTime(match.team1_id, match.completed_at);
    const team2Elo = await getEloRatingsAtTime(match.team2_id, match.completed_at);

    const team1EloMap = new Map(team1Elo.map((r) => [r.map_name, parseFloat(r.elo_rating)]));
    const team2EloMap = new Map(team2Elo.map((r) => [r.map_name, parseFloat(r.elo_rating)]));

    let team1EloLost = 0;
    let team2EloLost = 0;

    const availableMaps = new Set(vetoes.map((v) => v.map_name));

    for (const veto of vetoes) {
      // Any action that is not 'decider' MUST have a team_id to be analyzed.
      // If it's a pick/ban with a null team, it's bad data, so we must skip it.
      if (veto.action !== 'decider' && !veto.team_id) {
        console.warn(`Skipping veto for Match ID ${match.id} due to missing team_id on a ${veto.action} action.`);
        availableMaps.delete(veto.map_name);
        continue;
      }
      
      if (veto.action === "decider") {
        availableMaps.delete(veto.map_name);
        continue;
      }

      const actingTeamId = veto.team_id!;
      const opponentTeamId = actingTeamId === match.team1_id ? match.team2_id : match.team1_id;

      const actingTeamEloMap = actingTeamId === match.team1_id ? team1EloMap : team2EloMap;
      const opponentTeamEloMap = opponentTeamId === match.team1_id ? team1EloMap : team2EloMap;

      const mapOptions = Array.from(availableMaps).map((map) => {
        const actingElo = actingTeamEloMap.get(map) ?? 1500;
        const opponentElo = opponentTeamEloMap.get(map) ?? 1500;
        return {
          map_name: map,
          elo_advantage: actingElo - opponentElo,
        };
      });

      if (veto.action === "ban") {
        mapOptions.sort((a, b) => a.elo_advantage - b.elo_advantage);
        const optimalBan = mapOptions[0];
        const actualBanAdvantage = mapOptions.find((m) => m.map_name === veto.map_name)?.elo_advantage ?? 0;
        const eloLost = actualBanAdvantage - optimalBan.elo_advantage;
        if (actingTeamId === match.team1_id) {
          team1EloLost += eloLost;
        } else {
          team2EloLost += eloLost;
        }
      } else if (veto.action === "pick") {
        mapOptions.sort((a, b) => b.elo_advantage - a.elo_advantage);
        const optimalPick = mapOptions[0];
        const actualPickAdvantage = mapOptions.find((m) => m.map_name === veto.map_name)?.elo_advantage ?? 0;
        const eloLost = optimalPick.elo_advantage - actualPickAdvantage;
        if (actingTeamId === match.team1_id) {
          team1EloLost += eloLost;
        } else {
          team2EloLost += eloLost;
        }
      }

      availableMaps.delete(veto.map_name);
    }

    console.log(`Match ${match.id}: Team 1 Elo Lost: ${team1EloLost.toFixed(2)}, Team 2 Elo Lost: ${team2EloLost.toFixed(2)}`);

    // Insert the analysis for both teams for the current match
    await db.insert(matchPickBanAnalysisTable).values([
        { match_id: match.id, team_id: match.team1_id, elo_lost: team1EloLost },
        { match_id: match.id, team_id: match.team2_id, elo_lost: team2EloLost },
    ]);
  }

  console.log("Finished pick/ban analysis processing.");
}

processPickBanAnalysis().catch((err) => {
  console.error("Error processing pick/ban analysis:", err);
  process.exit(1);
});
