import type { TournamentConfig } from "./index";

// Masters Bangkok 2025 map pool (Feb 2025)
export const VCT_MASTERS_BANGKOK_2025_MAP_POOL = [
  'Abyss', 'Fracture', 'Bind', 'Haven', 'Pearl', 'Lotus', 'Split'
];

// Swiss stage seeding (8 teams play Swiss, top 4 advance)
export const VCT_MASTERS_BANGKOK_2025_SWISS_SEEDING = {
  "swiss-seed1": "EDG",
  "swiss-seed2": "DRX",
  "swiss-seed3": "VIT",
  "swiss-seed4": "G2",
  "swiss-seed5": "TRC",
  "swiss-seed6": "T1",
  "swiss-seed7": "SEN",
  "swiss-seed8": "TL",
};

export const VCT_MASTERS_BANGKOK_2025_CONFIG: TournamentConfig = {
  id: "vct-masters-bangkok-2025",
  name: "Valorant Masters Bangkok 2025",
  startDate: new Date("2025-02-14"),
  format: "swiss-4team-double-elim",
  mapPool: VCT_MASTERS_BANGKOK_2025_MAP_POOL,
  teams: [
    // All teams compete in Swiss stage first
    { name: "EDward Gaming", slug: "EDG", group: "swiss" },
    { name: "DRX", slug: "DRX", group: "swiss" },
    { name: "Vitality", slug: "VIT", group: "swiss" },
    { name: "G2 Esports", slug: "G2", group: "swiss" },
    { name: "Trace", slug: "TRC", group: "swiss" },
    { name: "T1", slug: "T1", group: "swiss" },
    { name: "Sentinels", slug: "SEN", group: "swiss" },
    { name: "Team Liquid", slug: "TL", group: "swiss" },
  ],
  seeding: {
    ...VCT_MASTERS_BANGKOK_2025_SWISS_SEEDING,
  },

  actualResults: {
    winner: "T1",
    runnerUp: "G2",
    thirdPlace: "EDG",
    top4: ["T1", "G2", "EDG", "VIT"],
    top6: ["T1", "G2", "EDG", "VIT", "DRX", "TL"], 
  },
};
