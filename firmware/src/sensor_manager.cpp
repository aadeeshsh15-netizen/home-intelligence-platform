#include "sensor_manager.h"
#include <DHT.h>

int SensorManager::_pinDht = 4;
int SensorManager::_pinMq135 = 34;
int SensorManager::_pinPir = 18;
int SensorManager::_pinReed = 19;

static DHT* dhtSensor = nullptr;

void SensorManager::init(int pinDht, int pinMq135, int pinPir, int pinReed) {
    _pinDht = pinDht;
    _pinMq135 = pinMq135;
    _pinPir = pinPir;
    _pinReed = pinReed;

    pinMode(_pinPir, INPUT);
    pinMode(_pinReed, INPUT_PULLUP); // Reed switch connects pin to GND when window is closed
    pinMode(_pinMq135, INPUT);

    dhtSensor = new DHT(_pinDht, DHT22);
    dhtSensor->begin();
    Serial.printf("[Sensors] Initialized pins: DHT=%d, MQ135=%d, PIR=%d, Reed=%d\n",
                  _pinDht, _pinMq135, _pinPir, _pinReed);
}

SensorData SensorManager::readAll() {
    SensorData data;

    // 1. Read Temperature & Humidity from DHT22
    float t = dhtSensor ? dhtSensor->readTemperature() : NAN;
    float h = dhtSensor ? dhtSensor->readHumidity() : NAN;

    if (isnan(t) || isnan(h)) {
        data.dhtValid = false;
        data.temperature = 0.0f;
        data.humidity = 0.0f;
        Serial.println("[Sensors] Warning: DHT22 read returned NaN (sensor warming up or communication glitch)");
    } else {
        data.dhtValid = true;
        data.temperature = roundf(t * 10.0f) / 10.0f;
        data.humidity = roundf(h * 10.0f) / 10.0f;
    }

    // 2. Read MQ-135 Gas Sensor (12-bit ADC: 0 - 4095)
    // Maps raw ADC voltage to clean 400 - 2,500 ppm air-quality proxy
    int rawAdc = analogRead(_pinMq135);
    data.co2Ppm = (int)(400 + (rawAdc / 4095.0f) * 1600.0f);

    // 3. Read PIR Motion Sensor (Active HIGH)
    data.occupancy = digitalRead(_pinPir) == HIGH ? 1 : 0;

    // 4. Read Reed Contact Switch (LOW = Closed / Magnet adjacent; HIGH = Open)
    data.windowContact = digitalRead(_pinReed) == HIGH ? 1 : 0;

    return data;
}
