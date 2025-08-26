import { initializeSeasons } from "@/db/elo/elo-processor";

initializeSeasons().then(() => {
  console.log("Seasons initialized");
  process.exit(0);
}).catch(err => {
  console.error("Error initializing seasons:", err);
  process.exit(1);
}); 