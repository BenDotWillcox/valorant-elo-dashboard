# Predictive and Contextual Valorant Ratings Research

This directory is an isolated, reproducible research workspace. It does not
write to the production database and it does not change the dashboard's Elo or
VPM behavior.

## Research contract

- One canonical row represents each played map; player rows are a child table.
- Every feature is computed from information strictly earlier than the series
  prediction cutoff. Ratings and features are frozen for every map in a series.
- The 2023 season is warm-up, rolling 2024-2025 predictions are development,
  and 2026 is a one-time confirmation lockbox.
- Production Elo and smoothed VPM tables are not model inputs. Elo, player
  states, preprocessing, agent selection, and calibration are rebuilt in each
  temporal fold.
- Conditional and swap estimates are predictive associations, not causal
  claims. Sparse scenarios partially pool and expose wider uncertainty.
- Generated snapshots and artifacts are versioned and hash-manifested but are
  intentionally ignored by Git because they can contain large source extracts.

## Environment

The project pins Python 3.12 and uses `uv`:

```powershell
cd research/ratings
$env:UV_CACHE_DIR=(Join-Path (Get-Location) '.uv-cache')
uv sync --extra dev
```

The database URL is read from the repository `.env.local` only for a read-only
snapshot command. The default cutoff is `2026-06-21T23:59:59Z`.

```powershell
uv run ratings-research snapshot --output data/snapshots/vct_2023_2026_cutoff_2026-06-21_v3
uv run ratings-research audit --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2
uv run ratings-research develop --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2
uv run ratings-research confirm-2026 --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --development artifacts/<experiment-id>
uv run ratings-research score --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --development artifacts/<experiment-id>
uv run ratings-research notebooks --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --development artifacts/<experiment-id>
uv run ratings-research report --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --development artifacts/<experiment-id>
uv run pytest
```

The transient map-readiness challenger is a separate experiment version. It
inherits the promoted carryover pathway, freezes its 2024–2025 selection, and
then opens a distinct one-time 2026 confirmation:

```powershell
uv run ratings-research develop-map-readiness --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --promoted artifacts/ratings-development-v1-full --experiment-id ratings-map-readiness-v1-full
uv run ratings-research confirm-map-readiness-2026 --snapshot data/snapshots/vct_2023_2026_cutoff_2026-06-21_v2 --development artifacts/ratings-map-readiness-v1-full
```

Maintainer-selected sign checks belong in `config/map_form_episodes.json` and
must be declared before inspecting experiment outcomes. An empty fixture is
reported as unevaluated and never affects promotion.

`develop` cannot read 2026 outcomes. `confirm-2026` requires a previously
written development selection manifest, records that the lockbox was opened,
and refuses a second confirmation unless a new experiment version is used.

## Outputs

The pipeline writes versioned Parquet/JSON artifacts under `artifacts/`:

- rolling map and series predictions for every baseline and challenger;
- player component forecasts and Predictive Box VPM weights;
- standardized/global, map, agent, and map-agent ratings;
- demonstrated player-agent rankings plus a separately flagged forced-counterfactual grid;
- scenario comparisons with decomposition, support, and uncertainty;
- veto simulations, matchup matrices, rankings, metrics, bootstrap intervals,
  calibration tables, ablations, and the model-selection decision;
- immutable manifests with code/config/data hashes and prediction cutoffs.

`report` joins the immutable development, one-time confirmation, and v5 scoring
bundles into `reports/final_model_selection_report.md` plus its complete JSON
payload. The report includes the promotion decision, rejected candidates,
conditional support, scenario deltas, rankings, and matchup artifact locations.
When scoring uses an alternate corrected OOF display reference, its immutable
experiment ID carries a `-ref-<digest>` suffix; report and notebook discovery
select the newest matching v5 bundle.

## Interactive rating explorer

`notebooks/07_rating_explorer.ipynb` is an executed, reader-facing playground
for the frozen scoring artifacts. Its first editable cell controls top-N limits,
map/agent/player lookups, the demonstrated/forced-counterfactual player-agent
view, uncertainty penalties, support filters, and minimum predicted agent-use
probability. The notebook defaults to demonstrated cells from the trailing
12 calendar months. Player tables display per-view development-referenced
`performance_z_score` beside the raw `performance_rounds_per_24`; uncertainty-aware
rankings use the matching scale. It also exposes reusable functions
for global and map team rankings, map and agent player leaderboards, and
name-based player profiles.

Open it from this directory so the pinned environment supplies the kernel:

```powershell
$env:UV_CACHE_DIR=(Join-Path (Get-Location) '.uv-cache')
uv run python -m ipykernel install --user --name valorant-ratings --display-name "Python 3.12 (Valorant Ratings)"
uv run jupyter lab notebooks/07_rating_explorer.ipynb
```

In Jupyter or VS Code, select **Python 3.12 (Valorant Ratings)** from the
notebook kernel picker. The explorer stops immediately with a clear message if
another interpreter is selected, which prevents Pandas/PyArrow conflicts from
an unrelated Python installation.

The explorer parameters reshape or filter frozen predictions; changing fitted
Elo or player-model parameters requires a new versioned development and scoring
run.

The public Next.js API and dashboard remain out of scope for this research
package.
