import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { processTelemetryIngest } from '../../src/server/telemetry/pipeline';
import { validatePhysicalBounds, validateSensorUnit } from '../../src/domain/telemetry.schema';
import { calculateZScore } from '../../src/lib/statistics';
import { evaluateDeviceAndSensorConnectivity } from '../../src/server/event-engine/rules';
import { SensorHealth, DeviceStatus } from '@prisma/client';

describe('Data Integrity & Pipeline Edge Cases', () => {
  let testSensor: any;

  beforeAll(async () => {
    testSensor = await prisma.sensor.findFirst({
      where: { type: 'TEMPERATURE' },
      include: { room: true },
    });
  });

  it('rejects physically impossible PM2.5 particulate values', () => {
    expect(validatePhysicalBounds('PM2_5', -10).valid).toBe(false);
    expect(validatePhysicalBounds('PM2_5', 1200).valid).toBe(false);
    expect(validatePhysicalBounds('PM2_5', 15.5).valid).toBe(true);
  });

  it('rejects invalid or mismatched sensor units', () => {
    expect(validateSensorUnit('TEMPERATURE', '°C').valid).toBe(true);
    expect(validateSensorUnit('TEMPERATURE', 'kg').valid).toBe(false);
    expect(validateSensorUnit('HUMIDITY', '%').valid).toBe(true);
    expect(validateSensorUnit('HUMIDITY', 'ppm').valid).toBe(false);
    expect(validateSensorUnit('CO2', 'ppm').valid).toBe(true);
    expect(validateSensorUnit('POWER', 'W').valid).toBe(true);
  });

  it('handles zero-variance baseline situations predictably without masking anomalies', () => {
    // Zero variance: all past readings were exactly 21.0
    const baselineMean = 21.0;
    const baselineStdDev = 0.0;

    // Normal observation identical to baseline
    expect(calculateZScore(21.0, baselineMean, baselineStdDev)).toBe(0);

    // Sudden deviation (+10°C) with zero-variance baseline
    const zScore = calculateZScore(31.0, baselineMean, baselineStdDev);
    // Must NOT be 0 (previously masked)!
    expect(zScore).toBeGreaterThan(0);
    expect(zScore).toBe(100); // (31 - 21) / 0.1 = 100
  });

  it('prevents out-of-order historical readings from overwriting live sensor state', async () => {
    if (!testSensor) return;

    const latestTime = testSensor.lastReadingTime ? new Date(testSensor.lastReadingTime).getTime() : Date.now();
    const futureTime = new Date(latestTime + 3600 * 1000);
    const pastTime = new Date(latestTime - 3600 * 1000);

    // 1. Ingest newer reading
    await processTelemetryIngest({
      producerId: 'test-integrity-producer',
      readings: [
        {
          sensorId: testSensor.id,
          timestamp: futureTime.toISOString(),
          value: 23.5,
          quality: 'VALID',
        },
      ],
    });

    let current = await prisma.sensor.findUnique({ where: { id: testSensor.id } });
    expect(current?.lastReadingValue).toBe(23.5);
    expect(new Date(current!.lastReadingTime!).getTime()).toBe(futureTime.getTime());

    // 2. Ingest older historical reading (out of order by 2 hours)
    await processTelemetryIngest({
      producerId: 'test-integrity-producer',
      readings: [
        {
          sensorId: testSensor.id,
          timestamp: pastTime.toISOString(),
          value: 18.2,
          quality: 'VALID',
        },
      ],
    });

    // 3. Verify sensor live state was NOT regressed
    current = await prisma.sensor.findUnique({ where: { id: testSensor.id } });
    expect(current?.lastReadingValue).toBe(23.5); // Still the newer reading
    expect(new Date(current!.lastReadingTime!).getTime()).toBe(futureTime.getTime());
  });

  it('gracefully suppresses duplicate telemetry records without database crash', async () => {
    if (!testSensor) return;

    const fixedTimestamp = new Date('2026-09-10T09:15:30Z');

    // Ingest first time
    const res1 = await processTelemetryIngest({
      producerId: 'test-producer',
      readings: [
        {
          sensorId: testSensor.id,
          timestamp: fixedTimestamp.toISOString(),
          value: 21.8,
          quality: 'VALID',
        },
      ],
    });

    // Ingest second time with exact same timestamp (simulating network retry)
    const res2 = await processTelemetryIngest({
      producerId: 'test-producer',
      readings: [
        {
          sensorId: testSensor.id,
          timestamp: fixedTimestamp.toISOString(),
          value: 21.8,
          quality: 'VALID',
        },
      ],
    });

    expect(res2.duplicateCount).toBe(1);
    expect(res2.errors.length).toBe(0);
  });

  it('marks inactive sensors as stale when connectivity timeout threshold is exceeded', async () => {
    // Create an artificial past sensor
    const pastTime = new Date(Date.now() - 300 * 1000); // 300s ago (stale > 120s)
    const staleSensor = await prisma.sensor.findFirst({
      where: { type: 'NOISE' },
    });

    if (!staleSensor) return;

    await prisma.sensor.update({
      where: { id: staleSensor.id },
      data: {
        lastReadingTime: pastTime,
        health: SensorHealth.HEALTHY,
      },
    });

    // Run connectivity evaluator with 120s threshold
    await evaluateDeviceAndSensorConnectivity(120);

    const updated = await prisma.sensor.findUnique({ where: { id: staleSensor.id } });
    expect(updated?.health).toBe(SensorHealth.STALE);
  });
});
