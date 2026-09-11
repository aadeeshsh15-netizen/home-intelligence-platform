import { describe, it, expect } from 'vitest';
import {
  computeCyclicalFeatures,
  mapTargetToSensorType,
} from '../../src/server/intelligence/prediction/features';
import { clampValue } from '../../src/server/intelligence/prediction/providers/persistence';
import { SensorType } from '@prisma/client';

describe('Prediction Feature Engineering & Cyclical Encodings', () => {
  it('computes trigonometric cyclical encodings accurately at key day times', () => {
    // Midnight UTC (00:00) -> sin(0) = 0, cos(0) = 1
    const midnight = new Date('2026-03-15T00:00:00Z');
    const fMid = computeCyclicalFeatures(midnight);
    expect(fMid.hourSin).toBeCloseTo(0, 2);
    expect(fMid.hourCos).toBeCloseTo(1, 2);

    // Midday UTC (12:00) -> sin(pi) = 0, cos(pi) = -1
    const midday = new Date('2026-03-15T12:00:00Z');
    const fNoon = computeCyclicalFeatures(midday);
    expect(fNoon.hourSin).toBeCloseTo(0, 2);
    expect(fNoon.hourCos).toBeCloseTo(-1, 2);

    // 06:00 UTC -> sin(pi/2) = 1, cos(pi/2) = 0
    const morning = new Date('2026-03-15T06:00:00Z');
    const fMorn = computeCyclicalFeatures(morning);
    expect(fMorn.hourSin).toBeCloseTo(1, 2);
    expect(fMorn.hourCos).toBeCloseTo(0, 2);

    // 18:00 UTC -> sin(3pi/2) = -1, cos(3pi/2) = 0
    const evening = new Date('2026-03-15T18:00:00Z');
    const fEve = computeCyclicalFeatures(evening);
    expect(fEve.hourSin).toBeCloseTo(-1, 2);
    expect(fEve.hourCos).toBeCloseTo(0, 2);
  });

  it('preserves unit circle property: sin^2 + cos^2 = 1', () => {
    const testTimes = [
      new Date('2026-05-10T03:15:00Z'),
      new Date('2026-08-22T14:47:30Z'),
      new Date('2026-11-03T23:59:00Z'),
    ];

    for (const time of testTimes) {
      const feat = computeCyclicalFeatures(time);
      const hourNorm = Math.pow(feat.hourSin, 2) + Math.pow(feat.hourCos, 2);
      const dowNorm = Math.pow(feat.dayOfWeekSin, 2) + Math.pow(feat.dayOfWeekCos, 2);

      expect(hourNorm).toBeCloseTo(1.0, 3);
      expect(dowNorm).toBeCloseTo(1.0, 3);
    }
  });

  it('accurately identifies weekends and day of week', () => {
    // 2026-03-15 is Sunday (day 0) -> weekend
    const sunday = new Date('2026-03-15T12:00:00Z');
    const fSun = computeCyclicalFeatures(sunday);
    expect(fSun.dayOfWeek).toBe(0);
    expect(fSun.isWeekend).toBe(true);

    // 2026-03-16 is Monday (day 1) -> not weekend
    const monday = new Date('2026-03-16T12:00:00Z');
    const fMon = computeCyclicalFeatures(monday);
    expect(fMon.dayOfWeek).toBe(1);
    expect(fMon.isWeekend).toBe(false);

    // 2026-03-21 is Saturday (day 6) -> weekend
    const saturday = new Date('2026-03-21T12:00:00Z');
    const fSat = computeCyclicalFeatures(saturday);
    expect(fSat.dayOfWeek).toBe(6);
    expect(fSat.isWeekend).toBe(true);
  });

  it('maps prediction targets to canonical SensorTypes', () => {
    expect(mapTargetToSensorType('HOUSEHOLD_POWER')).toBe(SensorType.POWER);
    expect(mapTargetToSensorType('ROOM_TEMPERATURE')).toBe(SensorType.TEMPERATURE);
    expect(mapTargetToSensorType('ROOM_CO2')).toBe(SensorType.CO2);
    expect(mapTargetToSensorType('OCCUPANCY_PROBABILITY')).toBe(SensorType.OCCUPANCY);
  });

  it('enforces physical bounds per target via clampValue', () => {
    // Active power cannot be negative
    expect(clampValue('HOUSEHOLD_POWER', -50)).toBe(0);
    expect(clampValue('HOUSEHOLD_POWER', 1250)).toBe(1250);

    // Indoor temperature bounded realistically
    expect(clampValue('ROOM_TEMPERATURE', -10)).toBe(5);
    expect(clampValue('ROOM_TEMPERATURE', 65)).toBe(50);
    expect(clampValue('ROOM_TEMPERATURE', 22.5)).toBe(22.5);

    // CO2 bounded to outdoor floor of 380 ppm
    expect(clampValue('ROOM_CO2', 150)).toBe(380);
    expect(clampValue('ROOM_CO2', 850)).toBe(850);

    // Occupancy probability strictly in [0.0, 1.0]
    expect(clampValue('OCCUPANCY_PROBABILITY', -0.2)).toBe(0.0);
    expect(clampValue('OCCUPANCY_PROBABILITY', 1.4)).toBe(1.0);
    expect(clampValue('OCCUPANCY_PROBABILITY', 0.65)).toBe(0.65);
  });
});
