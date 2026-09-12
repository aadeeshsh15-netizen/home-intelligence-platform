import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { CrossSensorCorrelationEngine } from '../../src/server/intelligence/correlation/engine';
import { processTelemetryIngest } from '../../src/server/telemetry/pipeline';
import { IncidentStatus } from '@prisma/client';

export interface IncidentBenchmarkMetric {
  scenario: string;
  incidentType: string;
  detected: boolean;
  confidence: number;
  distinctSensors: number;
  latencyMs: number;
  falsePositive: boolean;
  passed: boolean;
}

describe('Cross-Sensor Incident Intelligence Engine - Controlled Benchmark', () => {
  let home: any;
  let kitchen: any;
  let powderRoom: any;
  let livingRoom: any;

  // Sensor maps
  let kitchenSensors: Record<string, any> = {};
  let powderRoomSensors: Record<string, any> = {};
  let livingRoomSensors: Record<string, any> = {};

  const benchmarkMetrics: IncidentBenchmarkMetric[] = [];

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No home found in test database');

    kitchen = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'KITCHEN' },
      include: { sensors: true },
    });
    for (const s of kitchen.sensors) {
      kitchenSensors[s.type] = s;
    }

    powderRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, sensors: { some: { type: 'WATER_FLOW' } } },
      include: { sensors: true },
    });
    for (const s of powderRoom.sensors) {
      powderRoomSensors[s.type] = s;
    }

    livingRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
      include: { sensors: true },
    });
    for (const s of livingRoom.sensors) {
      livingRoomSensors[s.type] = s;
    }

    // Clear existing incidents
    await prisma.incident.deleteMany({
      where: { homeId: home.id },
    });
  });

  afterAll(async () => {
    // Print out benchmark summary table
    console.log('\n========================================================================================');
    console.log('         CROSS-SENSOR INCIDENT INTELLIGENCE ENGINE BENCHMARK REPORT                     ');
    console.log('========================================================================================');
    console.table(benchmarkMetrics);
    console.log('========================================================================================\n');

    // Clean up test incidents
    if (home) {
      await prisma.incident.deleteMany({
        where: { homeId: home.id },
      });
    }
  });

  it('Benchmark 1: Cooking Event multi-sensor correlation (Power + Temp + PM2.5 + Occupancy)', async () => {
    const now = new Date(Date.now() + 5000);

    // Ingest synchronized readings simulating culinary activity in kitchen
    const readings = [
      { sensorId: kitchenSensors['OCCUPANCY'].id, timestamp: now, value: 1, quality: 'VALID' as const },
      { sensorId: kitchenSensors['POWER'].id, timestamp: now, value: 1850, quality: 'VALID' as const },
      { sensorId: kitchenSensors['PM2_5'].id, timestamp: now, value: 48.0, quality: 'VALID' as const },
      { sensorId: kitchenSensors['TEMPERATURE'].id, timestamp: new Date(now.getTime() - 60000), value: 21.0, quality: 'VALID' as const },
      { sensorId: kitchenSensors['TEMPERATURE'].id, timestamp: now, value: 22.2, quality: 'VALID' as const },
    ];

    await processTelemetryIngest({
      producerId: 'benchmark-cooking',
      readings,
    });

    const t0 = performance.now();
    const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(home.id, now);
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const cookingCandidate = candidates.find(
      (c) => c.roomId === kitchen.id && c.incidentType === 'COOKING_EVENT'
    );

    const detected = !!cookingCandidate;
    const confidence = cookingCandidate?.confidence ?? 0;
    const distinctSensors = cookingCandidate?.auditPayload?.distinctSensorCount ?? 0;

    benchmarkMetrics.push({
      scenario: 'Cooking Activity in Kitchen',
      incidentType: 'COOKING_EVENT',
      detected,
      confidence,
      distinctSensors,
      latencyMs,
      falsePositive: false,
      passed: detected && confidence >= 0.70 && latencyMs < 50,
    });

    expect(detected).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0.70);
    expect(distinctSensors).toBeGreaterThanOrEqual(3);
    expect(latencyMs).toBeLessThan(50); // Target: <50ms detection latency
  });

  it('Benchmark 2: Unmonitored Water Leak correlation (Continuous Flow + Humidity + Unoccupied)', async () => {
    const now = new Date(Date.now() + 5000);

    const readings = [
      { sensorId: powderRoomSensors['OCCUPANCY'].id, timestamp: now, value: 0, quality: 'VALID' as const },
      { sensorId: powderRoomSensors['WATER_FLOW'].id, timestamp: now, value: 4.8, quality: 'VALID' as const },
      { sensorId: powderRoomSensors['HUMIDITY'].id, timestamp: now, value: 89.0, quality: 'VALID' as const },
    ];

    await processTelemetryIngest({
      producerId: 'benchmark-water-leak',
      readings,
    });

    const t0 = performance.now();
    const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(home.id, now);
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const leakCandidate = candidates.find(
      (c) => c.roomId === powderRoom.id && c.incidentType === 'WATER_LEAK'
    );

    const detected = !!leakCandidate;
    const confidence = leakCandidate?.confidence ?? 0;
    const distinctSensors = leakCandidate?.auditPayload?.distinctSensorCount ?? 0;

    benchmarkMetrics.push({
      scenario: 'Unattended Water Leak in Powder Room',
      incidentType: 'WATER_LEAK',
      detected,
      confidence,
      distinctSensors,
      latencyMs,
      falsePositive: false,
      passed: detected && confidence >= 0.70 && latencyMs < 50,
    });

    expect(detected).toBe(true);
    expect(leakCandidate?.severity).toBe('CRITICAL');
    expect(confidence).toBeGreaterThanOrEqual(0.75);
    expect(distinctSensors).toBe(3);
    expect(latencyMs).toBeLessThan(50);
  });

  it('Benchmark 3: AC Cooling Failure correlation (Compressor Active + Upward Temp Drift + Occupied)', async () => {
    const now = new Date(Date.now() + 5000);

    const readings = [
      { sensorId: livingRoomSensors['OCCUPANCY'].id, timestamp: now, value: 1, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['POWER'].id, timestamp: now, value: 1250, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['TEMPERATURE'].id, timestamp: new Date(now.getTime() - 120000), value: 22.0, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['TEMPERATURE'].id, timestamp: now, value: 23.4, quality: 'VALID' as const }, // +0.7 °C/min
    ];

    await processTelemetryIngest({
      producerId: 'benchmark-ac-failure',
      readings,
    });

    const t0 = performance.now();
    const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(home.id, now);
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const acCandidate = candidates.find(
      (c) => c.roomId === livingRoom.id && c.incidentType === 'AC_FAILURE'
    );

    const detected = !!acCandidate;
    const confidence = acCandidate?.confidence ?? 0;
    const distinctSensors = acCandidate?.auditPayload?.distinctSensorCount ?? 0;

    benchmarkMetrics.push({
      scenario: 'HVAC Cooling Failure in Living Room',
      incidentType: 'AC_FAILURE',
      detected,
      confidence,
      distinctSensors,
      latencyMs,
      falsePositive: false,
      passed: detected && confidence >= 0.75 && latencyMs < 50,
    });

    expect(detected).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0.75);
    expect(distinctSensors).toBe(3);
    expect(latencyMs).toBeLessThan(50);
  });

  it('Benchmark 4: Window Thermal Breach correlation (Contact Open + Steep Drop + HVAC Counter-action)', async () => {
    const now = new Date(Date.now() + 5000);

    const readings = [
      { sensorId: livingRoomSensors['CONTACT'].id, timestamp: now, value: 1, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['POWER'].id, timestamp: now, value: 750, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['TEMPERATURE'].id, timestamp: new Date(now.getTime() - 60000), value: 21.5, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['TEMPERATURE'].id, timestamp: now, value: 20.2, quality: 'VALID' as const }, // -1.3 °C/min
    ];

    await processTelemetryIngest({
      producerId: 'benchmark-window-breach',
      readings,
    });

    const t0 = performance.now();
    const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(home.id, now);
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const windowCandidate = candidates.find(
      (c) => c.roomId === livingRoom.id && c.incidentType === 'WINDOW_THERMAL_EVENT'
    );

    const detected = !!windowCandidate;
    const confidence = windowCandidate?.confidence ?? 0;
    const distinctSensors = windowCandidate?.auditPayload?.distinctSensorCount ?? 0;

    benchmarkMetrics.push({
      scenario: 'Window Thermal Breach in Living Room',
      incidentType: 'WINDOW_THERMAL_EVENT',
      detected,
      confidence,
      distinctSensors,
      latencyMs,
      falsePositive: false,
      passed: detected && confidence >= 0.70 && latencyMs < 50,
    });

    expect(detected).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0.70);
    expect(distinctSensors).toBe(3);
    expect(latencyMs).toBeLessThan(50);
  });

  it('Benchmark 5: Baseline Control Scenario - Clean telemetry exhibits 0% false positive incidents', async () => {
    const now = new Date(Date.now() + 5000);

    // Reset sensors to nominal peaceful baseline conditions
    const readings = [
      { sensorId: kitchenSensors['OCCUPANCY'].id, timestamp: now, value: 0, quality: 'VALID' as const },
      { sensorId: kitchenSensors['POWER'].id, timestamp: now, value: 45, quality: 'VALID' as const },
      { sensorId: kitchenSensors['PM2_5'].id, timestamp: now, value: 6.2, quality: 'VALID' as const },
      { sensorId: kitchenSensors['TEMPERATURE'].id, timestamp: now, value: 21.0, quality: 'VALID' as const },
      { sensorId: powderRoomSensors['OCCUPANCY'].id, timestamp: now, value: 0, quality: 'VALID' as const },
      { sensorId: powderRoomSensors['WATER_FLOW'].id, timestamp: now, value: 0.0, quality: 'VALID' as const },
      { sensorId: powderRoomSensors['HUMIDITY'].id, timestamp: now, value: 45.0, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['CONTACT'].id, timestamp: now, value: 0, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['POWER'].id, timestamp: now, value: 120, quality: 'VALID' as const },
      { sensorId: livingRoomSensors['TEMPERATURE'].id, timestamp: now, value: 21.2, quality: 'VALID' as const },
    ];

    await processTelemetryIngest({
      producerId: 'benchmark-clean-baseline',
      readings,
    });

    const t0 = performance.now();
    const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(home.id, now);
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const falsePositives = candidates.length;

    benchmarkMetrics.push({
      scenario: 'Clean Baseline Household Operations',
      incidentType: 'NONE (NORMAL)',
      detected: falsePositives === 0,
      confidence: 0,
      distinctSensors: 0,
      latencyMs,
      falsePositive: falsePositives > 0,
      passed: falsePositives === 0 && latencyMs < 50,
    });

    // Rigorous zero false-positive requirement
    expect(falsePositives).toBe(0);
    expect(latencyMs).toBeLessThan(50);
  });
});
