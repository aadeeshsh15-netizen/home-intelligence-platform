import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { systemEventsBus } from '@/server/event-engine/rules';
import { DeviceProtocol, DeviceStatus, SensorType, SensorHealth } from '@prisma/client';
import { hashDeviceToken } from '@/server/iot/device-auth';

describe('Phase 6: End-to-End IoT Pipeline (MQTT -> Gateway -> Ingest -> DB -> Intelligence -> SSE)', () => {
  let home: any;
  let livingRoom: any;
  let esp32Device: any;
  let co2Sensor: any;
  let occSensor: any;
  let receivedTicks: any[] = [];

  const handleTick = (tick: any) => {
    receivedTicks.push(tick);
  };

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');

    livingRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
    });
    if (!livingRoom) throw new Error('No living room found');

    // Register live SSE listener
    systemEventsBus.on('telemetry_tick', handleTick);

    // Create physical ESP32 node
    esp32Device = await prisma.device.create({
      data: {
        name: 'Living Room Physical ESP32 Sensor Node',
        deviceType: 'ENVIRONMENTAL_HUB',
        hardwareType: 'ESP32_WROOM_32',
        protocol: DeviceProtocol.MQTT,
        identifier: `esp32-e2e-node-${Date.now()}`,
        status: DeviceStatus.OFFLINE,
        authTokenHash: hashDeviceToken('dvt_live_e2e_secret'),
        roomId: livingRoom.id,
      },
    });

    // Create attached sensors
    co2Sensor = await prisma.sensor.create({
      data: {
        roomId: livingRoom.id,
        deviceId: esp32Device.id,
        type: SensorType.CO2,
        unit: 'ppm',
        minExpectedValue: 350,
        maxExpectedValue: 3000,
        health: SensorHealth.HEALTHY,
        lastReadingValue: 600,
      },
    });

    occSensor = await prisma.sensor.create({
      data: {
        roomId: livingRoom.id,
        deviceId: esp32Device.id,
        type: SensorType.OCCUPANCY,
        unit: 'binary',
        minExpectedValue: 0,
        maxExpectedValue: 1,
        health: SensorHealth.HEALTHY,
        lastReadingValue: 1,
      },
    });
  });

  afterAll(async () => {
    systemEventsBus.off('telemetry_tick', handleTick);

    if (esp32Device) {
      await prisma.telemetryReading.deleteMany({
        where: { sensorId: { in: [co2Sensor?.id, occSensor?.id].filter(Boolean) } },
      });
      await prisma.sensor.deleteMany({
        where: { deviceId: esp32Device.id },
      });
      await prisma.device.delete({
        where: { id: esp32Device.id },
      });
    }
  });

  it('ingests physical telemetry packet, triggers intelligence pipeline, and emits realtime tick', async () => {
    receivedTicks = [];
    const testTime = new Date();

    // Telemetry packet from physical ESP32
    const mqttPayload = {
      timestamp: testTime.toISOString(),
      seq: 205,
      metrics: [
        { type: 'CO2', value: 890, unit: 'ppm' },
        { type: 'OCCUPANCY', value: 1, unit: 'binary' },
      ],
    };

    // Gateway receives message on home/{homeId}/device/{deviceId}/telemetry
    const summary = await mqttGateway.handleTelemetry(home.id, esp32Device.identifier, mqttPayload);

    // 1. Ingestion summary confirms processing
    expect(summary).not.toBeNull();
    expect(summary?.processedCount).toBe(2);
    expect(summary?.rejectedCount).toBe(0);

    // 2. PostgreSQL TelemetryReading table contains physical readings
    const savedReadings = await prisma.telemetryReading.findMany({
      where: {
        sensorId: { in: [co2Sensor.id, occSensor.id] },
        timestamp: testTime,
      },
    });
    expect(savedReadings.length).toBe(2);

    // 3. Sensor live values updated
    const refreshedCo2 = await prisma.sensor.findUnique({ where: { id: co2Sensor.id } });
    expect(refreshedCo2?.lastReadingValue).toBe(890);

    // 4. Device status updated to ONLINE
    const refreshedDev = await prisma.device.findUnique({ where: { id: esp32Device.id } });
    expect(refreshedDev?.status).toBe(DeviceStatus.ONLINE);

    // 5. Realtime SSE bus broadcasted tick
    expect(receivedTicks.length).toBeGreaterThanOrEqual(1);
    const co2Tick = receivedTicks.find((t) => t.sensorId === co2Sensor.id);
    expect(co2Tick).toBeDefined();
    expect(co2Tick.value).toBe(890);
    expect(co2Tick.roomName).toBe(livingRoom.name);
  });
});
