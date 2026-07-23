-- Reproducible materialization for the GRID Open Access portal review.
-- Evidence inventory and classification rules:
-- research/GRID_OPEN_ACCESS_REVIEW_NOTES.md
-- Generated from reviewed documentation on July 16, 2026.

DROP TABLE IF EXISTS "coverage_summary";
CREATE TABLE "coverage_summary" (
  "tier" TEXT,
  "status" TEXT,
  "count" INTEGER,
  "denominator" INTEGER,
  "share" REAL,
  "status_order" INTEGER,
  "definition" TEXT
);
INSERT INTO "coverage_summary" ("tier", "status", "count", "denominator", "share", "status_order", "definition") VALUES
  ('Tier 1 — migration', 'Strong Open Access fit', 2, 6, 0.3333333333333333, 1, 'Core fields directly represented in an Open Access endpoint.'),
  ('Tier 1 — migration', 'Partial or derivable', 4, 6, 0.6666666666666666, 2, 'Useful fields exist, but material requested elements are missing, ambiguous, or reconstructed.'),
  ('Tier 1 — migration', 'Commercial events/files', 0, 6, 0, 3, 'Decisive evidence lives in gated event history.'),
  ('Tier 1 — migration', 'Unresolved with GRID', 0, 6, 0, 4, 'Documentation does not answer the request.'),
  ('Tier 2 — round data', 'Strong Open Access fit', 0, 6, 0, 1, 'Core fields directly represented in an Open Access endpoint.'),
  ('Tier 2 — round data', 'Partial or derivable', 1, 6, 0.16666666666666666, 2, 'Useful fields exist, but material requested elements are missing, ambiguous, or reconstructed.'),
  ('Tier 2 — round data', 'Commercial events/files', 4, 6, 0.6666666666666666, 3, 'Decisive evidence lives in gated event history.'),
  ('Tier 2 — round data', 'Unresolved with GRID', 1, 6, 0.16666666666666666, 4, 'Documentation does not answer the request.'),
  ('Tier 3 — operations', 'Strong Open Access fit', 2, 7, 0.2857142857142857, 1, 'Core fields directly represented in an Open Access endpoint.'),
  ('Tier 3 — operations', 'Partial or derivable', 2, 7, 0.2857142857142857, 2, 'Useful fields exist, but material requested elements are missing, ambiguous, or reconstructed.'),
  ('Tier 3 — operations', 'Commercial events/files', 0, 7, 0, 3, 'Decisive evidence lives in gated event history.'),
  ('Tier 3 — operations', 'Unresolved with GRID', 3, 7, 0.42857142857142855, 4, 'Documentation does not answer the request.');

DROP TABLE IF EXISTS "product_surfaces";
CREATE TABLE "product_surfaces" (
  "order" INTEGER,
  "surface" TEXT,
  "access" TEXT,
  "protocol" TEXT,
  "delivers" TEXT,
  "valorant_signal" TEXT,
  "limitation" TEXT
);
INSERT INTO "product_surfaces" ("order", "surface", "access", "protocol", "delivers", "valorant_signal", "limitation") VALUES
  (1, 'Central Data Feed', 'Open Access', 'GraphQL', 'Titles, tournaments, series schedules, teams, players, organizations, external links, content catalogs, prize pool, venue type, per-series product service levels.', 'Docs use Valorant examples; content catalogs are versioned and include characters, items, and maps.', 'No expected roster/lineup support; region, stage, placement, competition tier, and coach/IGL fields were not found.'),
  (2, 'Series State', 'Open Access', 'GraphQL', 'Latest and final hierarchical Series → Game → Segment states, with team/player aggregates at series, game, and round-like segment grain.', 'Explicit AbilityValorant, Game/Segment/Series PlayerStateValorant and TeamStateValorant types are documented.', 'A snapshot is not an event timeline. Per-round economy and timestamped actions are not direct fields in Valorant segment state.'),
  (3, 'Stats Feed', 'Open Access', 'GraphQL', 'Aggregated player/team statistics over filtered series or game samples; tournament, time, map, title version, agent, side, objective, and first-kill filters.', 'Explicit Valorant player/game/team/series statistics types are documented.', 'No raw events; the documented Valorant aggregate surface is thinner than the state schema and does not expose ACS, ADR, or KAST as named metrics.'),
  (4, 'Series Events', 'Not Open Access', 'WebSocket', 'Ordered transactions with occurred/published timestamps, discrete events, deltas, optional full state, reversion handling, and reconnect sequence numbers.', 'Valorant event catalog includes rounds, buy phase, Spike flow, ultimate orbs, abilities, item pickup/drop, timeouts, and round wins.', 'The guide explicitly says this API is not included in Open Access; a documented Valorant test loop does not prove entitlement.'),
  (5, 'File Download', 'Series/entitlement dependent', 'REST', 'Post-series GRID end-state JSON and compressed GRID events JSONL; selected titles may also expose game-developer files.', 'The examples include Riot Game Agnostic Match History and Riot LiveStats file types.', 'Availability is reported per series; files may be missing, processing, or forbidden. The documented base URL is the full-access domain.');

DROP TABLE IF EXISTS "valorant_evidence";
CREATE TABLE "valorant_evidence" (
  "order" INTEGER,
  "capability" TEXT,
  "documented_schema" TEXT,
  "grain" TEXT,
  "access" TEXT,
  "proves" TEXT,
  "missing_or_unclear" TEXT
);
INSERT INTO "valorant_evidence" ("order", "capability", "documented_schema", "grain", "access", "proves", "missing_or_unclear") VALUES
  (1, 'Series and map structure', 'SeriesState.games; GameState.map, started, finished, startedAt, duration, titleVersion, segments', 'Series / game / nested segment', 'Open Access state', 'Map identity, order, status, version/patch label, timing, and round hierarchy are first-class.', 'Completed timestamp is derived from startedAt + duration; map number is sequence/order, not a named field.'),
  (2, 'Agent and core box score', 'GamePlayerStateValorant.character, kills, deaths, killAssistsGiven/Received, firstKill, headshots, multikills', 'Game, series, round-like segment', 'Open Access state/stats', 'Agent, K/D/assists, first-kill indication, headshots, and multikills should be available.', 'ACS, KAST, first-death count, clutch attempts/wins, and VLR-style assist semantics are not named.'),
  (3, 'Damage and weapons', 'damageDealt/Taken, DamageDealtSource/Target/Type, weaponKills', 'Game and segment aggregates', 'Open Access state', 'Damage totals, source/target breakdowns, and weapon kill totals are modeled.', 'Per-shot damage, per-kill weapon metadata, headshot flag, wallbang flag, and trade windows are not explicit.'),
  (4, 'Current economy and equipment', 'money, loadoutValue, netWorth, inventory.items, currentArmor', 'Current game/player state', 'Open Access state', 'Credits, loadout value, inventory, and armor exist in the live/final game state.', 'Valorant segment state omits money/loadout/inventory; starting credits, spend, and buy tier need event-time snapshots or reconstruction.'),
  (5, 'Abilities and ult economy', 'AbilityValorant.name, ready, charges; GamePlayerStateValorant.abilities, ultimatePoints', 'Current game/player state', 'Open Access state', 'Ability readiness/charges and ultimate points are explicitly modeled for Valorant.', 'Per-round starting ult state and exact use time require events; ability cost/type metadata is not shown.'),
  (6, 'Round ledger', 'SegmentState.sequenceNumber, startedAt, duration; SegmentTeamStateValorant.side, won, winType, players', 'Round-like segment', 'Open Access state', 'Round order, side, winner, win reason, start, duration, and player round aggregates are modeled.', 'Score entering the round is derived; plant site and survivor counts are not direct named round fields.'),
  (7, 'Spike timeline', 'beginDefuseBomb, defuseBomb, stopDefuseBomb, reachDefuseBombCheckpoint, plantBomb, explodeBomb', 'Timestamped event transaction', 'Series Events / event file', 'The current event catalog explicitly names Valorant Spike actions.', 'Series Events is not Open Access; plant site and defuse timestamp fields beyond transaction occurredAt are not documented separately.'),
  (8, 'Utility timeline', 'player-used-ability; player-completed-captureUltimateOrb; abilities and ultimatePoints state deltas', 'Timestamped event transaction', 'Series Events / event file', 'Ability use and ultimate-orb actions exist as Valorant events.', 'The generic event envelope does not document a title-specific payload proving exact ability identity in every event.'),
  (9, 'Positioning', 'GamePlayerStateValorant.position; MapState.bounds; Coordinates.x/y', 'Current game/player state', 'Open Access state', 'Player coordinates and map bounds are modeled.', 'Sampling cadence, event-by-event coordinate history, and standardized map zones are not specified.'),
  (10, 'Patch and content versioning', 'GameState.titleVersion; ContentCatalogVersion.name/publishedOn; versioned characters/items/maps', 'Game plus effective-dated content catalog', 'Open Access state/static/stats', 'A patch-aware pipeline is structurally supported.', 'Actual Valorant value population and Riot build crosswalk must be validated on a real series.'),
  (11, 'Map veto and side selection', 'SeriesState.draftActions; DraftAction(drafter, type, sequence, draftable)', 'Series/game draft', 'Open Access state', 'The shared schema can represent ordered draft actions.', 'The title-specific event catalog lists map pick/ban for CS2/R6, not Valorant; side selection and pick-to-game linkage are not explicit.'),
  (12, 'Corrections and replay safety', 'transaction.sequenceNumber/sessionSequenceNumber; revertedEventId; inverse deltas', 'Event stream', 'Series Events / event file', 'A robust ingestion design can replay ordered events and reverse corrected actions.', 'Requires access to event history; an end-state-only pipeline cannot audit the original timeline.');

DROP TABLE IF EXISTS "request_mapping";
CREATE TABLE "request_mapping" (
  "priority" INTEGER,
  "tier" TEXT,
  "area" TEXT,
  "assessment" TEXT,
  "evidence" TEXT,
  "implication" TEXT,
  "confidence" TEXT
);
INSERT INTO "request_mapping" ("priority", "tier", "area", "assessment", "evidence", "implication", "confidence") VALUES
  (1, 'Tier 1', 'Events / tournaments', 'Partial or derivable', 'Tournament id/name/dates, parent/children, teams, prizePool, venueType, external links, and title are present.', 'Core event identity is usable, but region, stage/bracket labels, placements, competition tier, event type, and stakes taxonomy still need another source or GRID fields.', 'High'),
  (2, 'Tier 1', 'Series', 'Strong Open Access fit', 'Series id, tournament, teams, format, scheduled start, type, streams, product service levels, and state-level score/winner/timing are modeled.', 'This is sufficient for the core match table once actual Valorant coverage is confirmed.', 'High'),
  (3, 'Tier 1', 'Games / maps', 'Strong Open Access fit', 'Game id/order, map, team score/winner, started/finished, start time, duration, nested rounds, and titleVersion are documented.', 'Map result parity and patch-aware modeling should be feasible; completion time may be derived.', 'High'),
  (4, 'Tier 1', 'Map veto', 'Partial or derivable', 'Generic ordered DraftAction exists, but the event catalog only names map pick/ban for CS2 and Rainbow Six.', 'Do not assume Valorant veto or side selection is populated until a real payload proves sequence, acting team, decider, side choice, and game linkage.', 'Medium'),
  (5, 'Tier 1', 'Player box score', 'Partial or derivable', 'Valorant state includes agent, kills/deaths/assists, firstKill, headshots, multikills, weaponKills, damage, objectives, and round aggregates.', 'Most raw ingredients are available, but ACS/ADR/KAST, first deaths, clutches, plants/defuses, and per-side splits are not all direct named metrics.', 'High'),
  (6, 'Tier 1', 'Entities / rosters', 'Partial or derivable', 'Team/player/org IDs, names, logos/images, nationality, roles, current team, title, and external links are modeled. FAQ says expected roster/lineup is not supported.', 'Entity parity is good; authoritative roster history, loans/subs, coaches, and IGL metadata remain gaps.', 'High'),
  (7, 'Tier 2', 'Round ledger', 'Partial or derivable', 'Nested segments can represent rounds and buy phases; round sequence, side, winner, winType, start, duration, and per-player aggregates are present.', 'A basic ledger is possible from Open Access state, but exact Spike timing/site and full score-state reconstruction are stronger with event history.', 'High'),
  (8, 'Tier 2', 'Economy per player / round', 'Commercial events/files', 'Current money, loadoutValue, netWorth, inventory, and armor exist at game-player state; Valorant segment-player state omits them.', 'H1 needs full-state snapshots around buy-phase/round boundaries or an event file. End-state segments alone are insufficient for starting credits and spend.', 'High'),
  (9, 'Tier 2', 'Ultimates and utility', 'Commercial events/files', 'Valorant ability readiness/charges and ultimatePoints are explicit; the event catalog includes player-used-ability and ultimate-orb capture.', 'Current state is available, but per-round start status and exact use timestamps depend on gated event history.', 'High'),
  (10, 'Tier 2', 'Timestamped combat events', 'Commercial events/files', 'Event transactions carry occurredAt and player-killed-player; state exposes aggregate damage, assists, weapons, and headshots.', 'Kills can be timestamped with events, but assister list, weapon/headshot/wallbang/trade context, and per-damage-event detail require payload validation.', 'High'),
  (11, 'Tier 2', 'Positioning', 'Commercial events/files', 'Player coordinates and map bounds are in game state.', 'A current/final position is not a trajectory. H2 needs repeated full-state snapshots or a separate positional entitlement, plus a zone model.', 'Medium'),
  (12, 'Tier 2', 'Scrims', 'Unresolved with GRID', 'SeriesType includes SCRIM, proving the schema can label practice series.', 'Schema support does not prove that any scrim data is collected or licensable for this account.', 'High'),
  (13, 'Tier 3', 'Historical depth', 'Unresolved with GRID', 'Past end state remains queryable and post-series files exist, but no retention start date or Valorant backfill depth is stated.', 'The 2023-present migration requirement remains a contractual question.', 'High'),
  (14, 'Tier 3', 'Coverage', 'Partial or derivable', 'Per-series productServiceLevels report FULL/LIMITED/NONE and Stats Feed supports title samples.', 'Coverage can be audited series by series, but VCT/Challengers/off-season/China completeness is not promised in docs.', 'High'),
  (15, 'Tier 3', 'ID crosswalk', 'Partial or derivable', 'Entities expose externalLinks, dataProviders, and lookups by external IDs.', 'A Riot crosswalk may already exist; a VLR mapping is not documented. Keep the planned local crosswalk layer.', 'High'),
  (16, 'Tier 3', 'Delivery and rate limits', 'Strong Open Access fit', 'Open Access GraphQL endpoints exist for Central Data, Series State, and Stats Feed; REST files and a WebSocket stream are documented.', 'The delivery architecture is clear, but exact OA quotas, latency SLAs, and file entitlements still need confirmation.', 'High'),
  (17, 'Tier 3', 'Complete sample', 'Unresolved with GRID', 'Test loops are documented, including Valorant series/title ID 6 for Series Events, but that API is not Open Access.', 'Request one real entitled Valorant series with Central Data, end state, file list, events JSONL, and Stats queries before final schema design.', 'High'),
  (18, 'Tier 3', 'Licensing', 'Unresolved with GRID', 'The reviewed technical documentation does not define public-display, attribution, or raw/derived redistribution rights.', 'Do not ship GRID-derived public stats until the license terms are explicit.', 'High'),
  (19, 'Tier 3', 'Patch / build metadata', 'Strong Open Access fit', 'GameState.titleVersion and version-aware content catalogs/Stats filters are explicit.', 'Patch-aware models have the right schema hook; validate actual Valorant values and Riot build mapping on samples.', 'High');

DROP TABLE IF EXISTS "workstreams";
CREATE TABLE "workstreams" (
  "order" INTEGER,
  "workstream" TEXT,
  "readiness" TEXT,
  "grid_adds" TEXT,
  "blocker" TEXT,
  "design_now" TEXT
);
INSERT INTO "workstreams" ("order", "workstream", "readiness", "grid_adds", "blocker", "design_now") VALUES
  (1, 'C — Transient map readiness', 'Good foundation', 'Game map, start time, result, titleVersion, versioned map catalog, tournament venue/prize.', 'Competition tier and complete historical coverage are not documented.', 'Key readiness by GRID game/map/titleVersion; retain external patch and map-pool tables.'),
  (2, 'D — Veto rebuild', 'Uncertain', 'Generic ordered DraftAction can represent picks/bans and the acting entity.', 'Current catalog does not confirm Valorant map veto, side selection, or pick-to-game linkage.', 'Keep a source-agnostic veto table; require a production Valorant payload before switching.'),
  (3, 'E — Tier-2 ingestion', 'Coverage unknown', 'Tournaments, series, teams, results, venue type, prize pool, product service level.', 'Competition tier, region, stage, showmatch flag, and Challenger/off-season completeness are not explicit.', 'Preserve the existing event taxonomy and treat GRID as another source until coverage is audited.'),
  (4, 'F — Agent metadata', 'Partial foundation', 'Versioned content catalogs for characters, items, maps, publishedOn, and in-state ability names/charges.', 'No balance-change ledger or mechanics taxonomy is documented.', 'Use GRID IDs as crosswalks, but keep Riot patch notes and the curated traits ledger authoritative.'),
  (5, 'G — Familiarity penalty', 'Good if history is deep', 'Stable player IDs, game-level character/agent, roles, participation status, match context.', 'Historical depth and tier-2 coverage determine whether debut episodes are numerous enough.', 'Model player-agent appearances from normalized game-player state, not display names.'),
  (6, 'H1 — Economy win probability', 'Event history required', 'Score/winner/side, current credits, loadout, inventory, armor, ult points, survivors, patch, round hierarchy.', 'Per-round starting economy is not in Valorant segment state; event/full-state snapshots appear necessary.', 'Create immutable snapshot/event tables with transaction time, sequence, state version, and round linkage.'),
  (7, 'H2 — Tempo and style', 'Commercial/event history', 'Round/buy-phase timing, Spike actions, kills, ability events, positions, map bounds.', 'Series Events is excluded from Open Access; position sampling and first-contact detail are unspecified.', 'Define event-time features and a zone abstraction, but do not implement until a full payload is reviewed.'),
  (8, 'H3 — Kill shots', 'Blocked on H1', 'Ordered event stream, state deltas, reversions, round outcomes, economy and ult state.', 'Requires a calibrated H1 model and reliable event/economy reconstruction first.', 'Retain reversible event sourcing so leverage runs can be recomputed after model changes.');


