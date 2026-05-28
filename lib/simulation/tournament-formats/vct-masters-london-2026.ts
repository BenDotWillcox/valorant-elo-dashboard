import type { TournamentConfig } from "./index";

// Masters London 2026 map pool (Stage 1-to-Masters window)
export const VCT_MASTERS_LONDON_2026_MAP_POOL = [
  "Split",
  "Breeze",
  "Lotus",
  "Haven",
  "Fracture",
  "Pearl",
  "Ascent",
];

// Swiss stage seeding follows the announced Round 1 draw:
// XLG vs NRG, VIT vs DRG, FS vs FUT, LEV vs GE.
export const VCT_MASTERS_LONDON_2026_SWISS_SEEDING = {
  "swiss-seed1": "XLG",
  "swiss-seed2": "VIT",
  "swiss-seed3": "FS",
  "swiss-seed4": "LEV",
  "swiss-seed5": "GE",
  "swiss-seed6": "FUT",
  "swiss-seed7": "DRG",
  "swiss-seed8": "NRG",
};

// 4 teams auto-qualified to playoffs (regional #1 seeds)
export const VCT_MASTERS_LONDON_2026_AUTO_QUALIFIED = [
  "G2", // Americas #1
  "TH", // EMEA #1
  "PRX", // Pacific #1
  "EDG", // China #1
];

export const VCT_MASTERS_LONDON_2026_CONFIG: TournamentConfig = {
  id: "vct-masters-london-2026",
  name: "Valorant Masters London 2026",
  startDate: new Date("2026-06-05"),
  format: "swiss-double-elim",
  mapPool: VCT_MASTERS_LONDON_2026_MAP_POOL,
  teams: [
    // Auto-qualified to playoffs (skip Swiss)
    { name: "G2 Esports", slug: "G2", group: "auto" },
    { name: "Team Heretics", slug: "TH", group: "auto" },
    { name: "Paper Rex", slug: "PRX", group: "auto" },
    { name: "EDward Gaming", slug: "EDG", group: "auto" },

    // Swiss stage teams
    { name: "Xi Lai Gaming", slug: "XLG", group: "swiss" },
    { name: "NRG", slug: "NRG", group: "swiss" },
    { name: "Team Vitality", slug: "VIT", group: "swiss" },
    { name: "Dragon Ranger Gaming", slug: "DRG", group: "swiss" },
    { name: "FULL SENSE", slug: "FS", group: "swiss" },
    { name: "FUT Esports", slug: "FUT", group: "swiss" },
    { name: "Leviatan", slug: "LEV", group: "swiss" },
    { name: "Global Esports", slug: "GE", group: "swiss" },
  ],
  seeding: {
    ...VCT_MASTERS_LONDON_2026_SWISS_SEEDING,
    // Auto-qualified playoff seeds
    "playoff-auto1": "G2",
    "playoff-auto2": "TH",
    "playoff-auto3": "PRX",
    "playoff-auto4": "EDG",
  },
};
