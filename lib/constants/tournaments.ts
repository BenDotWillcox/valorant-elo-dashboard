// tournaments.ts
export const tournaments: Record<string, { id: number; region: string }> = {
    // Official VCT 2025 tournaments and their VLR event IDs
    "Champions Tour 2025: Americas Kickoff": { id: 2274, region: "Americas" },
    "Champions Tour 2025: EMEA Kickoff":    { id: 2276, region: "EMEA" },
    "Champions Tour 2025: Pacific Kickoff": { id: 2277, region: "Pacific" },
    "Champions Tour 2025: China Kickoff": { id: 2275, region: "China" },
    "Champions Tour 2025: Masters Bangkok": { id: 2281, region: "International" },
    "Champions Tour 2025: China Stage 1": { id: 2359, region: "China" },
    "Champions Tour 2025: Americas Stage 1": { id: 2347, region: "Americas" },
    //"Champions Tour 2025: EMEA Stage 1": { id: 2361, region: "EMEA" },
    //"Champions Tour 2025: Pacific Stage 1": { id: 2362, region: "Pacific" },
    "Champions Tour 2025: Masters Toronto": { id: 2282, region: "International" },
    "Valorant Champions 2025": { id: 2283, region: "International" },
    // ... add future tournaments here
  };