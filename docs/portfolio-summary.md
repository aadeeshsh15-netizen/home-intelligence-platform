# Home Intelligence Platform — Architectural Portfolio Summary

An industrial-grade, TypeScript-first digital twin, predictive machine learning, and closed-loop automation platform for residential environments.

Designed and engineered by **Aadeesh Sharma** ([aadeeshsh15@gmail.com](mailto:aadeeshsh15@gmail.com)).

---

## 1. Problem Statement

Standard consumer smart home systems (HomeKit, Google Home, Home Assistant) function predominantly as **remote-control switchboards**. They react to single-sensor threshold triggers (e.g., *if temp > 24°C, turn on AC*) with zero thermodynamic context, zero multi-sensor correlation, and zero ability to anticipate hazards before they occur.

This creates three critical engineering deficiencies:
1. **Flapping & Oscillations**: Naive rules repeatedly toggle high-power appliances around threshold boundaries.
2. **False Positives**: Isolated sensor spikes (e.g., transient warm air from cooking) trigger erroneous whole-home cooling.
3. **Reactive Lag**: System responds only after environmental limits are breached, increasing energy consumption and occupant discomfort.

The **Home Intelligence Platform** models the home as an interconnected thermodynamic, electrical, and human-inhabited system. It closes the operational loop from physical sensing to machine learning prediction, fail-closed safety guardrails, low-voltage actuation, empirical trajectory verification, and causal observability.

---

## 2. The 12-Stage Control Loop Architecture

The platform executes an autonomous, deterministic 12-stage operational pipeline:

$$\mathbf{Sense \longrightarrow Ingest \longrightarrow Validate \longrightarrow Detect \longrightarrow Correlate \longrightarrow Predict \longrightarrow Anticipate \longrightarrow Decide \longrightarrow Interlock \longrightarrow Act \longrightarrow Verify \longrightarrow Audit}$$

1. **Edge Sensing & Simulation**: Physical ESP32 DevKit v1 microcontrollers (DHT22, PIR, Reed Switch) and a second-order thermodynamic ODE simulator.
2. **Broker Transport**: Eclipse Mosquitto MQTT broker over QoS 1 with structured topic taxonomy (`home/{homeId}/device/{deviceId}/telemetry`).
3. **Authoritative Ingestion**: `POST /api/telemetry/ingest` processing dual-producer streams through the exact same contract.
4. **Bounds & Reality Validator**: Zod bounds validation + spike filtering + impossible rate-of-change rejection.
5. **Statistical Anomaly Engine**: 168-hour empirical Gaussian baselines ($\mu \pm 2.5\sigma$, parametric Z-score) isolating true anomalies from diurnal rhythms.
6. **Cross-Sensor Correlation**: Sliding temporal window (10–15m) multi-signal signatures detecting compound incidents (`COOKING_EVENT`, `WATER_LEAK`, `AC_FAILURE`, `WINDOW_THERMAL_EVENT`).
7. **Multi-Horizon Forecasting**: Gradient Boosted Decision Trees (GBDT) and Random Forest models with cyclical features predicting $15\text{m}, 1\text{h}, 4\text{h}, 24\text{h}$ horizons with **-28.1% RMSE reduction**.
8. **Predictive Anticipation**: Solves analytical Gaussian CDF hazard probabilities $P(Y \ge T) = 1 - \Phi\left(\frac{T - \hat{y}}{\sigma}\right)$ and Time-to-Threshold ($\tau$).
9. **Automation Decision Engine**: Deterministic policy evaluation with hysteresis damping, priority arbitration, and mode gating.
10. **Safety Guardrails & Interlock**: Fail-closed safety evaluator enforcing operational modes (`AUTO`, `MANUAL`, `DISABLED`) and restricting commands to low-voltage actuators.
11. **Idempotent Command Dispatch**: Durable `DeviceCommand` records dispatched across dual paths (REST + MQTT QoS 1) with monotonically increasing IDs.
12. **Empirical Verification & Audit**: Measures post-actuation physical delta ($\Delta M$) against expected physical trajectories; records structured causal `SystemEvent` audit trail with preserved `correlationId`s.

---

## 3. Quantitative Evaluation & Machine Learning Methodology

Evaluated via rolling-origin walk-forward cross-validation across 40,320 hourly telemetry readings:

| Target Channel | Baseline Model | GBDT Tree Model | RMSE Baseline | RMSE GBDT | Improvement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Household Power** | Seasonal Diurnal AR | GBDT Regressor (50 trees, depth 4) | $342.6\,\text{W}$ | $246.3\,\text{W}$ | **-28.1%** |
| **Indoor Temperature** | Exponential Moving Avg | GBDT Regressor (50 trees, depth 4) | $0.84^\circ\text{C}$ | $0.61^\circ\text{C}$ | **-27.4%** |
| **Indoor CO₂** | Linear Trend + Diurnal | GBDT Regressor (50 trees, depth 4) | $92.4\,\text{ppm}$ | $68.1\,\text{ppm}$ | **-26.3%** |
| **Room Occupancy** | Naive Persistence | Bayesian Prior + Motion Decay | $0.38$ | $0.19$ | **-50.0%** |

- **Circuit-Breaker Fallback**: 800 ms inference timeout automatically falls back to statistical baselines with zero interruption.
- **Incident Engine Quality**: **0.00% false positive rate** under 24-hour clean nominal baseline test suites.

---

## 4. Physical IoT Integration & Hardware Bench

- **Microcontroller**: ESP32 DevKit v1 (Espressif ESP-WROOM-32)
- **Sensors**: DHT22 (Temp/Humidity, GPIO 4), HC-SR501 PIR (Occupancy, GPIO 18), Magnetic Reed Switch (Contact, GPIO 19)
- **Actuator**: Optocoupler-isolated low-voltage relay (GPIO 23)
- **Validation**: 8 physical hardware acceptance tests validating real-world breadboard connections, DHCP delays, SNTP synchronization, Wi-Fi reconnection, broker reconnects, and watchdog non-zeroing invariants.

---

## 5. Software Engineering & Operational Rigor

- **Strict Type-Safety**: 100% TypeScript with zero compilation errors (`npx tsc --noEmit`).
- **Comprehensive Test Suite**: 41 test files, 178 automated tests passing across unit, integration, benchmark, and regression domains.
- **Production Container Stack**: Multi-stage non-root Dockerfile (`node:22-alpine`, UID 1001), healthchecks, standalone Next.js 15 build, and separated `/api/live` and `/api/ready` probes.
- **Continuous Integration**: GitHub Actions automated pipeline validating dependencies, Prisma migrations, typechecking, test suites, and production builds.
- **Operational Observability**: In-process rolling percentiles ($p50/p95/p99$) for ingestion, prediction, decision, and command execution latencies.

---

## 6. Known Engineering Limitations & Tradeoffs

1. **Single-Node In-Memory State**: In-process rate limiting and sliding metrics operate in-memory on a single node; horizontal cluster scaling requires Redis.
2. **Low-Voltage Actuator Scope**: Safety policy explicitly restricts automated commands to low-voltage actuators (relays, smart plugs, dampers). Mains-voltage electrical switching is deliberately excluded to prevent physical safety risks.
3. **GBDT Tree Size Constraints**: Tree models are capped at 50 trees and depth 4 to guarantee sub-10ms inference times on serverless runtimes.
