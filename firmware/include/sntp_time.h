#ifndef SNTP_TIME_H
#define SNTP_TIME_H

#include <Arduino.h>

class SntpTime {
public:
    static void init(const char* ntpServer = "pool.ntp.org", long gmtOffsetSec = 0, int daylightOffsetSec = 0);
    static bool isSynchronized();
    static String getIsoTimestamp();
    static unsigned long getEpochSeconds();
private:
    static bool _synced;
};

#endif // SNTP_TIME_H
