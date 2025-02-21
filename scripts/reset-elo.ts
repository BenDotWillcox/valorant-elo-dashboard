import { db } from "@/db/db";
import { sql } from "drizzle-orm";
import { initializeSeasons } from "@/db/queries/elo-processor";

async function fullReset() {
  try {
    console.log("Starting full reset...");
    
    // Drop tables if they exist
    await db.execute(sql`
      DROP TABLE IF EXISTS elo_ratings_current CASCADE;
      DROP TABLE IF EXISTS elo_ratings CASCADE;
      DROP TABLE IF EXISTS seasons CASCADE;
    `);
    console.log("Tables dropped");
    
    // Reset maps to unprocessed
    await db.execute(sql`
      UPDATE maps SET processed = false;
    `);
    console.log("Maps reset");
    
    // Initialize seasons
    await initializeSeasons();
    console.log("Seasons initialized with active season for 2025");
  } catch (err) {
    console.error("Error during reset:", err);
    throw err;  // Re-throw to ensure process exits with error
  }
}

fullReset().then(() => {
  console.log("Full reset complete - ready for migrations");
  process.exit(0);
}).catch(err => {
  console.error("Error during full reset:", err);
  process.exit(1);
}); 