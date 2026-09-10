# Home Intelligence Platform

A production-grade, TypeScript-first web platform for modeling, monitoring, analyzing, and detecting anomalies across household environments, connected devices, and telemetry sensors.

> **"Understand the home, not merely control it."**

---

## Highlights & System Capabilities

- **Digital Twin Modeling**: Structured relational hierarchy (`Home` $\to$ `Floors` $\to$ `Rooms` $\to$ `Devices` $\to$ `Sensors` $\to$ `Telemetry` $\to$ `Events` $\to$ `Insights`).
- **Strict Producer vs. Consumer Separation**: Built to ingest data from both an integrated thermodynamic physics simulator and external physical microcontrollers (ESP32/ESP8266) over MQTT without altering application logic.
- **Deterministic AI & Explainable Intelligence**: No hallucinated LLM text or fabricated confidence scores. Uses an empirical 168-hour Gaussian baseline distribution matrix ($\mu, \sigma$) and standard Z-scores ($Z = \frac{x - \mu}{\sigma}$) with full mathematical derivation visible in the UI.
- **Interactive 2D Floor Plan Schematic**: Scaled vector representation of household floors with live sensor badges, occupancy indicators, and direct room deep-linking.
- **Historical Telemetry Analytics**: Multi-timeframe explorer (24h, 7d, 30d) across Power, Temperature, Humidity, CO₂, and Noise with parametric baseline corridor overlays ($\mu \pm 2\sigma$), peak extraction, and distribution percentiles (P10, P50, P90).
- **Realtime Event-Driven Architecture**: Server-Sent Events (SSE) stream delivering instantaneous updates, connectivity heartbeat, threshold breaches, and intelligence discoveries.
- **Production-Ready Stack**: Next.js 15 App Router, React 19, Tailwind CSS, PostgreSQL 18, Prisma ORM, Zod, and Vitest.

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
The test suite (28 automated tests across 6 suites) verifies:
- **Unit Math & Thermodynamics**: Statistical distributions, Z-scores, percentiles, downsampling, linear regression slopes, diurnal cycles, Newton's law of thermal cooling, and CO₂ mass balances.
- **Physical Reality Bounds**: Ingestion validation schemas, PM2.5 boundary checks, and sensor unit mismatch rejection.
- **Multi-Tenant Security**: HMAC-SHA256 signed session token generation, verification, tampering rejection, and home ownership authorization.
- **Pipeline Integrity**: Database-level duplicate suppression (`skipDuplicates: true`), out-of-order timestamp regression protection, and inactive sensor timeout transitions.
- **Intelligence Benchmark**: Controlled evaluation across 7 benchmark scenarios (normal activity, sustained heating, power surges, CO₂ drift, window thermal shock, AC failure, sensor outage).

---

## Docker Deployment

Build and run the entire platform with PostgreSQL container:
```bash
docker compose up --build
```
The application will be accessible on `http://localhost:3000`.
