#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <Arduino.h>

struct SensorData {
    float temperature;
    float humidity;
    int co2Ppm;
    int occupancy;
    int windowContact;
    bool dhtValid;
};

class SensorManager {
public:
    static void init(int pinDht, int pinMq135, int pinPir, int pinReed);
    static SensorData readAll();
private:
    static int _pinDht;
    static int _pinMq135;
    static int _pinPir;
    static int _pinReed;
};

#endif // SENSOR_MANAGER_H
