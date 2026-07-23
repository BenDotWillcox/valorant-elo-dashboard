# Ratings Research — Next Phase Plan

Consolidated from the Claude and Codex reviews of `research/ratings` (July 2026).

## Consolidated findings this plan responds to

1. **Team–map skill is unproven, not disproven.** The promoted carryover model is a
   slow, persistent map Elo with an 85% global weight (a corner of the search grid);
   median team–map offset is <1 Elo point and map rankings are effectively global
   rankings. The formulation cannot express *transient, patch-aware map readiness*
   (separate fast clock, patch/pool resets), and veto censoring removes exactly the
   games where map weakness would show. The failed veto model (worse than uniform)
   is consistent with map-skill signal living in veto behavior, not played-map outcomes.
2. **The player–agent leaderboard is not trustworthy as published.** ~96% of
   player–agent cells are extrapolated; unseen player–agent offsets shrink to zero so
   the best global player (Neon) tops all 29 agents; role and map–role borrowing were
   validated in development but omitted from final snapshot scoring; support labels are
   wrong at the agent view (Neon-on-Neon shows "extrapolated"); and the VPM layer has
   OOF r=0.04 (R²≈0.002) against its round-margin target with raw 80% interval
   coverage of 0.32 — point-estimate orderings are noise.
3. **Data expansion order:** tier-2/non-VCT ingestion first (attacks sparsity and
   supplies agent/role-switch natural experiments), agent/balance metadata in parallel
   (cheap), GRID round-level data is the step-change (blocked on entitlement),
   kill-shots only after a round-level economy win-probability model exists.

## Protocol note (applies to every workstream)

The 2026 lockbox for `ratings-development-v1-full` has been opened once. Every new
challenger below must run as a **new experiment version** under the same leakage
protocol. Repeated 2026 confirmations erode the lockbox guarantee — prefer rolling the
development window forward (e.g., develop on 2024–H1 2026, hold out H2 2026) and state
in the report that the original lockbox guarantee applies only to v1.

---

# Phase 0 — External setup (you, not code)

### 0.1 GRID Esports follow-up — status July 2026: quoted, DEFERRED
- VALORANT is **not** in Open Access (timeline unknown); commercial team requires a
  registered company to sign.
- **Quote received:** €3,000/month fixed, 12-month contract, **live broadcast-synced
  feed only** (~€36k/yr before add-ons). GRID does **not** sell historical/post-match
  data standalone — it is a volume-priced add-on available only on top of the live
  feed.
- **Decision: defer, do not sign.** Three independent reasons: (a) €36k/yr fixed on a
  12-month lock is a funded-company cost, not viable pre-revenue (break-even ≈ 350+
  subs or several team deals just for the data bill); (b) wrong *shape* — the roadmap
  needs historical/post-match data for model dev, which GRID won't sell standalone;
  (c) the live feed's real use (a live in-match win-probability / betting product) is
  a later, revenue-gated expansion. GRID is off the near-term critical path.
- **Revised data architecture:** consumer product runs on VLR-permission or
  Liquipedia (historical, cheap/free); Front Office tier potentially runs on the
  client team's **own VALORANT Data Portal entitlement** (still-unconfirmed question
  with GRID — if yes, the biggest revenue tier needs zero GRID spend from us).
- **Revisit GRID only when** (a) VALORANT enters Open Access, (b) subscriber/team
  revenue underwrites €36k+/yr, or (c) a live real-time product thesis justifies the
  live feed. Open questions still out to Juan: Open Access timeline, historical
  add-on pricing for 2023–present, team-VDP-entitlement path, and data-retention
  rights under the live subscription.
- **Coverage-calendar note (GRID media sheet, July 2026):** the live feed covers the
  full official Valorant pyramid going forward — T1 (EWC/Champions/GC Championship),
  T2 (Masters + all VCT regional league stages), and T3–T5 (Challengers regions +
  Game Changers) — ~596 matches / ~1,447 maps per rolling ~annual window. Two
  implications: (i) a subscription would **replace the entire Workstream E scrape**
  for official events with a clean licensed feed (moots the VLR-ToS risk for those
  events), but (ii) it is **forward-only** — no historical backfill without the paid
  add-on — so it accumulates data from start date rather than training models on
  history. All Valorant events show no "faster streaming rights" and some no video;
  confirm data (stats) vs AV redistribution rights before any public-dashboard use.
- **Follow-up answers from GRID (July 2026):**
  1. *Open Access timeline:* none — more titles planned but which/when undecided.
     Do not wait on it.
  2. *Historical backfill:* ~€10,000 **one-time**, but only as an add-on on top of
     the live contract (no standalone historical). First-year cost to train on GRID
     history ≈ €36k live + €10k ≈ **~€46k**.
  3. *Team-entitlement path — CONFIRMED, favorable:* an analyst can work under a
     team's own Data Portal access, but the request must come from the **professional
     team as an organization**, not from an individual. → the Front Office tier can be
     **GRID-cost-free to us** when a team sponsors the access (team-initiated).
  4. *Data is rented, not owned:* outputs may be built while under contract, but using
     the raw data for future projects after the contract ends is prohibited. → GRID is
     a **permanent recurring dependency**; never build our baseline/historical corpus
     on it (it vanishes when payments stop).
- **Sharpened architecture:** (a) **own** the baseline historical corpus via
  Liquipedia / VLR-permission (kept forever); (b) **Front Office** = team-sponsored
  data access + our models (potentially zero GRID cost to us, team-initiated);
  (c) a GRID subscription for our *own* consumer product is justified only later by a
  live real-time / round-level product thesis **and** durable recurring revenue,
  accepting it is a rented premium layer (~€36k/yr + €10k history), not a one-time
  acquisition.
- When access eventually lands, confirm **entitlement scope** (officials vs. scrims;
  historical backfill depth) and **schema**: starting credits/loadouts/armor per
  round, ult points and usage, round side/score/win condition, timestamped kills,
  damage, trades, utility, plants/defuses, player positions or map zones, and the
  actual game build/patch per match. Get sample payloads for one full series before
  designing any schema (full request list in `GRID_DATA_REQUEST.md`).

### 0.2 Data-expansion scope — DECIDED (July 2026)

Inclusion order, agreed:

1. **EWC / mid-season VCT-exclusive events** — include now, fully. Same teams, real
   stakes, no new infrastructure beyond the events table (E0).
2. **Pre-season / kickoff events** (mostly VCT + a few qualified T2 teams) — include.
   Effort/practice concern is handled by learned event-type weights, not a priori
   exclusion. Doubles as the small-scale rehearsal for automated team ingestion (E1).
3. **Challengers / T2 + Ascension** — the priority target. Supplies cross-tier player
   movement (Workstream G's natural experiments), tier-gap calibration, and the bulk
   of the player-agent sparsity relief.
4. **Game Changers** — include after Challengers. Caveat: GC is a nearly disconnected
   match-graph island; its rating level anchors to T1/T2 only through GC teams
   appearing in T2 events, so present GC as its own ladder with an explicitly
   uncertain cross-ladder anchor.
5. **Pre-2023 VCT (2020–2022)** — historical archive track only. Near-zero model value
   at a 360-day rating half-life with near-total roster turnover, but real product/
   story value. Ingest whenever convenient, era-tagged, excluded from model training
   by default. Revisit for modeling when preparing for the 2027 open format (that era
   is the only historical data on open-qualification dynamics).
6. **Tier 3** — excluded. Lowest signal, most divergent meta, worst mess per match.
   Backfill specific player histories on demand once a player surfaces in T2 instead.

Remaining open items: estimate volume per phase (events × matches) and confirm the
data source (see 0.2b — Liquipedia is now the leading source, not VLR scraping).

### 0.2b Data source — Liquipedia (leading option, July 2026)

Given the VLR ToS change + commercial pivot, Liquipedia (CC-BY-SA 3.0, Team Liquid)
is the preferred source for the expansion. Findings:

- **Two APIs.** MediaWiki API is open but brutally rate-limited (60 req/hr, 1 req/2s,
  `action=parse` 1/30s) — useless for a ~27k-match backfill. **LiquipediaDB (LPDB)** is
  the structured route (`match2` / `match2game` / `match2opponent` / `match2player`,
  rosters, transfers, tournaments) and requires an **approved access request + key**.
- **Commercial gating.** Free LPDB access is non-commercial only. Our commercial use
  needs a **commercial arrangement with Liquipedia** — but the CC-BY-SA 3.0 content
  license permits commercial reuse with attribution + share-alike, so we negotiate
  from real legal footing (unlike GRID). Attribution is trivial; **share-alike on
  derived DB/models is a lawyer question** (models trained on facts are generally not
  derivative works; reproducing their compilation is the risk).
- **Completeness split.** Team-graph data (results, map scores, vetoes, rosters,
  events/tiers) is **excellent** and covers the exact Challengers/GC/pre-2023 tiers
  GRID doesn't — fully powers Workstreams C, D, and E team-side. Player box scores are
  **partial**: K/D/A, ACS, agent are present; ADR, KAST, and first-duel rates are
  inconsistent and thin at lower tiers — so the player model (A/B/G) runs on a reduced
  feature set until the deep stats are filled (GRID team-sponsored, or VLR-permission).
- **What it takes:** (1) commercial LPDB access request to Liquipedia; (2) licensing
  read (attribution + share-alike); (3) LPDB ingestion client (compliant User-Agent,
  caching, schema mapping to `matches`/`maps`/`player_map_stats`); (4) entity
  resolution Liquipedia page-names → our IDs (dovetails with E1); (5) **completeness
  audit on a real sample of target events before committing**; (6) plan around the
  player-stat gap.
- Net: Liquipedia is the **ownable, licensable base** for the team graph + expansion
  tiers; player-stat depth stays a known gap. Replaces the VLR-scrape plan in E2 as
  the primary source pending the access/licensing outcome.

### 0.3 Balance-change curation — approach decided (July 2026)
- Source: the CC-BY-SA wiki mirrors of Riot's patch notes (same text, cleaner
  licensing posture than scraping playvalorant.com). Volume is ~150 documents
  (~2 patches/month since 2020).
- Pipeline: LLM-assisted extraction into a fixed schema, with a **full human review
  pass by you** (an afternoon or two at this volume) plus regex validation of the
  quantified "from X to Y" / "X >>> Y" patterns. See Workstream F.
- Remaining decisions: the ability-mechanics taxonomy for agent trait vectors (F4),
  and how far back the patch calendar goes (2023 minimum to cover the modeled era;
  2020 if the pre-2023 archive track proceeds).

### 0.4 Product decisions for the dashboard
- Player–agent display policy: default leaderboards show the demonstrated view;
  the forced-counterfactual view is visually distinct. (Workstream A implements
  whatever you choose.)
- Team rankings once non-franchised teams enter the pool (decide before pre-season
  ingestion lands): recommended policy — all ingested matches update ratings, but
  leaderboards default-filter to teams with T1 appearances in the current season,
  with a toggle to show all; Game Changers gets its own ladder view (see 0.2 item 4).

---

# Phase 1 — No new data required (do now)

## Workstream A — Fix the player–agent publication layer

**Goal:** stop presenting extrapolated counterfactuals as rankings. Three changes:
fix the support-label artifact, restore role/map–role borrowing in snapshot scoring,
and split the published views.

**Prompt:**

> In `research/ratings` (Python package `valorant_ratings`), fix three publication-layer
> problems in the player rating snapshots. Do not change the fitted model family or the
> leakage protocol; this is scoring/presentation work. Artifacts under
> `artifacts/ratings-development-v1-full__rating-snapshots-v3/` show the current bad output.
>
> 1. **Support-label audit and fix.** In the published `player_ratings.parquet`, every
>    row in the `agent` and `overall` views has `support="extrapolated"`, including
>    players on their signature agents (e.g., the player Neon on the agent Neon).
>    Trace how `HierarchicalPlayerModel.forecast` support levels flow into the
>    marginalized `agent`/`map`/`overall` views in the snapshot scoring code
>    (`scenario.py` / `scoring.py` / wherever views are built). The marginalized views
>    likely lose map/lineup context, so the "known map" checks fail. Define view-level
>    support correctly: an agent-view row should be `observed` when the player has
>    sufficient recent maps on that agent (aggregate `player_agent` count), and
>    analogously for map view. Add a regression test asserting a player with 30+ maps
>    on an agent is not labeled `extrapolated` in the agent view.
> 2. **Restore role borrowing in final scoring.** Rolling development validated
>    `agent_role_effect` and `map_agent_role` terms, but the final snapshot scoring
>    omitted them, so published agent rankings ignore role information entirely.
>    Find the discrepancy between the development configuration
>    (`run_player_development` ablation `triple` in `player.py`) and the snapshot
>    scoring configuration, and make snapshot scoring use exactly the promoted
>    development configuration. Add a test that the enabled-terms set used for
>    published snapshots equals the promoted ablation's set.
> 3. **Two published views instead of one leaderboard.** Rework the player-agent
>    snapshot output to publish:
>    - `demonstrated` (default): a player–agent cell appears if the player has at
>      least one map on the agent within a recency window (default 12 months,
>      configurable). Rank by uncertainty-penalized score `mean − λ·sd` (λ
>      configurable, default 0.5) so low-sample entries are listed but sink, and
>      include a `maps_played` (recency-windowed) column and the predicted
>      agent-use probability from `agent_selection_probabilities.parquet` as
>      display columns.
>    - `forced-counterfactual`: the current full grid, explicitly flagged, never the
>      default.
>    Update `notebooks/07_rating_explorer.ipynb` defaults so leaderboard functions use
>    `demonstrated` and print which view is active. The explorer already has support
>    filters and a minimum agent-use-probability parameter — keep them available as
>    optional filters on the demonstrated view.
>
> Constraints: no refitting semantics change; artifacts remain versioned/manifested;
> run the existing pytest suite plus your new tests; regenerate a snapshot bundle as
> `__rating-snapshots-v4` and summarize before/after for the Sova leaderboard
> (expected: Neon no longer #1 on agents he has never played in the demonstrated and
> expected-assignment views).

## Workstream B — VPM signal audit (why R² ≈ 0.002)

**Goal:** determine whether the near-zero predictive signal in the published VPM is a
bug (unit/target mismatch, over-shrinkage) or a true ceiling, and publish ratings on a
scale that is honest about it.

**Prompt:**

> In `research/ratings`, audit the `PredictiveBoxVPM` layer in
> `src/valorant_ratings/player.py`. Out-of-fold diagnostics
> (`artifacts/ratings-development-v1-full/predictions/player_oof.parquet`, component
> `__box_vpm__`, ablation `triple`) show predicted values with std 0.012 against
> observed values with std 0.26, correlation 0.04, and raw 80% interval coverage 0.32
> requiring a post-hoc 2.98× SD inflation. Investigate, in order:
>
> 1. **Unit/target consistency.** Verify which `TARGET_CANDIDATES` column is actually
>    selected on the real snapshot, what its units are, and that
>    `transform_target`/`target_multiplier_` put `observed` and `predicted` on the
>    same scale in `run_player_development`. Document the resolved unit chain in the
>    module docstring.
> 2. **Shrinkage audit.** The effect prior strengths in
>    `HierarchicalPlayerModel.DEFAULT_PRIORS` are hand-set and never tuned. Quantify
>    the shrinkage factor actually applied to `player_state`, `player_agent`, and
>    `player_map` for a median-support player (time-decayed weight sums vs. prior
>    strength), and run a small OOF sweep over prior strengths (at least
>    player_state ∈ {3, 7, 14, 30}, player_agent ∈ {10, 35, 80}) using the existing
>    rolling-fold machinery. Report whether looser priors improve component MAE/log
>    likelihood.
> 3. **Ridge/aggregation audit.** The ridge maps 5-player team-mean components to team
>    round margin, which dilutes individual variation. Evaluate an alternative:
>    fit component→margin weights at player level against team margin with
>    team-mean-centering, or increase/decrease `alpha` (sweep {2, 8, 32}).
> 4. **Honest display scale.** Whatever the ceiling turns out to be, add a
>    standardized display: publish per-view z-scores of `performance_mean` (with the
>    development population as the reference) alongside the raw rounds-per-24 value,
>    so a 0.1σ difference cannot be visually read as a meaningful gap.
>
> Deliverable: a short markdown report in `reports/vpm_audit.md` with the findings,
> plus any fixes that are clear bugs (unit mismatches, config drift). Any change to
> priors/alpha that alters fitted behavior must run as a new experiment version under
> the existing rolling development protocol, not as a silent edit to v1 artifacts.

## Workstream C — Transient map-readiness challenger (team model)

**Goal:** test the actual hypothesis — short-lived, patch-aware map form — rather than
re-searching the rejected persistent-map-Elo family.

**Prompt:**

> In `research/ratings`, implement and evaluate a new team-rating challenger in
> `src/valorant_ratings/elo.py` (new class, do not modify the promoted `EloModel`)
> that decomposes team strength into three components:
>
> 1. **Global strength** — as in the current carryover model.
> 2. **Persistent map affinity** — slow-moving per-map offset, small update share,
>    long half-life (reuse current behavior).
> 3. **Map readiness** — a fast per-map state with its own K-factor and its own decay
>    clock keyed to *days since the team last played that map* and to patch
>    boundaries: on a patch change (from `config/patches.json`) or when a map re-enters
>    the pool (`config/map_pools.json`), readiness shrinks hard toward zero
>    (configurable retention, default 0.25) and its uncertainty resets.
>
> The predicted rating is `global + affinity + readiness`. Update rules must keep the
> existing invariants: `predict` non-mutating, one frozen state per series
> (`update_batch` semantics), margin multiplier reuse.
>
> Search space: keep the promoted carryover parameters for the global pathway
> (including testing global weight up to 0.95 and 1.0, since development showed
> 95–100% slightly improved log loss); readiness half-life ∈ {21, 45, 90} days;
> readiness K ∈ {8, 16, 32}; patch retention ∈ {0.1, 0.25, 0.5}. Keep the grid small
> and auditable like `carryover_search_space()`.
>
> Evaluation — three levels, all via the existing rolling development protocol as a
> new experiment version:
> 1. Aggregate map log loss / Brier / calibration vs. the promoted carryover (existing
>    gate machinery in `evaluation.py`/`experiment.py`).
> 2. **Within-series map ordering**: among series where the same two teams play 2+
>    maps, does the model rank the map the team actually won as their better map more
>    often than the carryover baseline? Implement this as a new metric in
>    `evaluation.py` with match-clustered bootstrap intervals.
> 3. **Predeclared episodes**: add a small fixture file
>    (`config/map_form_episodes.json`) of known cases (team, map, date range,
>    direction) supplied by the maintainer, and report whether the readiness state has
>    the declared sign during those windows. This is a diagnostic, not a gate.
>
> Promotion follows the existing gate structure (development paired-difference plus
> holdout confirmation on the rolled-forward holdout window). Document results in the
> model-selection report format.

## Workstream D — Veto model rebuild

**Goal:** the current sequential pooled veto model is worse than uniform. Veto
behavior is both a prediction target and the best uncensored evidence of map skill.

**Prompt:**

> In `research/ratings`, rebuild the veto model in `src/valorant_ratings/veto.py`.
> The current `sequential_pooled_veto` scored 1.556 held-out choice log loss vs. 1.421
> for uniform-over-legal-choices — worse than knowing nothing. Replace it with a
> conditional-logit-style sequential choice model where, at each veto step, the
> utility of banning/picking map m for team t is a linear function of:
> - the team's own rating differential on m (global + map components from the team
>   model, computed as-of the series cutoff);
> - the opponent's rating differential on m;
> - the team's recency-weighted historical veto behavior toward m (ban rate, pick
>   rate, float rate, exponentially decayed, e.g. 90-day half-life);
> - map-pool context (how long m has been in the pool this cycle, patch age);
> - side-choice context where applicable.
>
> Requirements:
> - Strictly leakage-safe: all features computed from data before the series cutoff,
>   refit per rolling fold like the other models.
> - Evaluate on held-out per-action choice log loss vs. the uniform baseline and the
>   old model; also report top-1 accuracy per veto step.
> - Secondary analysis: export each team's implied map utilities per fold and
>   correlate them with (a) subsequent played-map results on those maps and (b) the
>   map-readiness state from the transient-readiness challenger if present. This
>   quantifies how much map skill is visible in veto behavior but censored from
>   played-map outcomes. Write the analysis to the metrics artifacts and a short
>   section in the report payload.
> - Keep the series-level integration: `carryover_pre_veto`/`carryover_post_veto`
>   series forecasts should be recomputed with the new veto model to check whether
>   veto-aware series forecasts finally beat veto-blind ones.

---

# Phase 2 — New data, existing sources (start after Phase 0 decisions)

## Workstream E — Data expansion: events, teams, and tiered ingestion

**Goal:** attack sparsity (median player–agent support is 5 maps), collect the
agent/role-switch natural experiments needed for Workstream G, and build the
team/event infrastructure the 2027 open format will require anyway.

Scope and order are decided in 0.2. Four sequenced sub-tasks: E0 (events table) →
E1 (team auto-resolution) → E2 (phased scraper backfill) → E3 (research integration).
E0 and E1 are prerequisites; E2's phases land data incrementally; E3 runs once
Challengers data exists (earlier phases can be smoke-tested through it).

### E0 — Events table migration (prerequisite for everything)

**Prompt:**

> In the valorant-elo-dashboard repo (Next.js + Drizzle + Postgres), event metadata
> currently lives as raw varchars (`event_name`, `region`, `stage`) on the `matches`
> and `maps` tables (`db/schema/matches-schema.ts`, `db/schema/maps-schema.ts`).
> Create a first-class events table and migrate onto it:
> 1. New `events` schema file following the conventions in `db/schema/` (exported
>    from `index.ts`): id, `vlr_event_id` (unique, nullable for legacy/manual rows),
>    name, `tier` ('t1-franchised' | 't1-offseason' | 't2-challengers' |
>    'game-changers' | 't3' | 'qualifier'), `event_type` ('league' | 'international' |
>    'kickoff' | 'ewc' | 'ascension' | 'showmatch' | 'other'), region, `lan`
>    (nullable boolean), start/end dates (nullable), created/updated timestamps.
> 2. Add a nullable `event_id` FK to `matches`. Keep `event_name` columns in place —
>    no column drops in this task.
> 3. Backfill: create events from distinct existing (`event_name`, `region`) pairs
>    and link all matches. Existing rows are all franchised VCT: tier
>    't1-franchised'; event_type by name heuristic (Masters/Champions →
>    'international', else 'league'); leave `lan`/dates null where unknown. Emit a
>    review report (CSV or markdown) of every created event with its guessed
>    tier/type for manual correction.
> 4. Update the ingestion code path that writes matches to resolve-or-create the
>    event (keyed on `vlr_event_id`) so future scrapes populate the FK.
> 5. Use the repo's existing Drizzle migration workflow. Do not modify Elo/VPM
>    computation or dashboard queries beyond what compiling requires.

### E1 — Automated team ingestion and org metadata

**Prompt:**

> In the valorant-elo-dashboard repo, team rows are currently created manually before
> their matches can be ingested. That cannot scale to Challengers-level ingestion
> (hundreds of teams, constant churn) and will break under the 2027 open format.
> Build automatic team resolution:
> 1. When ingestion encounters an unknown team, auto-create it keyed on `vlr_slug`
>    (`db/schema/teams-schema.ts`), populating name, slug, region, and logo when
>    available from the scraped page.
> 2. Resolution ladder, in order: exact `vlr_slug` match → `team_slug_aliases` →
>    `team_name_aliases` → exact name match → fuzzy name match. Fuzzy candidates are
>    NOT auto-merged: create the team anyway, set a new `needs_review` flag, and
>    record the suspected duplicate (nullable `suspected_duplicate_of` self-FK) so
>    merging stays a human decision.
> 3. Provide a merge script (or documented admin path) that repoints all FK
>    references from a duplicate team to its canonical team and writes alias rows so
>    the duplicate never recurs.
> 4. Add a nullable `parent_team_id` self-FK on teams for academy-team relationships
>    (population is manual for now).
> 5. Tests for the resolution ladder: known alias resolves, genuinely new team is
>    created cleanly, near-duplicate name is created-and-flagged rather than merged.
> No rating logic changes in this task.

### E2 — Scraper expansion and phased backfill

**Prompt:**

> With the events table (E0) and automatic team resolution (E1) in place, extend the
> VLR scraping pipeline to ingest additional circuits in four phases. Each phase must
> complete and pass a review gate (row-count summary + manual spot-check) before the
> next begins:
> - **Phase 1:** mid-season VCT-exclusive events (Esports World Cup and similar),
>   2024–present. Tier 't1-offseason', event_type 'ewc'/'other'.
> - **Phase 2:** pre-season/kickoff events including their non-franchised qualifiers,
>   2023–present. Event_type 'kickoff', tier per event.
> - **Phase 3:** Challengers/T2 leagues and Ascension, 2023–present. Tier
>   't2-challengers'; Ascension events get event_type 'ascension'.
> - **Phase 4:** Game Changers, tier 'game-changers'.
> Requirements:
> - Walk VLR's per-circuit event listings rather than hardcoding event ids.
> - Ingest **entire events** — every participating team via E1 auto-creation — not
>   only games involving known teams.
> - Flag showmatches (event_type 'showmatch'); exclude them from all downstream
>   rating queries by default.
> - Capture the patch version displayed on each VLR match page into a nullable
>   `patch` field on matches (with `patch_source` 'observed'); backfill it for
>   already-ingested matches while crawling. Inference for missing values happens
>   downstream (Workstream F0), not in the scraper.
> - Dedupe on `vlr_match_id` (some off-season events may partially exist).
> - Polite rate limiting and resumable, idempotent backfill runs.
> - After each phase: summary of events/matches/maps/new-teams/new-players by
>   year × region, plus a list of teams flagged `needs_review`.
> - No Elo/VPM behavior changes: newly ingested matches stay out of rating
>   computation until the display policy (Phase 0.4) and research integration (E3)
>   explicitly opt them in.

### E3 — Research integration (tiered modeling)

**Prompt:**

> In `research/ratings`, integrate the expanded event data into the research snapshot
> and models as a new experiment version:
> - Extend `snapshot.py` to include the new events with tier/event_type/LAN/showmatch
>   metadata (showmatches excluded; pre-2023 archive-tier data excluded by default).
>   Add tier fields to the snapshot manifest and audit.
> - Team model: tier-2 opponents enter the same rating pool; add a per-tier
>   observation weight (searched over {0.25..1.0} on the development folds) so the
>   model learns how predictive each environment is of VCT results rather than
>   pooling equally. Game Changers matches participate in the pool but note the
>   connectivity caveat: GC anchors to T1/T2 only through GC appearances in T2
>   events, so report the cross-ladder uncertainty rather than presenting GC-vs-T1
>   gaps as calibrated.
> - Player model: ensure tier is part of `event_context`, and add a tier-level effect
>   term so tier-2 box stats don't inflate ratings (stat-padding against weaker
>   opposition must be absorbed by the tier/opponent terms).
> - Report the effect on data sparsity (`data_sparsity.json`: median player-agent and
>   player-map-agent support before/after) and on development log loss for both team
>   and player models. Gate any promotion through the standard protocol.

## Workstream F — Patch calendar, balance-change ledger, and agent metadata

**Goal:** a patch calendar joined to matches at the match level, a structured
balance-change ledger extracted from patch notes, and effective-dated agent trait
vectors. Descriptive analytics first, extrapolation-borrowing later.

**Design decisions (July 2026):**

- **Three separate stores, never conflated:** `patches` (the calendar: id, live
  date), `patch_changes` (the ledger: what changed), and **match → patch** (which
  patch each match was actually played on). Events freeze on older patches for
  tournament fairness, so model joins always go through match → patch; calendar-date
  inference is only a flagged fallback.
- **Deltas, not levels.** Patch notes record changes, so an ability that never
  changed has no value anywhere in the archive. Change-points and deltas are the
  modeling signal; an absolute `ability_stats_asof` table is a *later derived
  artifact* (seed current levels from the CC-BY-SA wikis, replay the ledger from
  there) — not a curation prerequisite.
- **One pipeline, several outputs.** The same notes contain agent changes, weapon
  tuning, and map-pool rotations ("Summit IN, Fracture OUT") — the rotation records
  are the authoritative feed for `config/map_pools.json`, which Workstream C needs.
- **`change_class` is annotation, not fact.** Buff/nerf/rework/semantic direction is
  a judgment call stored separately from the raw old/new numbers. Semantic-only
  changes (audio, VO) get a category tag and no numbers — near-zero modeling value,
  minimal effort.

### F0 — Patch calendar and match-level patch join

**Prompt:**

> In `research/ratings`, build the patch calendar and the match-to-patch join:
> 1. Expand `config/patches.json` into a complete calendar of VALORANT patches from
>    2023-01-01 to present (schema: patch id e.g. "13.00", live date, notes source
>    URL, episode/act). Source the list from the CC-BY-SA wiki patch index.
> 2. Add a match-level patch resolution step to `snapshot.py`: use the observed
>    per-match patch field from the production DB where present (captured by the
>    scraper — see Workstream E2), else infer as the latest patch whose live date is
>    ≥14 days before the event start, and record `patch_source` = 'observed' |
>    'inferred' on every map row.
> 3. Feed the resolved match-level patch into the player model's `patch` column
>    (replacing date-based/`__UNKNOWN_PATCH__` handling) and expose patch boundaries
>    to the team-model configs (Workstream C reads `config/patches.json` for
>    readiness resets).
> 4. Tests: a match played during a tournament frozen on the prior patch must resolve
>    to the prior patch when observed data says so, and must be flagged 'inferred'
>    when it does not.

### F1 — Balance-change ledger extraction

**Prompt:**

> Build an LLM-assisted extraction pipeline that turns VALORANT patch notes (~150
> documents, sourced from the CC-BY-SA wiki mirrors) into a structured ledger at
> `research/ratings/config/balance_changes.json`:
> 1. Record schema: patch id, `subject_type` ('agent_ability' | 'weapon' | 'map' |
>    'system'), subject (agent/weapon/map name), ability (nullable), property,
>    old_value, new_value, unit, `change_class` ('buff' | 'nerf' | 'rework' |
>    'semantic' — stored as annotation, distinct from the numeric fields), and
>    `raw_text` (the verbatim note line(s), for provenance and future NLP on dev
>    commentary).
> 2. Map-pool rotation lines emit dedicated records (`subject_type` 'map', property
>    'competitive_pool', new_value in/out) and a script regenerates
>    `config/map_pools.json` from them.
> 3. Extraction: fetch each notes document, run LLM extraction against the schema,
>    validate quantified records with regexes for the "from X to Y" and "X >>> Y"
>    phrasings (a quantified record failing regex cross-check is flagged, not
>    dropped).
> 4. Review workflow: emit a per-patch review file (markdown or CSV) showing every
>    extracted record beside its raw text; the maintainer reviews and marks approval;
>    only approved records enter the canonical JSON. The pipeline must be idempotent
>    and re-runnable for new patches going forward.
> 5. Loader in `metadata.py`: changes-in-window and per-agent change-magnitude
>    queries (e.g., count/sum of quantified changes touching an agent in patch P),
>    with schema validation and tests.

### F2 — Model integration of patch features

**Prompt:**

> With F0 and F1 in place, wire patch information into the research models as a new
> experiment version:
> 1. Player model: confirm `patch_effect` now keys on the resolved match-level patch
>    (F0) and measure the development-fold effect of the improved join.
> 2. Team model (Workstream C challenger): replace the flat patch-boundary reset with
>    a magnitude-aware one — readiness shrink scales with the per-agent/aggregate
>    change magnitude from the F1 ledger (a patch touching five sentinels is a larger
>    meta shock than a VO update; both currently look identical). Search the
>    magnitude scaling as part of C's grid.
> 3. Evaluate through the standard rolling protocol and gates; report whether
>    magnitude-aware resets beat flat resets.

### F3 — Descriptive balance-impact notebook

**Prompt:**

> Create `notebooks/08_balance_impact.ipynb` over the F1 ledger and the snapshot
> data: for each quantified agent change, plot the agent's pick rate and (secondary)
> win rate by map for K matches before/after the patch reached competitive play
> (using the match-level patch join from F0, not the live date). Render the caveats
> in the notebook itself: patches bundle multiple changes, win rates are
> equilibrium-adjusted — pick rate is the sensitive instrument. No causal claims.

### F4 — Agent trait vectors (unchanged scope, later)

**Prompt:**

> Create `research/ratings/config/agent_traits.json`: effective-dated records per
> agent with role and a mechanics vector — information/reveal, flash/suppress,
> smoke/vision-control, entry-movement, stall/trap, heal, damage-utility, ultimate
> function/cost class — values 0–2 intensity, `effective_from` dates so reworks
> change the vector over time. Loader + validation in `metadata.py` with tests.
> Later (separate task, do not build now): use trait-vector similarity instead of
> the four Riot roles as the borrowing structure for unseen player–agent cells.

## Workstream G — Familiarity penalty from natural experiments

**Goal:** replace "unseen player–agent shrinks to zero offset" with an empirically
estimated unfamiliarity prior. Depends on E (tier-2 data multiplies the number of
observed agent debuts).

**Estimand note:** an official-match debut is not a cold start — players practice the
agent in ranked/scrims before teams field it. That hidden practice is not a confound
here; it is part of the estimand. The forecast we score is conditional on the team
choosing to field the player on the agent, and that choice only happens post-practice,
so debuts measured with hidden practice included are exactly the right natural
experiment for the predictive model. Consequence: the penalty may plausibly be near
zero. That outcome is informative, not a failure — it would validate the current
zero-offset shrinkage as a conditional forecast and localize the "Neon best Sova"
problem entirely to presentation (Workstream A). The truly cold "forced onto an
unpracticed agent" counterfactual remains unidentifiable and is only ever published
as the flagged forced-counterfactual view.

**Prompt:**

> In `research/ratings`, extend `natural_experiments.py` and the player model to
> estimate and use an **agent-unfamiliarity penalty**:
> 1. Identify agent-debut episodes in the training data: a player's first N
>    competitive maps on an agent (N=5), optionally stratified by whether the debut
>    crosses roles (duelist→initiator etc.) using `config/agent_traits.json` roles.
>    Only use episodes where the player had ≥20 prior maps on other agents.
> 2. Estimate the debut penalty: the average shortfall of debut-map components
>    (and box VPM) relative to the model's counterfactual prediction for that
>    player-map with the player's established agents, out-of-fold within the rolling
>    protocol. Report same-role vs. cross-role penalties with bootstrap intervals.
> 3. Use it as a prior: in `HierarchicalPlayerModel.forecast`, when the
>    `player_agent` cell has zero/low support, shrink the forecast toward
>    (player_state + agent_effect + estimated_debut_penalty[role_distance]) instead of
>    toward zero offset, with the penalty fading as observed support accumulates.
>    The penalty must be estimated from the training fold only.
> 4. Evaluate on the real switch events themselves: held-out prediction error on
>    debut maps vs. the current zero-offset behavior. This directly answers Codex's
>    hypothesis 2 ("do role proficiency and agent familiarity improve predictions
>    during real agent and role switches?"). Run as a new experiment version with the
>    standard gates; report in the model-selection format.

---

# Phase 3 — Blocked on GRID entitlement

## Workstream H — Round-level economy model, tempo, and "kill shots"

Sequence once data lands (each step is its own task; H1 is the foundation):

- **H1 — Round-level snapshot + economy win-probability model.**
  P(next-round win | strength, score, side, economy/loadout, ult state, survivors).
  This is the base layer everything else conditions on. Validate with round-level
  log loss and calibration by economy state.
- **H2 — Tempo/style features.** Not average round duration; per Codex: time to first
  contact/utility, map-space take timing, execute/plant timing, retake/rotation
  timing, default duration — conditioned on map, side, economy, score. Test as
  matchup-interaction features (attack tempo vs. defense response style) in the map
  forecast.
- **H3 — Kill shots / leverage runs.** Define runs as sequences producing
  substantially more cumulative win probability than H1 predicted from state — not a
  fixed round count. Outputs: full-buy break rate, anti-eco/bonus conversion,
  economy-break recovery, run creation/prevention. Expectation to test: most apparent
  momentum is explained by credits and ult cycles; any repeatable residual is the
  interesting part.

Prompts for H should be written after the actual GRID schema is known (0.1).

---

# Sequencing summary

| Order | Workstream | Depends on | Type |
| --- | --- | --- | --- |
| now | A — player-agent publication fix | nothing | code |
| now | B — VPM signal audit | nothing | code/analysis |
| now | C — transient map readiness | nothing | code |
| now | D — veto rebuild | C helps but optional | code |
| now | E0 — events table migration | nothing | code |
| after E0 | E2 phase 1 — EWC/mid-season backfill | E0 | code |
| after E0 | E1 — team auto-resolution | E0 | code |
| after E1 | E2 phases 2–4 — pre-season, Challengers, GC | E1 | code |
| after E2 ph.3 | E3 — research tiered integration | Challengers data | code |
| now | F0 — patch calendar + match-patch join | E2 patch capture helps, not required | code |
| now | F1 — balance-change ledger extraction | wiki source (decided in 0.3) | code + your review pass |
| after F0+F1, with C | F2 — magnitude-aware patch features | F0, F1, C | code |
| after F1 | F3 — balance-impact notebook | F1, F0 | code |
| after taxonomy (0.3) | F4 — agent trait vectors | taxonomy decision | external + code |
| after E3 | G — familiarity penalty | E (more debut episodes) | code |
| after 0.1 | H — economy/tempo/kill shots | GRID access | external + code |
| anytime | pre-2023 archive ingestion (0.2 item 5) | E0, E1 | code, low priority |
| never (for now) | Tier 3 ingestion | — | excluded |

A and B change what you publish and are cheap; C and D test the two precise hypotheses
both reviews converged on; E is the biggest data lever you control today; G is the
real fix for "Neon best Sova"; H is the ceiling-raiser.
