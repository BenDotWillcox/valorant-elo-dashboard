import type { TournamentConfig } from "./index";

export const VCT_CHAMPIONS_2025_SEEDING = {
  "groupA-seed1": "PRX",
  "groupA-seed4": "XLG",
  "groupA-seed2": "GX",
  "groupA-seed3": "SEN",

  "groupB-seed1": "BILI",
  "groupB-seed4": "MIBR",
  "groupB-seed2": "RRQ",
  "groupB-seed3": "FNC",

  "groupC-seed1": "TL",
  "groupC-seed4": "DRX",
  "groupC-seed2": "NRG",
  "groupC-seed3": "EDG",

  "groupD-seed1": "G2",
  "groupD-seed4": "TH",
  "groupD-seed2": "DRG",
  "groupD-seed3": "T1",
};

// VCT Champions 2025 map pool (Stage 2 pool)
export const VCT_CHAMPIONS_2025_MAP_POOL = [
  'Abyss', 'Ascent', 'Bind', 'Haven', 'Corrode', 'Lotus', 'Sunset'
];

export const VCT_CHAMPIONS_2025_CONFIG: TournamentConfig = {
  id: "vct-champions-2025",
  name: "Valorant Champions 2025",
  startDate: new Date("2025-09-12"),
  format: "gsl-groups-double-elim",
  mapPool: VCT_CHAMPIONS_2025_MAP_POOL,
  teams: [
    // Group A
    { name: "Paper Rex", slug: "PRX", group: "A" },
    { name: "XLG Esports", slug: "XLG", group: "A" },
    { name: "GiantX", slug: "GX", group: "A" },
    { name: "Sentinels", slug: "SEN", group: "A" },

    // Group B
    { name: "Bilibili Gaming", slug: "BILI", group: "B" },
    { name: "MIBR", slug: "MIBR", group: "B" },
    { name: "Rex Regum Qeon", slug: "RRQ", group: "B" },
    { name: "Fnatic", slug: "FNC", group: "B" },

    // Group C
    { name: "Team Liquid", slug: "TL", group: "C" },
    { name: "DRX", slug: "DRX", group: "C" },
    { name: "NRG", slug: "NRG", group: "C" },
    { name: "EDward Gaming", slug: "EDG", group: "C" },

    // Group D
    { name: "G2 Esports", slug: "G2", group: "D" },
    { name: "Team Heretics", slug: "TH", group: "D" },
    { name: "DRG", slug: "DRG", group: "D" },
    { name: "T1", slug: "T1", group: "D" },
  ],
  seeding: VCT_CHAMPIONS_2025_SEEDING,
  actualResults: {
    winner: "NRG",
    runnerUp: "FNC",
    thirdPlace: "DRX",
    top4: ["NRG", "FNC", "DRX", "PRX"],
    top6: ["NRG", "FNC", "DRX", "PRX", "TH", "MIBR"],
    top8: ["NRG", "FNC", "DRX", "PRX", "TH", "MIBR", "GX", "G2"],
    top12: ["NRG", "FNC", "DRX", "PRX", "TH", "MIBR", "GX", "G2", "T1", "TL", "RRQ", "XLG"]
  },
};
