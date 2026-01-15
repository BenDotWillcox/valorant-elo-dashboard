export const TEAM_COLORS = {
    'Sentinels': '#d00434', // Red  
    'Cloud9': '#28ace4', // Blue
    'G2 Esports': '#ffffff', // White
    'KRU Esports': '#ff1c8c', // Pink
    'NRG Esports': '#ffffff', // White
    'Leviatan': '#70acdc', // Light Blue
    'LOUD': '#18fc04', // Green
    '100 Thieves': '#ea3232', // Red
    'MIBR': '#ffffff', // White
    'Furia': '#ffffff', // White
    'Evil Geniuses': '#4287f5', // Blue
    'Karmine Corp': '#ffffff', // White
    'Fnatic': '#ff5c04', // Orange
    'Vitality': '#fffc04', // Yellow
    'Team Liquid': '#1a90ff', // Blue
    'BBL Esports': '#c39109', // Yellow
    'Team Heretics': '#d5a938', // Light Yellow
    'Natus Vincere': '#ffec04', // Yellow
    'KOI': '#d2ae74', // Light Brown
    'FUT Esports': '#4287f5', // Blue
    'Gentle Mates': '#ffffff', // White
    'GIANTX': '#4287f5', // Blue
    'Apeks': '#ffa500', // Orange
    'EDward Gaming': '#ffffff', // White
    'Dragon Ranger Gaming': '#76f35d', // Light Green
    'Bilibili': '#36d0f4', // Light Blue
    'Nova Esports': '#a854bc', // Purple
    'Wolves Esports': '#faa61a', // Orange
    'FunPlus Phoenix': '#ff0404', // Red
    'Trace Esports': '#3f446a', // Dark Blue
    'Titan Esports Club': '#e02c1c', // Red
    'JD Gaming': '#d0142c', // Red
    'All Gamers': '#da251c', // Red
    'TYLOO': '#d63831', // Red
    'Gen.G': '#a58822', // Yellow
    'Global Esports': '#124091', // Blue
    'T1': '#e8042c', // Red
    'Team Secret': '#ffffff', // White
    'BLEED': '#c3252d', // Red
    'DetonatioN FocusMe': '#2364ec', // Blue
    'DRX': '#0f03a3', // Blue
    'Paper Rex': '#e653e6', // Purple
    'Rex Regum Qeon': '#f3aa36', // Yellow
    'Talon Esports': '#e80444', // Red
    'ZETA DIVISION': '#ffffff', // White
    'Nongshim RedForce': '#d00434', // Red
    'Xi Lai Gaming': '#1EF5BF', // Teal
    '2Game Esports': '#9d05f5', // Purple
    'BOOM Esports': '#8a1616', // Red
    'ENVY': '#ffffff', // White
    'FS': '#ffa500', // Orange
    'VL': '#ffffff', // White
    'PCF': '#1EF5BF', // Teal
    'ULF': '#ffffff', // White
}

export const TEAM_SLUG_TO_COLOR: Record<string, string> = {
  'PRX': TEAM_COLORS['Paper Rex'],
  'XLG': TEAM_COLORS['Xi Lai Gaming'],
  'GX': TEAM_COLORS['GIANTX'],
  'SEN': TEAM_COLORS['Sentinels'],
  'BILI': TEAM_COLORS['Bilibili'],
  'MIBR': TEAM_COLORS['MIBR'],
  'RRQ': TEAM_COLORS['Rex Regum Qeon'],
  'FNC': TEAM_COLORS['Fnatic'],
  'TL': TEAM_COLORS['Team Liquid'],
  'DRX': TEAM_COLORS['DRX'],
  'NRG': TEAM_COLORS['NRG Esports'],
  'EDG': TEAM_COLORS['EDward Gaming'],
  'G2': TEAM_COLORS['G2 Esports'],
  'TH': TEAM_COLORS['Team Heretics'],
  'T1': TEAM_COLORS['T1'],
  'DRG': TEAM_COLORS['Dragon Ranger Gaming'],
  'GENG': TEAM_COLORS['Gen.G'],
  'WOL': TEAM_COLORS['Wolves Esports'],
};

export const MAP_COLORS = {
  'Abyss': 'hsl(var(--foreground))',
  'Ascent': '#1f77b4', // Blue
  'Bind': '#ff7f0e', // Orange
  'Breeze': '#2ca02c', // Green
  'Corrode': '#a87474', // Light Brown
  'Haven': '#784338', // Dark Brown
  'Icebox': '#e377c2', // Pink
  'Lotus': '#9467bd', // Purple
  'Split': '#7c7d7c', // Gray
  'Sunset': '#d62728', // Red 
  'Pearl': '#1EF5BF', // Teal
  'Fracture': '#E2A735' // Yellow
} as const;


