import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { getTournamentConfig, getTournamentIds } from "@/lib/simulation/tournament-formats";
import { getHistoricalEloSnapshot } from "@/lib/simulation/historical/get-elo-snapshot";
import { runMonteCarloSimulation } from "@/lib/simulation/simulation";

const NUM_SIMULATIONS = 100000;

interface SimulationOutput {
  tournamentId: string;
  tournamentName: string;
  simulatedAt: string;
  eloSnapshotDate: string;
  numSimulations: number;
  results: Array<{
    team: string;
    teamName: string;
    championships: number;
    finalist: number;
    top3: number;
    top4: number;
    top6: number;
    top8: number;
    top12: number;
  }>;
  actualResults?: {
    winner: string;
    runnerUp: string;
    thirdPlace: string;
    top4: string[];
    top6?: string[];
    top8?: string[];
    top12?: string[];
  };
}

async function generateSimulation(tournamentId: string) {
  console.log(`\nGenerating simulation for: ${tournamentId}`);

  const config = getTournamentConfig(tournamentId);
  if (!config) {
    console.error(`Tournament not found: ${tournamentId}`);
    console.log(`Available tournaments: ${getTournamentIds().join(", ")}`);
    process.exit(1);
  }

  console.log(`Tournament: ${config.name}`);
  console.log(`Start date: ${config.startDate.toISOString().split("T")[0]}`);
  console.log(`Teams: ${config.teams.length}`);
  console.log(`Map Pool: ${config.mapPool.join(', ')}`);

  // Get historical ELO snapshot
  const teamSlugs = config.teams.map((t) => t.slug);
  console.log(`\nFetching historical ELO data for ${teamSlugs.length} teams...`);

  const eloData = await getHistoricalEloSnapshot(config.startDate, teamSlugs);

  const teamsWithData = Object.keys(eloData).length;
  console.log(`Found ELO data for ${teamsWithData}/${teamSlugs.length} teams`);

  if (teamsWithData === 0) {
    console.error("No ELO data found. Make sure the database is populated.");
    process.exit(1);
  }

  // Debug: Show ELO data for first team and check map pool coverage
  const firstTeam = teamSlugs[0];
  const firstTeamData = eloData[firstTeam];
  if (firstTeamData) {
    console.log(`\nSample ELO data for ${firstTeam}:`);
    const availableMaps = Object.keys(firstTeamData);
    console.log(`  Available maps: ${availableMaps.join(', ')}`);
    config.mapPool.forEach(map => {
      const rating = firstTeamData[map];
      console.log(`  ${map}: ${rating ? rating.toFixed(1) : 'NO DATA'}`);
    });
    
    // Check for map pool mismatches
    const missingMaps = config.mapPool.filter(m => !availableMaps.includes(m));
    if (missingMaps.length > 0) {
      console.log(`\n  WARNING: Missing ELO data for maps: ${missingMaps.join(', ')}`);
    }
  }

  // Run Monte Carlo simulation
  console.log(`\nRunning ${NUM_SIMULATIONS.toLocaleString()} simulations...`);
  const startTime = Date.now();

  const results = await runMonteCarloSimulation(
    NUM_SIMULATIONS,
    undefined, // no completed winners for historical
    config,
    eloData
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Simulation completed in ${elapsed}s`);

  // Build output
  const output: SimulationOutput = {
    tournamentId: config.id,
    tournamentName: config.name,
    simulatedAt: new Date().toISOString(),
    eloSnapshotDate: config.startDate.toISOString(),
    numSimulations: NUM_SIMULATIONS,
    results,
    actualResults: config.actualResults,
  };

  // Write to file
  const outputDir = path.join(process.cwd(), "public", "simulations");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  const outputPath = path.join(outputDir, `${tournamentId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved simulation to: ${outputPath}`);

  // Print top 5 results
  console.log("\nTop 5 Championship Odds:");
  results.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.teamName} (${r.team}): ${r.championships.toFixed(1)}%`);
  });

  if (config.actualResults) {
    console.log(`\nActual winner: ${config.actualResults.winner}`);
    const winnerPrediction = results.find((r) => r.team === config.actualResults!.winner);
    if (winnerPrediction) {
      const rank = results.indexOf(winnerPrediction) + 1;
      console.log(
        `  Predicted rank: #${rank} with ${winnerPrediction.championships.toFixed(1)}% championship odds`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npx tsx scripts/generate-historical-simulation.ts <tournament-id>");
    console.log(`\nAvailable tournaments:`);
    getTournamentIds().forEach((id) => {
      const config = getTournamentConfig(id);
      console.log(`  - ${id}: ${config?.name}`);
    });
    process.exit(0);
  }

  const tournamentId = args[0];
  await generateSimulation(tournamentId);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
