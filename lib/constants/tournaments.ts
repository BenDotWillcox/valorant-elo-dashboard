// tournaments.ts
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed';

export const tournaments: Record<string, { id: number; region: string; status: TournamentStatus }> = {

    // VCT 2023
    "LOCK//IN São Paulo": { id: 1188, region: "International", status: "completed" },
    "Champions Tour 2023: Pacific League": { id: 1191, region: "Pacific", status: "completed" },
    "Champions Tour 2023: EMEA League": { id: 1190, region: "EMEA", status: "completed" },
    "Champions Tour 2023: Americas League": { id: 1189, region: "Americas", status: "completed" },
    "Champions Tour 2023: Masters Tokyo": { id: 1494, region: "International", status: "completed" },
    "Champions Tour 2023: Pacific Last Chance Qualifier": { id: 1660, region: "Pacific", status: "completed" },
    "Champions Tour 2023: EMEA Last Chance Qualifier": { id: 1659, region: "EMEA", status: "completed" },
    "Champions Tour 2023: Americas Last Chance Qualifier": { id: 1658, region: "Americas", status: "completed" },
    "Valorant Champions 2023": { id: 1657, region: "International", status: "completed" },

    // VCT 2024
    "Champions Tour 2024: Americas Kickoff": { id: 1923, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Kickoff": { id: 1925, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Kickoff": { id: 1924, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Kickoff": { id: 1926, region: "China", status: "completed" },
    "Champions Tour 2024: Masters Madrid": { id: 1921, region: "International", status: "completed" },
    "Champions Tour 2024: Americas Stage 1": { id: 2004, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Stage 1": { id: 1998, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Stage 1": { id: 2002, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Stage 1": { id: 2006, region: "China", status: "completed" },
    "Champions Tour 2024: Masters Shanghai": { id: 1999, region: "International", status: "completed" },
    "Champions Tour 2024: Americas Stage 2": { id: 2095, region: "Americas", status: "completed" },
    "Champions Tour 2024: EMEA Stage 2": { id: 2094, region: "EMEA", status: "completed" },
    "Champions Tour 2024: Pacific Stage 2": { id: 2005, region: "Pacific", status: "completed" },
    "Champions Tour 2024: China Stage 2": { id: 2096, region: "China", status: "completed" },
    "Valorant Champions 2024": { id: 2097, region: "International", status: "completed" },


    // Official VCT 2025 tournaments and their VLR event IDs
    "VCT 2025: Americas Kickoff": { id: 2274, region: "Americas", status: "completed" },
    "VCT 2025: EMEA Kickoff":    { id: 2276, region: "EMEA", status: "completed" },
    "VCT 2025: Pacific Kickoff": { id: 2277, region: "Pacific", status: "completed" },
    "VCT 2025: China Kickoff": { id: 2275, region: "China", status: "completed" },
    "Valorant Masters Bangkok 2025": { id: 2281, region: "International", status: "completed" },
    "VCT 2025: China Stage 1": { id: 2359, region: "China", status: "completed" },
    "VCT 2025: Americas Stage 1": { id: 2347, region: "Americas", status: "completed" },
    "VCT 2025: EMEA Stage 1": { id: 2380, region: "EMEA", status: "completed" },
    "VCT 2025: Pacific Stage 1": { id: 2379, region: "Pacific", status: "completed" },
    "Valorant Masters Toronto 2025": { id: 2282, region: "International", status: "completed" },
    "VCT 2025: China Stage 2": { id: 2499, region: "China", status: "ongoing" },
    "VCT 2025: Americas Stage 2": { id: 2501, region: "Americas", status: "ongoing" },
    "VCT 2025: EMEA Stage 2": { id: 2498, region: "EMEA", status: "ongoing" },
    "VCT 2025: Pacific Stage 2": { id: 2500, region: "Pacific", status: "ongoing" },
    "Valorant Champions 2025": { id: 2283, region: "International", status: "upcoming" },
  };