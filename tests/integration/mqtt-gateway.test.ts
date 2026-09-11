import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { DeviceProtocol, DeviceStatus, SensorType, SensorHealth } from '@prisma/client';
import { hashDeviceToken } from '@/server/iot/device-auth';

describe('Phase 6: MQTT Gateway & Ingestion Adapter Integration Tests', () => {
  let home: any;
  let room: any;
  let device: any;
  let tempSensor: any;
  let co2Sensor: any;
  const rawToken = 'dvt_live_integration_test_secret_123';

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');

    room = await prisma.room.findFirst({
      where: { floor: { homeId: home.id } },
    });
    if (!room) throw new Error('No test room found');

    // Create a physical test device
    device = await prisma.device.create({
      data: {
        name: 'Integration Test ESP32 Gateway Node',
        deviceType: 'ENVIRONMENTAL_HUB',
        hardwareType: 'ESP32_WROOM_32',
        protocol: DeviceProtocol.MQTT,
        identifier: `esp32-gw-test-${Date.now()}`,
        status: DeviceStatus.OFFLINE,
        authTokenHash: hashDeviceToken(rawToken),
        roomId: room.id,
      },
    });

    // Create temperature and CO2 sensors for this device
    tempSensor = await prisma.sensor.create({
      data: {
        roomId: room.id,
        deviceId: device.id,
        type: SensorType.TEMPERATURE,
        unit: '°C',
        minExpectedValue: -10,
        maxExpectedValue: 50,
        health: SensorHealth.HEALTHY,
      },
    });

    co2Sensor = await prisma.sensor.create({
      data: {
        roomId: room.id,
        deviceId: device.id,
        type: SensorType.CO2,
        unit: 'ppm',
        minExpectedValue: 350,
        maxExpectedValue: 3000,
        health: SensorHealth.HEALTHY,
      },
    });
  });

  afterAll(async () => {
    if (device) {
      await prisma.telemetryReading.deleteMany({
        where: { sensorId: { in: [tempSensor?.id, co2Sensor?.id].filter(Boolean) } },
      });
      await prisma.sensor.deleteMany({
        where: { deviceId: device.id },
      });
      await prisma.device.delete({
        where: { id: device.id },
      });
    }
  });

  it('translates physical MQTT telemetry and updates database and live sensor states', async () => {
    const testTimestamp = new Date();
    const payload = {
      timestamp: testTimestamp.toISOString(),
      seq: 101,
      metrics: [
        { type: 'TEMPERATURE', value: 23.5, unit: '°C' },
        { type: 'CO2', value: 740, unit: 'ppm' },
      ],
    };

    const summary = await mqttGateway.handleTelemetry(home.id, device.identifier, payload);

    expect(summary).not.toBeNull();
    expect(summary?.processedCount).toBeGreaterThanOrEqual(1);

    // Verify live sensor state updated in PostgreSQL
    const updatedTemp = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });
    expect(updatedTemp?.lastReadingValue).toBe(23.5);
    expect(updatedTemp?.health).toBe(SensorHealth.HEALTHY);

    const updatedCO2 = await prisma.sensor.findUnique({ where: { id: co2Sensor.id } });
    expect(updatedCO2?.lastReadingValue).toBe(740);

    // Verify device updated to ONLINE and lastSeen updated
    const updatedDevice = await prisma.device.findUnique({ where: { id: device.id } });
    expect(updatedDevice?.status).toBe(DeviceStatus.ONLINE);
    expect(updatedDevice?.lastSeenAt).not.toBeNull();
  });

  it('rejects telemetry packets for unknown devices', async () => {
    const payload = {
      timestamp: new Date().toISOString(),
      metrics: [{ type: 'TEMPERATURE', value: 20.0, unit: '°C' }],
    };

    const summary = await mqttGateway.handleTelemetry(home.id, 'non-existent-device-xyz', payload);
    expect(summary).toBeNull();
  });

  it('rejects telemetry packets attempting cross-home tenant spoofing', async () => {
    const payload = {
      timestamp: new Date().toISOString(),
      metrics: [{ type: 'TEMPERATURE', value: 20.0, unit: '°C' }],
    };

    // Passing a spoofed homeId different from the device's actual home
    const summary = await mqttGateway.handleTelemetry('spoofed-foreign-home-id', device.identifier, payload);
    expect(summary).toBeNull();
  });

  it('handles status and LWT packets, correctly marking device and sensors OFFLINE without fabricating zeros', async () => {
    // 1. Device sends LWT OFFLINE
    const offlinePayload = {
      status: 'OFFLINE',
      reason: 'UNEXPECTED_DISCONNECT',
    };

    await mqttGateway.handleStatus(home.id, device.identifier, offlinePayload);

    const offlineDev = await prisma.device.findUnique({ where: { id: device.id } });
    expect(offlineDev?.status).toBe(DeviceStatus.OFFLINE);

    const offlineSensor = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });
    expect(offlineSensor?.health).toBe(SensorHealth.OFFLINE);
    // CRITICAL: Sensor reading value MUST remain at last real reading (23.5°C), NOT fabricated to 0!
    expect(offlineSensor?.lastReadingValue).toBe(23.5);

    // 2. Device reconnects and sends ONLINE status
    const onlinePayload = {
      status: 'ONLINE',
      firmwareVersion: 'v1.0.1-esp32',
      ip: '192.168.1.99',
      mac: '24:6F:28:11:22:33',
    };

    await mqttGateway.handleStatus(home.id, device.identifier, onlinePayload);

    const onlineDev = await prisma.device.findUnique({ where: { id: device.id } });
    expect(onlineDev?.status).toBe(DeviceStatus.ONLINE);
    expect(onlineDev?.firmwareVersion).toBe('v1.0.1-esp32');
    expect(onlineDev?.macAddress).toBe('24:6F:28:11:22:33');
  });
});
