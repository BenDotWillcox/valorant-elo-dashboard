export const TEAM_REGIONS: Record<string, string[]> = {
    'Americas': ['100T', 'C9', 'EG', 'FUR', 'G2', 'KRU', 'LEV', 'LOUD', 'MIBR', 'NRG', 'SEN', '2G', 'ENVY'],  
    'EMEA': ['BBL', 'FNC', 'FUT', 'GX', 'TH', 'KC', 'KOI', 'TL', 'GM8', 'NAVI', 'VIT', 'APK', 'ULF', 'PCF'],  
    'Pacific': ['BLD', 'DFM', 'DRX', 'GENG', 'GE', 'PRX', 'RRQ', 'TS', 'T1', 'TLN', 'ZETA', 'BME', 'NS', 'FS', 'VL'],  
    'China': ['AG', 'BILI', 'DRG', 'EDG', 'FPX', 'JDG', 'NOVA', 'TEC', 'TRC', 'TYL', 'WOL', 'XLG'],
} as const;

// Helper function to get a team's region
export function getTeamRegion(teamSlug: string): string {
  return Object.entries(TEAM_REGIONS).find(([, teams]) => 
    teams.includes(teamSlug)
  )?.[0] || 'Unknown';
} 