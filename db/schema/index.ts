export * from "./teams-schema";
export * from "./maps-schema";

// Export everything from elo-ratings-schema
export {
  eloRatingsTable,
  eloRatingsCurrentTable,
  seasonsTable,
  type EloRating,
  type NewEloRating,
  type Season,
  type NewSeason,
} from "./elo-ratings-schema";