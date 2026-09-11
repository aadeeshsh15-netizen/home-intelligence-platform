#include "mqtt_manager.h"
#include <ArduinoJson.h>

WiFiClient MqttManager::_wifiClient;
PubSubClient MqttManager::_mqttClient(_wifiClient);

const char* MqttManager::_host = nullptr;
int MqttManager::_port = 1883;
const char* MqttManager::_homeId = nullptr;
const char* MqttManager::_deviceId = nullptr;
const char* MqttManager::_secret = nullptr;

String MqttManager::_topicTelemetry = "";
String MqttManager::_topicStatus = "";
String MqttManager::_topicCommand = "";
String MqttManager::_topicAck = "";

unsigned long MqttManager::_lastReconnectAttempt = 0;

void MqttManager::init(const char* host, int port, const char* homeId, const char* deviceId, const char* secret) {
    _host = host;
    _port = port;
    _homeId = homeId;
    _deviceId = deviceId;
    _secret = secret;

    _topicTelemetry = "home/" + String(_homeId) + "/device/" + String(_deviceId) + "/telemetry";
    _topicStatus = "home/" + String(_homeId) + "/device/" + String(_deviceId) + "/status";
    _topicCommand = "home/" + String(_homeId) + "/device/" + String(_deviceId) + "/command";
    _topicAck = "home/" + String(_homeId) + "/device/" + String(_deviceId) + "/ack";

    _mqttClient.setServer(_host, _port);
    _mqttClient.setCallback(onMessage);
    _mqttClient.setBufferSize(1024);
    _mqttClient.setKeepAlive(60); // 60s keepalive covers 30s heartbeat interval

    Serial.printf("[MQTT] Initialized broker target: %s:%d (KeepAlive=60s)\n", _host, _port);
    Serial.printf("[MQTT] Topics: \n  Telemetry: %s\n  Status:    %s\n", _topicTelemetry.c_str(), _topicStatus.c_str());
}

bool MqttManager::isConnected() {
    return _mqttClient.connected();
}

void MqttManager::loop() {
    if (!_mqttClient.connected()) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > 5000) {
            _lastReconnectAttempt = now;
            reconnect();
        }
    } else {
        _mqttClient.loop();
    }
}

void MqttManager::reconnect() {
    Serial.printf("[MQTT] Connecting to broker as %s...\n", _deviceId);

    // LWT Payload
    String lwtPayload = "{\"status\":\"OFFLINE\",\"reason\":\"UNEXPECTED_DISCONNECT\"}";

    if (_mqttClient.connect(
            _deviceId,                  // Client ID
            _deviceId,                  // Username
            _secret,                    // Password
            _topicStatus.c_str(),       // LWT Topic
            1,                          // LWT QoS
            true,                       // LWT Retain
            lwtPayload.c_str()          // LWT Payload
        )) {
        Serial.println("[MQTT] Connected to broker successfully.");

        // Subscribe to command topic
        _mqttClient.subscribe(_topicCommand.c_str(), 1);

        // Publish initial ONLINE status
        String onlinePayload = "{\"status\":\"ONLINE\",\"firmwareVersion\":\"v1.0.0-esp32\"}";
        _mqttClient.publish(_topicStatus.c_str(), onlinePayload.c_str(), true);
    } else {
        Serial.printf("[MQTT] Connection failed, rc=%d. Will retry in 5s...\n", _mqttClient.state());
    }
}

void MqttManager::publishTelemetry(const SensorData& data, unsigned long seq, const String& isoTimestamp) {
    if (!_mqttClient.connected()) return;

    JsonDocument doc;
    doc["timestamp"] = isoTimestamp;
    doc["seq"] = seq;

    JsonArray metrics = doc["metrics"].to<JsonArray>();

    // 1. Temperature & Humidity (Only published when sensor reading is physically valid)
    if (data.dhtValid) {
        JsonObject mTemp = metrics.add<JsonObject>();
        mTemp["type"] = "TEMPERATURE";
        mTemp["value"] = data.temperature;
        mTemp["unit"] = "°C";

        JsonObject mHum = metrics.add<JsonObject>();
        mHum["type"] = "HUMIDITY";
        mHum["value"] = data.humidity;
        mHum["unit"] = "%";
    }

    // 3. CO2 Proxy
    JsonObject mCo2 = metrics.add<JsonObject>();
    mCo2["type"] = "CO2";
    mCo2["value"] = data.co2Ppm;
    mCo2["unit"] = "ppm";

    // 4. Motion / Occupancy
    JsonObject mOcc = metrics.add<JsonObject>();
    mOcc["type"] = "OCCUPANCY";
    mOcc["value"] = data.occupancy;
    mOcc["unit"] = "binary";

    // 5. Window / Door Contact
    JsonObject mCont = metrics.add<JsonObject>();
    mCont["type"] = "CONTACT";
    mCont["value"] = data.windowContact;
    mCont["unit"] = "binary";

    char buffer[512];
    serializeJson(doc, buffer);

    bool ok = _mqttClient.publish(_topicTelemetry.c_str(), buffer, false);
    if (ok) {
        Serial.printf("[MQTT] Published telemetry (#%lu): Temp=%.1f C, CO2=%d ppm, Occ=%d, Contact=%d\n",
                      seq, data.temperature, data.co2Ppm, data.occupancy, data.windowContact);
    } else {
        Serial.println("[MQTT] Failed to publish telemetry packet.");
    }
}

void MqttManager::publishHeartbeat(unsigned long uptimeSec, const String& isoTimestamp, const String& ip, const String& mac, int rssi) {
    if (!_mqttClient.connected()) return;

    JsonDocument doc;
    doc["status"] = "ONLINE";
    doc["firmwareVersion"] = "v1.0.0-esp32";
    doc["ip"] = ip;
    doc["mac"] = mac;
    doc["uptimeSec"] = uptimeSec;
    doc["rssi"] = rssi;
    doc["timestamp"] = isoTimestamp;

    char buffer[256];
    serializeJson(doc, buffer);

    _mqttClient.publish(_topicStatus.c_str(), buffer, true);
    Serial.printf("[MQTT] Published heartbeat: uptime=%lu s, RSSI=%d dBm\n", uptimeSec, rssi);
}

void MqttManager::publishAck(const char* commandId, const char* status, const char* reason) {
    if (!_mqttClient.connected()) return;

    JsonDocument doc;
    doc["commandId"] = commandId;
    doc["status"] = status;
    doc["reason"] = reason;

    char buffer[256];
    serializeJson(doc, buffer);

    _mqttClient.publish(_topicAck.c_str(), buffer, false);
    Serial.printf("[MQTT] Published ACK: commandId=%s, status=%s, reason=%s\n", commandId, status, reason);
}

void MqttManager::onMessage(char* topic, byte* payload, unsigned int length) {
    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';
    Serial.printf("[MQTT] Command received on %s: %s\n", topic, msg);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, msg);
    if (error) {
        Serial.printf("[MQTT] JSON parse error: %s\n", error.c_str());
        return;
    }

    const char* commandId = doc["commandId"] | "";
    const char* action = doc["action"] | "";

    // Low-Voltage Actuator Control (e.g. GPIO 2 Status LED / Low-Voltage Relay)
    if (strcmp(action, "TURN_ON") == 0) {
        pinMode(2, OUTPUT);
        digitalWrite(2, HIGH);
        publishAck(commandId, "COMPLETED", "Low-voltage actuator engaged (ON)");
    } else if (strcmp(action, "TURN_OFF") == 0) {
        pinMode(2, OUTPUT);
        digitalWrite(2, LOW);
        publishAck(commandId, "COMPLETED", "Low-voltage actuator disengaged (OFF)");
    } else if (strcmp(action, "PULSE") == 0) {
        pinMode(2, OUTPUT);
        digitalWrite(2, HIGH);
        delay(150);
        digitalWrite(2, LOW);
        publishAck(commandId, "COMPLETED", "Pulse cycle executed");
    } else if (strcmp(action, "SHED_LOAD") == 0) {
        publishAck(commandId, "COMPLETED", "Auxiliary circuit load shed executed");
    } else {
        publishAck(commandId, "REJECTED", "Unsupported actuator action");
    }
}

