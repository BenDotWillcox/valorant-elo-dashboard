export type EloHistoryData = {
  teamId: number;
  teamName: string;
  teamSlug: string;
  mapName: string;
  rating: number;
  ratingDate: string;
  opponentName: string;
  winnerScore: number;
  loserScore: number;
  isWinner: boolean;
};

export interface EloDataPoint {
  rating: number;
  ratingDate: number;
  opponent: string;
  score: string;
  mapName: string;
  isInterpolated?: boolean;
  prevRating?: number;
  isDataPoint?: boolean;
  teamName: string;
  opponentName: string;
}

export interface TeamData {
  teamId: number;
  teamName: string;
  teamSlug: string;
  data: EloDataPoint[];
}

export interface TeamMapData {
  teamId: number;
  teamName: string;
  teamSlug: string;
  mapName: string;
  rating: string;
  logoUrl: string;
}

export interface TooltipPayload {
  value: number;
  name: string;
  payload: EloDataPoint;
} 