# ValoMapped review reconciliation

Last audited: July 10, 2026

## Status

All seven backlog items and the associated source-confirmed risks are implemented or explicitly
reconciled in the current worktree. The local implementation is not yet the live product: the
changes remain uncommitted on `main`, and `https://valomapped.com/` was still serving the old build
at the time of this audit. Deployment and a post-deploy live smoke are therefore the remaining
release gate, not an unimplemented product requirement.

## Backlog matrix

| Item | Local status | Authoritative evidence |
| --- | --- | --- |
| VM-01 temporal backtest | Implemented and reproducible | `lib/elo/backtest.ts`, `scripts/run-elo-backtest.ts`, `scripts/verify-elo-backtest.ts`, `data/elo-backtest-db-snapshot.json`, `public/data/elo-backtest.json`, and `/methodology` |
| VM-02 Elo invariants | Implemented and directly tested | `lib/elo/elo-calculator.ts`, `tests/unit/elo-calculator.test.ts`, and `tests/integration/elo-prediction-pipeline.test.ts` |
| VM-03 quality/CI contract | Implemented locally | `package.json`, `.github/workflows/ci.yml`, and the quality-gate section of `README.md` |
| VM-04 landing media | Implemented and measured locally | `components/feature-video.tsx`, `scripts/accessibility-smoke.ts`, and `docs/performance/vm04-media-audit.md` |
| VM-05 semantics/accessibility | Implemented and smoke-tested | `app/layout.tsx`, `app/page.tsx`, prediction controls, and `scripts/accessibility-smoke.ts` |
| VM-06 methodology/freshness | Implemented locally | `components/data-methodology-panel.tsx`, `app/api/data-methodology/route.ts`, `app/methodology/page.tsx`, ETL telemetry, and `docs/operations/etl-telemetry-rollout.md` |
| VM-07 alternative models | Implemented as a validation-stage comparison | The `experiments` section of `public/data/elo-backtest.json` and the VM-07 comparison on `/methodology` |

## Confirmed bug and risk reconciliation

- Elo rejects tied or reversed scores, fractional or negative scores, non-finite ratings and
  configuration, non-positive rating scale, negative K, and negative margin scale. Tests cover
  zero-sum updates, margin monotonicity, upset response, and K scaling.
- The aggressive production update is public rather than implicit: at equal 1000 ratings, the
  current formula moves both teams about 86.3 points after 13–11 and 114.8 after 13–0. The temporal
  evidence does not establish those magnitudes as superior.
- The application has one root `main`; landing CTAs render as single anchors through `Button
  asChild`; prediction team, match-type, and map comboboxes have useful accessible names. Axe and
  keyboard smoke tests cover the resulting DOM.
- All ten landing videos defer posters and sources until near the viewport, use
  `preload="metadata"`, separate loading from visibility-based playback, pause offscreen, and never
  attach MP4 sources under reduced motion.
- Product copy now describes daily ingestion and on-demand projections, not a streaming or
  real-time feed.
- Package scripts expose lint, `tsc --noEmit`, unit/integration tests, thresholded coverage,
  artifact verification, production build, and accessibility smoke. CI runs that contract for pull
  requests and pushes to `main`.

## Model evidence and boundaries

The map-Elo report uses 3,818 accepted maps from February 13, 2023 through June 21, 2026:

- Train: 1,799 maps / 712 series.
- Validation: 1,184 maps / 464 series.
- Chronological test: 835 maps / 319 series, beginning September 12, 2025.

It publishes plain overall-team Elo and 0.5 references, Brier score, log loss, accuracy, ECE,
ten-bin reliability values and plot, confidence-band accuracy with Wilson intervals, sample size by
map, and deterministic series-block bootstrap intervals and paired deltas.

The exact production behavior frozen in repository commit
`2f134f187c0717dbfcf18b1a07c4eccbef94dcdb` before the chronological test is reconstructed with
update scale 2000, forecast scale 1000, K=74, production MOV scale 1, and a hard annual reset. Its
Git source blobs are content-addressed in the report. On the 835-map test:

- Frozen production Brier: 0.256630; plain Elo: 0.251257.
- Paired Brier delta: +0.005372, 95% CI -0.005171 to +0.015983.
- Frozen production log loss: 0.708396; plain Elo: 0.699211.
- Paired log-loss delta: +0.009185, 95% CI -0.013283 to +0.032517.

This is a retrospectively out-of-sample comparator because its code predates the test. It does not
prove that the original undocumented K/scale/MOV search was itself leakage-free, and repeated access
means the period is no longer an untouched prospective holdout. A future adoption decision requires
a pre-frozen rule and a new untouched period or rolling-origin confirmation.

VM-07 publishes 14 validation-only variants covering annual season carry, a strictly prior
last-observed roster proxy, three cold-start uncertainty priors, and four MOV rules. The eight-game
cold-start prior is the best experimental map-Elo candidate by validation log loss; plain Elo scores
better than it on validation, so it is not described as the best model overall. No experimental
result changes production automatically.

## Pick/ban evidence and data quality

The separate observational veto study rebuilds ordered vetoes from source rows and never consumes
legacy derived analysis. Ratings use a strict completion-time cutoff proxy, exclude every rating
produced by the target series, reset across UTC calendar years, and use an explicit 1000 cold start.
The current snapshot contains 9,748 rating rows. All 2,112 rows without a source match are exact
1000-point January 1 00:00:00 UTC hard resets; zero fall outside that signature. Snapshot generation,
replay, the live query, and the derived-table processor fail closed on an unauditable source-less
row.

The production derived table was atomically rebuilt with 8,953 rows from 1,492 valid matches. Three
malformed source matches were excluded with explicit reasons. On the 310-match holdout, the
lower-regret team won 52.2% of 291 non-tied matches (event-cluster 95% CI 47.3%–57.3%). Adding veto
regret worsened Brier by +0.0025 in the point estimate (95% CI -0.0059 to +0.0118). Neither result
provides incremental predictive evidence, and the report makes no causal coaching claim.

## Freshness and source-coverage boundary

The landing panel distinguishes stored map coverage, the last successful ingestion step, the last
fully successful pipeline, the latest failed/running step, deployed and evaluated model versions,
retrospective evaluation date, and the explicit status `Calibration: Not calibrated`. ETL run
history records per-step status, duration, failure, and error. The public limitations state that
database counts cannot measure matches absent from the upstream source records or ingestion
results.

## Verification contract

Run from the repository root:

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

For CI-equivalent accessibility evidence, do not run `next dev` and `next build` concurrently in the
same `.next` directory. Stop the preview, run build then accessibility smoke, and restart the preview
afterward.

## Release gate

Before marking the review reconciled on the live product:

1. Commit the intended worktree on a review branch and push it.
2. Let the deployment complete.
3. Verify live one-main/single-anchor semantics, accessible combobox names, deferred media,
   reduced-motion behavior, `/api/data-methodology`, `/methodology`, and both published JSON files.
4. Confirm a post-deploy scheduled or manual ETL run creates telemetry and the panel displays its
   successful ingest/pipeline timestamps or an explicit failure state.
5. Repeat three cold Lighthouse runs against the HTTPS deployment and retain the raw reports if the
   performance evidence will be used externally.
