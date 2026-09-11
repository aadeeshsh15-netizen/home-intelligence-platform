# Phase 6 MQTT Protocol Specification & Telemetry Contract

This document defines the topic structure, payload schemas, QoS guarantees, retained message policies, and error-handling contracts governing MQTT communication in the Home Intelligence Platform.

---

## 1. Topic Hierarchy & Taxonomy

All topics follow a strict, standardized format matching the regular expression:
```regex
^home/([a-zA-Z0-9_-]+)/device/([a-zA-Z0-9_-]+)/(telemetry|status|command)$
```

| Topic Path | Direction | Purpose | QoS | Retained |
| :--- | :--- | :--- | :--- | :--- |
| `home/{homeId}/device/{deviceId}/telemetry` | Device $\to$ Gateway | Multi-metric sensor readings | **1** | **false** |
| `home/{homeId}/device/{deviceId}/status` | Device $\to$ Gateway | Heartbeat & Last Will and Testament (LWT) | **1** | **true** |
| `home/{homeId}/device/{deviceId}/command` | Gateway $\to$ Device | Downstream control and configuration | **1** | **false** |

### Justification of QoS & Retention Decisions:
- **Telemetry QoS 1 (At least once)**: Ensures sensor measurements are acknowledged across volatile Wi-Fi links. Deduplication in PostgreSQL (`skipDuplicates: true`) prevents duplicate readings from skewing aggregations.
- **Telemetry `retained = false`**: Stale measurements must never be retained by the broker, preventing outdated readings from replaying when subscribers reconnect.
- **Status `retained = true`**: Enables any new subscriber or restarting gateway to immediately inspect the device's availability without waiting for the next periodic heartbeat.
- **Last Will and Testament (LWT)**: Configured during device MQTT handshake. If the device abruptly loses power or Wi-Fi, the broker automatically publishes the retained LWT payload to `.../status` with `status: "OFFLINE"`.

---

## 2. Telemetry Payload Contract

Published to: `home/{homeId}/device/{deviceId}/telemetry`

```json
{
  "timestamp": "2026-09-11T12:45:00.000Z",
  "seq": 104,
  "metrics": [
    {
      "type": "TEMPERATURE",
      "value": 22.4,
      "unit": "°C"
    },
    {
      "type": "HUMIDITY",
      "value": 48.5,
      "unit": "%"
    },
    {
      "type": "CO2",
      "value": 680,
      "unit": "ppm"
    },
    {
      "type": "OCCUPANCY",
      "value": 1,
      "unit": "binary"
    },
    {
      "type": "CONTACT",
      "value": 0,
      "unit": "binary"
    }
  ]
}
```

### Field Definitions:
- `timestamp` (string, ISO-8601 UTC): Exact moment of hardware measurement, synchronized via SNTP.
- `seq` (integer, optional): Monotonically increasing sequence number reset on MCU reboot.
- `metrics` (array of objects, minimum 1):
  - `type` (enum): `TEMPERATURE`, `HUMIDITY`, `CO2`, `PM2_5`, `POWER`, `OCCUPANCY`, `LIGHT`, `NOISE`, `WATER_FLOW`, `CONTACT`.
  - `value` (number): Finite floating point or integer reading.
  - `unit` (string, optional): Physical unit conforming to platform dictionary (`°C`, `%`, `ppm`, `binary`, `W`, etc.).
  - `sensorId` (string, optional): Specific database sensor UUID if known to the firmware.

---

## 3. Status & Last Will and Testament (LWT) Payload Contract

Published to: `home/{homeId}/device/{deviceId}/status`

### 3.1. Healthy Online Heartbeat (Periodic every 30s)
```json
{
  "status": "ONLINE",
  "firmwareVersion": "v1.0.0-esp32",
  "ip": "192.168.1.185",
  "mac": "24:6F:28:9B:4C:1A",
  "uptimeSec": 120,
  "rssi": -58,
  "timestamp": "2026-09-11T12:45:00.000Z"
}
```

### 3.2. Last Will and Testament (Broker-Issued on Socket Drop)
```json
{
  "status": "OFFLINE",
  "reason": "UNEXPECTED_DISCONNECT",
  "timestamp": "2026-09-11T12:45:15.000Z"
}
```

---

## 4. Reconnect & Backoff Strategy

The ESP32 firmware implements exponential backoff with jitter to protect local networks and broker instances from connection storms:

$$\text{backoff}(n) = \min\left(60000\text{ ms}, 2000 \times 2^n\right) \pm \text{jitter}$$

- Initial retry delay: $2\text{ seconds}$.
- Doubling on successive failures up to a maximum cap of $60\text{ seconds}$.
- Reset to $2\text{ seconds}$ immediately upon successful Wi-Fi and MQTT connection.

---

## 5. Gateway Rejection Codes & Error Handling

| Scenario | Rejection Action | Log Reason Code |
| :--- | :--- | :--- |
| **Malformed JSON** | Packet dropped silently | `Rejected malformed JSON from MQTT message` |
| **Invalid Topic** | Ignored | `Ignoring non-conforming MQTT topic` |
| **Clock Skew $> 10\text{m}$ Past** | Packet rejected | `Timestamp too far in the past` |
| **Clock Skew $> 2\text{m}$ Future** | Packet rejected | `Timestamp too far in the future` |
| **Unregistered Device** | Packet rejected | `Device not found in registry` |
| **Tenant Isolation Violation** | Packet rejected | `Device does not belong to specified home` |
| **Device Revoked** | Packet rejected | `Device has been revoked by home administrator` |
| **Invalid Sensor Metric Value** | Metric skipped / flagged | `Physical boundary validation rejected reading` |
