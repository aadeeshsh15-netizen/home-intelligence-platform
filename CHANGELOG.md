# Changelog

All notable changes to the **Home Intelligence Platform** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-09-12 — Public Portfolio Release

### Major Capabilities Across Phases 1–10
- **Digital Twin Modeling (Phase 1)**: Relational home hierarchy modeling floors, rooms, devices, sensors, and telemetry readings with Zod validation.
- **Cross-Sensor Correlation Engine (Phase 2)**: Temporal sliding-window multi-signal correlation isolating compound events (`COOKING_EVENT`, `WATER_LEAK`, `AC_FAILURE`, `WINDOW_THERMAL_EVENT`) with a **0.00% false-positive rate** on baseline data.
- **Predictive Intelligence & Quality Benchmarks (Phase 3)**: Cyclical features, diurnal decay baselines, and walk-forward cross-validation.
- **Machine Learning Inference Engine (Phase 4)**: In-process Gradient Boosted Decision Trees (GBDT) and Random Forest models achieving **-28.1% RMSE reduction** over statistical baselines.
- **Predictive Incident Anticipation (Phase 5)**: Analytical Gaussian CDF hazard modeling $P(Y \ge T)$ and Time-to-Threshold ($\tau$) early warning indicators.
- **Real IoT Integration & MQTT Gateway (Phase 6)**: Mosquitto broker integration, dual-producer ingestion abstraction, device token security, and watchdog monitoring.
- **Physical Hardware Acceptance Testing (Phase 6B)**: Physical ESP32 DevKit v1 breadboard validation (DHT22, PIR, Reed Switch) passing 8 hardware acceptance tests.
- **Closed-Loop Intelligent Automation (Phase 7)**: Fail-closed safety guardrails, low-voltage boundary enforcement, and post-actuation trajectory verification ($\Delta M$).
- **Production Observability & Presentation Console (Phase 8)**: In-process sliding-window latency percentiles ($p50/p95/p99$), causal `SystemEvent` audit trail, deterministic `/api/health` service, and 6 presentation scenarios.
- **Production Deployment & Reliability (Phase 9)**: Standalone Next.js 15 Docker container (non-root `nextjs:1001`), separated `/api/live` and `/api/ready` probes, baseline SQL migrations, sliding-window rate limiting, and GitHub Actions CI.
- **Public Release & Portfolio Launch (Phase 10)**: Polished `/demo` console with 8-stage interactive tracker, media specifications, production deployment guide, portfolio summary, and interview deep-dive documentation.

### Validation Metrics
- **Tests**: 41 test files, 178 tests passed (100% pass rate).
- **TypeScript**: 0 compilation errors (`npx tsc --noEmit`).
- **Production Build**: Standalone Next.js 15 build with 22 UI pages and 37 API routes generated cleanly.
- **Code Hygiene**: 0 TODO/FIXME markers, clean git diff, zero committed secrets.
