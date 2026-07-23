# GRID Open Access portal review notes

Reviewed: July 16, 2026

Purpose: map the current GRID documentation and Open Access product boundary to
`GRID_DATA_REQUEST.md` and the July 2026 ratings research roadmap. These are supporting
source notes for the rendered report, not a claim that the documented Valorant schema is
currently entitled for this account.

## Source inventory

- Local request: `research/GRID_DATA_REQUEST.md`
- Local roadmap: `research/NEXT_PHASE_PLAN.md`
- Central Data Feed API reference:
  https://docs.grid.gg/public/documentation/api-reference/central-data-feeds/central-data-feed-api
- Static Data entity model:
  https://docs.grid.gg/public/documentation/api-documentation/static-data/static-data-entities
- Static Data FAQ:
  https://docs.grid.gg/public/documentation/api-documentation/static-data/static-data-faq
- Series State API reference:
  https://docs.grid.gg/public/documentation/api-reference/live-data-feed/api-reference-series-state-api
- Series State guide:
  https://docs.grid.gg/public/documentation/api-documentation/in-game-data/series-state
- Series Events API reference:
  https://docs.grid.gg/public/documentation/api-reference/live-data-feed/series-events-api
- Series Events guide:
  https://docs.grid.gg/public/documentation/api-documentation/in-game-data/series-events
- Stats Feed API reference:
  https://docs.grid.gg/public/documentation/api-reference/stats-feed/stats-feed-api
- Stats Feed overview:
  https://docs.grid.gg/public/documentation/api-documentation/data-analysis/stats-feed-overview
- File Download API guide:
  https://docs.grid.gg/public/documentation/api-documentation/in-game-data/grid-file-download-api
- File Download API reference:
  https://docs.grid.gg/public/documentation/api-reference/live-data-feed/grid-file-download-reference

## Access boundary observed in the documentation

| Surface | Documented access | Protocol | Main job |
| --- | --- | --- | --- |
| Central Data Feed | Open Access endpoint | GraphQL | Static entities, schedules, external IDs, content catalogs |
| Series State | Open Access endpoint | GraphQL | Latest/final hierarchical state |
| Stats Feed | Open Access endpoint | GraphQL | Aggregates over filtered samples |
| Series Events | Explicitly not in Open Access | WebSocket | Ordered timestamped event/state timeline |
| File Download | Per-series and entitlement dependent | REST | End-state JSON and events JSONL files |

The File Download documentation uses the full-access API domain and reports per-series
statuses such as `ready`, `processing`, `file-not-available`, and forbidden access. The
review therefore treats files as entitlement dependent rather than assuming that the
presence of a documented endpoint grants Open Access availability.

## Classification rules

- **Strong Open Access fit:** the requested area's core fields are directly represented
  in an Open Access endpoint.
- **Partial or derivable:** useful fields exist, but a material requested element is
  absent, ambiguous, or requires reconstruction.
- **Commercial events/files:** the decisive history is in Series Events or event-history
  files; Series Events is explicitly excluded from Open Access.
- **Unresolved with GRID:** the reviewed documentation does not answer the request.

Each top-level subsection in `GRID_DATA_REQUEST.md` is counted once. The resulting chart
denominators and counts are:

| Tier | Denominator | Strong OA | Partial / derivable | Commercial events/files | Unresolved |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tier 1 — migration | 6 | 2 | 4 | 0 | 0 |
| Tier 2 — round data | 6 | 0 | 1 | 4 | 1 |
| Tier 3 — operations | 7 | 2 | 2 | 0 | 3 |

## Key Valorant-specific schema evidence

- The Series State reference explicitly names `AbilityValorant`,
  `GamePlayerStateValorant`, `GameTeamStateValorant`,
  `SegmentPlayerStateValorant`, `SegmentTeamStateValorant`,
  `SeriesPlayerStateValorant`, and `SeriesTeamStateValorant`.
- Valorant game-player state includes agent/character, roles, participation, money,
  loadout value, net worth, kills, assists, deaths, first kill, weapon kills, inventory,
  position, multikills, abilities, alive/health/armor, headshots, ultimate points, and
  damage totals/source/target breakdowns.
- Valorant segment-player state includes per-round-like kills, assists, deaths, first
  kill, objectives, alive/health/armor, headshots, and damage. It does not include the
  game-player economy/loadout/inventory fields.
- Valorant segment-team state includes side, won, `winType`, and nested players.
- `SegmentState` provides sequence, nesting, start time, and duration. The guide states
  that a segment can be a Valorant round and a nested segment can be the buy phase.
- `GameState` includes map, title version, start/finish state, start time, clock,
  segments, and duration.
- The title-specific event catalog names Valorant round start/end, buy-phase
  start/end, Spike plant/explosion/defuse flow, ultimate-orb capture, ability use,
  item pickup/drop, timeouts, and round wins.
- Player positions and map bounds are modeled, but sampling cadence and standardized
  zones are not documented.
- Ordered events support sequence numbers, timestamps, state deltas, optional full
  state, and reversions. This is the evidence for a replayable event-sourced design.

## Material gaps or ambiguities

- Tournament region, stage/bracket labels, placements, competition tier, event type,
  showmatch flag, and a richer stakes taxonomy were not found.
- The FAQ says expected roster/lineup support is not currently available. Roster
  history, loans/substitutes, coaches, and IGL metadata remain gaps.
- The shared `DraftAction` model exists, but the event catalog names map pick/ban for
  CS2 and Rainbow Six, not Valorant. Valorant veto population, side selection, and
  pick-to-game linkage require a real payload.
- ACS, ADR, KAST, first-death counts, clutches, per-side splits, plant site, buy tier,
  wallbang/trade context, and detailed assister/weapon flags are not all direct named
  fields.
- Starting credits, spend, and round-start loadout/ult state are not present in the
  documented Valorant segment-player type. Event-time full-state snapshots or an
  equivalent file appear necessary.
- Historical depth, detailed competition coverage, licensing, public-display rights,
  and the Valorant release date are not answered by the reviewed documentation.

## Chart contract and QA notes

- Section: request coverage by tier
- Question: how much of each request tier is directly usable in Open Access versus
  partial, gated, or unresolved?
- Family/type: composition; stacked categorical bar
- Fields: tier, status, count; denominator and share retained for tooltips/audit
- Takeaway: Tier 1 is close to migration-ready, while most Tier 2 areas depend on
  event history outside Open Access.
- Palette policy: relaxed multi-category, with one distinct category per assessment
- Omitted trend: there is no time series; a trend chart would be misleading.

## Interpretation guardrails

1. Documentation proves schema presence, not entitlement, coverage, field population,
   retention, latency, or license rights.
2. A documented Valorant test loop (series/title ID 6) is useful schema evidence, but
   the same page says Series Events is not part of Open Access.
3. Derived metrics need explicit definitions and validation against a complete real
   production series before becoming migration gates.
