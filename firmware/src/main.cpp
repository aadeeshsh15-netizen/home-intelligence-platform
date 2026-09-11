#include <Arduino.h>

#if __has_include("config.h")
#include "config.h"
#else
#include "config.h.example"
#warning "Using config.h.example defaults. Copy config.h.example to config.h and configure credentials."
#endif

#include "wifi_manager.h"
#include "sntp_time.h"
#include "sensor_manager.h"
#include "mqtt_manager.h"

static unsigned long lastTelemetryMs = 0;
static unsigned long lastHeartbeatMs = 0;
static unsigned long telemetrySeq = 0;
static unsigned long bootTimeMs = 0;

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n==================================================");
    Serial.println("   Home Intelligence Platform - ESP32 Node        ");
    Serial.println("   Firmware: v1.0.0-esp32 | Phase 6 Real IoT     ");
    Serial.println("==================================================");

    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, LOW);

    // 1. Initialize Wi-Fi
    WiFiManager::init(WIFI_SSID, WIFI_PASSWORD);

    // 2. Wait up to 10s for initial Wi-Fi connection
    unsigned long startWait = millis();
    while (!WiFiManager::isConnected() && millis() - startWait < 10000) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (WiFiManager::isConnected()) {
        Serial.printf("[System] Wi-Fi connected. IP: %s, RSSI: %d dBm\n",
                      WiFiManager::getIP().c_str(), WiFiManager::getRSSI());
        digitalWrite(PIN_STATUS_LED, HIGH);

        // 3. Initialize SNTP Time Sync
        SntpTime::init("pool.ntp.org", 0, 0);
    } else {
        Serial.println("[System] Wi-Fi connection pending; will continue background reconnection.");
    }

    // 4. Initialize Hardware Sensors
    SensorManager::init(PIN_DHT22, PIN_MQ135_ADC, PIN_PIR_MOTION, PIN_REED_CONTACT);

    // 5. Initialize MQTT Manager
    MqttManager::init(MQTT_BROKER_HOST, MQTT_BROKER_PORT, HOME_ID, DEVICE_ID, DEVICE_SECRET);

    bootTimeMs = millis();
}

void loop() {
    // 1. Background network watchdogs
    WiFiManager::checkConnection();
    MqttManager::loop();

    // Auto-sync SNTP time if Wi-Fi came up after boot
    if (!SntpTime::isSynchronized() && WiFiManager::isConnected()) {
        static unsigned long lastNtpAttempt = 0;
        if (millis() - lastNtpAttempt > 10000) {
            lastNtpAttempt = millis();
            SntpTime::init("pool.ntp.org", 0, 0);
        }
    }

    unsigned long now = millis();

    // 2. Telemetry publishing loop
    if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
        lastTelemetryMs = now;
        telemetrySeq++;

        // Read physical hardware sensors
        SensorData data = SensorManager::readAll();

        // Obtain ISO-8601 UTC timestamp
        String isoTime = SntpTime::getIsoTimestamp();

        // Publish to MQTT
        MqttManager::publishTelemetry(data, telemetrySeq, isoTime);
    }

    // 3. Heartbeat status publishing loop
    if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatMs = now;
        unsigned long uptimeSec = (now - bootTimeMs) / 1000;
        String isoTime = SntpTime::getIsoTimestamp();

        MqttManager::publishHeartbeat(
            uptimeSec,
            isoTime,
            WiFiManager::getIP(),
            WiFiManager::getMAC(),
            WiFiManager::getRSSI()
        );
    }

    delay(10);
}
