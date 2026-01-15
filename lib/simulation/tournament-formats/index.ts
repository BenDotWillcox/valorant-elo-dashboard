// Tournament configuration registry for historical and live simulations

export type TournamentFormat = "gsl-groups-double-elim";

export interface TournamentTeam {
  name: string;
  slug: string;
  group: string;
}

export interface TournamentSeeding {
  [key: string]: string;
}

export interface ActualResults {
  winner: string;
  runnerUp: string;
  thirdPlace: string;
  top4: string[];
  top6?: string[];
  top8?: string[];
  top12?: string[];
}

export interface TournamentConfig {
  id: string;
  name: string;
  startDate: Date;
  format: TournamentFormat;
  teams: TournamentTeam[];
  seeding: TournamentSeeding;
  mapPool: string[];  // Maps active during this tournament
  actualResults?: ActualResults;
}

// Import tournament configs
import { VCT_CHAMPIONS_2025_CONFIG } from "./vct-champions-2025";

// Registry of all available tournament configs
export const tournamentRegistry: Record<string, TournamentConfig> = {
  "vct-champions-2025": VCT_CHAMPIONS_2025_CONFIG,
};

// Get list of available historical tournaments (those with actual results)
export function getHistoricalTournaments(): TournamentConfig[] {
  return Object.values(tournamentRegistry).filter(
    (config) => config.actualResults !== undefined
  );
}

// Get a tournament config by ID
export function getTournamentConfig(id: string): TournamentConfig | undefined {
  return tournamentRegistry[id];
}

// Get list of tournament IDs
export function getTournamentIds(): string[] {
  return Object.keys(tournamentRegistry);
}
