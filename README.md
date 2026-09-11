# Home Intelligence Platform

A production-grade, TypeScript-first web platform for modeling, monitoring, analyzing, and detecting anomalies across household environments, connected devices, and telemetry sensors.

> **"Understand the home, not merely control it."**

---

## Highlights & System Capabilities

- **Digital Twin Modeling**: Structured relational hierarchy (`Home` $\to$ `Floors` $\to$ `Rooms` $\to$ `Devices` $\to$ `Sensors` $\to$ `Telemetry` $\to$ `Events` $\to$ `Incidents` $\to$ `Insights` $\to$ `PredictionModel` $\to$ `ModelEvaluation`).
- **Strict Producer vs. Consumer Separation**: Built to ingest data from both an integrated thermodynamic physics simulator and external physical microcontrollers (ESP32/ESP8266) over MQTT without altering application logic.
- **Predictive Home Intelligence (Phase 3)**: Transitions platform from reactive correlation to multi-horizon predictive forecasting (`Observe` $\to$ `Detect` $\to$ `Correlate` $\to$ `Predict`). Predicts `HOUSEHOLD_POWER`, `ROOM_TEMPERATURE`, `ROOM_CO2`, and `OCCUPANCY_PROBABILITY` across $15\text{m}, 1\text{h}, 4\text{h}, 24\text{h}$ horizons.
- **Deterministic Mathematical Baselines & Pluggable ML**: No LLMs or synthetic heuristics. Implements Seasonal Diurnal with Autoregressive Residual Decay ($\hat{y} = \mu_{d, h} + e^{-\lambda h}(y_0 - \mu_0)$), Naive Persistence, EMA with damped momentum, and Bayesian Occupancy Prior with motion decay. Features pluggable `IPredictionProvider` interface for remote Python ML services (LightGBM/ONNX) with 800ms circuit-breaker fallback.
- **Rolling-Origin Walk-Forward Backtesting**: Continuous out-of-sample cross-validation evaluating MAE, RMSE, MAPE, inference latency (<10ms SLA), and horizon degradation without lookahead bias. Durable evaluation records persisted to PostgreSQL.
- **Cross-Sensor Incident Intelligence Engine (Phase 2)**: Correlates temporally synchronized signals across multiple independent physical sensors (Power, Temperature, Humidity, CO₂, PM2.5, Water Flow, Contact) to detect unified household incidents (`COOKING_EVENT`, `WATER_LEAK`, `AC_FAILURE`, `WINDOW_THERMAL_EVENT`) with automated deduplication and auto-cooldown resolution.
- **Deterministic AI & Explainable Proofs**: Zero LLM hallucination and zero fabricated confidence scores. Uses parametric Gaussian baseline corridors ($\mu \pm 2.5\sigma$) and closed-form multi-sensor corroboration equations.
- **Interactive 2D Floor Plan Schematic**: Scaled vector representation of household floors with live sensor badges, occupancy indicators, and direct room deep-linking.
- **Multi-Horizon Forecast & Analytics Overlays**: Time-series charts in `/analytics` and `/rooms/[id]` with empirical baseline corridors, forecast trajectory lines, 80%/95% confidence intervals, model selector, data quality badges, and interactive backtest triggers.
- **Realtime Event-Driven Architecture**: Server-Sent Events (SSE) stream delivering instantaneous updates, connectivity heartbeat, threshold breaches, statistical anomalies, and multi-sensor incidents.
- **Closed-Loop Intelligent Automation (Phase 7)**: Closes the operational loop from passive anticipation to verified physical actuation ($\text{Sense} \to \text{Detect} \to \text{Correlate} \to \text{Predict} \to \text{Anticipate} \to \text{Decide} \to \text{Act} \to \text{Verify}$). Decouples predictive forecasts from actuation with a fail-closed safety evaluator, low-voltage control policies, idempotent command dispatcher, and empirical post-actuation verification.
- **High-Performance & Rigorously Verified**: 100% test pass rate across 29 unit, integration, and benchmark suites (136 tests), sub-150ms actuation latency, and 0% false positives.
- **Production-Ready Stack**: Next.js 15 App Router, React 19, Tailwind CSS, PostgreSQL, Prisma ORM, Zod, and Vitest.

---

## System Architecture

```mermaid
graph TD
    subgraph Producers ["Telemetry Ingestion Layer"]
        SIM["Thermodynamic Physics Simulator"]
        MQTT["Hardware MQTT Broker (ESP32 / Zigbee)"]
    end

    subgraph Pipeline ["Ingestion & Normalization Pipeline"]
        ING["POST /api/telemetry/ingest"]
        VAL["Zod Bounds & Reality Validator"]
        BUF["Time-Series Buffer & Deduplicator"]
    end

    subgraph DataStore ["Persistence & Indexing Layer"]
        PG[("PostgreSQL Database (Prisma ORM)")]
        TS[("telemetryReading (Composite Indexed)")]
        BASE[("telemetryBaseline (168-Hour Matrix)")]
    end

    subgraph Engine ["Intelligence & Event Services"]
        RULES["Rule & Threshold Evaluator"]
        ANOMALY["Deterministic Anomaly Engine (Z-Score)"]
        DRIFT["Persistent Drift / Rate-of-Change Detector"]
        SSE["Server-Sent Events (SSE) Broadcaster"]
    end

    subgraph UI ["User Interface (Next.js 15)"]
        DASH["Overview Dashboard"]
        FLOOR["2D Floor Plan Schematic"]
        ROOM["Room Micro-Climate Inspector"]
        HIST["Historical Analytics (24h/7d/30d)"]
        INSIGHT["Explainable AI Proof Inspector"]
    end

    SIM -->|HTTP REST Batch| ING
    MQTT -->|Gateway Bridge| ING
    ING --> VAL
    VAL --> BUF
    BUF --> PG
    PG --> TS
    PG --> BASE
    BUF --> RULES
    BUF --> ANOMALY
    BUF --> DRIFT
    RULES --> SSE
    ANOMALY --> SSE
    BUF --> SSE
    SSE --> DASH
    SSE --> FLOOR
    SSE --> ROOM
    PG --> HIST
    PG --> INSIGHT
```

---

## Engineering Documentation

Detailed engineering specifications and audit reports are located in `/docs`:
- [`automation-architecture.md`](docs/automation-architecture.md): Phase 7 closed-loop architecture, 8-tier progression, fail-closed safety model, and class hierarchy.
- [`command-protocol.md`](docs/command-protocol.md): Phase 7 MQTT command/ack contracts, JSON schemas, firmware GPIO handlers, and idempotency guarantees.
- [`closed-loop-evaluation.md`](docs/closed-loop-evaluation.md): Phase 7 empirical evaluation across 8 controlled benchmark scenarios with 100% pass score.
- [`hardware-validation.md`](docs/hardware-validation.md): Phase 6B physical hardware acceptance test report, sensor bench specifications, and failure mitigations.
- [`iot-architecture.md`](docs/iot-architecture.md): Phase 6 real IoT microcontroller architecture, MQTT broker integration, and device state machines.
- [`mqtt-contract.md`](docs/mqtt-contract.md): Strict MQTT topic taxonomy, payload schemas, and Quality of Service (QoS) guarantees.
- [`device-provisioning.md`](docs/device-provisioning.md): Device registration, scrypt token hashing, and hardware lifecycle management.
- [`predictive-incidents.md`](docs/predictive-incidents.md): Phase 5 predictive incident engine, multi-horizon lead-time anticipation, and mitigation runbooks.
- [`predictive-evaluation.md`](docs/predictive-evaluation.md): Phase 5 benchmark suite evaluating predictive incident detection against false alarms.
- [`ml-model-evaluation.md`](docs/ml-model-evaluation.md): Phase 4 learned ML (GBDT & Random Forest) vs statistical baseline walk-forward comparison.
- [`prediction-evaluation.md`](docs/prediction-evaluation.md): Phase 3 multi-horizon forecast accuracy and degradation audit.
- [`engineering-audit.md`](docs/engineering-audit.md): Comprehensive subsystem audit, verified vulnerability remediations, and technical debt.
- [`intelligence-evaluation.md`](docs/intelligence-evaluation.md): Quantitative benchmark report across 7 controlled scenarios, detection latency, and failure mode analysis.
- [`architecture.md`](docs/architecture.md): In-depth system design, data flows, and component breakdown.
- [`data-model.md`](docs/data-model.md): Relational schema, entity relationships, cascade policies, and composite indexes.
- [`telemetry.md`](docs/telemetry.md): Producer/consumer ingestion contracts, physical simulation equations, and ESP32 MQTT guide.
- [`intelligence.md`](docs/intelligence.md): Mathematical formulations for baseline matrices, Z-score derivations, and explainability proofs.


---

## Quickstart & Local Development

### Prerequisites
- **Node.js**: v20 or v22+
- **PostgreSQL**: v15+ running locally on port 5432 (or via Docker Compose)

### 1. Installation
```bash
git clone https://github.com/your-repo/home-intelligence-platform.git
cd "home-intelligence-platform"
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default connection string:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/home_intelligence?schema=public"
JWT_SECRET="super-secret-dev-jwt-key-change-in-production-min-32-chars"
```

### 3. Initialize Database & Seed High-Fidelity Telemetry
```bash
# Push schema and generate Prisma client
npx prisma db push

# Seed 30 days of realistic correlated telemetry (40,320 readings, 4,704 baselines), devices, and rules
npm run db:seed
```
*Default Seeded User:* `engineer@homeintelligence.internal` (Password: `admin123`)

### 4. Run Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

---

## Automated Testing & Benchmarks

Run test suites (Vitest):
```bash
npm run test
```
The test suite (136 automated tests across 29 test suites) verifies:
- **Unit Math, Physics & Thermodynamics**: Statistical distributions, Z-scores, percentiles, downsampling, linear regression slopes, diurnal cycles, Newton's law of thermal cooling, and CO₂ mass balances.
- **Predictive Mathematical Baselines**: Autoregressive residual decay, Naive Persistence expanding uncertainty, EMA damped momentum, Bayesian occupancy prior relaxation, and trigonometric cyclical encodings.
- **Learned Machine Learning Models (Phase 4)**: Gradient Boosted Decision Trees (GBDT) and Random Forest inference, rolling-origin walk-forward evaluation, and sub-10ms circuit-breaker fallback.
- **Predictive Incident Intelligence (Phase 5)**: Multi-horizon lead-time anticipation for CO₂ ventilation alerts, compressor failures, peak energy surges, and thermal ingress with automated mitigation runbooks.
- **Physical Reality Bounds**: Ingestion validation schemas, PM2.5 boundary checks, and sensor unit mismatch rejection.
- **Multi-Tenant Security**: HMAC-SHA256 signed session token generation, verification, tampering rejection, and home ownership authorization.
- **Pipeline Integrity**: Database-level duplicate suppression (`skipDuplicates: true`), out-of-order timestamp regression protection, and inactive sensor timeout transitions.
- **Cross-Sensor Incident Intelligence Engine**: Controlled benchmark evaluating cooking activity, water leaks, AC failures, window thermal breaches, and 0% false positives under baseline operations.
- **IoT Microcontroller Lifecycle & Security (Phase 6)**: Scrypt salted device token hashing, replay timestamp protection, tenant isolation, and watchdog inactivity transitions (`ONLINE` $\to$ `STALE` $\to$ `OFFLINE`).
- **Physical Hardware Acceptance Test Suite (Phase 6B)**: 8 end-to-end hardware acceptance tests verifying physical temperature, humidity, PIR occupancy, reed switch contact, disconnect watchdog preservation, auto-recovery, and multi-sensor scenario dispatch.
- **Closed-Loop Intelligent Automation & Verification (Phase 7)**: 8 controlled benchmark scenarios (100% pass score) validating anticipatory CO₂ ventilation, cooling assist, peak load shedding, fail-closed offline rejection, manual override enforcement, command idempotency, timeout recovery, and low-probability suppression.

---

## Physical Hardware Integration & Demo (Phase 6 & 6B)

The platform natively ingests telemetry from physical **ESP32 DevKit v1** microcontrollers communicating over 2.4 GHz Wi-Fi and MQTT without requiring mains-voltage hardware.

```
Physical Sensors ──> ESP32 DevKit v1 ──> Wi-Fi (2.4 GHz) ──> MQTT Broker (:1883) ──> Gateway ──> PostgreSQL ──> Next.js 15 UI
```

### Hardware Specification & Pinout
- **Microcontroller**: ESP32 DevKit v1 (ESP-WROOM-32)
- **DHT22 (AM2302)** on `GPIO 4`: Temperature (°C) & Relative Humidity (%)
- **HC-SR501 PIR** on `GPIO 18`: Room Occupancy State ($0 \to 1$)
- **Magnetic Reed Switch** on `GPIO 19` (`INPUT_PULLUP`): Window/Door Contact ($0 = \text{Closed}, 1 = \text{Open}$)
- **Status LED** on `GPIO 2`: Heartbeat indicator

### Running the Hardware Acceptance Validation Suite
Execute the hardware validation script to verify all 8 acceptance tests against the live database and MQTT broker:
```bash
npx tsx scripts/validate-hardware.ts
```

### Flashing a Physical ESP32 Device
1. Navigate to **Fleet Inventory** (`/devices`) in the Web UI.
2. Click **Provision ESP32 Node**, select room and equipped sensors, and submit.
3. Copy the generated credentials snippet to `firmware/include/config.h`.
4. Build and flash the firmware using PlatformIO:
   ```bash
   cd firmware
   pio run --target upload
   pio device monitor -b 115200
   ```
5. View physical telemetry update live across the 2D Floor Plan (`/home-view`), Room Inspector (`/rooms/[id]`), and Realtime SSE Stream.

---

## Closed-Loop Intelligent Automation (Phase 7)

Phase 7 introduces an intelligent, safe, and explainable actuation and control layer that bridges predictions and physical actuators:

```
Sense ──> Detect ──> Correlate ──> Predict ──> Anticipate ──> Decide ──> Act ──> Verify
```

### Key Engineering Guarantees
- **Decoupled Decision Engine**: Predictive models never directly actuate devices. All interventions pass through `AutomationDecisionEngine`.
- **Fail-Closed Safety Model**: Actions are immediately blocked if a policy is set to `MANUAL` or `DISABLED`, if the target device is `OFFLINE` or `STALE`, or if electrical safety is breached.
- **Strict Low-Voltage Operation**: Software and hardware safeguards restrict automation strictly to low-voltage actuators (auxiliary DC relays, ventilation fans, LEDs). Mains-voltage switching is prohibited.
- **Empirical Verification Loop**: Following command dispatch, the `AutomationVerificationEngine` tracks post-actuation telemetry against pre-actuation baselines to verify physical trajectory ($\Delta\text{Metric}$) and assign terminal states (`VERIFIED_EFFECTIVE` / `VERIFIED_INEFFECTIVE`).
- **Web UI Management**: View live automation policies, trigger manual commands, toggle `AUTO`/`MANUAL` modes, inspect real-time intervention executions, and audit closed-loop metrics at `/automations`.

---

## Docker Deployment

Build and run the entire platform with PostgreSQL container:
```bash
docker compose up --build
```
The application will be accessible on `http://localhost:3000`.
