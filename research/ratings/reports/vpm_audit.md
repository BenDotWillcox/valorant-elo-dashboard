# VPM signal audit: a real scale bug, but an empirical predictive ceiling

## Technical summary

The published v1 Predictive Box VPM had two clear implementation bugs: a
normalized round-margin fraction was labeled as rounds per 24 without the
required `×24` transform, and future labels were admitted by source-row time
instead of label-availability time when scoring OOF Box rows (while training
over-applied the label gate to already-observed component rows). Both are fixed
in code and isolated from the immutable v1 artifacts. Neither bug explains the
near-zero predictive signal. Under a corrected rolling 2024–2025 refit,
observed target SD is 6.162
rounds per 24, predicted SD is 0.270, correlation is 0.0385
(`correlation² = 0.00149`), and conventional out-of-sample R² is 0.00034.

The prior and ridge audits also do not identify a material repair. Interaction
effects are heavily shrunk at median support, but the best of 12 prior settings
changes Box MAE by only -0.00072 rounds per 24, has a map-clustered 95% interval
that crosses zero, worsens Box log likelihood, and worsens all seven component
MAEs. Changing ridge alpha or fitting an identifiable player-row alternative
is similarly immaterial. The defensible conclusion is therefore an empirical
ceiling in this tested **feature-to-future-team-result association and
protocol**, not a theoretical ceiling or a universal ceiling on player
evaluation.

No prior or alpha is promoted. Publication now keeps the raw rounds-per-24
association and adds an empirical development-referenced z-score for each
view. A 0.1 z-score gap is explicitly one tenth of the applicable reference SD,
not evidence of a practically important player gap.

## Resolved target and unit chain

On the real snapshot, v1 explicitly selected `next_lineup_round_margin`. The
name was inaccurate: 11.96% of scored player rows had a changed match player
set in the target match. Restricting to unchanged-player-set rows only raises
correlation to 0.0467, so lineup churn is not the main explanation.

| Stage | Correct meaning | Unit |
|---|---|---|
| Map label | signed `(winner_rounds - loser_rounds) / total_rounds` for the player's team | normalized-margin fraction |
| Team-match label | arithmetic mean over maps in the same team-match | normalized-margin fraction |
| Future label | that team's next match-average, now named `next_team_match_normalized_round_margin` | normalized-margin fraction |
| Model/display transform | multiply fitted labels, OOF observations, predictions, SDs, and intervals by 24 | signed rounds per 24 |

V1 used a misleading `team_round_margin` alias, shifted it under the
`next_lineup_round_margin` name, left `target_multiplier_=1`, and nevertheless
claimed `output_unit_="rounds_per_24"`. Observed and predicted values were still
on the same internal fraction scale, so the bug explains the 24× unit error but
cannot change correlation, coverage, or R². The corrected chain is documented
in [`player.py`](../src/valorant_ratings/player.py) and built in
[`features.py`](../src/valorant_ratings/features.py).

The fold gate now uses the next match's `match_completed_at` when available and
fails closed if a rolling future-target fit lacks `target_observed_at`. In this
frozen snapshot, completion time equals the stored series anchor for every
non-null target, so that timestamp clarification changes zero fold assignments.
It does prevent future snapshots from silently leaking by match-start time.

## Corrected OOF diagnosis

| Triple-ablation Box diagnostic | Published v1 | Corrected refit |
|---|---:|---:|
| OOF player-label rows | 23,665 | 20,195 |
| Observed SD | 0.2589 fraction | 6.1622 rounds/24 |
| Predicted SD | 0.01163 fraction | 0.27028 rounds/24 |
| Correlation / correlation² | 0.0406 / 0.00165 | 0.0385 / 0.00149 |
| Conventional OOS R² | 0.00095 | 0.00034 |
| MAE | 0.21219 fraction | 5.04793 rounds/24 |
| Raw 80% interval coverage | 0.3233 | 0.3212 |
| 2025 post-hoc SD inflation for 80% coverage | 2.976× | 2.980× |

V1 scored 3,470 rows whose future label was not observable before the fold's
validation end, including 580 labels first available in 2026. Merely removing
those rows from the old predictions leaves correlation 0.0373 and conventional
R² 0.00017. The corrected refit also stops hiding already-observed component
rows just because their future target was unavailable. Its result remains the
same near-zero ceiling. Published-v1 evidence is preserved in
[`player_oof.parquet`](../artifacts/ratings-development-v1-full/predictions/player_oof.parquet);
the corrected default OOF is in the versioned prior-sweep experiment below.

The component layer is not uniformly signal-free: corrected OOF correlations
range from 0.061 for first-duel win rate to 0.614 for first-duel attempt rate
(APR is 0.602; ADR is 0.328). The tested bottleneck therefore appears
downstream, in the bridge from noisy individual box components to one future
team result shared by all five players, rather than in every component model.

## Shrinkage audit

For each effect, the fitted retention factor is `W / (W + prior)`, where `W`
is the sum of 120-day half-life weights. Across 1,474 median player-fold
contexts:

| Term | Median raw support | Median decayed W | Prior | Retention |
|---|---:|---:|---:|---:|
| `player_state` | 37 | 15.9986 | 14 | 0.5333 |
| `player_agent` | 3 | 1.6864 | 35 | 0.0460 |
| `player_map` | 3.5 | 1.5430 | 35 | 0.0422 |

The required 12-setting sweep crossed
`player_state ∈ {3, 7, 14, 30}` with `player_agent ∈ {10, 35, 80}`, holding
`player_map=35` and `alpha=8`. The loosest `3/10` setting raises median state
retention to 0.842 and player-agent retention to 0.144. Its Box MAE improves by
only 0.000723 rounds per 24 (0.0143%), with map-clustered 95% CI
`[-0.001304, 0.000095]`; Box log likelihood worsens by 0.0535 and all seven
component MAEs worsen by 0.15%–0.55%. All seven component log likelihoods do
improve (equal-component mean +0.01196 nats per row), so the loose setting
trades slightly better Gaussian log score/distributional fit for uniformly
worse point errors and worse Box likelihood. The smallest aggregate
component-MAE change,
at `14/80`, is only -0.0162% and worsens component likelihood and Box MAE. Full
results and independent recomputation are in
[`prior_sweep_summary.csv`](../artifacts/vpm-audit-prior-sweep-v2/prior_sweep_summary.csv),
[`paired_comparisons.csv`](../artifacts/vpm-audit-prior-sweep-v2/paired_comparisons.csv),
and [`validation.json`](../artifacts/vpm-audit-prior-sweep-v2/validation.json).

## Ridge and aggregation audit

| Design | Alpha | Box MAE | Mean log likelihood | Predicted SD | Correlation² |
|---|---:|---:|---:|---:|---:|
| Existing team mean | 2 | 5.04815 | -5.51206 | 0.27845 | 0.00140 |
| Existing team mean | 8 | 5.04793 | -5.56685 | 0.27028 | 0.00149 |
| Existing team mean | 32 | 5.04729 | -5.72291 | 0.24611 | 0.00177 |
| Player row, team-balanced | 8 | 5.04621 | -6.38633 | 0.10477 | 0.00476 |

Alpha 2 slightly improves likelihood but worsens MAE by 0.00023; alpha 32
slightly improves MAE by 0.00064 but materially worsens likelihood and further
compresses predictions. The player-row alternative improves MAE by 0.00172,
with team-map-clustered 95% CI `[-0.00645, 0.00295]`, while worsening likelihood
by 0.819 and shrinking predicted SD further. Strict within-team-map centering is
unidentifiable because every player has the same target: the centered component
columns are orthogonal to that shared label. Detailed results are in
[`audit_summary.json`](../artifacts/vpm-audit-ridge-v3-corrected/audit_summary.json)
and [`diagnostic_addendum.json`](../artifacts/vpm-audit-ridge-v3-corrected/diagnostic_addendum.json).
That experiment's metadata retains the legacy target name
`next_lineup_round_margin`; its values are the exact compatibility alias of the
canonical next-team-match column and use the corrected `×24` multiplier.

## Honest publication scale and decision

The new scoring schema publishes, side by side:

- `performance_rounds_per_24`: the raw association, with `performance_mean` kept
  as a compatibility alias in the same unit;
- `performance_z_score`: `(raw - view_reference_mean) / view_reference_sd`;
- raw and z-scaled uncertainty and interval columns.

Reference SDs are 0.2646 for map-agent, 0.2649 for map, 0.2576 for agent, and
0.2439 for overall views. They are distributions of OOF predicted
`performance_mean`, arithmetically aggregated over the contexts actually
observed in the corrected 2024–2025 development population. They do not
reconstruct the current active-map weighting or agent-selection probabilities;
that limitation is encoded in the reference metadata and notebook explanation.
See [`performance_display_reference.json`](../artifacts/vpm-audit-display-reference-v1/performance_display_reference.json)
and the implementation in [`scoring.py`](../src/valorant_ratings/scoring.py).
The verified digest-qualified publication bundle contains 52,088 conditional
player rows with finite z-scores and exact raw/compatibility-alias agreement;
see its [`manifest.json`](../artifacts/ratings-development-v1-full__rating-snapshots-v5-ref-360cce8a5872/manifest.json)
and [`publication_config.json`](../artifacts/ratings-development-v1-full__rating-snapshots-v5-ref-360cce8a5872/publication_config.json).

Decision: retain `player_state=14`, `player_agent=35`, `player_map=35`, and
`alpha=8`. Treat VPM as a weak, associational display layer rather than a
decision-grade forecast or causal player value. The corrected prior-sweep and
ridge experiments, plus the display reference, all use new immutable
experiment IDs; the published v1 artifacts were not rewritten. Remaining
caveats are seven non-empty quarterly folds, a fixed player-map prior, and no
multiplicity adjustment for selecting the best of 12 prior settings (whose
interval already crosses zero). Target horizons also vary substantially across
team-matches:
median 6 days, 90th percentile 44.05 days, and maximum 197.83 days.
