#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>

class WiFiManager {
public:
    static void init(const char* ssid, const char* password);
    static bool isConnected();
    static void checkConnection();
    static String getIP();
    static String getMAC();
    static int getRSSI();
private:
    static const char* _ssid;
    static const char* _password;
    static unsigned long _lastAttempt;
    static unsigned long _backoffMs;
};

#endif // WIFI_MANAGER_H
