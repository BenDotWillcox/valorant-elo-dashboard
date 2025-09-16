export interface Match {
  team1: string | null;
  team2: string | null;
  winner: string | null;
  round: number;
  matchNumber: number;
  id: string;
  type: "BO3" | "BO5" | "BO5_ADV";
}

export interface TournamentBracket {
  [key: string]: Match;
}
