# Home Intelligence Platform

A production-grade, TypeScript-first digital twin, predictive intelligence, and closed-loop automation platform for residential environments, connected IoT devices, and multi-modal sensor telemetry.

> **"Understand the home, not merely control it."**
> Standard smart home platforms operate merely as remote-control switches. This platform models the home as an interconnected thermodynamic, aerodynamic, electrical, and human-inhabited system. It closes the operational loop from physical sensing to deterministic machine learning, predictive anticipation, fail-closed safety guardrails, low-voltage actuation, empirical verification, and causal observability.

---

## The 12-Stage Closed-Loop Control Architecture

The platform executes a continuous, autonomous operational loop across 12 discrete engineering stages:

$$\mathbf{Sense \longrightarrow Ingest \longrightarrow Validate \longrightarrow Detect \longrightarrow Correlate \longrightarrow Predict \longrightarrow Anticipate \longrightarrow Decide \longrightarrow Interlock \longrightarrow Act \longrightarrow Verify \longrightarrow Audit}$$

```
+-----------------------------------------------------------------------------------------------------------------------+
| 1. Physical Edge & Sensing        ESP32 DevKit v1, DHT22, BME280, PIR, Reed, Power Clamps, Flow Meters, Sim Engine    |
| 2. Edge Broker Transport          Eclipse Mosquitto MQTT Broker (TLS 1.3, QoS 1, Structured Topic Taxonomy)           |
| 3. Normalized Ingestion Gateway   POST /api/telemetry/ingest (Dual-Producer Abstraction: MQTT Gateway + Simulator)   |
| 4. Bounds & Reality Validator     Zod Schema + Physical Envelopes + Spike & Impossible Rate-of-Change Filtering       |
| 5. Statistical Anomaly Engine     168-Hour Empirical Gaussian Baselines (mu +- 2.5 sigma, Parametric Z-Scores)        |
| 6. Cross-Sensor Correlation       Sliding Temporal Windows (10-15 min), Multi-Signal Signatures, Channel Corroboration|
| 7. Multi-Horizon Forecasting      Cyclical Encodings + Diurnal Decay + Bayesian Occupancy + GBDT (28.1% RMSE drop)    |
| 8. Predictive Anticipation        Analytical Gaussian CDF Hazard P(Y >= T), Time-to-Threshold (tau) Early Warning     |
| 9. Automation Decision Engine     Policy Evaluation, Cooldown Timers, Flapping Damping, Priority Resolution           |
| 10. Safety Guardrails & Interlock Fail-Closed Evaluation, Mode Gate (AUTO/MANUAL/DISABLED), Strict Low-Voltage Guard  |
| 11. Idempotent Command Dispatch   Durable DeviceCommand, Dual-Path (REST + MQTT QoS 1), Hardware Actuator Handlers    |
| 12. Verification & Observability  Empirical Delta-M Trajectory Verifier, In-Process Metrics, Causal SystemEvent Audit |
+-----------------------------------------------------------------------------------------------------------------------+
```

---

## Core Engineering Highlights

- **Digital Twin Modeling**: Structured relational hierarchy (`Home` $\to$ `Floors` $\to$ `Rooms` $\to$ `Devices` $\to$ `Sensors` $\to$ `Telemetry` $\to$ `Events` $\to$ `Incidents` $\to$ `Predictions` $\to$ `Automations` $\to$ `SystemEvents`).
- **Strict Producer Decoupling**: Ingests data from physical **ESP32 microcontrollers** over MQTT and an integrated **thermodynamic physics simulator** over HTTP through the exact same normalized contract with zero downstream code differences.
- **Explainable Machine Learning (Phase 4)**: Gradient Boosted Decision Trees (GBDT) and Random Forest models achieving a **28.1% RMSE reduction** over statistical baselines across multi-horizon forecasts ($15\text{m}, 1\text{h}, 4\text{h}, 24\text{h}$).
- **Walk-Forward Cross-Validation**: Continuous rolling-origin out-of-sample backtesting evaluating MAE, RMSE, MAPE, and horizon degradation without lookahead bias.
- **Cross-Sensor Incident Intelligence (Phase 2)**: Correlates disparate physical signals within sliding windows to detect unified incidents (`COOKING_EVENT`, `WATER_LEAK`, `AC_FAILURE`, `WINDOW_THERMAL_EVENT`) with a **0.00% false-positive rate** under clean baseline conditions.
- **Predictive Incident Anticipation (Phase 5)**: Solves analytical Gaussian CDF hazard probabilities $P(Y \ge T) = 1 - \Phi\left(\frac{T - \hat{y}}{\sigma}\right)$ to generate early warnings before physical breaches occur.
- **Closed-Loop Intelligent Automation (Phase 7)**: Safe, explainable actuator control layer. Predictions never actuate directly; every action passes through an explicit fail-closed safety evaluator, low-voltage boundary enforcement, and post-actuation verification ($\Delta M$).
- **Physical Hardware Acceptance Testing (Phase 6 & 6B)**: 8 end-to-end hardware acceptance tests validating real ESP32 DevKit v1 boards, GPIO sensors (DHT22, PIR, Reed switch), Wi-Fi reconnection, and MQTT broker recovery.
- **Production Observability & Causal Audit (Phase 8)**: Structured `SystemEvent` audit log tracking causality across stages with shared `correlationId`s, sliding-window $p50/p95/p99$ latency metrics, and deterministic `/api/health` diagnostics.
- **Deterministic Presentation Console (Phase 8)**: Interactive presenter console at `/demo` executing 6 controlled, real-pipeline scenarios with zero synthetic heuristics or UI faking.

---

## Quantitative Machine Learning Evaluation

Evaluated via rolling-origin walk-forward cross-validation across 40,320 hourly telemetry readings:

| Target Metric | Baseline Model | GBDT Tree Model | RMSE Baseline | RMSE GBDT | Improvement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Household Power** | Seasonal Diurnal AR | GBDT Regressor (50 trees, depth 4) | $342.6\,\text{W}$ | $246.3\,\text{W}$ | **-28.1%** |
| **Indoor Temperature** | Exponential Moving Avg | GBDT Regressor (50 trees, depth 4) | $0.84^\circ\text{C}$ | $0.61^\circ\text{C}$ | **-27.4%** |
| **Indoor CO₂** | Linear Trend + Diurnal | GBDT Regressor (50 trees, depth 4) | $92.4\,\text{ppm}$ | $68.1\,\text{ppm}$ | **-26.3%** |
| **Room Occupancy** | Naive Persistence | Bayesian Prior + Motion Decay | $0.38$ | $0.19$ | **-50.0%** |

*All inferences execute within an 8.7 ms average latency envelope with an automatic 800 ms circuit-breaker fallback to statistical baselines.*

---

## Physical Hardware Integration & IoT Bench (Phase 6 & 6B)

The platform communicates with physical **ESP32 DevKit v1** nodes over 2.4 GHz Wi-Fi and MQTT:

```
Physical Sensors ──> ESP32 DevKit v1 ──> Wi-Fi (2.4 GHz) ──> Mosquitto (:1883) ──> MQTT Gateway ──> PostgreSQL ──> Next.js 15 UI
```

### Hardware Pinout & Bench Specifications
- **Microcontroller**: ESP32 DevKit v1 (Espressif ESP-WROOM-32)
- **DHT22 (AM2302)** on `GPIO 4`: Temperature ($^\circ\text{C}$) & Relative Humidity ($\%$)
- **HC-SR501 PIR Sensor** on `GPIO 18`: Room Occupancy State ($0 \to 1$)
- **Magnetic Reed Switch** on `GPIO 19` (`INPUT_PULLUP`): Contact Envelope ($0 = \text{Closed}, 1 = \text{Open}$)
- **Status LED** on `GPIO 2`: Heartbeat & MQTT connectivity indicator
- **Low-Voltage Actuator Relay** on `GPIO 23`: Auxiliary ventilation/fan control (optocoupler isolated)

Firmware source code and PlatformIO project configuration are located in [`firmware/`](firmware/).

---

## Technical Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | Next.js 15 (App Router), React 19, TypeScript 5.7 |
| **Styling & Visualization** | Tailwind CSS 3.4, Lucide React, SVG Floor Plans, Canvas Sparklines |
| **Backend & Runtime** | Node.js v20/v22, Next.js Server Actions, Web Streams API (SSE) |
| **Database & ORM** | PostgreSQL 15+, Prisma ORM 6.1 (Composite Indexing, Connection Pooling) |
| **Validation & Security** | Zod 3.24, scrypt token hashing, HMAC-SHA256 session signatures |
| **Edge IoT & Messaging** | Eclipse Mosquitto MQTT v2.0, MQTT.js client, ESP32 C++ (PlatformIO) |
| **Testing & Quality** | Vitest 2.1, 33 test suites, 158+ automated unit/integration/E2E tests |

---

## Quickstart & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or v22+
- **PostgreSQL**: v15+ (Local or Docker)
- **MQTT Broker** *(Optional for physical hardware)*: Eclipse Mosquitto on port 1883

### 2. Installation
```bash
git clone https://github.com/aadeeshsh15-netizen/home-intelligence-platform.git
cd "home-intelligence-platform"
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your database connection string is configured:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/home_intelligence?schema=public"
JWT_SECRET="super-secret-dev-jwt-key-change-in-production-min-32-chars"
MQTT_BROKER_URL="mqtt://localhost:1883"
```

### 4. Database Setup & Telemetry Seeding
```bash
# Push schema and generate Prisma client
npx prisma db push

# Seed 30 days of realistic correlated telemetry, 168h baselines, devices, and rules
npm run db:seed
```
*Default Seeded User:* `engineer@homeintelligence.internal` (Password: `admin123`)

### 5. Launch the Platform
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running Verification Suites & Benchmarks

Execute the entire test suite (unit, integration, ML backtests, hardware acceptance, automation benchmarks, and observability):

```bash
npm test -- --fileParallelism=false
```

### Test Suite Coverage:
- **Physics & Thermodynamics**: Gaussian Z-scores, percentiles, Newton's law of thermal cooling, CO₂ mass balance equations.
- **Machine Learning & Baselines**: Autoregressive residual decay, EMA momentum, Bayesian occupancy priors, GBDT inference, walk-forward cross-validation.
- **Cross-Sensor Incidents**: Cooking activity, unmonitored water leaks, AC cooling failures, thermal envelope breaches.
- **Predictive Anticipation**: Gaussian CDF hazard calculations, time-to-threshold estimations, early warning triggers.
- **Physical IoT Lifecycle**: Salted token hashing, replay protection, device disconnect watchdogs (`ONLINE` $\to$ `STALE` $\to$ `OFFLINE`).
- **Closed-Loop Automation**: Policy resolution, flapping damping, fail-closed safety rejection, low-voltage isolation, post-actuation verification.
- **Observability & Metrics**: In-process rolling latencies ($p50/p95/p99$), deterministic health checks, structured `SystemEvent` audit logging.

To run physical hardware acceptance tests against a live MQTT broker:
```bash
npx tsx scripts/validate-hardware.ts
```

---

## Presentation & Demo Runbook

An interactive, deterministic demonstration console is available at `/demo`. It executes 6 real-pipeline operational scenarios:

1. **Normal Household Operation**: Nominal baseline operations with healthy telemetry corridors.
2. **Unmonitored Water Leak**: Multi-sensor correlation of continuous flow during unoccupied hours.
3. **CO₂ Buildup & Autonomous Ventilation**: Predictive hazard detection, fail-closed policy evaluation, command dispatch, and empirical $\Delta M$ verification.
4. **AC Cooling Deficit**: Compressor failure anticipation under rising indoor thermal load.
5. **Peak Energy Surge**: GBDT multi-horizon power surge prediction and autonomous non-essential load shedding.
6. **Safety Guardrail Rejection**: Fail-closed safety interlock blocking actuation when policy is set to `MANUAL` mode.

For a detailed minute-by-minute presentation script, see [`docs/demo-guide.md`](docs/demo-guide.md).

---

## Architectural Documentation Index

Comprehensive engineering specifications are located in [`docs/`](docs/):

- [`architecture.md`](docs/architecture.md): Canonical 12-stage control loop, component interactions, and latency budgets.
- [`demo-guide.md`](docs/demo-guide.md): 2-minute presenter script with screen transitions and talking points.
- [`automation-architecture.md`](docs/automation-architecture.md): Phase 7 closed-loop architecture, safety guardrails, and verification engine.
- [`closed-loop-evaluation.md`](docs/closed-loop-evaluation.md): Empirical verification benchmarks across 8 controlled automation scenarios.
- [`command-protocol.md`](docs/command-protocol.md): Phase 7 MQTT command/acknowledgment contracts and GPIO firmware handlers.
- [`hardware-validation.md`](docs/hardware-validation.md): Phase 6B physical ESP32 hardware acceptance test report.
- [`iot-architecture.md`](docs/iot-architecture.md): Phase 6 edge microcontroller architecture and MQTT topic design.
- [`predictive-incidents.md`](docs/predictive-incidents.md): Phase 5 predictive incident engine and hazard formulations.
- [`ml-model-evaluation.md`](docs/ml-model-evaluation.md): Phase 4 GBDT tree model evaluation and walk-forward benchmark.
- [`data-model.md`](docs/data-model.md): PostgreSQL entity relationships, cascade policies, and composite indexes.
- [`engineering-audit.md`](docs/engineering-audit.md): Complete subsystem audit and verified vulnerability remediations.

---

## Architectural Trade-Offs & Design Decisions

1. **In-Memory Forecasts vs. Precomputed Persistence**:
   - *Decision*: Forecasts across 4 horizons are calculated on-demand with a 30-second memory cache rather than continuously written to PostgreSQL.
   - *Rationale*: Precomputing 4 horizons for 100 sensors every minute generates $>500,000$ database rows daily with $99.9\%$ going unread. On-demand inference (<10 ms) with caching eliminates database bloat while delivering fresh predictions.
2. **Fail-Closed Safety vs. Control Availability**:
   - *Decision*: If an actuator reports `STALE` status or if telemetry is missing, the automation engine rejects execution immediately.
   - *Rationale*: In residential environments, false actuations (e.g., closing a valve or cycling a compressor unnecessarily) present higher physical risk than delayed interventions.
3. **Parametric Gaussian Baselines vs. Deep Neural Networks**:
   - *Decision*: Single-sensor anomaly detection relies on 168-hour empirical Gaussian distributions ($\mu \pm 2.5\sigma$) rather than opaque autoencoders.
   - *Rationale*: Complete mathematical explainability. Every anomaly card provides the exact mean, standard deviation, and sample count so users and engineers can audit why an alert fired.

---

## Author & Attribution

- **Architect & Author**: Aadeesh Sharma ([@aadeeshsh15-netizen](https://github.com/aadeeshsh15-netizen))
- **Email**: [aadeeshsh15@gmail.com](mailto:aadeeshsh15@gmail.com)
- **License**: MIT
