# Home Intelligence Platform: ESP32 Hardware Firmware

This directory contains the modular ESP32 firmware project designed to connect physical microcontrollers to the Home Intelligence Platform over MQTT.

The physical microcontroller operates strictly as a **telemetry producer**:
```
Sensors -> ESP32 -> MQTT Broker -> Platform Gateway -> PostgreSQL -> Intelligence Layers
```

---

## 1. Hardware Requirements & Bill of Materials (BOM)

| Component | Specification / Model | Function | Operating Voltage |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit v1 (ESP-WROOM-32, 30 or 38 pin) | Main controller with 2.4 GHz Wi-Fi | 3.3V Logic / 5V USB |
| **Temperature & Humidity** | DHT22 (AM2302) | Ambient climate measurements | 3.3V – 5V DC |
| **Air Quality Proxy** | MQ-135 Gas Sensor Module | Indoor $\text{CO}_2$ / VOC proxy | 5V VCC / 3.3V ADC Out |
| **Occupancy Sensor** | HC-SR501 PIR Motion Sensor | Room occupancy tracking | 5V VCC / 3.3V Output |
| **Contact Sensor** | Magnetic Reed Switch (Normally Open) | Window / Door state detection | Dry contact / Internal Pull-up |
| **Breadboard & Wires** | Standard 830-point breadboard, Dupont jumpers | Prototyping circuit | — |

> [!WARNING]
> **Electrical Safety Standard**: Do **NOT** experiment with mains voltage (120V/240V AC) during this prototype milestone. All power proxies and current sensors should be tested exclusively with isolated low-voltage DC circuits (5V–12V).

---

## 2. Wiring & Pinout Guide

```
+-------------------------------------------------------------+
|                     ESP32 DevKit v1                         |
|                                                             |
|   [GPIO 4]  <--------> DHT22 DATA (with 10k pull-up to 3.3V)|
|   [GPIO 34] <--------> MQ-135 AOUT (Analog ADC1_CH6)        |
|   [GPIO 18] <--------> HC-SR501 PIR OUT (Digital Input)     |
|   [GPIO 19] <--------> Magnetic Reed Switch to GND          |
|   [GPIO 2]  <--------> Built-in Blue LED (Status Indicator) |
|   [3V3]     <--------> DHT22 VCC                            |
|   [VIN/5V]  <--------> MQ-135 VCC & PIR VCC                 |
|   [GND]     <--------> Common Ground Rail                   |
+-------------------------------------------------------------+
```

### Sensor Pin Details

1. **DHT22 (Temperature & Humidity)**:
   - Pin 1 (VCC) $\to$ ESP32 3.3V
   - Pin 2 (DATA) $\to$ ESP32 **GPIO 4** (add a $10\text{ k}\Omega$ pull-up resistor between VCC and DATA if using raw 4-pin sensor)
   - Pin 3 (NC) $\to$ Leave unconnected
   - Pin 4 (GND) $\to$ ESP32 GND
2. **MQ-135 (Air Quality / CO₂ Proxy)**:
   - VCC $\to$ ESP32 5V (VIN)
   - GND $\to$ ESP32 GND
   - AOUT $\to$ ESP32 **GPIO 34** (ADC1, input only, safe for analog reading)
3. **HC-SR501 (PIR Motion)**:
   - VCC $\to$ ESP32 5V (VIN)
   - GND $\to$ ESP32 GND
   - OUT $\to$ ESP32 **GPIO 18**
4. **Magnetic Reed Switch (Window/Door)**:
   - One lead $\to$ ESP32 **GPIO 19**
   - Other lead $\to$ ESP32 GND (Internal `INPUT_PULLUP` resistor enabled)

---

## 3. Firmware Configuration

1. In the Web UI, navigate to **Hardware Fleet Inventory** (`/devices`).
2. Click **Provision ESP32 Node**, select your room, choose your equipped sensors, and click **Complete Registration**.
3. Copy the generated `config.h` snippet.
4. Duplicate `firmware/include/config.h.example` to `firmware/include/config.h`:
   ```bash
   cp firmware/include/config.h.example firmware/include/config.h
   ```
5. Paste your Wi-Fi credentials, MQTT Broker IP, `HOME_ID`, `DEVICE_ID`, and `DEVICE_SECRET` into `firmware/include/config.h`.

---

## 4. Building & Flashing with PlatformIO

### Prerequisites
- [VS Code](https://code.visualstudio.com/) with the [PlatformIO IDE Extension](https://platformio.org/) installed, OR
- PlatformIO Core CLI (`pip install platformio`)

### Build & Flash via CLI
Connect your ESP32 to your PC via micro-USB, then execute:

```bash
cd firmware

# Build firmware binary
pio run

# Flash firmware to connected ESP32
pio run --target upload

# Open serial debug monitor (115200 baud)
pio device monitor -b 115200
```

### Expected Serial Monitor Output
```
==================================================
   Home Intelligence Platform - ESP32 Node        
   Firmware: v1.0.0-esp32 | Phase 6 Real IoT     
==================================================
[WiFi] Connecting to MyHomeNetwork
.....
[System] Wi-Fi connected. IP: 192.168.1.185, RSSI: -54 dBm
[SNTP] Initializing time sync with pool.ntp.org...
[SNTP] Time synchronized successfully: 2026-09-11T12:40:00Z
[Sensors] Initialized pins: DHT=4, MQ135=34, PIR=18, Reed=19
[MQTT] Initialized broker target: 192.168.1.100:1883
[MQTT] Connecting to broker as esp32-living-room-01...
[MQTT] Connected to broker successfully.
[MQTT] Published telemetry (#1): Temp=22.4 C, CO2=640 ppm, Occ=1, Contact=0
[MQTT] Published heartbeat: uptime=30 s, RSSI=-54 dBm
```

---

## 5. Troubleshooting & Diagnostics

- **Wi-Fi Connection Fails**: Verify that your Wi-Fi network operates on **2.4 GHz**. The standard ESP32 does not support 5 GHz Wi-Fi.
- **MQTT rc=-2 (Broker Unreachable)**: Ensure your PC firewall allows inbound connections on port `1883`. Check `MQTT_BROKER_HOST` in `config.h`.
- **DHT22 returns NaN**: Verify that the data wire is connected to GPIO 4 and has a $10\text{ k}\Omega$ pull-up resistor. Note that on cold boot the sensor takes ~2s to stabilize; firmware v1.0.0 will omit invalid readings rather than reporting fallback approximations.
- **Timestamp says 1970**: Ensure UDP port 123 is not blocked on your router. The firmware automatically retries SNTP sync inside `loop()` once Wi-Fi connects.

---

## 6. Physical Hardware Validation Results (Phase 6B)

The ESP32 firmware was formally validated against physical sensors on a breadboard test bench connected to the local MQTT broker and PostgreSQL backend.

### Verified Hardware Matrix
- **Controller**: ESP32 DevKit v1 (ESP-WROOM-32)
- **Sensors Validated**: DHT22 (GPIO 4), HC-SR501 PIR (GPIO 18), Magnetic Reed Switch (GPIO 19)
- **Broker**: MQTT v3.1.1 on port 1883
- **Acceptance Tests**: 8 / 8 Passed (100%)
  1. `TEMPERATURE`: DHT22 physical temperature read & ingestion verified (24.2°C).
  2. `HUMIDITY`: DHT22 relative humidity read & ingestion verified (54.5%).
  3. `OCCUPANCY`: Physical PIR motion triggered state transition $0 \to 1$ & SSE broadcast.
  4. `CONTACT`: Reed switch magnet separation triggered state transition $0 \to 1$.
  5. `LIFECYCLE`: Device disconnection triggered watchdog transitions to `STALE` (>60s) and `OFFLINE` (>180s) without zero-wiping database readings.
  6. `RECONNECT`: Network reconnect automatically restored `ONLINE` state & fresh telemetry.
  7. `SECURITY`: Cryptographic scrypt token boundary verified; invalid tokens and cross-tenant messages strictly rejected.
  8. `DEMO_SCENARIO`: Full multi-sensor sequence (baseline $\to$ occupancy $\to$ window open $\to$ thermal influx) successfully triggered downstream correlation & SSE dispatch.

See full engineering audit in [`docs/hardware-validation.md`](../docs/hardware-validation.md).

