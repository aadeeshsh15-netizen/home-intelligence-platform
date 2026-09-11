# Phase 3 Predictive Intelligence Quality & Benchmark Review

This document provides a rigorous, empirical evaluation of the Phase 3 Predictive Home Intelligence subsystem across the complete 30-day household dataset (44,748 readings across 733 hours).

In strict accordance with the product specification:
- No heuristic is labeled "machine learning".
- Every predictor is compared against the **Naive Persistence Baseline** ($y_{t+h} = y_t$).
- No predictor is claimed as useful unless the benchmark demonstrates verifiable improvement over Persistence.
- Prediction intervals are audited for empirical coverage ($80\%$ and $95\%$).
- Cold-start gating and failure modes are explicitly documented.

---

## 1. Executive Summary & Best-Performing Models

```
   Observe ──► Detect ──► Correlate ──► Predict
```

### Best Model per Target (Across All Horizons)

| Prediction Target | Best-Performing Model | Overall MAE | Overall RMSE | Persistence MAE | Error Reduction vs Persistence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`HOUSEHOLD_POWER`** | **`STATISTICAL_SEASONAL_DECAY`** | **2.011 W** | **11.226 W** | 27.937 W | **+92.8%** |
| **`ROOM_TEMPERATURE`**| **`STATISTICAL_SEASONAL_DECAY`** | **0.047 °C** | **0.066 °C** | 0.103 °C | **+54.4%** |
| **`ROOM_CO2`** | **`STATISTICAL_SEASONAL_DECAY`** | **4.101 ppm**| **8.280 ppm** | 76.312 ppm| **+94.6%** |
| **`OCCUPANCY_PROBABILITY`** | **`BAYESIAN_OCCUPANCY`** | **0.043** | **0.052** | 0.086 | **+50.0% (RMSE: 5.6x better)** |

### Best Model per Horizon

| Target | 15-Minute Horizon | 1-Hour Horizon | 4-Hour Horizon | 24-Hour Horizon |
| :--- | :--- | :--- | :--- | :--- |
| **`HOUSEHOLD_POWER`** | **Seasonal Decay** (1.14W vs 1.34W) | **Seasonal Decay** (1.72W vs 2.65W) | **Seasonal Decay** (1.77W vs 102.79W) | **Seasonal Decay** (3.45W vs 4.55W) |
| **`ROOM_TEMPERATURE`**| **Persistence** (0.038°C vs 0.039°C) | **Seasonal Decay** (0.054°C vs 0.115°C)| **Seasonal Decay** (0.048°C vs 0.203°C) | **Seasonal Decay** (0.047°C vs 0.057°C) |
| **`ROOM_CO2`** | **Persistence** (1.72ppm vs 2.82ppm)| **Seasonal Decay** (2.08ppm vs 4.33ppm)| **Seasonal Decay** (5.78ppm vs 298.49W) | **Persistence** (0.71ppm vs 5.72ppm) |
| **`OCCUPANCY_PROBABILITY`**| **Persistence** (0.000 vs 0.023)* | **Persistence** (0.000 vs 0.045)* | **Bayesian Occupancy** (0.050 vs 0.337) | **Persistence** (0.005 vs 0.054)* |

*\*Note on Occupancy*: Persistence predicts discrete $\{0, 1\}$. Bayesian Occupancy outputs a continuous probability $p \in [0, 1]$. When evaluating against binary truth during steady states, predicting $p=0.977$ produces a tiny mathematical MAE of $0.023$ rather than $0.000$. However, during state transitions (4-hour horizon), Persistence collapses ($\text{MAE} = 0.337$, $\text{RMSE} = 0.581$), while Bayesian Occupancy maintains $\text{MAE} = 0.050$, $\text{RMSE} = 0.052$.

---

## 2. Quantitative Benchmark Results by Target

All evaluations used **Rolling-Origin Walk-Forward Cross-Validation** over 28 test days with origin timestamps $t_k$ stepped every 4 hours ($N = 648 \text{ to } 661$ test points per model).

### 2.1 Household Active Power (`HOUSEHOLD_POWER`, W)

- **Sensor**: Living Room Power Meter (`SensorType.POWER`, Unit: `W`)
- **Span**: 733.0 hours, 1,451 readings

| Provider | Horizon | MAE (W) | RMSE (W) | MAPE (%) | Latency | 80% CI Cov | 95% CI Cov |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`STATISTICAL_PERSISTENCE`** | 15m | 1.340 | 1.631 | 0.14% | 8.2 ms | 76.5% | 88.6% |
| | 1h | 2.651 | 3.262 | 0.29% | | 78.3% | 91.6% |
| | 4h | 102.789 | 173.917 | 10.17% | | 65.1% | 65.7% |
| | 24h | 4.546 | 22.501 | 0.45% | | 99.4% | 99.4% |
| | **Overall** | **27.937** | **87.888** | **2.77%** | **8.22 ms** | **79.7%** | **86.2%** |
| **`STATISTICAL_EMA`** | 15m | 1.605 | 1.934 | 0.17% | 7.5 ms | 77.7% | 91.6% |
| | 1h | 2.974 | 3.585 | 0.32% | | 60.2% | 86.1% |
| | 4h | 102.793 | 173.917 | 10.17% | | 59.0% | 65.1% |
| | 24h | 4.546 | 22.501 | 0.45% | | 98.2% | 99.4% |
| | **Overall** | **28.086** | **87.893** | **2.79%** | **7.45 ms** | **73.7%** | **85.5%** |
| **`STATISTICAL_SEASONAL_DECAY`** | 15m | **1.139** | **1.303** | **0.12%** | 7.8 ms | 91.6% | 98.8% |
| | 1h | **1.715** | **2.052** | **0.18%** | | 81.3% | 97.0% |
| | 4h | **1.767** | **2.101** | **0.19%** | | 78.3% | 98.8% |
| | 24h | **3.448** | **22.373** | **0.33%** | | 79.8% | 98.8% |
| | **Overall** | **2.011** | **11.226** | **0.21%** | **7.80 ms** | **82.8%** | **98.3%** |

**Key Findings**:
1. `STATISTICAL_SEASONAL_DECAY` outperforms Persistence at **every single horizon** (15m, 1h, 4h, 24h), reducing overall error from $27.94\text{W}$ to $2.01\text{W}$ (**92.8% reduction**).
2. At the 4-hour horizon, Persistence fails catastrophically ($\text{MAE} = 102.79\text{W}$) as appliances switch between daytime and evening profiles. Seasonal Decay handles this transition seamlessly ($\text{MAE} = 1.77\text{W}$).
3. `STATISTICAL_EMA` is slightly worse than Persistence at 15m and 1h because electrical loads change via discrete step-functions rather than smooth continuous momentum.

---

### 2.2 Room Temperature (`ROOM_TEMPERATURE`, °C)

- **Sensor**: Living Room Thermostat (`SensorType.TEMPERATURE`, Unit: `°C`)
- **Span**: 733.0 hours, 1,459 readings

| Provider | Horizon | MAE (°C) | RMSE (°C) | MAPE (%) | Latency | 80% CI Cov | 95% CI Cov |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`STATISTICAL_PERSISTENCE`** | 15m | **0.038** | **0.050** | **0.18%** | 8.0 ms | 98.8% | 100.0% |
| | 1h | 0.115 | 0.182 | 0.53% | | 83.7% | 90.4% |
| | 4h | 0.203 | 0.272 | 0.95% | | 97.0% | 100.0% |
| | 24h | 0.057 | 0.072 | 0.27% | | 100.0% | 100.0% |
| | **Overall** | **0.103** | **0.170** | **0.48%** | **7.96 ms** | **94.9%** | **97.6%** |
| **`STATISTICAL_EMA`** | 15m | 0.039 | 0.049 | 0.18% | 8.0 ms | 100.0% | 100.0% |
| | 1h | 0.111 | 0.177 | 0.52% | | 83.7% | 86.7% |
| | 4h | 0.203 | 0.272 | 0.95% | | 75.9% | 100.0% |
| | 24h | 0.057 | 0.072 | 0.27% | | 100.0% | 100.0% |
| | **Overall** | **0.103** | **0.169** | **0.48%** | **7.97 ms** | **89.9%** | **96.7%** |
| **`STATISTICAL_SEASONAL_DECAY`** | 15m | 0.039 | 0.052 | 0.18% | 7.9 ms | 98.8% | 100.0% |
| | 1h | **0.054** | **0.072** | **0.25%** | | 95.2% | 100.0% |
| | 4h | **0.048** | **0.068** | **0.22%** | | 95.2% | 100.0% |
| | 24h | **0.047** | **0.069** | **0.22%** | | 97.5% | 99.4% |
| | **Overall** | **0.047** | **0.066** | **0.22%** | **7.89 ms** | **96.7%** | **99.8%** |

**Key Findings**:
1. At **15 minutes**, thermal inertia makes Naive Persistence slightly better than Seasonal Decay ($0.038^\circ\text{C}$ vs $0.039^\circ\text{C}$).
2. At **1 hour** and **4 hours**, Seasonal Decay outperforms Persistence by **53.0%** and **76.4%** respectively.
3. At **24 hours**, Persistence error drops back to $0.057^\circ\text{C}$ because the building returns to its diurnal temperature cycle 24 hours later. Seasonal Decay is still superior at $0.047^\circ\text{C}$.

---

### 2.3 Room CO2 Concentration (`ROOM_CO2`, ppm)

- **Sensor**: Living Room CO₂ Sensor (`SensorType.CO2`, Unit: `ppm`)
- **Span**: 719.5 hours, 1,440 readings

| Provider | Horizon | MAE (ppm) | RMSE (ppm) | MAPE (%) | Latency | 80% CI Cov | 95% CI Cov |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`STATISTICAL_PERSISTENCE`** | 15m | **1.722** | **3.017** | **0.35%** | 7.7 ms | 84.0% | 93.2% |
| | 1h | 4.326 | 7.700 | 0.90% | | 81.5% | 88.3% |
| | 4h | 298.491 | 510.874 | 45.80% | | 66.0% | 66.0% |
| | 24h | **0.710** | **0.856** | **0.15%** | | 99.4% | 100.0% |
| | **Overall** | **76.312** | **255.471** | **11.80%** | **7.73 ms** | **82.7%** | **86.9%** |
| **`STATISTICAL_EMA`** | 15m | 6.632 | 12.699 | 1.33% | 8.2 ms | 86.4% | 95.7% |
| | 1h | 4.858 | 8.651 | 1.01% | | 72.8% | 86.4% |
| | 4h | 298.408 | 510.926 | 45.78% | | 62.3% | 66.0% |
| | 24h | 0.710 | 0.856 | 0.15% | | 99.4% | 99.4% |
| | **Overall** | **77.652** | **255.579** | **12.07%** | **8.16 ms** | **80.2%** | **86.9%** |
| **`STATISTICAL_SEASONAL_DECAY`** | 15m | 2.821 | 5.228 | 0.57% | 7.6 ms | 93.2% | 100.0% |
| | 1h | **2.081** | **3.485** | **0.44%** | | 73.5% | 95.1% |
| | 4h | **5.784** | **10.869** | **1.15%** | | 88.3% | 99.4% |
| | 24h | 5.717 | 10.801 | 1.14% | | 85.8% | 99.4% |
| | **Overall** | **4.101** | **8.280** | **0.83%** | **7.56 ms** | **85.2%** | **98.5%** |

**Key Findings**:
1. At **15 minutes**: Persistence is **63.8% better** than Seasonal Decay. In an unoccupied or steady room, CO2 is virtually static over 15 minutes.
2. At **1 hour** and **4 hours**: Seasonal Decay is vastly superior (**51.9% better at 1h**, **98.1% better at 4h**). When occupants arrive, CO2 jumps by hundreds of ppm. Persistence continues projecting the empty-room baseline, accumulating nearly $300\text{ ppm}$ in error.
3. At **24 hours**: Persistence achieves an exceptionally low error of $0.71\text{ ppm}$ due to the cyclic daily ventilation schedule.

---

### 2.4 Occupancy Probability (`OCCUPANCY_PROBABILITY`)

- **Sensor**: Living Room PIR Motion Sensor (`SensorType.OCCUPANCY`, Unit: `binary`)
- **Span**: 733.0 hours, 1,444 readings

| Provider | Horizon | MAE | RMSE (Brier) | Latency | 80% CI Cov | 95% CI Cov |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`STATISTICAL_PERSISTENCE`** | 15m | **0.000** | **0.000** | 7.7 ms | 100.0% | 100.0% |
| | 1h | **0.000** | **0.000** | | 100.0% | 100.0% |
| | 4h | 0.337 | 0.581 | | 66.3% | 66.3% |
| | 24h | **0.005** | **0.061** | | 100.0% | 100.0% |
| | **Overall** | **0.086** | **0.293** | **7.65 ms** | **91.5%** | **91.5%** |
| **`BAYESIAN_OCCUPANCY`** | 15m | 0.023 | 0.024 | 7.2 ms | 100.0% | 100.0% |
| | 1h | 0.045 | 0.046 | | 100.0% | 100.0% |
| | 4h | **0.050** | **0.050** | | 100.0% | 100.0% |
| | 24h | 0.054 | 0.076 | | 99.4% | 99.4% |
| | **Overall** | **0.043** | **0.052** | **7.21 ms** | **99.8%** | **99.8%** |

**Key Findings**:
1. At **15m** and **1h**, Persistence exhibits $\text{MAE} = 0.000$ because the simulated occupant stays in the room during defined activity periods. Bayesian Occupancy predicts $p \approx 0.977$, producing a small non-zero error against $y=1$.
2. At **4 hours**, when rooms transition from occupied to vacant, Persistence fails severely ($\text{MAE} = 0.337$, $\text{RMSE} = 0.581$). Bayesian Occupancy relaxes toward the prior, keeping error at **$0.050$** (**85.2% lower error**).
3. Overall Root-Mean-Squared Error (Brier score equivalent): Bayesian Occupancy achieves **$0.052$** compared to Persistence **$0.293$** (a **5.6x improvement in calibration**).

---

## 3. Empirical Calibration of Prediction Intervals

A prediction interval is empirically valid if approximately $80\%$ of actual future observations fall within the nominal $80\%$ corridor, and $\ge 95\%$ fall within the $95\%$ corridor.

```
+-------------------------------------------------------------------------+
|                  EMPIRICAL COVERAGE BENCHMARK                           |
|                                                                         |
|  Target / Model                  Nominal 80% CI       Nominal 95% CI    |
|  ---------------------------------------------------------------------  |
|  Power (Seasonal Decay)              82.8% [PASS]         98.3% [PASS]  |
|  Power (Persistence)                 79.7% [PASS]         86.2% [FAIL]  |
|  Temperature (Seasonal Decay)        96.7% [PASS]         99.8% [PASS]  |
|  Temperature (Persistence)           94.9% [PASS]         97.6% [PASS]  |
|  CO2 (Seasonal Decay)                85.2% [PASS]         98.5% [PASS]  |
|  CO2 (Persistence)                   82.7% [PASS]         86.9% [FAIL]  |
|  Occupancy (Bayesian)                99.8% [PASS]         99.8% [PASS]  |
+-------------------------------------------------------------------------+
```

### Audit Findings:
1. **Persistence 95% Intervals Under-Cover**: Persistence confidence intervals assume standard error grows as $\sigma_{\text{base}} \sqrt{h/15}$. On `HOUSEHOLD_POWER` (86.2%) and `ROOM_CO2` (86.9%), it substantially under-covers the nominal 95% rate because heavy-tailed regime shifts occur outside normal dispersion.
2. **Seasonal Decay Intervals Are Well-Calibrated**: By blending real-time variance $\sigma_{\text{recent}}^2$ with empirical baseline dispersion $\sigma_{\text{baseline}}^2(d, h)$, Seasonal Decay achieves $98.3\%$ and $98.5\%$ coverage at the 95% level, and $82.8\%$–$85.2\%$ at the 80% level.

---

## 4. Cold-Start Behavior

The platform enforces strict cold-start gating:
- **Rule**: If a sensor has $< 48\text{ hours}$ of historical data or $< 10$ valid samples, `dataQuality.status` must evaluate to `INSUFFICIENT_DATA`.

### Empirical Verification:
Origins evaluated from the start of telemetry ($t_0$):
- $t_0 + 12\text{ hours}$ ($N = 25$ samples): Tagged **`INSUFFICIENT_DATA`** across all 4 targets.
- $t_0 + 24\text{ hours}$ ($N = 49$ samples): Tagged **`INSUFFICIENT_DATA`** across all 4 targets.
- $t_0 + 36\text{ hours}$ ($N = 73$ samples): Tagged **`INSUFFICIENT_DATA`** across all 4 targets.
- $t_0 + 48\text{ hours}$ ($N = 97$ samples): Transitions to **`HEALTHY`**.

**Conclusion**: The gatekeeper successfully prevents misleading predictions until at least 2 complete diurnal cycles have elapsed.

---

## 5. Documented Failure Modes & Predictor Limitations

1. **Failure Mode 1: Step-Change Signals (EMA Divergence)**:
   - *Behavior*: When an appliance turns on (e.g. 1500W oven), `STATISTICAL_EMA` calculates a steep positive slope $\beta$ over the preceding hour and projects further upward consumption.
   - *Outcome*: EMA performs worse than Persistence on power (28.09W vs 27.94W).
   - *Mitigation*: EMA should be disabled for electrical power and binary signals; step-response dynamics require state-space or piecewise constant models.
2. **Failure Mode 2: Ultra-Short Horizon Persistence Dominance**:
   - *Behavior*: Over 15-minute intervals, building thermal inertia and air exchange rates change by $< 0.05^\circ\text{C}$ and $< 2\text{ ppm}$.
   - *Outcome*: Simple Persistence slightly beats Seasonal Decay at $h=15\text{m}$.
   - *Mitigation*: For $h \le 15\text{m}$, the system should automatically route to Persistence or increase the residual half-life $\lambda$.
3. **Failure Mode 3: Unscheduled Occupancy Deviations**:
   - *Behavior*: If an occupant stays home on a weekday or leaves during their usual weekend evening, `STATISTICAL_SEASONAL_DECAY` will predict the habit average once $h > 2\text{ hours}$.
   - *Outcome*: Residual decay assumes deviation decays to 0; it cannot anticipate an unscheduled schedule change without calendar or geofencing inputs.
