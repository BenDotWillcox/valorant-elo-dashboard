import { resetEloSystem } from "@/db/elo/elo-processor";

async function main() {
  try {
    await resetEloSystem();
    console.log("ELO system reset successfully");
  } catch (error) {
    console.error("Error resetting ELO system:", error);
  }
}

main();

