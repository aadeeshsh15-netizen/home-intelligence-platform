import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { evaluateTelemetryAnomaly, evaluateCO2VentilationAnomaly } from '../../src/server/intelligence/anomaly';
import { processTelemetryIngest } from '../../src/server/telemetry/pipeline';
import { evaluateDeviceAndSensorConnectivity } from '../../src/server/event-engine/rules';
import { SensorHealth } from '@prisma/client';

export interface ScenarioEvaluation {
  scenario: string;
  expected: string;
  detected: boolean;
  latencyMs: number;
  falsePositive: boolean;
  falseNegative: boolean;
  explanation?: string;
}

describe('Intelligence Layer Controlled Evaluation Scenarios', () => {
  let livingRoomTempSensor: any;
  let livingRoomPowerSensor: any;
  let bedroomCO2Sensor: any;
  let officeNoiseSensor: any;

  const evaluationResults: ScenarioEvaluation[] = [];

  beforeAll(async () => {
    livingRoomTempSensor = await prisma.sensor.findFirst({
      where: { type: 'TEMPERATURE', room: { name: 'Living Room' } },
      include: { room: true },
    });
    livingRoomPowerSensor = await prisma.sensor.findFirst({
      where: { type: 'POWER', room: { name: 'Living Room' } },
      include: { room: true },
    });
    bedroomCO2Sensor = await prisma.sensor.findFirst({
      where: { type: 'CO2', room: { name: 'Primary Bedroom' } },
      include: { room: true },
    });
    officeNoiseSensor = await prisma.sensor.findFirst({
      where: { type: 'NOISE', room: { name: 'Living Room' } },
      include: { room: true },
    });
  });

  it('Scenario 1: Normal household activity does not trigger false positive anomalies', async () => {
    const t0 = performance.now();
    // Normal temperature for afternoon (~21.5°C, close to baseline)
    const result = await evaluateTelemetryAnomaly(livingRoomTempSensor.id, 21.2, new Date());
    const latency = performance.now() - t0;

    const detected = result !== null && result.isAnomaly;
    evaluationResults.push({
      scenario: 'Normal Household Activity',
      expected: 'No Anomaly (within baseline)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: detected,
      falseNegative: false,
    });

    expect(detected).toBe(false);
  });

  it('Scenario 2: Sustained temperature increase is detected with statistical proof', async () => {
    const t0 = performance.now();
    // Sustained extreme temperature (33.5°C vs baseline ~21.5°C)
    const result = await evaluateTelemetryAnomaly(livingRoomTempSensor.id, 33.5, new Date());
    const latency = performance.now() - t0;

    const detected = result !== null && result.isAnomaly;
    evaluationResults.push({
      scenario: 'Sustained Temperature Increase',
      expected: 'Detected (Z >= 2.50)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: result?.explanation,
    });

    expect(detected).toBe(true);
    expect(result?.zScore).toBeGreaterThan(2.5);
    expect(result?.explanation).toContain('Historical baseline for');
  });

  it('Scenario 3: Unusual energy consumption / power surge is detected with high confidence', async () => {
    const t0 = performance.now();
    // Sudden power draw of 3,850 W vs evening baseline (~360 W)
    const result = await evaluateTelemetryAnomaly(livingRoomPowerSensor.id, 3850, new Date());
    const latency = performance.now() - t0;

    const detected = result !== null && result.isAnomaly;
    evaluationResults.push({
      scenario: 'Unusual Energy Surge (+3.8 kW)',
      expected: 'Detected with High Confidence (Z >= 4.0)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: result?.explanation,
    });

    expect(detected).toBe(true);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.90);
    expect(result?.severity).toBe('CRITICAL');
  });

  it('Scenario 4: Sudden CO2 accumulation triggers ventilation drift detection', async () => {
    const t0 = performance.now();
    const now = Date.now();

    // Ingest progressive accumulation over 30 mins
    const readings = [
      { timestamp: new Date(now - 25 * 60 * 1000).toISOString(), value: 450 },
      { timestamp: new Date(now - 20 * 60 * 1000).toISOString(), value: 550 },
      { timestamp: new Date(now - 15 * 60 * 1000).toISOString(), value: 680 },
      { timestamp: new Date(now - 10 * 60 * 1000).toISOString(), value: 850 },
      { timestamp: new Date(now - 5 * 60 * 1000).toISOString(), value: 1020 },
      { timestamp: new Date(now).toISOString(), value: 1210 },
    ];

    await processTelemetryIngest({
      producerId: 'evaluation-producer',
      readings: readings.map((r) => ({
        sensorId: bedroomCO2Sensor.id,
        timestamp: r.timestamp,
        value: r.value,
        quality: 'VALID' as const,
      })),
    });

    const drift = await evaluateCO2VentilationAnomaly(bedroomCO2Sensor.roomId);
    const latency = performance.now() - t0;

    const detected = drift !== null && drift.detected;
    evaluationResults.push({
      scenario: 'Sudden CO2 Accumulation / Ventilation Deficit',
      expected: 'Detected (Drift rate > 12 ppm/min)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: drift?.explanation,
    });

    expect(detected).toBe(true);
    expect(drift?.slopePpmPerMin).toBeGreaterThan(12);
  });

  it('Scenario 5: Window-open thermal shock triggers rapid temperature deviation', async () => {
    const t0 = performance.now();
    // Winter window open causing steep plunge to 11.5°C
    const result = await evaluateTelemetryAnomaly(livingRoomTempSensor.id, 11.5, new Date());
    const latency = performance.now() - t0;

    const detected = result !== null && result.isAnomaly;
    evaluationResults.push({
      scenario: 'Window-Open Thermal Shock (Plunge)',
      expected: 'Detected (Negative Z-Score <= -2.50)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: result?.explanation,
    });

    expect(detected).toBe(true);
    expect(result?.zScore).toBeLessThan(-2.5);
  });

  it('Scenario 6: AC failure causes progressive upward temperature departure', async () => {
    const t0 = performance.now();
    const result = await evaluateTelemetryAnomaly(livingRoomTempSensor.id, 30.5, new Date());
    const latency = performance.now() - t0;

    const detected = result !== null && result.isAnomaly;
    evaluationResults.push({
      scenario: 'AC Failure Overheating Departure',
      expected: 'Detected',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: result?.explanation,
    });

    expect(detected).toBe(true);
  });

  it('Scenario 7: Sensor outage / heartbeat failure transitions sensor to STALE', async () => {
    const t0 = performance.now();
    const staleTime = new Date(Date.now() - 600 * 1000); // 10 minutes ago

    await prisma.sensor.update({
      where: { id: officeNoiseSensor.id },
      data: { lastReadingTime: staleTime, health: SensorHealth.HEALTHY },
    });

    await evaluateDeviceAndSensorConnectivity(120);

    const checked = await prisma.sensor.findUnique({ where: { id: officeNoiseSensor.id } });
    const latency = performance.now() - t0;

    const detected = checked?.health === SensorHealth.STALE;
    evaluationResults.push({
      scenario: 'Sensor Outage / Heartbeat Failure',
      expected: 'Health marked as STALE (> 120s timeout)',
      detected,
      latencyMs: Number(latency.toFixed(2)),
      falsePositive: false,
      falseNegative: !detected,
      explanation: 'Sensor health transitioned from HEALTHY to STALE after 600s inactivity.',
    });

    expect(detected).toBe(true);
  });
});
