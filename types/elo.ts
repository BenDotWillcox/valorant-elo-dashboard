export type EloHistoryData = {
  teamId: number;
  teamName: string;
  teamSlug: string;
  mapName: string;
  rating: string;
  ratingDate: string;
  opponentName: string;
  winnerScore: number;
  loserScore: number;
  isWinner: boolean;
};

export interface TeamData {
  teamId: number;
  teamName: string;
  teamSlug: string;
  data: {
    rating: number;
    ratingDate: number;
    opponent: string;
    score: number;
    mapName: string;
  }[];
}

export interface TeamMapData {
  teamId: number;
  teamName: string;
  teamSlug: string;
  mapName: string;
  rating: string;
  logoUrl: string;
} 