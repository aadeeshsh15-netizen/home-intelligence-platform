# Home Intelligence Platform — Screenshots & Media Specification

This directory specifies the official portfolio media and screenshots captured from the live platform.

## Capture Environment & Standards
- **Resolution**: 1920x1080 (16:9 Full HD)
- **Color Theme**: Dark Slate Theme (Platform Default)
- **Browser**: Chromium-based (clean profile, no extension overlays, 100% zoom)
- **Telemetry State**: Populated via `npm run bootstrap` and `npm run demo`

---

## Required Portfolio Screenshots

### 1. `01-dashboard.png` — Real-Time Operations & System Health Dashboard
- **Route**: `http://localhost:3000/`
- **Focus**: Global system status banner (HEALTHY / SLA compliant), live 2D interactive floor plan showing room states, active sensor cards (temperature, humidity, CO2, power), active anomaly counter, and recent events stream.
- **Caption**: *Live operational dashboard displaying real-time digital twin state, multi-channel telemetry streams, and instantaneous system health SLA evaluation.*

### 2. `02-observability.png` — Observability & Latency Percentiles
- **Route**: `http://localhost:3000/observability`
- **Focus**: Rolling sliding-window latency percentiles (p50, p95, p99) for Ingestion, Prediction, Decision, and Command roundtrip; real-time throughput gauges; live Causal Audit Timeline showing chronological SystemEvents tagged with `correlationId`.
- **Caption**: *Production observability console with rolling in-process latency percentiles (p50/p95/p99) and causally correlated audit trail.*

### 3. `03-architecture.png` — 12-Stage Closed-Loop Architectural Visualizer
- **Route**: `http://localhost:3000/architecture`
- **Focus**: Complete 12-stage interactive control loop (Sense → Ingest → Validate → Detect → Correlate → Predict → Anticipate → Decide → Interlock → Act → Verify → Audit) with active stage inspection panel and mathematical models.
- **Caption**: *Interactive 12-stage closed-loop architecture visualizer mapping end-to-end telemetry propagation to actuator verification.*

### 4. `04-demo-console.png` — Deterministic Presentation Runner
- **Route**: `http://localhost:3000/demo`
- **Focus**: 8-stage visual pipeline tracker, 2-minute Evaluator Guide, scenario grid (CO2 Ventilation, Peak Shaving, Rapid Cold Gradient, Transient Rejection, Multi-Sensor Leak, Actuator Failure), step progression bar, and real-time ingestion summary.
- **Caption**: *Deterministic presentation runner executing reproducible 2-minute live scenarios through the real intelligence and safety pipeline.*

### 5. `05-automations.png` — Closed-Loop Automation & Verification
- **Route**: `http://localhost:3000/automations`
- **Focus**: Policy evaluation rules (HVAC, Ventilation, Peak Shaving), fail-closed safety interlocks, low-voltage actuator command history, and Delta-M empirical trajectory verification results.
- **Caption**: *Autonomous decision engine with fail-closed safety guardrails and empirical post-actuation trajectory verification (Delta-M).*

### 6. `06-devices.png` — Physical & Virtual Fleet Management
- **Route**: `http://localhost:3000/devices`
- **Focus**: Device fleet table showing physical ESP32 DevKit v1 nodes (protocol: MQTT) and digital twin simulated devices (protocol: SIMULATED), provisioning tokens, watchdog connectivity statuses (ONLINE, STALE, OFFLINE), and attached sensors.
- **Caption**: *Dual-fleet device manager supporting physical ESP32 microcontrollers over MQTT and virtual digital twin nodes with independent watchdog monitoring.*

### 7. `07-insights.png` — Predictive Forecasting & Hazard Modeling
- **Route**: `http://localhost:3000/insights`
- **Focus**: Multi-horizon GBDT forecasts (15m, 1h, 4h, 24h) with confidence intervals, analytical Gaussian CDF hazard probabilities P(Y >= T), time-to-threshold early warning meters, and historical walk-forward backtest comparisons.
- **Caption**: *Multi-horizon predictive intelligence displaying GBDT regression horizons and analytical Gaussian CDF hazard anticipation.*
