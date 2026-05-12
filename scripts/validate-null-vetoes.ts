import { db } from "@/db/db";
import { matchesTable } from "@/db/schema/matches-schema";
import { matchVetoesTable } from "@/db/schema/match-vetoes-schema";
import { teamsTable } from "@/db/schema/teams-schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

async function validateNullVetoes() {
  const team2Alias = alias(teamsTable, "team2");

  const rows = await db
    .select({
      matchId: matchesTable.id,
      vlrMatchId: matchesTable.vlr_match_id,
      eventName: matchesTable.event_name,
      team1Name: teamsTable.name,
      team2Name: team2Alias.name,
      vetoId: matchVetoesTable.id,
      orderIndex: matchVetoesTable.order_index,
      action: matchVetoesTable.action,
      mapName: matchVetoesTable.map_name,
    })
    .from(matchVetoesTable)
    .innerJoin(matchesTable, eq(matchVetoesTable.match_id, matchesTable.id))
    .innerJoin(teamsTable, eq(matchesTable.team1_id, teamsTable.id))
    .innerJoin(team2Alias, eq(matchesTable.team2_id, team2Alias.id))
    .where(and(isNull(matchVetoesTable.team_id), ne(matchVetoesTable.action, "decider")))
    .orderBy(matchesTable.completed_at, matchesTable.id, matchVetoesTable.order_index);

  if (rows.length === 0) {
    console.log("No unresolved null veto team_ids found.");
    process.exit(0);
    return;
  }

  const matchIds = new Set(rows.map((row) => row.matchId));
  console.error(
    `Found ${rows.length} unresolved non-decider vetoes across ${matchIds.size} matches. ` +
      "Stopping before pick/ban analysis."
  );

  for (const row of rows) {
    console.error(
      [
        `match_id=${row.matchId}`,
        `vlr=https://www.vlr.gg/${row.vlrMatchId}`,
        `event="${row.eventName}"`,
        `teams="${row.team1Name} vs ${row.team2Name}"`,
        `veto_id=${row.vetoId}`,
        `order=${row.orderIndex}`,
        `action=${row.action}`,
        `map=${row.mapName}`,
      ].join(" | ")
    );
  }

  process.exit(1);
}

validateNullVetoes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to validate null vetoes:", error);
    process.exit(1);
  });
