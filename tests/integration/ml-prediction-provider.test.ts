import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { predictionEngine } from '../../src/server/intelligence/prediction/engine';
import { GradientBoostingProvider } from '../../src/server/intelligence/prediction/providers/gradient-boosting';
import { RandomForestProvider } from '../../src/server/intelligence/prediction/providers/random-forest';

describe('Phase 4 ML Prediction Providers & Engine Integration', () => {
  let homeId: string;

  beforeAll(async () => {
    const home = await prisma.home.findFirst();
    if (!home) throw new Error('No home found. Seed database first.');
    homeId = home.id;
    await predictionEngine.ensureModelsSeeded();
  });

  it('1. Verifies GradientBoostingProvider contract and target support', () => {
    const provider = new GradientBoostingProvider();

    expect(provider.id).toBe('model-gradient-boosting-v1');
    expect(provider.type).toBe('ML_GRADIENT_BOOSTING');
    expect(provider.version).toBe('1.0.0');

    expect(provider.supports('HOUSEHOLD_POWER')).toBe(true);
    expect(provider.supports('ROOM_TEMPERATURE')).toBe(false);
    expect(provider.supports('ROOM_CO2')).toBe(false);
    expect(provider.supports('OCCUPANCY_PROBABILITY')).toBe(false);
  });

  it('2. Verifies RandomForestProvider contract and target support', () => {
    const provider = new RandomForestProvider();

    expect(provider.id).toBe('model-random-forest-v1');
    expect(provider.type).toBe('ML_RANDOM_FOREST');
    expect(provider.version).toBe('1.0.0');

    expect(provider.supports('HOUSEHOLD_POWER')).toBe(true);
    expect(provider.supports('ROOM_TEMPERATURE')).toBe(false);
  });

  it('3. Successfully resolves registered ML providers in PredictionEngine', () => {
    const gbdt = predictionEngine.getProvider('ML_GRADIENT_BOOSTING');
    const rf = predictionEngine.getProvider('ML_RANDOM_FOREST');

    expect(gbdt).toBeDefined();
    expect(gbdt?.type).toBe('ML_GRADIENT_BOOSTING');

    expect(rf).toBeDefined();
    expect(rf?.type).toBe('ML_RANDOM_FOREST');
  });

  it('4. Generates multi-horizon forecast via GBDT provider on live telemetry', async () => {
    const response = await predictionEngine.getForecast({
      homeId,
      target: 'HOUSEHOLD_POWER',
      modelType: 'ML_GRADIENT_BOOSTING',
      horizon: '4h',
      stepMinutes: 15,
    });

    expect(response.target).toBe('HOUSEHOLD_POWER');
    expect(response.model.type).toBe('ML_GRADIENT_BOOSTING');
    expect(response.forecast.length).toBeGreaterThan(0);

    for (const point of response.forecast) {
      expect(point.predicted).toBeGreaterThanOrEqual(0);
      expect(point.confidenceInterval80.lower).toBeLessThanOrEqual(point.predicted);
      expect(point.confidenceInterval80.upper).toBeGreaterThanOrEqual(point.predicted);
      expect(point.confidenceInterval95.lower).toBeLessThanOrEqual(point.confidenceInterval80.lower);
      expect(point.confidenceInterval95.upper).toBeGreaterThanOrEqual(point.confidenceInterval80.upper);
      expect(point.standardError).toBeGreaterThan(0);
    }
  });

  it('5. Gracefully executes circuit-breaker fallback when model weights are missing', async () => {
    // Instantiate provider with non-existent path
    const fallbackProvider = new GradientBoostingProvider('/invalid/path/missing_model.json');

    const response = await fallbackProvider.predict(
      {
        homeId,
        target: 'HOUSEHOLD_POWER',
        horizonMinutes: [15, 60],
      },
      {
        timestamp: new Date(),
        target: 'HOUSEHOLD_POWER',
        currentValue: 1200,
        cyclical: {
          hourSin: 0,
          hourCos: 1,
          dayOfWeekSin: 0,
          dayOfWeekCos: 1,
          isWeekend: false,
          hourOfDay: 12,
          dayOfWeek: 2,
        },
        lags: { lag15m: 1190, lag1h: 1150 },
        rolling: { mean15m: 1195, mean1h: 1170, std1h: 20, slopePerMinute: 0 },
        context: {},
        dataQuality: {
          status: 'HEALTHY',
          historicalHours: 720,
          missingDataPercent: 0,
          validSamplesCount: 1400,
        },
      }
    );

    // Fallback should seamlessly return valid predictions (via Seasonal Decay)
    expect(response).toHaveLength(2);
    expect(response[0].predicted).toBeGreaterThan(0);
    expect(response[1].predicted).toBeGreaterThan(0);
  });
});
