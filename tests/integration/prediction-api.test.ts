import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { predictionEngine } from '../../src/server/intelligence/prediction/engine';
import { QueryPredictionSchema, EvaluateModelSchema } from '../../src/domain/prediction.schema';

describe('Prediction Intelligence Engine Integration', () => {
  let home: any;
  let livingRoom: any;
  let bedroom: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No home found in test database');

    livingRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
    });

    bedroom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'BEDROOM' },
    });
  });

  it('validates QueryPredictionSchema and EvaluateModelSchema parameters strictly', () => {
    // Valid queries
    const valid1 = QueryPredictionSchema.safeParse({
      target: 'HOUSEHOLD_POWER',
      horizon: '24h',
      stepMinutes: 15,
    });
    expect(valid1.success).toBe(true);

    const valid2 = QueryPredictionSchema.safeParse({
      target: 'ROOM_TEMPERATURE',
      roomId: livingRoom.id,
      modelType: 'STATISTICAL_SEASONAL_DECAY',
    });
    expect(valid2.success).toBe(true);

    // Invalid target
    const invalidTarget = QueryPredictionSchema.safeParse({
      target: 'UNKNOWN_TARGET',
    });
    expect(invalidTarget.success).toBe(false);

    // Invalid horizon
    const invalidHorizon = QueryPredictionSchema.safeParse({
      target: 'ROOM_CO2',
      horizon: '99d',
    });
    expect(invalidHorizon.success).toBe(false);

    // Valid evaluation schema
    const evalValid = EvaluateModelSchema.safeParse({
      target: 'ROOM_TEMPERATURE',
      days: 7,
      roomId: livingRoom.id,
    });
    expect(evalValid.success).toBe(true);
  });

  it('seeds default prediction models in the database', async () => {
    await predictionEngine.ensureModelsSeeded();

    const models = await predictionEngine.listModels();
    expect(models.length).toBeGreaterThanOrEqual(4);

    const types = models.map((m) => m.type);
    expect(types).toContain('STATISTICAL_SEASONAL_DECAY');
    expect(types).toContain('BAYESIAN_OCCUPANCY');
    expect(types).toContain('STATISTICAL_PERSISTENCE');
  });

  it('generates multi-horizon forecast for HOUSEHOLD_POWER', async () => {
    const forecast = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'HOUSEHOLD_POWER',
      horizon: '24h',
      stepMinutes: 30,
    });

    expect(forecast).toBeDefined();
    expect(forecast.target).toBe('HOUSEHOLD_POWER');
    expect(forecast.unit).toBe('W');
    expect(forecast.currentObserved).toBeDefined();
    expect(forecast.model).toBeDefined();
    expect(forecast.dataQuality).toBeDefined();
    expect(forecast.forecast.length).toBe(48); // 24 hours * 2 points/hr

    const firstPt = forecast.forecast[0];
    expect(firstPt.horizonMinutes).toBe(30);
    expect(firstPt.predicted).toBeGreaterThanOrEqual(0);
    expect(firstPt.confidenceInterval80.lower).toBeLessThanOrEqual(firstPt.predicted);
    expect(firstPt.confidenceInterval80.upper).toBeGreaterThanOrEqual(firstPt.predicted);
  });

  it('generates room micro-climate forecast for ROOM_TEMPERATURE', async () => {
    const forecast = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'ROOM_TEMPERATURE',
      roomId: livingRoom.id,
      horizon: '4h',
      stepMinutes: 15,
    });

    expect(forecast.target).toBe('ROOM_TEMPERATURE');
    expect(forecast.roomId).toBe(livingRoom.id);
    expect(forecast.forecast.length).toBe(16); // 4 hours * 4 points/hr

    for (const pt of forecast.forecast) {
      expect(pt.predicted).toBeGreaterThan(10);
      expect(pt.predicted).toBeLessThan(35);
      expect(pt.standardError).toBeGreaterThan(0);
    }
  });

  it('generates room CO2 forecast for ROOM_CO2', async () => {
    const forecast = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'ROOM_CO2',
      roomId: bedroom ? bedroom.id : livingRoom.id,
      horizon: '1h',
      stepMinutes: 15,
    });

    expect(forecast.target).toBe('ROOM_CO2');
    expect(forecast.unit).toBe('ppm');
    expect(forecast.forecast.length).toBe(4); // 1h / 15m

    for (const pt of forecast.forecast) {
      expect(pt.predicted).toBeGreaterThanOrEqual(380); // Respects atmospheric floor
    }
  });

  it('generates probabilistic occupancy forecast for OCCUPANCY_PROBABILITY', async () => {
    const forecast = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'OCCUPANCY_PROBABILITY',
      roomId: livingRoom.id,
      horizon: '4h',
      stepMinutes: 15,
    });

    expect(forecast.target).toBe('OCCUPANCY_PROBABILITY');
    expect(forecast.model.type).toBe('BAYESIAN_OCCUPANCY');

    for (const pt of forecast.forecast) {
      expect(pt.predicted).toBeGreaterThanOrEqual(0.0);
      expect(pt.predicted).toBeLessThanOrEqual(1.0);
      expect(pt.confidenceInterval80.lower).toBeGreaterThanOrEqual(0.0);
      expect(pt.confidenceInterval80.upper).toBeLessThanOrEqual(1.0);
    }
  });

  it('caches forecasts in-memory within 30-second TTL to prevent database strain', async () => {
    const t0 = performance.now();
    const firstCall = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'ROOM_TEMPERATURE',
      roomId: livingRoom.id,
      horizon: '1h',
    });
    const firstLatency = performance.now() - t0;

    const t1 = performance.now();
    const secondCall = await predictionEngine.getForecast({
      homeId: home.id,
      target: 'ROOM_TEMPERATURE',
      roomId: livingRoom.id,
      horizon: '1h',
    });
    const secondLatency = performance.now() - t1;

    // Second call should come from cache and be almost instant
    expect(secondCall.generatedAt).toBe(firstCall.generatedAt);
    expect(secondLatency).toBeLessThan(10);
  });
});
