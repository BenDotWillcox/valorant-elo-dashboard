# Valorant ELO Dashboard

A comprehensive analytics platform for Valorant Champions Tour (VCT) data, featuring custom Elo rating systems, match predictions, and in-depth statistical analysis.

## 🎯 Features

### Core Analytics

- **Team Rankings** - Map-specific Elo ratings for all VCT teams
- **Match Predictions** - Win probability calculations with custom map pools
- **Player Ratings** - Individual player performance metrics and progression tracking
- **Map Pool Analysis** - Compare team strengths across different maps

### Advanced Insights

- **Pick & Ban Analysis** - Strategic map selection patterns and trends
- **Elo History** - Interactive charts showing team performance over time
- **Tournament Simulations** - Monte Carlo simulations for VCT tournaments
- **Record Book** - Historical achievements, streaks, and statistical records

### Data Visualization

- Interactive charts and graphs using Chart.js and Recharts
- Historical data exploration with interactive filtering
- Responsive design with dark/light mode support
- Video previews for each feature section

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, Radix UI components
- **Database**: PostgreSQL with Drizzle ORM
- **Data Processing**: Custom Elo algorithms, statistical analysis
- **Visualization**: Chart.js, Recharts, Framer Motion
- **Historical Data Processing**: Stored VCT match records with a paused import pipeline

## 📊 Data Processing

### Elo Rating System

The platform uses a custom Elo rating system with the following features:

- **Map-specific ratings** - Separate Elo ratings for each Valorant map
- **Margin of victory** - Accounts for score differential in rating changes
- **Configurable parameters** - K-factor, rating scale, and margin scaling
- **Initial rating**: 1000 points per map

### Reproducible model evaluation

The published temporal backtest is available at `/methodology` and as machine-readable JSON at
`/data/elo-backtest.json`. It uses a SHA-256-verified source snapshot of 3,818 maps from
February 2023 through June 2026.

Replay the full analysis without database credentials:

```powershell
npm run model:backtest
```

Refresh the snapshot from PostgreSQL/Supabase using a read-only transaction, then rerun the analysis:

```powershell
npm run model:backtest:db
```

The retrospective split trains before 2025-01-01, selects one challenger from the experimental
map-Elo grid on validation data before 2025-09-01, and then computes a chronological test period.
Fixed references are not eligible for that selection and may score better. The runner enforces that ordering within
each execution, but the study was not prospectively preregistered and the test period is not an
untouched future holdout. Results include a plain-Elo baseline, 0.5
reference, Brier score, log loss, reliability bins, confidence-band accuracy, map sample sizes,
block-bootstrap confidence intervals, and comparisons of season carry, last-observed roster
regression, cold-start uncertainty, and alternative margin-of-victory scaling. The runner never
changes production model parameters. The artifact records its analysis timestamp, snapshot and
source hashes, Git commit, dirty-worktree state, evaluated model version, and extraction scope.

The final comparison also reconstructs the production behavior at repository commit
`2f134f187c0717dbfcf18b1a07c4eccbef94dcdb` (2025-08-26), before the chronological test began.
That version used initial rating 1000, update divisor 2000, K=74, production margin scale 1, and a
hard annual reset, while its forecast code separately used divisor 1000. The artifact records the
three historical source paths and Git blob IDs so this comparator is content-addressed. It is an
externally frozen, retrospective out-of-sample comparator for later rows; it does not prove the
original parameter selection was leakage-free or restore an untouched holdout after results have
been viewed.

On the current 835-map chronological test, the frozen historical production comparator recorded
Brier 0.2566 versus 0.2513 for plain Elo (paired difference +0.0054, 95% block-bootstrap interval
-0.0052 to +0.0160; positive is worse) and log loss 0.7084 versus 0.6992 (paired difference
+0.0092, interval -0.0133 to +0.0325). Neither interval excludes zero. Validation selected
`cold-start-prior-8` only among 14 experimental map-Elo candidates; plain Elo itself had lower
validation log loss (0.6815 versus 0.6899).

### Reproducible pick/ban outcome evaluation

The separate pick/ban backtest asks whether model-aligned veto choices carry outcome signal beyond
the map strengths already selected. It never reads the legacy `match_veto_analysis` rows. Instead,
it rebuilds each match from ordered vetoes, played maps, and map-Elo ratings frozen strictly before
the recorded match timestamp, with explicit 1000-point cold starts and target-match rating
exclusion. The database snapshot uses `matches.completed_at` as that cutoff proxy because match
start time is not stored.

Rating rows without a source match are accepted only when they exactly match the documented season
hard-reset signature: rating 1000 at January 1 00:00:00 UTC. The current snapshot contains 2,112
such resets and zero source-less rows outside that signature. Snapshot generation and replay fail
closed if an outside row appears, because excluding ratings produced by the target series cannot
otherwise be proven.

Replay the checked-in snapshot without database credentials:

```powershell
npm run model:pick-ban
```

Refresh the source snapshot through a repeatable-read, read-only database transaction:

```powershell
npm run model:pick-ban:db
```

Results are published at `/data/pick-ban-backtest.json` and summarized on `/methodology`. The same
calendar split is used: train before 2025-01-01, validation before 2025-09-01, then the final
holdout. The artifact compares neutral, mean-map plug-in, selected-map, calibrated selected-map,
and calibrated selected-map-plus-regret forecasts; it also reports model-regret association bands,
clustered uncertainty, exclusions, and cold-start coverage. This is retrospective observational
evidence. Banned-map outcomes and unchosen veto sequences are counterfactual, so the analysis does
not establish that following the model causes teams to win.

In the current 310-match holdout, the lower-regret team won 52.2% of 291 non-tied matches
(event-cluster 95% interval: 47.3% to 57.3%). Adding relative regret to the calibrated selected-map
forecast changed Brier score by +0.0025 (95% interval: -0.0059 to +0.0118; positive is worse).
Both intervals cross their null values, so this run provides no incremental predictive evidence for
the veto-regret score.

The landing-page media optimization is documented in
[`docs/performance/vm04-media-audit.md`](docs/performance/vm04-media-audit.md), including mobile
Lighthouse, request, transfer-byte, reduced-motion, and measurement-limit evidence.

Production rollout for the ETL freshness history is documented in
[`docs/operations/etl-telemetry-rollout.md`](docs/operations/etl-telemetry-rollout.md). Use the
targeted migration path in that runbook; production Drizzle history must be reconciled before any
general `db:migrate` run.

## Quality gates

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run model:verify
npm run model:pick-ban:verify
npm run build
npm run test:a11y
```

Pull requests and pushes to `main` run these checks in `.github/workflows/ci.yml`.
`model:verify` performs a fresh offline replay and checks the published analytical sections plus
snapshot, source, and configuration provenance. Run timestamps intentionally differ and are not
compared. The manifest's Git commit, tree state, and capture time describe the original run; the
verifier instead checks the canonical source hash so the artifact remains valid after those exact
files are committed on a new revision.
`model:pick-ban:verify` applies the same contract to the pick/ban snapshot and outcome artifact.

## 🏗️ Project Structure

```
valorant-elo-dashboard/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── rankings/          # Team rankings page
│   ├── predictions/       # Match predictions page
│   ├── player-ratings/    # Player analytics page
│   ├── teams/            # Team profiles
│   └── ...
├── components/           # Reusable React components
│   ├── ui/              # Radix UI components
│   ├── charts/          # Data visualization components
│   ├── filters/         # Data filtering components
│   └── ...
├── db/                  # Database configuration and schemas
│   ├── schema/          # Drizzle schema definitions
│   ├── queries/         # Database query functions
│   └── migrations/      # Database migration files
├── lib/                 # Utility libraries
│   ├── elo/            # Elo rating calculations
│   ├── predictions/    # Match prediction algorithms
│   └── simulation/     # Tournament simulation logic
├── scripts/            # Data processing and migration scripts
├── types/              # TypeScript type definitions
└── public/             # Static assets (images, videos)
```

## 📈 Key Algorithms

### Elo Rating Calculation

```typescript
// Map-specific Elo with margin of victory
const expectedProbability =
  1 / (1 + Math.pow(10, (loserRating - winnerRating) / ratingScale));
const marginFactor = marginScale * Math.log(5.95 * Math.sqrt(scoreDiff + 1));
const eloChange = kFactor * marginFactor * (1 - expectedProbability);
```

### Match Prediction

- Uses current Elo ratings to calculate win probabilities
- Supports custom map pools for tournament simulations
- Accounts for map-specific team strengths

### Tournament Simulation

- Monte Carlo simulation engine
- Round-by-round probability calculations
- Support for various tournament formats (GSL, Swiss, etc.)

## 🎮 Supported Data

### Tournaments

- VCT 2023-2026 (Americas, EMEA, Pacific, China)
- International tournaments (Masters, Champions)
- Regional leagues and qualifiers

### Teams & Players

- All VCT franchised teams
- Individual player statistics
- Historical roster changes

### Maps

- All competitive Valorant maps
- Map-specific performance metrics
- Pick/ban analysis and trends

## Data maintenance

Automated external data collection is currently paused. Historical import and ETL tooling remains
in the repository for reproducibility and possible future use, but it should not be run against a
third-party service without explicit authorization.

After applying the latest Drizzle migration, ETL runs persist per-step status in `etl_runs`.
The public methodology panel reports the historical dataset coverage and most recent successful
ingestion separately from full-pipeline health.
