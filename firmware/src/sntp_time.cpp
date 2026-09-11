#include "sntp_time.h"
#include <time.h>

bool SntpTime::_synced = false;

void SntpTime::init(const char* ntpServer, long gmtOffsetSec, int daylightOffsetSec) {
    Serial.printf("[SNTP] Initializing time sync with %s...\n", ntpServer);
    configTime(gmtOffsetSec, daylightOffsetSec, ntpServer);

    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 5000)) {
        _synced = true;
        char buffer[32];
        strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        Serial.printf("[SNTP] Time synchronized successfully: %s\n", buffer);
    } else {
        Serial.println("[SNTP] Warning: Failed to obtain initial time from NTP server.");
        _synced = false;
    }
}

bool SntpTime::isSynchronized() {
    time_t now = time(nullptr);
    return now > 1700000000; // Greater than Nov 2023 indicates valid time
}

String SntpTime::getIsoTimestamp() {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 500)) {
        char buffer[32];
        strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buffer);
    }

    // Fallback: Return epoch seconds in ISO format or relative
    time_t now = time(nullptr);
    if (now > 1700000000) {
        gmtime_r(&now, &timeinfo);
        char buffer[32];
        strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buffer);
    }

    return "1970-01-01T00:00:00Z";
}

unsigned long SntpTime::getEpochSeconds() {
    return (unsigned long)time(nullptr);
}
