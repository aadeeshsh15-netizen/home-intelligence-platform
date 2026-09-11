# Home Intelligence Platform — 2-Minute Presentation Demo Guide

This runbook guides a presenter through a rigorous, deterministic, 2-minute demonstration of the Home Intelligence Platform.

The platform demonstrates the complete autonomous operational loop:
$$\mathbf{Sense \longrightarrow Detect \longrightarrow Correlate \longrightarrow Predict \longrightarrow Anticipate \longrightarrow Decide \longrightarrow Act \longrightarrow Verify \longrightarrow Audit}$$

---

## Demo Script & Timeline

```
+-----------------------------------------------------------------------------------------------+
| TIME   | SCREEN / VIEW       | ACTION                          | TALKING POINT                |
+-----------------------------------------------------------------------------------------------+
| 00:00  | / (Dashboard)       | Show top status & health badge  | 30-sec situational awareness |
| 00:20  | /devices            | Show IoT fleet & MQTT status    | Physical ESP32 + Virtual Hub |
| 00:40  | /demo               | Select 'CO2_VENTILATION' & step | Real pipeline, zero fake data|
| 01:00  | /insights           | Inspect early warning cards     | Analytical normal CDF (P>.85)|
| 01:20  | /automations        | Inspect policy decision & proof | Fail-closed safety evaluator |
| 01:35  | /demo               | Step to command dispatch & ACK  | Idempotent MQTT QoS 1 wire   |
| 01:45  | /automations        | Inspect verification result     | Empirical Delta M < -30 ppm  |
| 01:55  | /observability      | Inspect causal audit timeline   | Complete end-to-end trace    |
+-----------------------------------------------------------------------------------------------+
```

---

### Minute 00:00 – 00:20: System Overview & 30-Second Situational Awareness
- **Navigate to**: `http://localhost:3000/`
- **Key Talking Points**:
  - The platform communicates total household status in under 30 seconds across 5 operational zones:
    1. **Home Status**: Overall health badge (`HEALTHY`/`DEGRADED`/`CRITICAL`), occupancy state, aggregate power draw.
    2. **Intelligence**: Active early warnings, statistical confidence corridors, and multi-sensor correlations.
    3. **Closed-Loop Automation**: Interventions count, verification efficacy rate (100%), fail-closed safety state.
    4. **Fleet Infrastructure**: Active devices count (ONLINE / STALE / OFFLINE), Eclipse Mosquitto MQTT broker status.
    5. **Causal Event Timeline**: Live chronological stream of system events.
  - Highlight the top telemetry stream badge pulsing with live Server-Sent Events (SSE).

---

### Minute 00:20 – 00:40: Physical IoT Fleet & Dual-Producer Architecture
- **Navigate to**: `http://localhost:3000/devices`
- **Key Talking Points**:
  - The platform implements strict producer/consumer decoupling:
    - **Physical Nodes**: ESP32 DevKit running C++ PlatformIO firmware, sampling real DHT22/BME280/MQ-135 sensors and communicating over MQTT with HMAC token authentication and SNTP synchronization.
    - **Virtual Nodes**: Thermodynamic physics simulator computing continuous thermal diffusion, air exchange, and power curves.
  - Both producers feed into the **exact same normalized ingestion pipeline** (`processTelemetryIngest`). Zero microcontroller business logic.

---

### Minute 00:40 – 01:00: Launch Controlled Scenario (CO₂ Accumulation)
- **Navigate to**: `http://localhost:3000/demo`
- **Key Talking Points**:
  - Select the **CO₂ Buildup & Autonomous Ventilation** scenario.
  - Emphasize: *"This demo does not fake metrics or replay static UI state. It injects real telemetry into the authoritative production ingestion pipeline, exercising every intelligence engine in real time."*
  - Click **Start** followed by **Next Step** (Step 1: Pre-Meeting Baseline, 750 ppm).
  - Click **Next Step** (Step 2: Rapid CO₂ Buildup, 1,180 ppm with steep positive gradient).

---

### Minute 01:00 – 01:20: Predictive Incident Intelligence & Early Warning
- **Navigate to**: `http://localhost:3000/insights` (or inspect live cards on `/demo`)
- **Key Talking Points**:
  - While physical CO₂ is currently 1,180 ppm (below the 1,200 ppm critical limit), the **Predictive Incident Intelligence Engine** evaluates the analytical normal CDF:
    $$P(Y \ge T) = 1 - \Phi\left(\frac{T - \hat{y}}{\sigma}\right)$$
  - Point forecast projects a crossing in 12 minutes with **$P = 0.89$** and confidence $> 0.85$.
  - An early warning (`PREDICTED_CO2_VENTILATION`) is created *before* the room experiences uncomfortable air quality.

---

### Minute 01:20 – 01:35: Fail-Closed Automation Decision Layer
- **Navigate to**: `http://localhost:3000/automations`
- **Key Talking Points**:
  - Show the **Ventilation CO₂ Predictive Control** policy.
  - Explain the core safety principle: *"The platform does NOT blindly execute every forecast. Every actuation passes through an explicit fail-closed safety evaluator."*
  - Checks verified:
    1. Operational Mode: `AUTO`
    2. Actuator online & capable: Low-voltage relay / fan online
    3. Probability threshold: $P = 0.89 \ge 0.75$
    4. Cooldown timer: No interventions in last 15 minutes
    5. Flapping damping: No rapid on/off state transitions
  - The decision engine creates an immutable `AutomationExecution` record with a deterministic explanation proof (no LLM hallucinations).

---

### Minute 01:35 – 01:45: Idempotent Command Dispatch & Actuator ACK
- **Navigate to**: `http://localhost:3000/demo` (or stay on `/automations`)
- **Key Talking Points**:
  - Advance to **Step 3** (Policy evaluation & command dispatch).
  - The `CommandDispatcher` creates a durable `DeviceCommand` record with a per-dispatch unique `commandId` (`cmd_...`) and publishes to MQTT topic:
    `home/{homeId}/device/{deviceId}/command` with QoS 1.
  - The actuator executes the command and publishes a signed acknowledgement to `.../ack`.
  - Command transitions from `PENDING` $\to$ `SENT` $\to$ `ACKNOWLEDGED` $\to$ `COMPLETED` with recorded roundtrip latency.

---

### Minute 01:45 – 01:55: Empirical Closed-Loop Verification
- **Navigate to**: `http://localhost:3000/demo` and click **Next Step** twice (Steps 4 & 5: Ventilation clearance)
- **Navigate to**: `http://localhost:3000/automations`
- **Key Talking Points**:
  - Observe the **Closed-Loop Verification Engine**:
    - Calculates post-actuation physical delta:
      $$\Delta M = M(t) - M(\text{baseline}) = 850\,\text{ppm} - 1180\,\text{ppm} = -330\,\text{ppm}$$
    - Because $\Delta M \le -30\,\text{ppm}$ and current value $< 1,000\,\text{ppm}$, the intervention is certified as:
      $$\mathbf{VERIFIED\_EFFECTIVE}$$
  - If the window had closed without improvement, the system would flag `VERIFIED_INEFFECTIVE` and trigger an operator maintenance alert.

---

### Minute 01:55 – 02:00: Observability & Causal Audit Timeline
- **Navigate to**: `http://localhost:3000/observability`
- **Key Talking Points**:
  - Review the **Causal Audit & Event Timeline**:
    - Filter by `category: AUTOMATION` or click **JSON** on any event.
    - Demonstrate the unbroken causal chain:
      `TELEMETRY_INGESTED` $\to$ `ANOMALY_DETECTED` $\to$ `INCIDENT_PREDICTED` $\to$ `AUTOMATION_TRIGGERED` $\to$ `COMMAND_DISPATCHED` $\to$ `COMMAND_ACKNOWLEDGED` $\to$ `ACTION_VERIFIED`.
    - All events share the same `correlationId`.
  - Conclude by pointing out the **Subsystem Health Checks** (all `HEALTHY`) and the **p50/p95 Processing Latencies** (sub-25ms ingestion, sub-10ms decision).

---

## Fallback Scenarios Available

If the audience requests alternative failure modes or physical responses:
1. **Safety Guardrail Rejection**: Demonstrates fail-closed safety blocking actuation when policy is set to `MANUAL` mode.
2. **Water Leak Detection**: Demonstrates multi-sensor correlation when high flow is detected during unoccupied hours.
3. **Peak Energy Surge**: Demonstrates GBDT peak-load forecasting ($>3,500\text{W}$) and autonomous non-essential load shedding.
