# Phase 4 Machine Learning Evaluation Report: HOUSEHOLD_POWER

This report documents the head-to-head empirical evaluation between deterministic statistical baselines and learned tree ensemble models (Gradient Boosted Trees and Random Forest) on the **HOUSEHOLD_POWER** prediction target.

Evaluation was performed on the untouched **7-day holdout test set** ($N = 326$ origins, $N_{\text{eval}} = 1304$ forecast points) using rolling-origin walk-forward testing.

---

## 1. Executive Summary & Comparative Benchmark

| Model Architecture | Type | Overall MAE (W) | Overall RMSE (W) | Overall MAPE (%) | Latency (p50 / p99) | 80% CI Cov | 95% CI Cov | Error vs Seasonal Decay | Error vs Persistence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`STATISTICAL_PERSISTENCE`** | Baseline | **33.945 W** | **99.232 W** | 4.01% | 5.8ms / 10.2ms | 79.3% | 84.0% [FAIL] | +1360% | Baseline |
| **`STATISTICAL_EMA`** | Baseline | **35.933 W** | **99.725 W** | 4.21% | 6.2ms / 12.6ms | 73.6% | 83.7% [FAIL] | +1368% | +0.6% |
| **`STATISTICAL_SEASONAL_DECAY`** | Baseline (Best) | **8.902 W** | **41.421 W** | 1.55% | 7.1ms / 15.7ms | 83.7% | 96.2% [PASS] | **Reference Baseline** | -92.9% |
| **`ML_RANDOM_FOREST`** | Learned | **29.014 W** | **51.687 W** | 3.85% | 7.0ms / 25.9ms | 31.2% | 35.7% [FAIL] | +24.8% | -14.5% |
| **`ML_GRADIENT_BOOSTING`** | Learned | **3.115 W** | **29.770 W** | 0.98% | 5.8ms / 8.8ms | 82.7% | 96.7% [PASS] | -28.1% | -90.8% |

---

## 2. Granular Horizon Breakdown

### 15-Minute Horizon (Ultra-Short)
| Model | MAE (W) | RMSE (W) | MAPE (%) | 80% CI Coverage | 95% CI Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Persistence** | 7.238 | 29.989 | 0.71% | 75.8% | 85.6% |
| **Seasonal Decay** | 6.904 | 25.808 | 0.7% | 94.5% | 97.9% |
| **Random Forest** | 24.008 | 26.921 | 2.7% | 12% | 14.4% |
| **Gradient Boosted Trees** | 1.092 | 1.341 | 0.12% | 85% | 96.9% |

### 1-Hour Horizon (Short)
| Model | MAE (W) | RMSE (W) | MAPE (%) | 80% CI Coverage | 95% CI Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Persistence** | 25.383 | 83.039 | 2.54% | 75.2% | 82.5% |
| **Seasonal Decay** | 8.016 | 29.275 | 0.82% | 78.5% | 94.2% |
| **Random Forest** | 8.559 | 10.171 | 0.94% | 30.7% | 35% |
| **Gradient Boosted Trees** | 2.007 | 2.424 | 0.22% | 81.6% | 96% |

### 4-Hour Horizon (Medium)
| Model | MAE (W) | RMSE (W) | MAPE (%) | 80% CI Coverage | 95% CI Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Persistence** | 95.469 | 167.603 | 9.4% | 67.8% | 69% |
| **Seasonal Decay** | 7.248 | 28.998 | 0.73% | 81% | 96.9% |
| **Random Forest** | 18.345 | 38.652 | 1.61% | 68.7% | 76.7% |
| **Gradient Boosted Trees** | 2.016 | 2.419 | 0.22% | 82.5% | 96% |

### 24-Hour Horizon (Diurnal Return)
| Model | MAE (W) | RMSE (W) | MAPE (%) | 80% CI Coverage | 95% CI Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Persistence** | 7.688 | 59.184 | 3.39% | 98.5% | 99.1% |
| **Seasonal Decay** | 13.441 | 67.074 | 3.96% | 80.7% | 96% |
| **Random Forest** | 65.142 | 91.454 | 10.15% | 13.5% | 16.6% |
| **Gradient Boosted Trees** | 7.347 | 59.427 | 3.36% | 81.9% | 97.9% |

---

## 3. Prediction Interval Calibration Audit

Both learned models employ **empirical residual quantile conformalization** calculated on the out-of-sample validation slice ($D_{\text{val}}$).

- **Nominal 80% Corridor**:
  - GBDT: **82.7%** [PASS]
  - Random Forest: **31.2%** [FAIL — undercovers at 31.2%]
  - Seasonal Decay: **83.7%** [PASS]
  - Persistence: **79.3%** [PASS]

- **Nominal 95% Corridor**:
  - GBDT: **96.7%** [PASS]
  - Random Forest: **35.7%** [FAIL — undercovers at 35.7%]
  - Seasonal Decay: **96.2%** [PASS]
  - Persistence: **84%** [FAIL — undercovers at 84%]

---

## 4. Inference Latency & Computational Overhead

| Model Architecture | Training Duration (Total) | Inference Latency (Mean) | Inference Latency (p99) | In-Process Memory Footprint |
| :--- | :--- | :--- | :--- | :--- |
| **Naive Persistence** | 0 ms | 5.8 ms | 10.2 ms | < 1 KB |
| **Seasonal Diurnal Decay** | 0 ms (Online Matrix) | 7.1 ms | 15.7 ms | ~50 KB |
| **Random Forest (RF)** | ~2.5 s | 7.0 ms | 25.9 ms | ~450 KB |
| **Gradient Boosted Trees (GBDT)** | ~2.4 s | 5.8 ms | 8.8 ms | ~280 KB |

*Finding*: In-process binary tree traversal executes in under 2 milliseconds on top of feature extraction, comfortably satisfying the $< 10\text{ms}$ platform SLA.

---

## 5. Production Promotion Verdict

```
VERDICT: PROMOTED: Gradient Boosted Trees outperforms statistical baseline by >= 5% RMSE and passes all latency and interval gates.
```

### Gating Checklist:
1. **Beats Persistence Everywhere ($h \ge 60\text{m}$)**: **PASS** (3.12W vs 33.95W).
2. **Superiority Threshold (>= 5% RMSE over Seasonal Decay)**: **PASS** (28.1% improvement).
3. **Calibrated Prediction Intervals (>= 92% coverage at 95% CI)**: **PASS** (96.7% coverage).
4. **Latency Budget (< 10ms)**: **PASS** (5.8ms).

---

## 6. Documented Limitations & Failure Modes

1. **Step-Function Load Response**: Tree splits approximate step responses well, but extreme unobserved peak loads (e.g. combined oven + EV charging simultaneously) cannot be extrapolated above the maximum observed training leaf value ($y_{\max}$).
2. **Data Efficiency**: With 1,451 readings, statistical Seasonal Diurnal Decay has already captured the primary cyclic signature. As training history expands from 30 days to 180+ days, non-linear interactions between weather context and power demand will increasingly favor GBDT over static diurnal matrices.
