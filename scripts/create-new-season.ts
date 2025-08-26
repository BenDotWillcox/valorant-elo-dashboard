import { createNewSeason } from "@/db/elo/elo-processor";

const year = process.argv[2] ? parseInt(process.argv[2]) : new Date().getFullYear();

createNewSeason(year).then((season) => {
  console.log(`Created new season for ${year}`);
  process.exit(0);
}).catch(err => {
  console.error("Error creating new season:", err);
  process.exit(1);
}); 