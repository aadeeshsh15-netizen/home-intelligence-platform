# Home Intelligence Platform

[![CI Status](https://github.com/aadeeshsh15-netizen/home-intelligence-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/aadeeshsh15-netizen/home-intelligence-platform/actions)
[![Release](https://img.shields.io/badge/release-v1.0.0-blue.svg)](docs/releases/v1.0.0.md)
[![Tests](https://img.shields.io/badge/tests-194%20passed-brightgreen.svg)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-15.1%20App%20Router-black?logo=next.js)](next.config.ts)
[![Docker](https://img.shields.io/badge/Docker-Production%20Stack-2496ED?logo=docker)](docker-compose.prod.yml)
[![Hardware](https://img.shields.io/badge/Hardware-ESP32%20DevKit%20v1-E7352C?logo=espressif)](firmware/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **Topics / Tags**: `iot`, `smart-home`, `digital-twin`, `predictive-maintenance`, `machine-learning`, `gbdt`, `time-series-forecasting`, `mqtt`, `esp32`, `typescript`, `nextjs`, `prisma`, `postgresql`, `closed-loop-control`, `reliability-engineering`

---

## ⚡ 60-Second Executive Summary

| Question | Engineering Answer |
| :--- | :--- |
| **What is it?** | A production-grade digital twin, predictive machine learning, and closed-loop automation platform for residential environments, connected IoT devices, and multi-sensor telemetry. |
| **Why is it interesting?** | Standard smart homes are dumb remote-control switchboards. This platform models the home as an interconnected thermodynamic, electrical, and human-inhabited system that anticipates hazards before they breach and verifies physical actuator response ($\Delta M$). |
| **How does it work?** | Executes an autonomous 12-stage operational pipeline: **Sense $\to$ Ingest $\to$ Validate $\to$ Detect $\to$ Correlate $\to$ Predict $\to$ Anticipate $\to$ Decide $\to$ Interlock $\to$ Act $\to$ Verify $\to$ Audit**. |
| **What technologies are used?** | **Full-Stack TypeScript**: Next.js 15 App Router, React 19, Tailwind CSS, PostgreSQL, Prisma ORM, Eclipse Mosquitto MQTT, ESP32 C++/PlatformIO, in-process Gradient Boosted Decision Trees (GBDT), Docker Compose, and Vitest. |
| **What was physically tested?** | Real **ESP32 DevKit v1** hardware running DHT22 (temp/humidity), HC-SR501 PIR (occupancy), and magnetic reed switches over 2.4 GHz Wi-Fi and MQTT QoS 1 across 8 hardware acceptance gates. |
| **What are the measured results?** | **-28.1% RMSE reduction** over statistical baselines, **0.00% false-positive rate** under clean baseline suites, sub-9ms GBDT inference, and **194/194 tests passing**. |
| **How do I run it?** | `cp .env.example .env && npm run bootstrap && npm run dev` |
| **How do I demo it?** | Run `npm run demo` and open `http://localhost:3000/demo` for an interactive 2-minute deterministic presentation runner. |

---

## 📑 Portfolio & Technical Deep-Dive Index

For technical evaluators, hiring managers, and system architects:
- **[Architectural Portfolio Summary](docs/portfolio-summary.md)**: Executive architectural summary covering ML methodology, IoT contracts, closed-loop safety, and benchmarks.
- **[Technical Interview Notes](docs/interview-notes.md)**: Authentic, implementation-accurate explanations for 9 core architectural decisions (GBDT vs. DNN, false positive control, fail-closed guardrails, $\Delta M$ trajectory verification).
- **[Production Deployment Guide](docs/production-deployment.md)**: Single-node Ubuntu 22.04 LTS deployment path with Docker Compose, reverse proxy, Let's Encrypt TLS, migrations, and rollbacks.
- **[Release Notes (v1.0.0)](docs/releases/v1.0.0.md)** & **[Changelog](CHANGELOG.md)**: Detailed capabilities, validation metrics, and release history across Phases 1–10.
- **[Production Operations Manual](docs/operations.md)**: Probes, backup/restore, secret rotation, and incident runbooks.
- **[Physical Hardware Validation Report](docs/hardware-validation.md)**: ESP32 DevKit v1 breadboard test results, cold-boot NaN filtering, and watchdog invariants.

---

## 📸 Platform User Interface & Observability Console

Official screenshot captures with capture specifications are documented in [`docs/screenshots/README.md`](docs/screenshots/README.md):

| Screenshot View | Route | Description |
| :--- | :--- | :--- |
| **1. Operational Dashboard** | `/` | Real-time digital twin state, 2D floor plan, multi-channel telemetry streams, and SLA evaluation. |
| **2. Production Observability** | `/observability` | Rolling in-process latency percentiles ($p50/p95/p99$), throughput gauges, and causal audit timeline. |
| **3. 12-Stage Control Loop** | `/architecture` | Interactive pipeline visualizer mapping end-to-end telemetry propagation to actuator verification. |
| **4. Presentation Runner** | `/demo` | 8-stage interactive control path tracker and 2-minute reproducible presentation scenarios. |
| **5. Closed-Loop Automations** | `/automations` | Policy evaluation rules, fail-closed safety interlocks, and empirical $\Delta M$ trajectory verification. |
| **6. Dual-Fleet Management** | `/devices` | Physical ESP32 microcontrollers and digital twin virtual nodes with watchdog monitoring. |
| **7. Predictive Forecasting** | `/insights` | Multi-horizon GBDT forecasts ($15\text{m}, 1\text{h}, 4\text{h}, 24\text{h}$) and analytical Gaussian CDF hazard modeling. |

---

## 🏛️ The 12-Stage Closed-Loop Control Architecture

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

## 📊 Quantitative Machine Learning & Incident Benchmarks

Evaluated via rolling-origin walk-forward cross-validation across 40,320 hourly telemetry readings:

| Target Metric | Baseline Model | GBDT Tree Model | RMSE Baseline | RMSE GBDT | Improvement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Household Power** | Seasonal Diurnal AR | GBDT Regressor (50 trees, depth 4) | $342.6\,\text{W}$ | $246.3\,\text{W}$ | **-28.1%** |
| **Indoor Temperature** | Exponential Moving Avg | GBDT Regressor (50 trees, depth 4) | $0.84^\circ\text{C}$ | $0.61^\circ\text{C}$ | **-27.4%** |
| **Indoor CO₂** | Linear Trend + Diurnal | GBDT Regressor (50 trees, depth 4) | $92.4\,\text{ppm}$ | $68.1\,\text{ppm}$ | **-26.3%** |
| **Room Occupancy** | Naive Persistence | Bayesian Prior + Motion Decay | $0.38$ | $0.19$ | **-50.0%** |

- **Sub-9ms Latency**: In-process tree traversal executes in $\approx 8.7\,\text{ms}$ with an automatic 800 ms circuit-breaker fallback to statistical baselines.
- **Zero-Hallucination Corroboration**: Multi-channel sliding-window correlation delivers a **0.00% false-positive rate** under clean baseline operating conditions.

---

## 🔌 Physical Hardware Integration & IoT Bench

The platform communicates with physical **ESP32 DevKit v1** microcontrollers over 2.4 GHz Wi-Fi and MQTT:

```
Physical Sensors ──> ESP32 DevKit v1 ──> Wi-Fi (2.4 GHz) ──> Mosquitto (:1883) ──> MQTT Gateway ──> PostgreSQL ──> Next.js 15 UI
```

### Hardware Pinout & Bench Specifications
- **Microcontroller**: ESP32 DevKit v1 (Espressif ESP-WROOM-32)
- **DHT22 (AM2302)** on `GPIO 4`: Temperature ($^\circ\text{C}$) & Relative Humidity ($\%)
- **HC-SR501 PIR Sensor** on `GPIO 18`: Room Occupancy State ($0 \to 1$)
- **Magnetic Reed Switch** on `GPIO 19` (`INPUT_PULLUP`): Contact Envelope ($0 = \text{Closed}, 1 = \text{Open}$)
- **Status LED** on `GPIO 2`: Heartbeat & MQTT connectivity indicator
- **Low-Voltage Actuator Relay** on `GPIO 23`: Auxiliary ventilation/fan control (optocoupler isolated)

Firmware source code and PlatformIO project configuration are located in [`firmware/`](firmware/).

---

## 🚀 Quickstart & Presentation Demo

### 1. Prerequisites
- Node.js 22+ & npm 10+
- Docker Engine 24+ & Docker Compose (for production stack)

### 2. Local Setup
```bash
# 1. Clone repository
git clone https://github.com/aadeeshsh15-netizen/home-intelligence-platform.git
cd home-intelligence-platform

# 2. Configure environment
cp .env.example .env

# 3. Bootstrap database and seed data
npm run bootstrap

# 4. Start local development server
npm run dev
# Dashboard available at http://localhost:3000
```

### 3. Presentation Runner (2-Minute Demo)
```bash
npm run demo
# Access interactive console at http://localhost:3000/demo
```
Select any of the 6 controlled scenarios (e.g., *CO₂ Buildup & Autonomous Ventilation*, *Peak Energy Surge*, *Unmonitored Water Leak*) and click **Auto-Play All** to witness the complete 8-stage loop in real time.

---

## 🐳 Production Deployment Stack

The platform provides a production Docker Compose stack ([`docker-compose.prod.yml`](docker-compose.prod.yml)) running:
1. **Next.js 15 Standalone Application Container**: Multi-stage `node:22-alpine` build running as unprivileged user `nextjs:nodejs` (UID 1001) with internal healthchecks.
2. **PostgreSQL 16 Alpine**: Relational store with healthcheck-ordered dependency and persistent volume storage.
3. **Eclipse Mosquitto 2**: Lightweight MQTT message broker with persistent volume storage.

```bash
# Launch production container stack
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations inside container
docker compose -f docker-compose.prod.yml exec app npm run bootstrap

# Check diagnostic readiness
docker compose -f docker-compose.prod.yml exec app npm run check:readiness
```

For complete production deployment instructions including Caddy reverse proxy and domain setup, see [`docs/production-deployment.md`](docs/production-deployment.md).

---

## 🛡️ Operational Reliability & Verification Gates

| Metric / Gate | Measurement / SLA | Verification Command |
| :--- | :--- | :--- |
| **Static Typecheck** | **0 Errors** (100% clean) | `npx tsc --noEmit` |
| **Test Suite** | **43 / 43 files passed (194 / 194 tests)** | `npm test -- --fileParallelism=false` |
| **Production Build** | **22 UI pages, 37 API routes generated** | `npm run build` |
| **Ingestion SLA** | $p50 < 10\,\text{ms},\; p95 < 25\,\text{ms}$ | Measured live in `/observability` |
| **Inference SLA** | $p50 < 9\,\text{ms},\; p95 < 15\,\text{ms}$ | Measured live in `/observability` |
| **Health Probe** | HTTP 200 / 503 fallback | `curl http://localhost:3000/api/ready` |

---

## ⚠️ Known Engineering Limitations & Tradeoffs

1. **In-Memory Single-Node State**: Sliding latency windows and rate limiters operate in process memory; multi-instance horizontal clustering requires Redis for shared rate limiting.
2. **Low-Voltage Actuator Scope**: Safety policy explicitly restricts automated commands to low-voltage actuators (relays, smart plugs, dampers). Mains-voltage electrical switching is deliberately excluded to prevent physical safety hazards.
3. **Tree Size Budget**: GBDT models are constrained to 50 trees (depth 4) to ensure sub-10ms inference times on serverless and edge nodes.
4. **Known UI Limitation (Floor Switcher)**: The Floor 1 / First Floor selector in the digital twin visualization is currently a non-functional presentation control. The underlying room telemetry, interactive room hotspots, environmental sensing, and digital-twin visualization remain fully operational.

---

## 👤 Author & Attribution

- **Architect & Author**: Aadeesh Sharma ([@aadeeshsh15-netizen](https://github.com/aadeeshsh15-netizen))
- **Email**: [aadeeshsh15@gmail.com](mailto:aadeeshsh15@gmail.com)
- **License**: MIT
