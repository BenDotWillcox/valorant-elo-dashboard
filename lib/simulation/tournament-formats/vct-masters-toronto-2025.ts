import type { TournamentConfig } from "./index";

// Masters Toronto 2025 map pool (Stage 1 pool)
export const VCT_MASTERS_TORONTO_2025_MAP_POOL = [
  'Split', 'Ascent', 'Pearl', 'Haven', 'Icebox', 'Lotus', 'Sunset'
];

// Swiss stage seeding (8 teams play Swiss, top 4 advance)
export const VCT_MASTERS_TORONTO_2025_SWISS_SEEDING = {
  "swiss-seed1": "SEN",  // Replace with actual team slugs
  "swiss-seed2": "GENG",
  "swiss-seed3": "TH",
  "swiss-seed4": "BLG",
  "swiss-seed5": "TL",
  "swiss-seed6": "PRX",
  "swiss-seed7": "MIBR",
  "swiss-seed8": "WOL",
};

// 4 teams auto-qualified to playoffs (seeds 1-4 in playoffs)
export const VCT_MASTERS_TORONTO_2025_AUTO_QUALIFIED = [
  "G2",  // Playoff seed 1
  "FNC",  // Playoff seed 2
  "RRQ",  // Playoff seed 3
  "XLG",  // Playoff seed 4
];

export const VCT_MASTERS_TORONTO_2025_CONFIG: TournamentConfig = {
  id: "vct-masters-toronto-2025",
  name: "Valorant Masters Toronto 2025",
  startDate: new Date("2025-06-07"),
  format: "swiss-double-elim",
  mapPool: VCT_MASTERS_TORONTO_2025_MAP_POOL,
  teams: [
    // Auto-qualified to playoffs (skip Swiss)
    { name: "G2", slug: "G2", group: "auto" },
    { name: "FNC", slug: "FNC", group: "auto" },
    { name: "RRQ", slug: "RRQ", group: "auto" },
    { name: "XLG", slug: "XLG", group: "auto" },

    // Swiss stage teams
    { name: "SEN", slug: "SEN", group: "swiss" },
    { name: "GENG", slug: "GENG", group: "swiss" },
    { name: "TH", slug: "TH", group: "swiss" },
    { name: "BLG", slug: "BLG", group: "swiss" },
    { name: "TL", slug: "TL", group: "swiss" },
    { name: "PRX", slug: "PRX", group: "swiss" },
    { name: "MIBR", slug: "MIBR", group: "swiss" },
    { name: "WOL", slug: "WOL", group: "swiss" },
  ],
  seeding: {
    ...VCT_MASTERS_TORONTO_2025_SWISS_SEEDING,
    // Auto-qualified playoff seeds
    "playoff-auto1": "G2",
    "playoff-auto2": "FNC",
    "playoff-auto3": "RRQ",
    "playoff-auto4": "XLG",
  },

  actualResults: {
    winner: "PRX",
    runnerUp: "FNC",
    thirdPlace: "WOL",
    top4: ["PRX", "FNC", "WOL", "G2"],
    top6: ["PRX", "FNC", "WOL", "G2", "SEN", "GENG"],
    top8: ["PRX", "FNC", "WOL", "G2", "SEN", "GENG", "XLG", "RRQ"],
  },
};
