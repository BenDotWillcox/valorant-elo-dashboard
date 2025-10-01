import { db } from "../db/db";
import { mapsTable } from "../db/schema/maps-schema";
import { tournamentWinnersTable } from "../db/schema/tournament-winners-schema";
import { tournaments } from "../lib/constants/tournaments";
import { desc, eq, and, sql } from "drizzle-orm";

async function populateTournamentWinners() {
  console.log("Starting tournament winners population...");

  try {
    // Get completed tournaments
    const completedTournaments = Object.entries(tournaments).filter(
      ([_, tournament]) => tournament.status === 'completed'
    );

    console.log(`Found ${completedTournaments.length} completed tournaments`);

    // Clear existing data
    await db.delete(tournamentWinnersTable);
    console.log("Cleared existing tournament winners data");

    let processedCount = 0;
    let errorCount = 0;

    // Process each tournament
    for (const [tournamentName, tournament] of completedTournaments) {
      try {
        console.log(`Processing tournament: ${tournamentName}`);

        // Get the last game played in this tournament (by completed_at time)
        const lastGame = await db
          .select({
            winner_team_id: mapsTable.winner_team_id,
            completed_at: mapsTable.completed_at
          })
          .from(mapsTable)
          .where(eq(mapsTable.event_name, tournamentName))
          .orderBy(desc(mapsTable.completed_at))
          .limit(1);

        if (lastGame.length > 0) {
          const winner = lastGame[0];
          
          // Determine tournament type
          let tournamentType = 'Domestic';
          if (tournament.region === 'International') {
            // Check if it's Champions or Masters
            if (tournamentName.toLowerCase().includes('champions')) {
              tournamentType = 'Champions';
            } else if (tournamentName.toLowerCase().includes('masters')) {
              tournamentType = 'Masters';
            } else {
              tournamentType = 'Masters'; // Default for other international tournaments
            }
          }

          // Insert the tournament winner
          await db.insert(tournamentWinnersTable).values({
            tournament_name: tournamentName,
            tournament_id: tournament.id,
            winner_team_id: winner.winner_team_id,
            region: tournament.region,
            tournament_type: tournamentType,
            completed_at: winner.completed_at || new Date(),
          });

          console.log(`✓ ${tournamentName}: Team ID ${winner.winner_team_id} (${tournament.region})`);
          processedCount++;
        } else {
          console.log(`⚠ No games found for tournament: ${tournamentName}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`✗ Error processing tournament ${tournamentName}:`, error);
        errorCount++;
      }
    }

    console.log(`\nTournament winners population completed!`);
    console.log(`✓ Successfully processed: ${processedCount} tournaments`);
    console.log(`✗ Errors: ${errorCount} tournaments`);

    // Verify the data
    const totalWinners = await db.select().from(tournamentWinnersTable);
    console.log(`\nTotal tournament winners in database: ${totalWinners.length}`);

    // Show some sample data
    const sampleWinners = await db
      .select()
      .from(tournamentWinnersTable)
      .limit(5);
    
    console.log("\nSample tournament winners:");
    sampleWinners.forEach(winner => {
      console.log(`- ${winner.tournament_name}: Team ${winner.winner_team_id} (${winner.region})`);
    });

  } catch (error) {
    console.error("Error populating tournament winners:", error);
    throw error;
  }
}

// Run the script
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
