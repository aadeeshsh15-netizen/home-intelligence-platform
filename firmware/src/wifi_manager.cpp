#include "wifi_manager.h"
#include <WiFi.h>

const char* WiFiManager::_ssid = nullptr;
const char* WiFiManager::_password = nullptr;
unsigned long WiFiManager::_lastAttempt = 0;
unsigned long WiFiManager::_backoffMs = 2000;

void WiFiManager::init(const char* ssid, const char* password) {
    _ssid = ssid;
    _password = password;
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    Serial.print("[WiFi] Connecting to ");
    Serial.println(_ssid);
    WiFi.begin(_ssid, _password);
    _lastAttempt = millis();
}

bool WiFiManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::checkConnection() {
    if (isConnected()) {
        _backoffMs = 2000; // Reset backoff upon healthy connection
        return;
    }

    unsigned long now = millis();
    if (now - _lastAttempt > _backoffMs) {
        Serial.printf("[WiFi] Reconnecting to %s (backoff: %lu ms)...\n", _ssid, _backoffMs);
        WiFi.disconnect();
        WiFi.begin(_ssid, _password);
        _lastAttempt = now;
        _backoffMs = min(_backoffMs * 2, 60000UL); // Exponential backoff capped at 60s
    }
}

String WiFiManager::getIP() {
    return WiFi.localIP().toString();
}

String WiFiManager::getMAC() {
    return WiFi.macAddress();
}

int WiFiManager::getRSSI() {
    return WiFi.RSSI();
}
