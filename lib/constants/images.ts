export const MAP_IMAGES = {
  'Abyss': '/images/maps/abyss_image.PNG',
  'Ascent': '/images/maps/ascent_image.PNG',
  'Bind': '/images/maps/bind_image.PNG',
  'Breeze': '/images/maps/breeze_image.PNG',
  'Corrode': '/images/maps/corrode_image.PNG',
  'Haven': '/images/maps/haven_image.PNG',
  'Icebox': '/images/maps/icebox_image.PNG',
  'Lotus': '/images/maps/lotus_image.PNG',
  'Split': '/images/maps/split_image.PNG',
  'Sunset': '/images/maps/sunset_image.PNG',
  'Fracture': '/images/maps/fracture_image.PNG',
  'Pearl': '/images/maps/pearl_image.PNG',
} as const;

export const TEAM_LOGOS = {
  '100T': '/images/teams/100t_logo.png',
  '2G': '/images/teams/2g_logo.png',
  'AG': '/images/teams/ag_logo.png',
  'APK': '/images/teams/apk_logo.png',
  'BBL': '/images/teams/bbl_logo.png',
  'BILI': '/images/teams/bili_logo.png',
  'BLD': '/images/teams/bleed_logo.png',
  'BME': '/images/teams/bme_logo.png',
  'C9': '/images/teams/cloud9_logo.png',
  'DFM': '/images/teams/dfm_logo.png',
  'DRG': '/images/teams/drg_logo.png',
  'DRX': '/images/teams/drx_logo.png',
  'EDG': '/images/teams/edward_logo.png',
  'EG': '/images/teams/eg_logo.png',
  'FNC': '/images/teams/fnatic_logo.png',
  'FPX': '/images/teams/fpx_logo.png',
  'FUR': '/images/teams/furia_logo.png',
  'FUT': '/images/teams/fut_logo.png',
  'G2': '/images/teams/g2_logo.png',
  'GENG': '/images/teams/geng_logo.png',
  'GX': '/images/teams/giant_logo.png',
  'GE': '/images/teams/global_logo.png',
  'TH': '/images/teams/heretics_logo.png',
  'JDG': '/images/teams/jdg_logo.png',
  'KC': '/images/teams/karmine_logo.png',
  'KOI': '/images/teams/koi_logo.png',
  'KRU': '/images/teams/kru_logo.png',
  'LEV': '/images/teams/leviatan_logo.png',
  'TL': '/images/teams/liquid_logo.png',
  'LOUD': '/images/teams/loud_logo.png',
  'GM8': '/images/teams/mates_logo.png',
  'MIBR': '/images/teams/mibr_logo.png',
  'NAVI': '/images/teams/navi_logo.png',
  'NOVA': '/images/teams/nova_logo.png',
  'NS': '/images/teams/ns_logo.png',
  'NRG': '/images/teams/nrg_logo.png',
  'PRX': '/images/teams/prx_logo.png',
  'RRQ': '/images/teams/rrq_logo.png',
  'TS': '/images/teams/secret_logo.png',
  'SEN': '/images/teams/sentinels_logo.png',
  'T1': '/images/teams/t1_logo.png',
  'TLN': '/images/teams/talon_logo.png',
  'TEC': '/images/teams/titan_logo.png',
  'TRC': '/images/teams/trace_logo.png',
  'TYL': '/images/teams/tyloo_logo.png',
  'VIT': '/images/teams/vitality_logo.png',
  'WOL': '/images/teams/wolves_logo.png',
  'XLG': '/images/teams/xlg_logo.png',
  'ZETA': '/images/teams/zeta_logo.png',
} as const;

export const AGENT_IMAGES = {
  'Astra': '/images/agents/astra.png',
  'Breach': '/images/agents/breach.png',
  'Brimstone': '/images/agents/brimstone.png',
  'Chamber': '/images/agents/chamber.png',
  'Clove': '/images/agents/clove.png',
  'Cypher': '/images/agents/cypher.png',
  'Deadlock': '/images/agents/deadlock.png',
  'Fade': '/images/agents/fade.png',
  'Gekko': '/images/agents/gekko.png',
  'Harbor': '/images/agents/harbor.png',
  'Iso': '/images/agents/iso.png',
  'Jett': '/images/agents/jett.png',
  'KAY/O': '/images/agents/kayo.png',
  'Killjoy': '/images/agents/killjoy.png',
  'Neon': '/images/agents/neon.png',
  'Omen': '/images/agents/omen.png',
  'Phoenix': '/images/agents/phoenix.png',
  'Raze': '/images/agents/raze.png',
  'Reyna': '/images/agents/reyna.png',
  'Sage': '/images/agents/sage.png',
  'Skye': '/images/agents/skye.png',
  'Sova': '/images/agents/sova.png',
  'Tejo': '/images/agents/tejo.png',
  'Viper': '/images/agents/viper.png',
  'Vyse': '/images/agents/vyse.png',
  'Waylay': '/images/agents/waylay.png',
  'Yoru': '/images/agents/yoru.png',
} as const;

export const TROUPHY_IMAGES = {
  'Champions': '/images/trophies/Champions.png',
  'Masters': '/images/trophies/Masters.png',
  'Americas': '/images/trophies/Americas.png',
  'EMEA': '/images/trophies/EMEA.png',
  'Pacific': '/images/trophies/Pacific.png',
  'China': '/images/trophies/China.png',
} as const;

export type TeamSlug = keyof typeof TEAM_LOGOS;
export type AgentName = keyof typeof AGENT_IMAGES;

// Helper function to normalize agent names for lookup
export function getAgentImage(agentName: string): string | null {
  // Direct lookup first
  if (AGENT_IMAGES[agentName as keyof typeof AGENT_IMAGES]) {
    return AGENT_IMAGES[agentName as keyof typeof AGENT_IMAGES];
  }
  
  // Try common variations
  const normalizedName = agentName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, value] of Object.entries(AGENT_IMAGES)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedName === normalizedKey) {
      return value;
    }
  }
  
  return null;
}
