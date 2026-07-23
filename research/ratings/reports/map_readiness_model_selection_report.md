# Valorant Team Ratings — Transient Map Readiness Model Selection

Retain **carryover**. The transient map-readiness challenger improved point estimates in development and the rolled-forward 2026 confirmation window, but its development paired-confidence interval crossed zero, so it did not clear the existing promotion gate.

Generated: 2026-07-16

## Decision

- Baseline: `carryover`
- Challenger: `map_readiness`
- Development gate passed: `False`
- Holdout direction and guardrails passed: `True`
- Promotion passed: `False`
- 2026 confirmation status: `confirmed-once`

The challenger rating is `global strength + persistent map affinity + map readiness`. Prediction is non-mutating, every map in a series uses one frozen pre-series state, and updates reuse the carryover margin multiplier.

## Data and temporal protocol

| audit_ok | cutoff | data_sha256 | warm-up | development | confirmation | total maps |
| --- | --- | --- | --- | --- | --- | --- |
| True | 2026-06-21T23:59:59.999999+00:00 | 97e36e8f5eb4c2cfa448adf466a47983094f08593f1b9f9b3a2f4efbc98caef9 | 2023 | 2024–2025 (2,376 maps) | 2026 (747 maps) | 3,818 |

The 2026 window was opened only after the 2024–2025 selection artifact was frozen. Selection used map log loss; Brier score and calibration slope were guardrails; paired intervals were clustered by match.

## Selected configuration

| global K | probability scale | offseason retention | global half-life | global weight | affinity update weight | readiness half-life | readiness K | patch retention |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 32 | 1000 | 0.70 | 360 days | 0.95 | 0.55 | 90 days | 8 | 0.50 |

The auditable grid contained 81 candidates:

- global weight: promoted `0.85`, `0.95`, `1.0`
- readiness half-life: `21`, `45`, `90` days
- readiness K: `8`, `16`, `32`
- patch retention: `0.1`, `0.25`, `0.5`

All other global-pathway values were inherited from the promoted carryover configuration. Persistent map affinity retained its existing slow update and long decay behavior.

## Aggregate map forecast performance

| period | model | maps | map log loss | Brier | calibration intercept | calibration slope | ECE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| development 2024–2025 | map readiness | 2,376 | 0.676337 | 0.241753 | -0.01302 | 0.94851 | 0.01704 |
| development 2024–2025 | carryover | 2,376 | 0.676884 | 0.242030 | -0.00990 | 1.07174 | 0.01180 |
| confirmation 2026 | map readiness | 747 | 0.682305 | 0.244607 | -0.16313 | 0.93944 | 0.05120 |
| confirmation 2026 | carryover | 747 | 0.682379 | 0.244649 | -0.15982 | 1.05022 | 0.04703 |

Development paired log-loss difference (challenger minus carryover): `-0.000547`, 95% match-clustered interval `[-0.002439, 0.000338]`. Brier improved by `0.000276`; calibration-slope distance from 1 improved by `0.02025`. The interval crossing zero caused the development gate failure.

The frozen 2026 configuration preserved the improvement direction. Its paired mean difference was `-0.000074`, with interval `[-0.002109, 0.001709]`; Brier changed by `-0.000043`, and calibration-slope degradation was `0.01034`, within the `0.10` guardrail. This passed holdout direction and guardrails but cannot override the required development failure.

### Same-global-path diagnostic

This non-gating ablation separates readiness from the selected `0.95` global weighting:

| period | promoted carryover (0.85) | global 0.95 without readiness | selected map readiness | readiness vs same-global path |
| --- | --- | --- | --- | --- |
| development 2024–2025 | 0.676884 | 0.676462 | 0.676337 | -0.000125 |
| confirmation 2026 | 0.682379 | 0.682631 | 0.682305 | -0.000326 |

The readiness component improved log loss beyond global reweighting in both periods, but the effect is too small to treat as established.

## Within-series map ordering

Only multi-map series with at least one map win by each team are comparable. For each such series, the metric checks whether the model assigns the focal team a higher pre-series win probability on the maps it won than on the maps it lost. Cross-outcome pair scores are averaged within match, ties receive half credit, and bootstrap intervals are match-clustered.

| period | multi-map series | comparable series | comparable pairs | readiness accuracy | carryover accuracy | difference | 95% interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| development 2024–2025 | 932 | 437 | 976 | 0.50000 | 0.46491 | +0.03509 | [-0.01030, 0.07896] |
| confirmation 2026 | 285 | 143 | 335 | 0.54779 | 0.51981 | +0.02797 | [-0.05361, 0.11422] |

Ordering improved directionally in both periods, but neither interval excludes zero.

## Predeclared map-form episodes

No maintainer-supplied cases were included with Workstream C. `config/map_form_episodes.json` therefore contains an intentionally empty, validated fixture instead of retrospectively chosen episodes. The diagnostic implementation is complete, but no episode sign result is reported and this omission is not a gate.

## Promotion gate

| candidate | baseline | development pass | final holdout pass | promoted |
| --- | --- | --- | --- | --- |
| map readiness | carryover | False | True | False |

## Validation

- Both immutable artifact manifests and every registered artifact hash verified.
- Independent recomputation from the saved prediction Parquets reproduced all four aggregate log-loss and Brier values above.
- Focused state/metric tests and the complete ratings suite passed (`74 passed`).
- Patch and pool resets were exercised in saved forecasts; uncertainty resets and retention were also checked with deterministic boundary tests.

## Limitations

- Historical 2023–2025 map-pool announcements remain unavailable. Development uses declared patch resets but cannot identify historical map-pool re-entries.
- Readiness is a predictive state inferred from outcomes; it does not identify tactical causes, roster intent, side selection, or veto effects.
- The ordering metric excludes sweeps because no opposite-winner map pair exists.
- The episode diagnostic remains incomplete until the maintainer supplies cases that were chosen independently of these results.

## Reproducibility

| item | value |
| --- | --- |
| experiment version | `ratings-map-readiness-v1` |
| seed | `20260714` |
| promoted selection digest | `974801812c14b0ec5c4325147abd977d3aab6e7394d2186c22bf3e06972d7358` |
| development selection digest | `125e123fc7094e2f5ff9bac3749781755817dede57bdf09e0203211b3caedda1` |
| development artifact digest | `dd38a8b3eb4b760e2b0ec8346597dbaffdbf4491f499ca0f2da2f2714f0e8ee2` |
| confirmation artifact digest | `eba2551f25b61e59c3b74376bb2aef957f12f1cea7735a576c3f9b594fc310db` |
| snapshot manifest digest | `239e7dc60f0fe5211889eca4f3f8cb60b5c81a13c731e6db127b504210b99613` |
| patch config SHA-256 | `ed6874dc47f3179f5b18c9b41665478fce5bc5e7ca6f2a44d08cb33ff9ea341d` |
| map-pool config SHA-256 | `a6e2db3fd8d3c36cff22d7b6aa1fc66102be78173a27bd9ebdb5e47fcc2195b7` |
| episode fixture SHA-256 | `e9ce44110e101c4360b48628cc7c099a393dac66fc70747c446706dcf744789c` |

Immutable local artifacts:

- `artifacts/ratings-map-readiness-v1-full`
- `artifacts/ratings-map-readiness-v1-full__2026-confirmation`
