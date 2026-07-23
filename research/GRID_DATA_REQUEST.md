# GRID Esports — Data Request List

What we need from GRID, in three tiers: (1) parity with the current VLR scrape so we
can switch ingestion over, (2) new round-level data that motivates the partnership,
(3) operational/contract questions. Tier 1 items marked **(gap)** are things the
current pipeline does *not* capture from VLR but should — worth requesting explicitly
since they're cheap for GRID and valuable for us.

---

## Tier 1 — Parity with current VLR scraping (migration requirement)

Everything here currently populates the production Postgres tables (`matches`, `maps`,
`player_map_stats`, `match_vetoes`, `teams`, `players`, `tournament_winners`).

### Events / tournaments
- Event id, name, region (International / Americas / EMEA / Pacific / China)
- Stage and bracket structure (group/swiss/playoff round names)
- Event dates, tournament results (winner/placements)
- **(gap)** Competition tier (franchised T1 / off-season / T2-Challengers /
  Ascension / qualifier / showmatch flag)
- **(gap)** LAN vs online, event type, prize/stakes

### Series (matches)
- Series id, event id, stage, scheduled + completed timestamps
- Both team ids, best-of format, final series score

### Games (maps)
- Map name, game number within series, winner, final round score
- Completed timestamp
- **(gap)** Per-half round scores (attack/defense split) and overtime rounds
- **(gap)** Game version / patch the match was played on

### Map veto
- Full pick/ban sequence: order, action (ban/pick/decider), map, acting team
- Link from each pick/decider to the resulting game number
- **(gap)** Side selections (which team chose attack/defense on each picked map)

### Player box score (per player per map)
- Player id, team id, agent played
- Kills, deaths, assists, first kills, first deaths
- ACS, ADR, KAST, rounds played
- Nice-to-have extras if in the feed: headshot %, multikills, clutches won/attempted,
  plants, defuses, per-side splits of the above

### Entities
- Team ids, names, regions, logos
- Player ids, IGN, real name, country
- **(gap)** Roster membership over time (join/leave dates, loans, substitutes) —
  currently inferred from match appearances; an authoritative roster history is
  strictly better
- Coach/IGL metadata if available

---

## Tier 2 — New round-level data (the reason to partner)

This is the data map-level box scores cannot provide, in priority order.

### 1. Round ledger (per round)
- Round number, side (attack/defense) per team, score state entering the round
- Win condition: elimination / spike detonation / defuse / time expiry
- Plant: whether planted, site, plant timestamp; defuse timestamp
- Round start/end timestamps (round duration)
- Survivors per team at round end

### 2. Economy (per player per round)
- Starting credits, credits spent, loadout value
- Weapon and armor purchased (or at least buy-tier classification:
  eco / semi / force / full)
- Team loadout value differential per round

### 3. Ultimates and utility (per player per round)
- Ult points and ult-ready status at round start; ult used (which, when)
- Ability usage counts/timestamps

### 4. Timestamped combat events
- Kills: timestamp, killer, victim, assister(s), weapon, headshot, wallbang,
  trade window context
- Damage events (or per-round damage dealt/received per player)
- First contact / first engagement timestamp per round

### 5. Positioning (if entitled)
- Player positions over time, or standardized map-zone occupancy
- Site approaches / map-space control timing

### 6. Scrims (if entitlement ever allows)
- Same schema as officials, flagged as scrim — enormously valuable for the
  agent-familiarity and map-readiness questions, but assumed unlikely

---

## Tier 3 — Operational / contract questions

1. **Historical depth:** how far back does the feed go? We need 2023-present for
   parity; deeper is better.
2. **Coverage:** all VCT leagues + Masters/Champions? Challengers/Ascension and
   off-season events? China league coverage?
3. **ID crosswalk:** do GRID ids map to Riot ids? Any existing mapping to
   VLR ids/slugs? (If not, we build a matching layer on names + dates — ask if they
   have one internally.)
4. **Delivery:** REST/GraphQL API vs. file feed vs. websocket; live vs. post-match
   availability; rate limits; schema documentation.
5. **Sample:** full payload for one complete series (all endpoints) before we design
   our schema.
6. **Licensing:** rights to display derived stats publicly on the dashboard;
   attribution requirements; any restriction on redistributing raw vs. derived data.
7. **Patch/build metadata:** confirm the actual game build per match is in the feed
   (critical for the patch-aware modeling work).

---

## Migration note (for us, not GRID)

Every production table keyed on `vlr_match_id` / `vlr_player_id` / `vlr_slug` needs a
`grid_id` column and a crosswalk table during a dual-ingestion period; keep VLR
scraping running in parallel until GRID coverage/latency is validated against it for
a few weeks of events. Tier-1 **(gap)** fields (halves, sides, patch, tier, roster
history) should get schema columns as part of the same migration since the
research plan (NEXT_PHASE_PLAN.md, Workstreams C–E) depends on them.
