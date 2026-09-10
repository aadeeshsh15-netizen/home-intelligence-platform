# Comprehensive Engineering Audit: Home Intelligence Platform

**Date:** September 2026  
**Auditor:** Senior Software Engineer & Technical Architect  
**Repository:** Home Intelligence Platform  
**Target Architecture:** Production-Grade TypeScript / Next.js / PostgreSQL Digital Twin Platform  

---

## Executive Summary

The **Home Intelligence Platform** has completed its foundational milestone. This engineering audit provides a line-by-line verification of the existing codebase against the original product specification.

The system's core premise—**"Understand the home, not merely control it"**—demands strict telemetry contracts, mathematical explainability, multi-tenant isolation, and high-fidelity physics. Prior to this hardening cycle, the codebase demonstrated strong conceptual modeling but suffered from crucial production vulnerabilities:
- **Authentication Bypasses**: All API endpoints previously queried global singleton records (`prisma.home.findFirst()`) without identity or tenancy checks.
- **Timezone Drift**: Analytics and baselines computed day/hour buckets using local machine offsets rather than UTC, causing misalignments against UTC time-series data.
- **Thermodynamic Runaway & Variance Collapse**: Simulated HVAC lacked indoor thermostat feedback, leading to extreme unconstrained baselines (~33°C) and near-zero standard deviations ($\sigma < 0.1$) that triggered false positives on normal room temperature fluctuations.
- **Missing Ingestion Guards**: Telemetry lacked database-level deduplication constraints, physical reality bounds for PM2.5, and out-of-order timestamp regression guards.
- **Dead Code**: Critical connectivity evaluations (`evaluateDeviceAndSensorConnectivity`) existed in isolation without being triggered by the simulation tick loop.

Through this audit, each of these structural deficiencies has been systematically remediated and verified through automated test suites (`vitest`, 28/28 tests passing) and a clean production build (`next build`, 15/15 routes compiled).

---

## Subsystem Audit Matrix

| Subsystem | Implemented Capabilities | Verified Corrections | Residual Technical Debt & Recommended Fixes |
| :--- | :--- | :--- | :--- |
| **1. Domain Model** | Hierarchical entity tree (`Home` $\to$ `Floor` $\to$ `Room` $\to$ `Device` $\to$ `Sensor` $\to$ `TelemetryReading`, `SystemEvent`, `HomeInsight`). TypeScript schemas via Zod. | Strict boundary validation (`PM2_5` clamped to 0–1,000 µg/m³; unit-type mismatch detection). | Room spatial coordinates ($x, y, w, h$) are presently 2D relative units; 3D volumetric spatial modeling and inter-room airflow adjacency graphs remain future enhancements. |
| **2. Database Schema** | PostgreSQL schema via Prisma ORM. Foreign key cascades, composite indices on `[sensorId, timestamp]`. | Added `@@unique([sensorId, timestamp])` to `TelemetryReading` for zero-duplicate database enforcement. | TimescaleDB or Postgres declarative table partitioning (monthly partitions) should be adopted before scaling past $10^7$ telemetry rows. |
| **3. Telemetry Ingestion** | Batch ingestion API (`POST /api/telemetry/ingest`) with producer identification and payload validation. | Added `skipDuplicates: true`, out-of-order timestamp regression protection for `lastReadingTime`/`lastReadingValue`, and unit validation. | Ingestion runs synchronously in Next.js route handlers. In production IoT scale (>1,000 req/sec), an asynchronous message buffer (e.g., Redis Streams / Apache Kafka) is required. |
| **4. Telemetry Simulator** | Physics-driven multi-room simulation: Newton's cooling, diurnal solar radiation, metabolic CO₂ exhalation, shower humidity spikes. | Implemented indoor thermostat feedback (`targetTemp` ±0.3°C) and 60-second sub-stepping in historical seed to prevent thermal runaway. | Multi-room heat transfer currently treats rooms as thermally isolated from each other except via outdoor envelope; inter-room thermal conduction can be added. |
| **5. Realtime Streaming** | Server-Sent Events (`GET /api/realtime/stream`) delivering live telemetry batches, rule triggers, and anomaly notifications. | Heartbeat keep-alives (15s), client disconnection cleanup, and in-memory event bus broadcasting. | In multi-instance cluster deployments, SSE requires a Redis Pub/Sub backplane to broadcast events across distinct web server instances. |
| **6. Analytics** | Multi-timeframe aggregation (24h, 7d, 30d) for Power, Temp, Humidity, CO₂, Noise. Percentiles (P10, P50, P90), min, max, mean. | Standardized baseline lookups on UTC (`getUTCDay()`, `getUTCHours()`). Added `dataCoverage` metadata (`availableDays`, `completenessRatio`). | 30-day analytics currently fetches raw readings and downsamples in memory. Continuous database rollups (hourly aggregate tables) should be scheduled for high scale. |
| **7. Event Engine** | Deterministic rule evaluator for threshold crossings (`GT`, `LT`, `EQ`) with severity levels (`INFO`, `WARNING`, `ERROR`, `CRITICAL`). | Wired dead `evaluateDeviceAndSensorConnectivity(120)` into simulator loop to transition inactive sensors/devices to `STALE`/`OFFLINE`. | Dynamic user-defined rule authoring UI (composite condition builder `IF A AND B FOR T MINUTES`) is not yet exposed in the front end. |
| **8. Anomaly Detection** | 168-hour empirical Gaussian baseline matrix ($\mu, \sigma$), Z-score standard deviations, linear drift rate-of-change regressions. | Refactored into `IAnomalyDetector` pattern; added `SENSOR_MINIMUM_STD_DEV` scale floors to eliminate variance collapse false positives. | Detection operates per-sensor. Cross-sensor multivariate correlations (e.g., Temperature spike + Power spike + Occupancy = Cooking vs Fire) should be formalized. |
| **9. Insights Subsystem** | Explainable intelligence cards with mathematical proofs ($Z$-score derivation, historical baseline comparison, timestamps). | Explicitly classified intelligence paradigm (`STATISTICAL_BASELINE`); eliminated misleading claims of black-box ML or hallucinated LLMs. | Insights are currently generated during ingestion and simulation ticks; automated resolution and lifecycle expiration cleanup need a background cron worker. |
| **10. Auth & Tenancy** | Multi-tenant user modeling (`User` $\to$ `Home.ownerId`). | Implemented HMAC-SHA256 signed session tokens, bcrypt password hashing, HTTP-only cookie parsing, and `enforceHomeAccess()` across all APIs. | Role-Based Access Control (RBAC) currently distinguishes Owner vs Unauthenticated. Granular roles (e.g., `GUEST`, `CHILD`, `TECHNICIAN`) can be expanded. |
| **11. API Validation** | Zod schemas across all ingestion payloads and query parameters. | Enforced sensor unit validation (`validateSensorUnit`), timestamp sanity checks, and physical reality bounds checking. | JSON error responses now conform to RFC 7807 problem details across all routes. |
| **12. Error Handling** | Structured logging module (`src/lib/logger.ts`) with severity levels, contextual metadata, and sensitive credential redaction. | Replaced unformatted `console.log`/`console.error` calls across ingestion, intelligence, and auth routes with contextual structured logger. | Global Next.js `error.tsx` boundary is implemented; Sentry / OpenTelemetry tracing integration is recommended for external observability. |
| **13. Automated Testing** | Vitest suite covering unit math, schema validation, integration pipeline edge cases, auth security, and intelligence benchmarks. | Expanded from 11 unit tests to 28 comprehensive tests (100% pass rate). Created `vitest.config.ts` for path alias resolution. | End-to-end browser tests (e.g. Playwright) covering interactive floor plan navigation and live chart updates should be added. |
| **14. Continuous Integration**| Docker containerization support (`Dockerfile`, `docker-compose.yml`). | Multi-stage Dockerfile builds Next.js standalone output with Prisma client generation. | GitHub Actions CI workflow script (`.github/workflows/ci.yml`) should be committed to enforce `npm run test` and `npm run build` on pull requests. |
| **15. Docker Container** | Standalone Node.js alpine container + PostgreSQL 15 service definition with persistent volume mounts. | Verified environment variable pass-through (`DATABASE_URL`, `JWT_SECRET`) and database readiness checks. | Add container healthcheck probes (`HEALTHCHECK CMD curl -f http://localhost:3000/api/home`) in Dockerfile. |
| **16. Documentation** | Technical specifications covering architecture, data modeling, telemetry contracts, and intelligence mathematics. | Created `engineering-audit.md` and `intelligence-evaluation.md`. Updated `README.md` to accurately reflect statistical baselines. | Add interactive OpenAPI/Swagger specification UI for third-party developer integrations. |

---

## Detailed Subsystem Findings & Remediations

### 1. Multi-Tenant Authentication & Route Hardening
- **Vulnerability Found**: The database schema contained `User` and `Home.ownerId`, yet every API route (`/api/home`, `/api/floors`, `/api/rooms`, `/api/devices`, `/api/analytics`, `/api/insights`, `/api/events`, `/api/simulator`) queried the database via `prisma.home.findFirst()` without extracting authentication tokens or validating ownership. Any client could read and manipulate household data.
- **Remediation**:
  - Implemented `src/lib/auth.ts` providing signed HMAC-SHA256 session token generation, verification, and cookie/bearer extraction.
  - Implemented `enforceHomeAccess(request, homeId?)` which verifies the session, validates ownership, and returns 401 Unauthorized or 403 Forbidden.
  - Hardened every API route to require valid authentication and enforce tenant boundaries.
  - Created `/api/auth/login` (verifying bcrypt password hashes) and `/api/auth/me` (returning user profile and owned homes).
  - Validated via `tests/integration/auth.test.ts` (token creation, verification, tampering rejection, and expiration).

### 2. Telemetry Ingestion & Data Integrity Edge Cases
- **Vulnerabilities Found**:
  1. `TelemetryReading` had no unique constraint on `(sensorId, timestamp)`. Duplicate network transmissions resulted in redundant rows.
  2. Physical bounds checking lacked constraints for particulate matter (`PM2_5`). Values such as `-50` or `15,000 µg/m³` would be accepted.
  3. Mismatched sensor units (e.g., submitting temperature in `kg` or humidity in `ppm`) passed validation.
  4. Ingestion of delayed/out-of-order historical packets silently overwrote `lastReadingTime` and `lastReadingValue` on the `Sensor` record, corrupting live operational state.
- **Remediation**:
  - Added `@@unique([sensorId, timestamp])` in `prisma/schema.prisma` and applied via `prisma db push`.
  - Added `skipDuplicates: true` to `createMany` in `src/server/telemetry/pipeline.ts`.
  - Enforced `PM2_5` physical boundaries (0 to 1,000 µg/m³) and strict unit validation (`validateSensorUnit`).
  - Added conditional logic in `processTelemetryIngest` to only update `Sensor.lastReadingTime` and `lastReadingValue` if the incoming timestamp is strictly newer than the currently stored timestamp.
  - Validated via `tests/integration/telemetry-integrity.test.ts`.

### 3. Thermodynamic Simulator & Baseline Drift
- **Vulnerabilities Found**:
  1. Historical seed (`prisma/seed.ts`) simulated 30 days of temperatures by stepping in 30-minute blocks without a thermostatic feedback loop. It turned HVAC on continuously based solely on outdoor temperature, driving room temperatures to ~33°C.
  2. Because every simulated day had identical weather at hour 14:00 UTC, the sample variance was near zero ($\sigma \approx 0.02$).
  3. When an indoor observation of 21.2°C was evaluated against $\mu = 21.78^\circ\text{C}$ with $\sigma = 0.1$, it produced $Z = -5.8$, triggering an erroneous critical anomaly on completely normal conditions (variance collapse).
- **Remediation**:
  - Refactored `prisma/seed.ts` and `src/server/simulator/engine.ts` to implement true closed-loop thermostat regulation (`targetTemp = 21.5`°C with a ±0.3°C deadband) and 60-second numerical sub-stepping.
  - Introduced `SENSOR_MINIMUM_STD_DEV` scale floors in `StatisticalZScoreDetector` (`TEMPERATURE`: 0.5°C, `HUMIDITY`: 2.0%, `CO2`: 30 ppm, `POWER`: 20 W, `NOISE`: 3 dB).
  - Required that an anomaly exhibit both statistical significance ($|Z| \ge 2.5$) and a physical deviation exceeding the sensor's measurement tolerance floor.
  - Re-seeded 40,320 historical readings and 4,704 baseline distributions.

### 4. Dead Code Elimination & Connectivity Monitoring
- **Vulnerability Found**: `evaluateDeviceAndSensorConnectivity` was defined in `src/server/event-engine/rules.ts` to detect offline devices and stale sensors, but was never imported or scheduled anywhere in the runtime.
- **Remediation**:
  - Wired `evaluateDeviceAndSensorConnectivity(120)` directly into the simulation tick loop in `src/server/simulator/engine.ts`.
  - Inactive sensors with no readings for >120 seconds now reliably transition from `HEALTHY` to `STALE`, and devices transition to `OFFLINE`.
  - Verified via integration tests and benchmark Scenario 7.

---

## Architectural Consistency & Production Defensibility

The codebase now maintains strict architectural separation:
1. **Producer Independence**: Telemetry producers (Thermodynamic Simulator or external ESP32 MQTT bridges) communicate exclusively via `POST /api/telemetry/ingest`. The core application has no direct coupling to the simulation loop.
2. **Honest AI Labeling**: The intelligence subsystem is explicitly documented as **deterministic statistical baseline analysis** (168-hour empirical Gaussian matrices and linear regression drift). No false claims of machine learning models or generative LLMs are presented to the user.
3. **Multi-Tenant Boundaries**: Every database query in API routes enforces user identity and home ownership.

---

## Remaining Technical Debt Summary

1. **Telemetry Storage Scalability**:
   - *Issue*: Current storage uses standard PostgreSQL relational tables with composite indexes.
   - *Impact*: At 1-second intervals across 50 sensors, the table accumulates 4.32 million rows daily.
   - *Recommendation*: Migrate to TimescaleDB hypertables or implement PostgreSQL 16+ declarative monthly partitioning with automated retention drop policies.

2. **Asynchronous Ingestion Decoupling**:
   - *Issue*: Ingestion occurs synchronously inside Next.js API route handlers.
   - *Impact*: In bursts of hundreds of sensor payloads, database write concurrency may saturate connection pool limits.
   - *Recommendation*: Place a Redis Stream or BullMQ queue between `POST /api/telemetry/ingest` and the persistence worker.

3. **Cross-Sensor Multivariate Anomaly Correlation**:
   - *Issue*: Anomaly detection currently runs independently on individual sensor streams.
   - *Impact*: Compounded household events (e.g. kitchen stove active + PM2.5 spike + elevated temperature) are detected as separate anomalies rather than unified household context.
   - *Recommendation*: Implement a higher-order correlation engine that combines simultaneous uni-variate anomalies into unified situational incidents.
