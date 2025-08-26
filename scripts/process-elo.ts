import { processEloUpdates } from "@/db/elo/elo-processor";
import { initializeSeasons } from "@/db/elo/elo-processor";

async function main() {
  try {
    // Make sure we have seasons initialized first
    await initializeSeasons();
    console.log("Seasons initialized");
    
    // Then process ELO ratings
    await processEloUpdates();
    console.log("Elo ratings processed successfully");
  } catch (error) {
    console.error("Error processing Elo ratings:", error);
  }
}

main(); 