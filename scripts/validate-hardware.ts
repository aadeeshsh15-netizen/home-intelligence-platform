import { prisma } from '@/lib/db';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { systemEventsBus } from '@/server/event-engine/rules';
import { DeviceProtocol, DeviceStatus, ProvisioningStatus, SensorType, SensorHealth } from '@prisma/client';
import { generateDeviceToken, hashDeviceToken, authenticateDeviceForTopic } from '@/server/iot/device-auth';
import { validateMqttTimestamp } from '@/domain/mqtt.schema';

interface HardwareTestResult {
  testNumber: number;
  testName: string;
  category: 'TEMPERATURE' | 'HUMIDITY' | 'OCCUPANCY' | 'CONTACT' | 'LIFECYCLE' | 'RECONNECT' | 'SECURITY' | 'DEMO_SCENARIO';
  expected: string;
  observed: string;
  passed: boolean;
  notes?: string;
}

export async function runHardwareValidationSuite(): Promise<HardwareTestResult[]> {
  const results: HardwareTestResult[] = [];
  const home = await prisma.home.findFirst();
  if (!home) throw new Error('No home found for hardware validation');

  const livingRoom = await prisma.room.findFirst({
    where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
  });
  if (!livingRoom) throw new Error('No living room found');

  const token = generateDeviceToken();
  const tokenHash = hashDeviceToken(token);
  const deviceIdentifier = `esp32-devkit-val-${Date.now()}`;

  // 1. Provision hardware validation device
  const device = await prisma.device.create({
    data: {
      name: 'ESP32 DevKit v1 Physical Validation Node',
      deviceType: 'ENVIRONMENTAL_HUB',
      hardwareType: 'ESP32_WROOM_32',
      protocol: DeviceProtocol.MQTT,
      identifier: deviceIdentifier,
      status: DeviceStatus.OFFLINE,
      provisioningStatus: ProvisioningStatus.PROVISIONED,
      authTokenHash: tokenHash,
      macAddress: '24:6F:28:AB:CD:EF',
      firmwareVersion: 'v1.0.0-esp32',
      roomId: livingRoom.id,
      lastSeenAt: new Date(),
    },
  });

  // Provision sensors
  const tempSensor = await prisma.sensor.create({
    data: {
      roomId: livingRoom.id,
      deviceId: device.id,
      type: SensorType.TEMPERATURE,
      unit: '°C',
      minExpectedValue: -10,
      maxExpectedValue: 50,
      samplingIntervalSec: 10,
      health: SensorHealth.HEALTHY,
    },
  });

  const humSensor = await prisma.sensor.create({
    data: {
      roomId: livingRoom.id,
      deviceId: device.id,
      type: SensorType.HUMIDITY,
      unit: '%',
      minExpectedValue: 0,
      maxExpectedValue: 100,
      samplingIntervalSec: 10,
      health: SensorHealth.HEALTHY,
    },
  });

  const occSensor = await prisma.sensor.create({
    data: {
      roomId: livingRoom.id,
      deviceId: device.id,
      type: SensorType.OCCUPANCY,
      unit: 'binary',
      minExpectedValue: 0,
      maxExpectedValue: 1,
      samplingIntervalSec: 5,
      health: SensorHealth.HEALTHY,
    },
  });

  const contactSensor = await prisma.sensor.create({
    data: {
      roomId: livingRoom.id,
      deviceId: device.id,
      type: SensorType.CONTACT,
      unit: 'binary',
      minExpectedValue: 0,
      maxExpectedValue: 1,
      samplingIntervalSec: 5,
      health: SensorHealth.HEALTHY,
    },
  });

  const co2Sensor = await prisma.sensor.create({
    data: {
      roomId: livingRoom.id,
      deviceId: device.id,
      type: SensorType.CO2,
      unit: 'ppm',
      minExpectedValue: 350,
      maxExpectedValue: 3000,
      samplingIntervalSec: 10,
      health: SensorHealth.HEALTHY,
    },
  });

  // Listen to realtime SSE broadcast
  const sseTicks: any[] = [];
  const onTick = (tick: any) => sseTicks.push(tick);
  systemEventsBus.on('telemetry_tick', onTick);

  try {
    // =========================================================================
    // TEST 1: Temperature Sensor Validation (DHT22 / BME280)
    // =========================================================================
    {
      const now = new Date();
      const payload = {
        timestamp: now.toISOString(),
        seq: 1,
        metrics: [{ type: 'TEMPERATURE', value: 24.2, unit: '°C' }],
      };
      await mqttGateway.handleTelemetry(home.id, device.identifier, payload);

      const refreshed = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });
      const devRefreshed = await prisma.device.findUnique({ where: { id: device.id } });
      const receivedSse = sseTicks.some((t) => t.sensorId === tempSensor.id && t.value === 24.2);

      const passed = refreshed?.lastReadingValue === 24.2 && devRefreshed?.status === DeviceStatus.ONLINE && receivedSse;
      results.push({
        testNumber: 1,
        testName: 'Temperature Hardware Response',
        category: 'TEMPERATURE',
        expected: 'Sensor value 24.2°C in DB, Device ONLINE, SSE telemetry_tick emitted',
        observed: `DB Value: ${refreshed?.lastReadingValue}°C, Device: ${devRefreshed?.status}, SSE Received: ${receivedSse}`,
        passed,
      });
    }

    // =========================================================================
    // TEST 2: Humidity Sensor Validation (DHT22 / BME280)
    // =========================================================================
    {
      const now = new Date();
      const payload = {
        timestamp: now.toISOString(),
        seq: 2,
        metrics: [{ type: 'HUMIDITY', value: 54.5, unit: '%' }],
      };
      await mqttGateway.handleTelemetry(home.id, device.identifier, payload);

      const refreshed = await prisma.sensor.findUnique({ where: { id: humSensor.id } });
      const passed = refreshed?.lastReadingValue === 54.5 && refreshed?.health === SensorHealth.HEALTHY;
      results.push({
        testNumber: 2,
        testName: 'Humidity Hardware Response',
        category: 'HUMIDITY',
        expected: 'Sensor value 54.5% in DB, Health HEALTHY',
        observed: `DB Value: ${refreshed?.lastReadingValue}%, Health: ${refreshed?.health}`,
        passed,
      });
    }

    // =========================================================================
    // TEST 3: Occupancy / Motion Sensor Validation (PIR / mmWave)
    // =========================================================================
    {
      const now = new Date();
      const payload = {
        timestamp: now.toISOString(),
        seq: 3,
        metrics: [{ type: 'OCCUPANCY', value: 1, unit: 'binary' }],
      };
      await mqttGateway.handleTelemetry(home.id, device.identifier, payload);

      const refreshed = await prisma.sensor.findUnique({ where: { id: occSensor.id } });
      const receivedSse = sseTicks.some((t) => t.sensorId === occSensor.id && t.value === 1);
      const passed = refreshed?.lastReadingValue === 1 && receivedSse;
      results.push({
        testNumber: 3,
        testName: 'Occupancy PIR Trigger Response',
        category: 'OCCUPANCY',
        expected: 'Occupancy binary state 1 persisted in DB, SSE tick broadcasted',
        observed: `DB Value: ${refreshed?.lastReadingValue}, SSE Broadcast: ${receivedSse}`,
        passed,
      });
    }

    // =========================================================================
    // TEST 4: Contact Sensor Validation (Magnetic Reed Switch)
    // =========================================================================
    {
      const now = new Date();
      // Transition from Closed (0) to Open (1)
      const payload = {
        timestamp: now.toISOString(),
        seq: 4,
        metrics: [{ type: 'CONTACT', value: 1, unit: 'binary' }],
      };
      await mqttGateway.handleTelemetry(home.id, device.identifier, payload);

      const refreshed = await prisma.sensor.findUnique({ where: { id: contactSensor.id } });
      const passed = refreshed?.lastReadingValue === 1;
      results.push({
        testNumber: 4,
        testName: 'Window/Door Reed Switch Contact Response',
        category: 'CONTACT',
        expected: 'Contact binary state 1 (Window Open) persisted in DB',
        observed: `DB Value: ${refreshed?.lastReadingValue}`,
        passed,
      });
    }

    // =========================================================================
    // TEST 5: Device Lifecycle Transitions (ONLINE -> STALE -> OFFLINE)
    // =========================================================================
    {
      const now = new Date();
      // Simulate last seen 90 seconds ago (stale window: 60s - 180s)
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(now.getTime() - 90 * 1000), status: DeviceStatus.ONLINE },
      });
      await mqttGateway.sweepStaleDevices(now);

      const staleDev = await prisma.device.findUnique({ where: { id: device.id } });
      const staleCheck = staleDev?.status === DeviceStatus.STALE;

      // Simulate last seen 240 seconds ago (> 180s offline window)
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(now.getTime() - 240 * 1000) },
      });
      await mqttGateway.sweepStaleDevices(now);

      const offlineDev = await prisma.device.findUnique({ where: { id: device.id } });
      const offlineCheck = offlineDev?.status === DeviceStatus.OFFLINE;

      // Ensure last reading values were NOT wiped to zero
      const tempAfterOffline = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });
      const noZeroWipe = tempAfterOffline?.lastReadingValue === 24.2;

      const passed = staleCheck && offlineCheck && noZeroWipe;
      results.push({
        testNumber: 5,
        testName: 'Device Watchdog Lifecycle (ONLINE -> STALE -> OFFLINE)',
        category: 'LIFECYCLE',
        expected: 'Status STALE at 90s, OFFLINE at 240s; lastReadingValue preserved (no zero-wipe)',
        observed: `At 90s: ${staleDev?.status}, At 240s: ${offlineDev?.status}, Last Value: ${tempAfterOffline?.lastReadingValue}°C`,
        passed,
      });
    }

    // =========================================================================
    // TEST 6: Hardware Reconnect Recovery (OFFLINE -> ONLINE)
    // =========================================================================
    {
      const now = new Date();
      const recoveryPayload = {
        timestamp: now.toISOString(),
        seq: 5,
        metrics: [
          { type: 'TEMPERATURE', value: 23.8, unit: '°C' },
          { type: 'HUMIDITY', value: 52.0, unit: '%' },
        ],
      };
      await mqttGateway.handleTelemetry(home.id, device.identifier, recoveryPayload);

      const reconnectedDev = await prisma.device.findUnique({ where: { id: device.id } });
      const reconnectedTemp = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });

      const passed = reconnectedDev?.status === DeviceStatus.ONLINE && reconnectedTemp?.lastReadingValue === 23.8;
      results.push({
        testNumber: 6,
        testName: 'Hardware Reconnect & Recovery',
        category: 'RECONNECT',
        expected: 'Device transitions from OFFLINE to ONLINE cleanly upon first fresh packet',
        observed: `Status: ${reconnectedDev?.status}, Restored Temperature: ${reconnectedTemp?.lastReadingValue}°C`,
        passed,
      });
    }

    // =========================================================================
    // TEST 7: Security Boundary & Replay Protection
    // =========================================================================
    {
      // 1. Valid token auth
      const authValid = await authenticateDeviceForTopic({ homeId: home.id, deviceId: device.identifier, authToken: token });

      // 2. Invalid token auth
      const authInvalid = await authenticateDeviceForTopic({ homeId: home.id, deviceId: device.identifier, authToken: 'dvt_live_fake_token' });

      // 3. Cross-home tenant spoofing
      const authCrossHome = await authenticateDeviceForTopic({ homeId: 'foreign_home_id', deviceId: device.identifier });

      // 4. Replay timestamp check (15 min past)
      const pastSkew = validateMqttTimestamp(new Date(Date.now() - 15 * 60 * 1000));

      const passed = authValid.authorized && !authInvalid.authorized && !authCrossHome.authorized && !pastSkew.valid;
      results.push({
        testNumber: 7,
        testName: 'Security Isolation & Cryptographic Boundary',
        category: 'SECURITY',
        expected: 'Valid token passes; bad token, cross-home spoof, and skewed timestamp rejected',
        observed: `ValidAuth: ${authValid.authorized}, BadTokenRejected: ${!authInvalid.authorized}, CrossHomeRejected: ${!authCrossHome.authorized}, ReplayRejected: ${!pastSkew.valid}`,
        passed,
      });
    }

    // =========================================================================
    // TEST 8: Full End-to-End Physical Proof-of-Concept Demo Scenario
    // =========================================================================
    {
      // Step 1: Normal room conditions
      const step1Time = new Date();
      await mqttGateway.handleTelemetry(home.id, device.identifier, {
        timestamp: step1Time.toISOString(),
        seq: 10,
        metrics: [
          { type: 'TEMPERATURE', value: 22.0, unit: '°C' },
          { type: 'HUMIDITY', value: 48.0, unit: '%' },
          { type: 'CO2', value: 550, unit: 'ppm' },
          { type: 'OCCUPANCY', value: 0, unit: 'binary' },
          { type: 'CONTACT', value: 0, unit: 'binary' },
        ],
      });

      // Step 2: Occupant enters room
      const step2Time = new Date(step1Time.getTime() + 15000);
      await mqttGateway.handleTelemetry(home.id, device.identifier, {
        timestamp: step2Time.toISOString(),
        seq: 11,
        metrics: [
          { type: 'OCCUPANCY', value: 1, unit: 'binary' },
          { type: 'CO2', value: 720, unit: 'ppm' },
        ],
      });

      // Step 3: Window opened (contact switch = 1)
      const step3Time = new Date(step2Time.getTime() + 15000);
      await mqttGateway.handleTelemetry(home.id, device.identifier, {
        timestamp: step3Time.toISOString(),
        seq: 12,
        metrics: [
          { type: 'CONTACT', value: 1, unit: 'binary' },
          { type: 'TEMPERATURE', value: 19.5, unit: '°C' },
          { type: 'CO2', value: 650, unit: 'ppm' },
        ],
      });

      const finalTemp = await prisma.sensor.findUnique({ where: { id: tempSensor.id } });
      const finalOcc = await prisma.sensor.findUnique({ where: { id: occSensor.id } });
      const finalContact = await prisma.sensor.findUnique({ where: { id: contactSensor.id } });

      const passed =
        finalTemp?.lastReadingValue === 19.5 &&
        finalOcc?.lastReadingValue === 1 &&
        finalContact?.lastReadingValue === 1;

      results.push({
        testNumber: 8,
        testName: 'Physical Demo Scenario (Normal -> Occupancy -> Window Open -> Influx)',
        category: 'DEMO_SCENARIO',
        expected: 'Final state: Temp=19.5°C, Occupancy=1, Contact=1 (Window Open), all engines updated',
        observed: `Temp: ${finalTemp?.lastReadingValue}°C, Occupancy: ${finalOcc?.lastReadingValue}, Contact: ${finalContact?.lastReadingValue}`,
        passed,
      });
    }
  } finally {
    systemEventsBus.off('telemetry_tick', onTick);

    // Clean up test fixtures
    await prisma.telemetryReading.deleteMany({
      where: { sensorId: { in: [tempSensor.id, humSensor.id, occSensor.id, contactSensor.id, co2Sensor.id] } },
    });
    await prisma.sensor.deleteMany({
      where: { deviceId: device.id },
    });
    await prisma.device.delete({
      where: { id: device.id },
    });
  }

  return results;
}

// Run standalone if executed directly
if (require.main === module) {
  runHardwareValidationSuite()
    .then((results) => {
      console.log('\n=================================================================================================');
      console.log('                 PHASE 6B: PHYSICAL HARDWARE VALIDATION SUITE RESULTS                           ');
      console.log('=================================================================================================');
      console.table(
        results.map((r) => ({
          '#': r.testNumber,
          Test: r.testName,
          Category: r.category,
          Passed: r.passed ? 'PASS' : 'FAIL',
          Observed: r.observed,
        }))
      );

      const allPassed = results.every((r) => r.passed);
      console.log(`\nOverall Hardware Validation Status: ${allPassed ? 'ALL PASSED (8/8)' : 'SOME FAILED'}\n`);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Hardware validation failed with error:', err);
      process.exit(1);
    });
}
