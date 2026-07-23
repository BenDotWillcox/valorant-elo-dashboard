# Predictive and Contextual Valorant Ratings — Model Selection

Promote **carryover** as the displayed rating backbone and **carryover** as the forecast champion.

Generated: 2026-07-16T02:06:20.569909+00:00

## Decision

- Displayed rating backbone: `carryover`
- Forecast champion: `carryover`
- Promotion gates passed: `True`
- 2026 confirmation status: `confirmed-once`

Conditional ratings and agent-swap deltas are predictive associations. They are not causal estimates of what a roster would have achieved under a different strategic choice.

## Data and temporal protocol

| audit_ok | cutoff | data_sha256 | maps | player_maps | veto_actions |
| --- | --- | --- | --- | --- | --- |
| True | 2026-06-21T23:59:59.999999+00:00 | 97e36e8f5eb4c2cfa448adf466a47983094f08593f1b9f9b3a2f4efbc98caef9 | 3818 | 38180 | 10466 |

2023 is warm-up; rolling 2024–2025 predictions select models; 2026 is opened once only after the model and calibration are frozen. All maps in a series share one pre-series state.

## Map forecast performance

| brier | calibration_intercept | calibration_slope | expected_calibration_error | map_log_loss | maps | model | period |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.24203 | -0.00990 | 1.07174 | 0.01180 | 0.67688 | 2376 | carryover | development-2024-25 |
| 0.24690 | 0.02233 | 0.84540 | 0.01481 | 0.68697 | 2376 | blend | development-2024-25 |
| 0.24718 | -0.01494 | 0.52012 | 0.06833 | 0.68966 | 2376 | glicko | development-2024-25 |
| 0.24953 | 0.04163 | 0.50663 | 0.02998 | 0.69238 | 2376 | current_elo | development-2024-25 |
| 0.24997 | 0.41209 | -8.18387 | 0.00395 | 0.69308 | 2376 | constant | development-2024-25 |
| 0.25082 | -0.04184 | 0.48077 | 0.07787 | 0.69605 | 2376 | elastic_net | development-2024-25 |
| 0.25110 | -0.04224 | 0.46713 | 0.07814 | 0.69726 | 2376 | backbone | development-2024-25 |
| 0.25246 | 0.00846 | 0.40520 | 0.06375 | 0.70074 | 2376 | boosted | development-2024-25 |
| 0.24465 | -0.15982 | 1.05022 | 0.04703 | 0.68238 | 747 | carryover | confirmation-2026 |
| 0.24509 | -0.13488 | 0.73778 | 0.04987 | 0.68353 | 747 | backbone | confirmation-2026 |
| 0.24563 | -0.14902 | 1.82114 | 0.03814 | 0.68437 | 747 | elastic_net | confirmation-2026 |
| 0.24586 | -0.09550 | 1.46007 | 0.05154 | 0.68483 | 747 | blend | confirmation-2026 |
| 0.24953 | -0.17142 | 0.92287 | 0.04496 | 0.69220 | 747 | boosted | confirmation-2026 |
| 0.25083 | -0.15793 | 0.42786 | 0.04608 | 0.69500 | 747 | current_elo | confirmation-2026 |

Primary selection uses map log loss. Brier score and calibration intercept/slope are guardrails; paired intervals are clustered by match.

## Series and veto forecasts

| model | series | series_brier | series_log_loss |
| --- | --- | --- | --- |
| carryover_pre_veto | 930 | 0.23145 | 0.65418 |
| carryover_post_veto | 930 | 0.23146 | 0.65421 |

### Veto action forecasts

| choice_log_loss | matches | model | uniform_choice_log_loss |
| --- | --- | --- | --- |
| 1.55608 | 930 | sequential_pooled_veto | 1.42051 |

## Player component forecasts

| ablation | component | extrapolated_rate | interval80_coverage | mae | mean_log_likelihood | observations |
| --- | --- | --- | --- | --- | --- | --- |
| triple | __box_vpm__ | 0.56256 | 0.32326 | 0.21219 | -2.42733 | 23665 |
| triple | adr | 0.54736 | 0.91600 | 27.59052 | -5.04169 | 21370 |
| triple | apr | 0.56288 | 0.93763 | 0.10704 | 0.46558 | 23760 |
| triple | dpr | 0.56288 | 0.92370 | 0.10182 | 0.53573 | 23760 |
| triple | first_duel_attempt_rate | 0.56288 | 0.90059 | 0.08186 | 0.79283 | 23760 |
| triple | first_duel_win_rate | 0.54864 | 0.89604 | 0.24057 | -0.29026 | 20662 |
| triple | kast | 0.54997 | 0.89799 | 0.09054 | 0.69013 | 19950 |
| triple | kpr | 0.56288 | 0.93413 | 0.17386 | -0.00371 | 23760 |

### Player uncertainty calibration

| ablation | calibration_rows | calibration_year | component | raw_calibration_year_coverage | scale | scaled_all_development_coverage | scaled_calibration_year_coverage | target_coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| triple | 12640 | 2025 | __box_vpm__ | 0.28418 | 2.97617 | 0.82100 | 0.80000 | 0.80000 |

The player table reports raw out-of-fold interval diagnostics; published snapshot intervals apply the development-only scale recorded above.

## Conditional interaction ablations

| ablation | component | extrapolated_rate | interval80_coverage | mae | mean_log_likelihood | observations |
| --- | --- | --- | --- | --- | --- | --- |
| triple | __box_vpm__ | 0.56256 | 0.32326 | 0.21219 | -2.42733 | 23665 |
| two-way | __box_vpm__ | 1.00000 | 0.32026 | 0.21220 | -2.47038 | 23665 |
| additive | __box_vpm__ | 1.00000 | 0.31371 | 0.21220 | -2.62065 | 23665 |
| composition | __box_vpm__ | 0.24492 | 0.31595 | 0.21220 | -2.58190 | 23665 |
| player-only | __box_vpm__ | 1.00000 | 0.31916 | 0.21226 | -2.54947 | 23665 |

### Conditional support tasks

| interval80_coverage | mae | mean_log_likelihood | observations | support | task |
| --- | --- | --- | --- | --- | --- |
| 0.33678 | 0.20988 | -2.44679 | 5796 | extrapolated | unseen/cold-start context |
| 0.31385 | 0.20220 | -2.30856 | 3097 | observed | familiar player-map-agent/composition |
| 0.30822 | 0.21521 | -2.69223 | 14772 | partially-pooled | sparse player-map-agent |

An interaction layer is retained only when it improves future observations. Sparse map–agent–composition cells shrink toward parent effects and carry wider intervals.

## Published rating support

| support | rows | players | mean_standard_deviation | median_standard_deviation |
| --- | --- | --- | --- | --- |
| observed | 2748 | 231 | 0.26372 | 0.26373 |
| partially-pooled | 5651 | 240 | 0.26406 | 0.26419 |
| extrapolated | 43689 | 240 | 0.26571 | 0.26571 |

## Scenario comparison audit

| change_type | scenarios | mean_absolute_performance_delta | mean_absolute_win_probability_delta | median_uncertainty_of_delta |
| --- | --- | --- | --- | --- |
| focal_agent | 1680 | 0.00650 | 0.00013 | 0.22096 |
| teammate_agent | 1680 | 0.00000 | 0.00000 | 0.22181 |

## Calibration and interval coverage

| ece | intercept | model | slope |
| --- | --- | --- | --- |
| 0.01180 | -0.00990 | carryover | 1.07174 |
| 0.01481 | 0.02233 | blend | 0.84540 |
| 0.06833 | -0.01494 | glicko | 0.52012 |
| 0.02998 | 0.04163 | current_elo | 0.50663 |
| 0.00395 | 0.41209 | constant | -8.18387 |
| 0.07787 | -0.04184 | elastic_net | 0.48077 |
| 0.07814 | -0.04224 | backbone | 0.46713 |
| 0.06375 | 0.00846 | boosted | 0.40520 |

## Final holdout gates

| baseline | brier_degradation | calibration_slope_degradation | candidate | development_pass | final_holdout_pass | paired_difference | promoted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current_elo | -0.00750 | -0.42163 | carryover | True | True | {'confidence': 0.95, 'lower': -0.026776758628685646, 'mean_difference': -0.015491503060753179, 'resamples': 2000, 'unit': 'match_id', 'upper': -0.011571944076563383} | True |
| current_elo | 0.00157 | 0.03950 | backbone | False | True | {'confidence': 0.95, 'lower': -0.012460468352949524, 'mean_difference': 0.004879940289633601, 'resamples': 2000, 'unit': 'match_id', 'upper': 0.015700303426753257} | False |
| backbone | -0.00419 | -0.37827 | blend | False | False | {'confidence': 0.95, 'lower': -0.018745980895317812, 'mean_difference': -0.010285359936349058, 'resamples': 2000, 'unit': 'match_id', 'upper': 0.002365008998214331} | False |

The paired-difference fields above are the frozen development comparisons; `final_holdout_pass` records the same-direction 2026 confirmation and guardrails.

## Rejected candidates

- `backbone` — development paired-confidence/calibration gate failed
- `blend` — development paired-confidence/calibration gate failed
- `separately identified player contribution` — not promoted without transfer/roster-change prediction lift
- `full-data PyMC finalist` — empirical-Bayes screen runs first; MCMC is gated to finalists that add OOF lift
- `sequential pooled veto` — held-out veto action log loss was worse than uniform legal choice
- `teammate-agent composition interaction` — the composition ablation did not improve future player forecasts; published teammate-agent mean deltas remain zero

## Rankings and matchup artifacts

- player ratings: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\player_ratings.parquet`
- demonstrated player-agent rankings: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\player_agent_ratings_demonstrated.parquet`
- forced player-agent counterfactuals: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\player_agent_ratings_forced_counterfactual.parquet`
- scenario comparisons: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\scenario_comparisons.parquet`
- team ratings: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\team_ratings.parquet`
- matchup matrix: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\matchup_matrix.parquet`
- field rankings: `..\artifacts\ratings-development-v1-full__rating-snapshots-v4\field_rankings.parquet`

| rank | team_id | team_name | field_win_probability |
| --- | --- | --- | --- |
| 1 | 32 | Paper Rex | 0.68969 |
| 2 | 24 | Leviatan | 0.68155 |
| 3 | 15 | G2 Esports | 0.62334 |
| 4 | 31 | NRG Esports | 0.61379 |
| 5 | 47 | Nongshim RedForce | 0.59871 |
| 6 | 36 | T1 | 0.58209 |
| 7 | 41 | Vitality | 0.58122 |
| 8 | 9 | EDward Gaming | 0.55988 |
| 9 | 19 | Team Heretics | 0.54513 |
| 10 | 11 | Fnatic | 0.54442 |
| 11 | 45 | Xi Lai Gaming | 0.54092 |
| 12 | 1 | 100 Thieves | 0.53702 |
| 13 | 25 | Team Liquid | 0.53278 |
| 14 | 8 | DRX | 0.52778 |
| 15 | 51 | Eternal Fire | 0.52447 |
| 16 | 4 | Bilibili | 0.51259 |
| 17 | 35 | Sentinels | 0.50408 |
| 18 | 2 | All Gamers | 0.50405 |
| 19 | 29 | Natus Vincere | 0.50263 |
| 20 | 14 | FUT Esports | 0.49906 |


## Limitations

- Roster announcements are absent; observed lineups become eligible only after their completed match.
- Historical 2023–2025 map-pool announcements remain unknown and are not reconstructed from eventual vetoes for standardized ratings.
- Map-level data cannot isolate side, credits/loadouts, pistol/bonus state, ults, utility, trades, or IGL communication.
- Contribution updates are rejected in this phase unless a transfer/roster-change OOF test demonstrates lift.
- Agent and teammate-agent swaps are associational predictions, not causal interventions.
- The selected player model did not retain teammate-agent synergy; teammate-agent scenario means are zero until that layer demonstrates out-of-fold lift.

## Reproducibility

| code_sha256 | configuration_sha256 | seed | snapshot_manifest_sha256 | development_artifact_sha256 | confirmation_artifact_sha256 | scoring_artifact_sha256 |
| --- | --- | --- | --- | --- | --- | --- |
| 8238bd6c67ae4b49efd8cdefc473f8633ae133d4eda8e89d18f4b6b6f31e6baf | 0eee85964ebbf845f130a29dfdc8d2e5a1e68741020018e1b1e228219d267734 | 20260714 | 239e7dc60f0fe5211889eca4f3f8cb60b5c81a13c731e6db127b504210b99613 | fc9130b897ccee67731151d182ded6acc28f522ea1d64ee6b42811f506ce595e | b3605011da8ad09e52caa087e8cd6a43d3127f5d13afa2371c685bd21a3e16ae | f205ad71bc506076ea5c00563444e0fd04498daa70292455ced063e699a829f0 |
