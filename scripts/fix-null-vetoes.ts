import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { teamsTable } from "@/db/schema/teams-schema";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { eq, inArray, isNull, and, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { prompt } from "enquirer";

async function fixNullVetoes() {
  console.log("Searching for matches with null veto team_ids...");

  // 1. Find all matches that have at least one null team_id in a pick/ban action
  const problemMatchesQuery = await db
    .selectDistinct({ match_id: matchVetoesTable.match_id })
    .from(matchVetoesTable)
    .where(and(isNull(matchVetoesTable.team_id), ne(matchVetoesTable.action, "decider")));

  const problemMatchIds = problemMatchesQuery.map((m) => m.match_id);

  if (problemMatchIds.length === 0) {
    console.log("No matches with null veto data found. Exiting.");
    return;
  }

  console.log(`Found ${problemMatchIds.length} matches with problematic veto data.`);

  const team2Alias = alias(teamsTable, "team2");

  // 2. Fetch the details for these matches
  const matches = await db
    .select({
      id: matchesTable.id,
      team1: { id: teamsTable.id, name: teamsTable.name },
      team2: { id: team2Alias.id, name: team2Alias.name },
    })
    .from(matchesTable)
    .where(inArray(matchesTable.id, problemMatchIds))
    .innerJoin(teamsTable, eq(matchesTable.team1_id, teamsTable.id))
    .innerJoin(team2Alias, eq(matchesTable.team2_id, team2Alias.id));

  const updatesToPerform: { vetoId: number; teamId: number }[] = [];

  for (const match of matches) {
    console.log(`\n--- Processing Match ID: ${match.id} (${match.team1.name} vs ${match.team2.name}) ---`);

    const vetoes = await db
      .select()
      .from(matchVetoesTable)
      .where(eq(matchVetoesTable.match_id, match.id))
      .orderBy(matchVetoesTable.order_index);

    console.table(vetoes.map(v => ({ order: v.order_index, action: v.action, map: v.map_name, team_id: v.team_id })));

    let firstMoverId: number | undefined;
    const firstActualVeto = vetoes.find(v => v.action !== 'decider' && v.team_id);
    
    if (firstActualVeto) {
        const firstVetoIndex = firstActualVeto.order_index ?? 1;
        // If the first known action is on an even turn, the other team must have gone first
        firstMoverId = firstVetoIndex % 2 === 0 ? (firstActualVeto.team_id === match.team1.id ? match.team2.id : match.team1.id) : firstActualVeto.team_id;
    } else {
      // If we have no info at all, we must ask the user
      const response: { teamName: string } = await prompt({
        type: "select",
        name: "teamName",
        message: `Who made the first pick/ban for Match ID ${match.id}?`,
        choices: [match.team1.name, match.team2.name],
      });
      
      // Explicitly map the chosen name back to the correct team ID
      firstMoverId = response.teamName === match.team1.name ? match.team1.id : match.team2.id;
    }

    const secondMoverId = firstMoverId === match.team1.id ? match.team2.id : match.team1.id;

    for (const veto of vetoes) {
        if (veto.action !== 'decider' && !veto.team_id) {
            const turn = veto.order_index ?? 1;
            const correctTeamId = turn % 2 !== 0 ? firstMoverId : secondMoverId;
            console.log(`  > Proposing fix: Veto ID ${veto.id}, Action '${veto.action}' on map ${veto.map_name} to be assigned to Team ID ${correctTeamId}`);
            updatesToPerform.push({ vetoId: veto.id, teamId: correctTeamId });
        }
    }
  }

  if (updatesToPerform.length === 0) {
    console.log("\nNo updates were proposed. Exiting.");
    return;
  }

  console.log(`\nProposed ${updatesToPerform.length} total updates.`);
  const confirm: { value: boolean } = await prompt({
    type: "confirm",
    name: "value",
    message: "Apply these changes to the database?",
  });

  if (confirm.value) {
    for (const update of updatesToPerform) {
        await db.update(matchVetoesTable).set({ team_id: update.teamId }).where(eq(matchVetoesTable.id, update.vetoId));
    }
    console.log("Successfully applied all updates!");
  } else {
    console.log("Aborted. No changes were made.");
  }
}

fixNullVetoes().catch((err) => {
  console.error("An error occurred:", err);
  process.exit(1);
});
