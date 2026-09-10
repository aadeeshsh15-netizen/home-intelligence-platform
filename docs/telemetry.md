# Telemetry Architecture & Hardware IoT Roadmap

This document outlines the telemetry pipeline contract, physical simulation equations, and the integration guide for physical ESP32/ESP8266 hardware communicating over MQTT.

---

## 1. Producer vs. Consumer Boundary

```
[Simulated Physics Engine] ---\
                               +---> [POST /api/telemetry/ingest] ---> [Database + Rules + SSE]
[ESP32 Hardware via MQTT]   ---/
```

The ingestion endpoint accepts batches of telemetry readings formatted per the strict Zod schema:

```typescript
POST /api/telemetry/ingest
Content-Type: application/json

{
  "producerId": "esp32-gateway-living-room",
  "readings": [
    {
      "sensorId": "cly1234567890",
      "timestamp": "2026-09-10T14:30:00.000Z",
      "value": 22.4,
      "quality": "VALID"
    }
  ]
}
```

### Physical Bounds Validation
To prevent corrupted sensor readings or faulty analog-to-digital converter (ADC) outputs from entering the database, the ingestion pipeline enforces boundary sanity checks:
- **Temperature**: $-40^\circ\text{C} \le T \le 75^\circ\text{C}$
- **Humidity**: $0\% \le \text{RH} \le 100\%$
- **CO₂**: $200\,\text{ppm} \le \text{CO}_2 \le 50,000\,\text{ppm}$
- **Power**: $0\,\text{W} \le P \le 100,000\,\text{W}$
- **Occupancy**: $\{0, 1\}$ binary

---

## 2. Realistic Physics & Behavioral Simulation

Instead of random Gaussian noise, the built-in simulator implements:

1. **Diurnal Solar & Atmospheric Model**:
   $$T_{out}(t) = T_{base} + A_{temp} \sin\left(\frac{2\pi (t_{UTC} - 9.5)}{24}\right)$$
   Minimum occurs at 05:30 UTC; peak solar radiation and temperature occur at 15:30 UTC.

2. **Thermodynamic Heat Transfer**:
   $$\frac{dT_{room}}{dt} = \frac{T_{out} - T_{room}}{\tau_{wall}} + Q_{solar} + Q_{occupants} + Q_{HVAC}$$

3. **CO₂ Metabolic Mass Balance**:
   $$\frac{d[\text{CO}_2]}{dt} = G_{people} - \text{Ventilation\_Rate} \times ([\text{CO}_2]_{in} - [\text{CO}_2]_{out})$$

4. **Bathroom Psychrometrics & Shower Moisture**:
   Sudden moisture surge during morning shower events ($\text{RH} \to 85\%-95\%$) followed by exponential evacuation decay via exhaust ventilation:
   $$\text{RH}(t) = \text{RH}_{base} + \Delta\text{RH} \cdot e^{-t / \tau_{exhaust}}$$

5. **Appliance Electrical Profiles**:
   - Vampire standby baseline: $35\text{W}-85\text{W}$ per room.
   - Morning breakfast spike ($07:00-08:30$): $1.4\text{kW}-2.5\text{kW}$ (induction, kettle, coffee).
   - Evening dinner peak ($18:30-20:30$): $2.2\text{kW}-3.8\text{kW}$ (oven, range, dishwasher).

---

## 3. Physical IoT Hardware Integration Guide (MQTT / ESP32)

To connect physical microcontrollers:

### Topic Taxonomy
```
home/{homeId}/room/{roomId}/device/{deviceId}/telemetry
```

### ESP32 MicroPython / C++ Firmware Pattern
```c
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

void publishTelemetry() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h)) {
    char payload[256];
    snprintf(payload, sizeof(payload),
      "{\"producerId\":\"esp32-node-01\",\"readings\":[{\"sensorId\":\"<TEMP_SENSOR_ID>\",\"timestamp\":\"%s\",\"value\":%.2f},{\"sensorId\":\"<HUM_SENSOR_ID>\",\"timestamp\":\"%s\",\"value\":%.2f}]}",
      getIsoTimestamp(), t, getIsoTimestamp(), h
    );
    client.publish("home/estate-1/room/living-room/device/esp32-01/telemetry", payload);
  }
}
```

An MQTT subscriber sidecar (e.g. Node-RED or a lightweight Go/Node daemon) subscribes to `home/#` and forwards incoming payloads directly into `POST /api/telemetry/ingest`.
