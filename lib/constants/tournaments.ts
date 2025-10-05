// tournaments.ts
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed';

export const tournaments: Record<string, { id: number; region: string; status: TournamentStatus; start_date?: Date; end_date?: Date }> = {

    // VCT 2023
    "LOCK//IN São Paulo": { id: 1188, region: "International", status: "completed", start_date: new Date("2023-02-13"), end_date: new Date("2023-03-06") },
    "Champions Tour 2023: Pacific League": { id: 1191, region: "Pacific", status: "completed" },
    "Champions Tour 2023: EMEA League": { id: 1190, region: "EMEA", status: "completed" },
    "Champions Tour 2023: Americas League": { id: 1189, region: "Americas", status: "completed" },
    "Champions Tour 2023: Masters Tokyo": { id: 1494, region: "International", status: "completed", start_date: new Date("2023-06-10"), end_date: new Date("2023-06-26") },
    "Champions Tour 2023: Pacific Last Chance Qualifier": { id: 1660, region: "Pacific", status: "completed" },
    "Champions Tour 2023: EMEA Last Chance Qualifier": { id: 1659, region: "EMEA", status: "completed" },
    "Champions Tour 2023: Americas Last Chance Qualifier": { id: 1658, region: "Americas", status: "completed" },
    "Valorant Champions 2023": { id: 1657, region: "International", status: "completed", start_date: new Date("2023-08-06"), end_date: new Date("2023-08-26") },

    // VCT 2024
    "Champions Tour 2024: Americas Kickoff": { id: 1923, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Kickoff": { id: 1925, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Kickoff": { id: 1924, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Kickoff": { id: 1926, region: "China", status: "completed" },
    "Champions Tour 2024: Masters Madrid": { id: 1921, region: "International", status: "completed", start_date: new Date("2024-03-14"), end_date: new Date("2024-03-25") },
    "Champions Tour 2024: Americas Stage 1": { id: 2004, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Stage 1": { id: 1998, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Stage 1": { id: 2002, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Stage 1": { id: 2006, region: "China", status: "completed" },
    "Champions Tour 2024: Masters Shanghai": { id: 1999, region: "International", status: "completed", start_date: new Date("2024-05-23"), end_date: new Date("2024-06-10") },
    "Champions Tour 2024: Americas Stage 2": { id: 2095, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Stage 2": { id: 2094, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Stage 2": { id: 2005, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Stage 2": { id: 2096, region: "China", status: "completed" },
    "Valorant Champions 2024": { id: 2097, region: "International", status: "completed", start_date: new Date("2024-08-01"), end_date: new Date("2024-08-26") },


    // Official VCT 2025 tournaments and their VLR event IDs
    "VCT 2025: Americas Kickoff": { id: 2274, region: "Americas", status: "completed" },
    "VCT 2025: EMEA Kickoff":    { id: 2276, region: "EMEA", status: "completed" },
    "VCT 2025: Pacific Kickoff": { id: 2277, region: "Pacific", status: "completed" },
    "VCT 2025: China Kickoff": { id: 2275, region: "China", status: "completed" },
    "Valorant Masters Bangkok 2025": { id: 2281, region: "International", status: "completed", start_date: new Date("2025-02-20"), end_date: new Date("2025-03-03") },
    "VCT 2025: China Stage 1": { id: 2359, region: "China", status: "completed" },
    "VCT 2025: Americas Stage 1": { id: 2347, region: "Americas", status: "completed" },
    "VCT 2025: EMEA Stage 1": { id: 2380, region: "EMEA", status: "completed" },
    "VCT 2025: Pacific Stage 1": { id: 2379, region: "Pacific", status: "completed" },
    "Valorant Masters Toronto 2025": { id: 2282, region: "International", status: "completed", start_date: new Date("2025-06-07"), end_date: new Date("2025-06-23") },
    "VCT 2025: China Stage 2": { id: 2499, region: "China", status: "completed" },
    "VCT 2025: Americas Stage 2": { id: 2501, region: "Americas", status: "completed" },
    "VCT 2025: EMEA Stage 2": { id: 2498, region: "EMEA", status: "completed" },
    "VCT 2025: Pacific Stage 2": { id: 2500, region: "Pacific", status: "completed" },
    "Valorant Champions 2025": { id: 2283, region: "International", status: "completed", start_date: new Date("2025-09-12"), end_date: new Date("2025-10-06") },
  };

export const UPCOMING_TOURNAMENT_NAME = "Valorant Champions 2025";

export const UPCOMING_TOURNAMENT_QUALIFIED_TEAMS: string[] = [
  'G2',
  'SEN',
  'NRG',
  'MIBR',
  'BILI',
  'DRG',
  'EDG',
  'XLG',
  'TL',
  'FNC',
  'TH',
  'GX',
  'PRX',
  'RRQ',
  'T1',
  'DRX'
];

export const VCT_CHAMPIONS_2025_TEAMS = [
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
];

export const VCT_CHAMPIONS_2025_GROUPS = {
  A: ["PRX", "XLG", "GX", "SEN"],
  B: ["BILI", "MIBR", "RRQ", "FNC"],
  C: ["TL", "DRX", "NRG", "EDG"],
  D: ["G2", "TH", "DRG", "T1"],
};

export const VCT_CHAMPIONS_2025_GROUP_MATCHUPS = {
    A: {
        initial1: { team1: 'PRX', team2: 'XLG' },
        initial2: { team1: 'GX', team2: 'SEN' }
    },
    B: {
        initial1: { team1: 'BILI', team2: 'MIBR' },
        initial2: { team1: 'RRQ', team2: 'FNC' }
    },
    C: {
        initial1: { team1: 'TL', team2: 'DRX' },
        initial2: { team1: 'NRG', team2: 'EDG' }
    },
    D: {
        initial1: { team1: 'G2', team2: 'TH' },
        initial2: { team1: 'DRG', team2: 'T1' }
    }
};