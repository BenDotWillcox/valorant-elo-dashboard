import { db } from "../db/db";
import { matchesTable } from "../db/schema/matches-schema";
import { tournamentWinnersTable } from "../db/schema/tournament-winners-schema";
import { tournaments } from "../lib/constants/tournaments";
import { desc, eq } from "drizzle-orm";

const REBUILD = process.argv.includes("--rebuild");

async function populateTournamentWinners() {
  console.log("Starting tournament winners population...");

  const completedTournaments = Object.entries(tournaments).filter(
    ([, tournament]) => tournament.status === "completed"
  );

  console.log(`Found ${completedTournaments.length} completed tournaments`);

  if (REBUILD) {
    await db.delete(tournamentWinnersTable);
    console.log("Cleared existing tournament winners data");
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [tournamentName, tournament] of completedTournaments) {
    try {
      console.log(`Processing tournament: ${tournamentName}`);

      const existingWinner = await db
        .select({ id: tournamentWinnersTable.id })
        .from(tournamentWinnersTable)
        .where(eq(tournamentWinnersTable.tournament_id, tournament.id))
        .limit(1);

      if (!REBUILD && existingWinner.length > 0) {
        console.log(`Skipping existing tournament winner: ${tournamentName}`);
        skippedCount++;
        continue;
      }

      const [lastMatch] = await db
        .select({
          team1_id: matchesTable.team1_id,
          team2_id: matchesTable.team2_id,
          team1_score: matchesTable.team1_score,
          team2_score: matchesTable.team2_score,
          completed_at: matchesTable.completed_at,
        })
        .from(matchesTable)
        .where(eq(matchesTable.event_name, tournamentName))
        .orderBy(desc(matchesTable.completed_at))
        .limit(1);

      if (!lastMatch) {
        console.log(`WARN No games found for tournament: ${tournamentName}`);
        errorCount++;
        continue;
      }

      if (lastMatch.team1_score === null || lastMatch.team2_score === null) {
        console.log(`WARN Match scores not available for tournament: ${tournamentName}`);
        errorCount++;
        continue;
      }

      const winnerTeamId =
        lastMatch.team1_score > lastMatch.team2_score
          ? lastMatch.team1_id
          : lastMatch.team2_id;

      if (winnerTeamId === null) {
        console.log(`WARN Winner team ID is null for tournament: ${tournamentName}`);
        errorCount++;
        continue;
      }

      let tournamentType = "Domestic";
      if (tournament.region === "International") {
        if (tournamentName.toLowerCase().includes("champions")) {
          tournamentType = "Champions";
        } else {
          tournamentType = "Masters";
        }
      }

      await db.insert(tournamentWinnersTable).values({
        tournament_name: tournamentName,
        tournament_id: tournament.id,
        winner_team_id: winnerTeamId,
        region: tournament.region,
        tournament_type: tournamentType,
        completed_at: lastMatch.completed_at || new Date(),
      });

      console.log(`OK ${tournamentName}: Team ID ${winnerTeamId} (${tournament.region})`);
      processedCount++;
    } catch (error) {
      console.error(`ERROR processing tournament ${tournamentName}:`, error);
      errorCount++;
    }
  }

  console.log("\nTournament winners population completed!");
  console.log(`Successfully processed: ${processedCount} tournaments`);
  console.log(`Skipped existing: ${skippedCount} tournaments`);
  console.log(`Errors: ${errorCount} tournaments`);

  const totalWinners = await db.select().from(tournamentWinnersTable);
  console.log(`\nTotal tournament winners in database: ${totalWinners.length}`);

  const sampleWinners = await db.select().from(tournamentWinnersTable).limit(5);

  console.log("\nSample tournament winners:");
  sampleWinners.forEach((winner) => {
    console.log(`- ${winner.tournament_name}: Team ${winner.winner_team_id} (${winner.region})`);
  });
}

if (require.main === module) {
  populateTournamentWinners()
    .then(() => {
      console.log("Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}

export { populateTournamentWinners };
