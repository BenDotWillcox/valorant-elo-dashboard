import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eloRatingsCurrentTable, seasonsTable, teamsTable, mapsTable, playersTable, matchVetoesTable, playerMapStatsTable, matchesTable, vpmPlayerStateTable, vpmKfStateTable, vpmPlayerMapTable, vpmPlayerKfTable, vpmPlayerLatestTable, matchVetoAnalysisTable } from "./schema";

config({ path: ".env.local" });

const schema = {
  eloRatingsCurrent: eloRatingsCurrentTable,
  seasons: seasonsTable,
  teams: teamsTable,
  maps: mapsTable,
  players: playersTable,
  playerMapStats: playerMapStatsTable,
  matchVetoes: matchVetoesTable,
  matches: matchesTable,
  matchVetoAnalysis: matchVetoAnalysisTable,
  vpmPlayerState: vpmPlayerStateTable,
  vpmKfState: vpmKfStateTable,
  vpmPlayerMap: vpmPlayerMapTable,
  vpmPlayerKf: vpmPlayerKfTable,
  vpmPlayerLatest: vpmPlayerLatestTable,
};

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });