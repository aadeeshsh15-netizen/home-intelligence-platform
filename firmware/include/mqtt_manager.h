#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClient.h>
#include "sensor_manager.h"

class MqttManager {
public:
    static void init(const char* host, int port, const char* homeId, const char* deviceId, const char* secret);
    static void loop();
    static bool isConnected();
    static void publishTelemetry(const SensorData& data, unsigned long seq, const String& isoTimestamp);
    static void publishHeartbeat(unsigned long uptimeSec, const String& isoTimestamp, const String& ip, const String& mac, int rssi);
    static void publishAck(const char* commandId, const char* status, const char* reason);
private:
    static void reconnect();
    static void onMessage(char* topic, byte* payload, unsigned int length);

    static WiFiClient _wifiClient;
    static PubSubClient _mqttClient;

    static const char* _host;
    static int _port;
    static const char* _homeId;
    static const char* _deviceId;
    static const char* _secret;

    static String _topicTelemetry;
    static String _topicStatus;
    static String _topicCommand;
    static String _topicAck;

    static unsigned long _lastReconnectAttempt;
};

#endif // MQTT_MANAGER_H
