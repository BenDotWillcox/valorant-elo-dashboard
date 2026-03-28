import type { TournamentConfig } from "./index";

// Masters Santiago 2026 map pool (Kickoff-to-Masters window)
export const VCT_MASTERS_SANTIAGO_2026_MAP_POOL = [
  "Split",
  "Breeze",
  "Bind",
  "Haven",
  "Abyss",
  "Pearl",
  "Corrode",
];

// Swiss stage seeding (8 teams play Swiss, top 4 advance)
export const VCT_MASTERS_SANTIAGO_2026_SWISS_SEEDING = {
  "swiss-seed1": "G2",
  "swiss-seed2": "NRG",
  "swiss-seed3": "TL",
  "swiss-seed4": "GM8",
  "swiss-seed5": "T1",
  "swiss-seed6": "NS",
  "swiss-seed7": "EDG",
  "swiss-seed8": "XLG",
};

// 4 teams auto-qualified to playoffs (regional #1 seeds)
export const VCT_MASTERS_SANTIAGO_2026_AUTO_QUALIFIED = [
  "FUR", // Americas #1
  "BBL", // EMEA #1
  "PRX", // Pacific #1
  "AG", // China #1
];

export const VCT_MASTERS_SANTIAGO_2026_CONFIG: TournamentConfig = {
  id: "vct-masters-santiago-2026",
  name: "Valorant Masters Santiago 2026",
  startDate: new Date("2026-02-28"),
  format: "swiss-double-elim",
  mapPool: VCT_MASTERS_SANTIAGO_2026_MAP_POOL,
  teams: [
    // Auto-qualified to playoffs (skip Swiss)
    { name: "FURIA", slug: "FUR", group: "auto" },
    { name: "BBL Esports", slug: "BBL", group: "auto" },
    { name: "Paper Rex", slug: "PRX", group: "auto" },
    { name: "All Gamers", slug: "AG", group: "auto" },

    // Swiss stage teams
    { name: "G2 Esports", slug: "G2", group: "swiss" },
    { name: "NRG", slug: "NRG", group: "swiss" },
    { name: "Team Liquid", slug: "TL", group: "swiss" },
    { name: "Gentle Mates", slug: "GM8", group: "swiss" },
    { name: "T1", slug: "T1", group: "swiss" },
    { name: "Nongshim RedForce", slug: "NS", group: "swiss" },
    { name: "EDward Gaming", slug: "EDG", group: "swiss" },
    { name: "Xi Lai Gaming", slug: "XLG", group: "swiss" },
  ],
  seeding: {
    ...VCT_MASTERS_SANTIAGO_2026_SWISS_SEEDING,
    // Auto-qualified playoff seeds
    "playoff-auto1": "FUR",
    "playoff-auto2": "BBL",
    "playoff-auto3": "PRX",
    "playoff-auto4": "AG",
  },

  actualResults: {
    winner: "NS",
    runnerUp: "PRX",
    thirdPlace: "NRG",
    top4: ["NS", "PRX", "NRG", "G2"],
    top6: ["NS", "PRX", "NRG", "G2", "AG", "BBL"],
    top8: ["NS", "PRX", "NRG", "G2", "AG", "BBL", "GM8", "FUR"],
  },
};
