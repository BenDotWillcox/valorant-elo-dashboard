import { db } from "../db/db";
import { matchesTable } from "../db/schema/matches-schema";
import { tournamentWinnersTable } from "../db/schema/tournament-winners-schema";
import { tournaments } from "../lib/constants/tournaments";
import { desc, eq } from "drizzle-orm";

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

        // Get the last completed match for this tournament
        const lastMatch = await db
          .select({
            team1_id: matchesTable.team1_id,
            team2_id: matchesTable.team2_id,
            team1_score: matchesTable.team1_score,
            team2_score: matchesTable.team2_score,
            completed_at: matchesTable.completed_at
          })
          .from(matchesTable)
          .where(eq(matchesTable.event_name, tournamentName))
          .orderBy(desc(matchesTable.completed_at))
          .limit(1);

        if (lastMatch.length > 0) {
          const match = lastMatch[0];
          
          // Check if scores are available
          if (match.team1_score === null || match.team2_score === null) {
            console.log(`⚠ Match scores not available for tournament: ${tournamentName}`);
            errorCount++;
            continue;
          }
          
          const winner_team_id = match.team1_score > match.team2_score 
            ? match.team1_id 
            : match.team2_id;
            
          // Check if winner team ID is valid
          if (winner_team_id === null) {
            console.log(`⚠ Winner team ID is null for tournament: ${tournamentName}`);
            errorCount++;
            continue;
          }
          
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
            winner_team_id: winner_team_id,
            region: tournament.region,
            tournament_type: tournamentType,
            completed_at: match.completed_at || new Date(),
          });

          console.log(`✓ ${tournamentName}: Team ID ${winner_team_id} (${tournament.region})`);
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
