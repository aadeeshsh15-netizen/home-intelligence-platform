import { describe, it, expect } from 'vitest';
import { PersistenceProvider } from '../../src/server/intelligence/prediction/providers/persistence';
import { EmaProvider } from '../../src/server/intelligence/prediction/providers/ema';
import { SeasonalDecayProvider } from '../../src/server/intelligence/prediction/providers/seasonal-decay';
import { BayesianOccupancyProvider } from '../../src/server/intelligence/prediction/providers/occupancy-prior';
import { RemoteMlAdapterProvider } from '../../src/server/intelligence/prediction/providers/remote-adapter';
import {
  PredictionFeatureVector,
  PredictionRequest,
  BaselineMatrix,
} from '../../src/server/intelligence/prediction/types';
import { computeCyclicalFeatures } from '../../src/server/intelligence/prediction/features';

describe('Prediction Baselines Mathematical Verification', () => {
  const baseTime = new Date('2026-06-15T14:00:00Z'); // Monday 14:00

  const mockFeatureVector: PredictionFeatureVector = {
    timestamp: baseTime,
    target: 'ROOM_TEMPERATURE',
    currentValue: 24.5,
    cyclical: computeCyclicalFeatures(baseTime),
    lags: {
      lag15m: 24.3,
      lag30m: 24.1,
      lag1h: 23.8,
      lag4h: 22.0,
      lag24h: 24.0,
      lag168h: 24.2,
    },
    rolling: {
      mean15m: 24.4,
      mean1h: 24.0,
      std1h: 0.35,
      slopePerMinute: 0.015, // Rising by ~0.9°C/hour
      min1h: 23.5,
      max1h: 24.5,
    },
    context: {
      outdoorTemperature: 28.0,
      roomCo2: 550,
      occupancyState: true,
    },
    dataQuality: {
      status: 'HEALTHY',
      historicalHours: 168,
      missingDataPercent: 0,
      validSamplesCount: 2000,
    },
  };

  const mockBaselineMatrix: BaselineMatrix = new Map();
  // Set baselines across all 7 days and 24 hours
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      mockBaselineMatrix.set(`${d}_${h}`, {
        dayOfWeek: d,
        hourOfDay: h,
        mean: 22.0 + Math.sin(((h - 8) / 24) * 2 * Math.PI) * 2, // Peak ~24°C in afternoon, min ~20°C
        stdDev: 0.8,
        sampleCount: 50,
      });
    }
  }

  it('PersistenceProvider predicts constant value with expanding sqrt(h) uncertainty', async () => {
    const provider = new PersistenceProvider();
    const req: PredictionRequest = {
      homeId: 'test-home',
      target: 'ROOM_TEMPERATURE',
      horizonMinutes: [15, 60, 240, 1440],
    };

    const forecast = await provider.predict(req, mockFeatureVector, mockBaselineMatrix);

    expect(forecast.length).toBe(4);
    // Predicted value remains equal to observed currentValue
    for (const pt of forecast) {
      expect(pt.predicted).toBe(24.5);
      expect(pt.confidenceInterval80.lower).toBeLessThan(pt.predicted);
      expect(pt.confidenceInterval80.upper).toBeGreaterThan(pt.predicted);
    }

    // Standard error must monotonically expand across horizons
    expect(forecast[0].standardError).toBeLessThan(forecast[1].standardError);
    expect(forecast[1].standardError).toBeLessThan(forecast[2].standardError);
    expect(forecast[2].standardError).toBeLessThan(forecast[3].standardError);
  });

  it('EmaProvider damps momentum extrapolation over time', async () => {
    const provider = new EmaProvider();
    const req: PredictionRequest = {
      homeId: 'test-home',
      target: 'ROOM_TEMPERATURE',
      horizonMinutes: [15, 60, 240],
    };

    const forecast = await provider.predict(req, mockFeatureVector, mockBaselineMatrix);

    // Initial positive slope raises 15m forecast
    expect(forecast[0].predicted).toBeGreaterThan(mockFeatureVector.rolling.mean15m!);

    // Over longer horizons (240m), momentum must be damped rather than diverging to infinity
    const delta15to60 = forecast[1].predicted - forecast[0].predicted;
    const delta60to240 = forecast[2].predicted - forecast[1].predicted;
    expect(delta60to240).toBeLessThan(delta15to60 * 4); // Damping prevents runaway linear drift
  });

  it('SeasonalDecayProvider anchors on real-time deviation at short horizons and relaxes to diurnal baseline at long horizons', async () => {
    const provider = new SeasonalDecayProvider();
    const req: PredictionRequest = {
      homeId: 'test-home',
      target: 'ROOM_TEMPERATURE',
      horizonMinutes: [15, 60, 360, 1440], // 15m, 1h, 6h, 24h
    };

    const forecast = await provider.predict(req, mockFeatureVector, mockBaselineMatrix);

    const baseline14 = mockBaselineMatrix.get('1_14')!.mean;
    const baseline20 = mockBaselineMatrix.get('1_20')!.mean;

    // At 15m, prediction is very close to currentValue (residual is largely preserved)
    expect(Math.abs(forecast[0].predicted - mockFeatureVector.currentValue)).toBeLessThan(0.3);

    // At 360m (6 hours = 20:00), residual has largely decayed; prediction approaches baseline20
    expect(Math.abs(forecast[2].predicted - baseline20)).toBeLessThan(0.5);

    // Uncertainty interval blends from recentStd toward baseline stdDev
    expect(forecast[0].standardError).toBeGreaterThanOrEqual(0.3);
    expect(forecast[3].standardError).toBeGreaterThanOrEqual(0.7);
  });

  it('BayesianOccupancyProvider predicts valid Bernoulli probabilities with exponential decay toward habit prior', async () => {
    const provider = new BayesianOccupancyProvider();
    const occFeatures: PredictionFeatureVector = {
      ...mockFeatureVector,
      target: 'OCCUPANCY_PROBABILITY',
      currentValue: 1.0, // Currently occupied
    };

    const occBaselineMatrix: BaselineMatrix = new Map();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        occBaselineMatrix.set(`${d}_${h}`, {
          dayOfWeek: d,
          hourOfDay: h,
          mean: 0.25, // Habitual occupancy probability 25%
          stdDev: 0.43,
          sampleCount: 50,
        });
      }
    }

    const req: PredictionRequest = {
      homeId: 'test-home',
      target: 'OCCUPANCY_PROBABILITY',
      horizonMinutes: [15, 60, 240],
    };

    const forecast = await provider.predict(req, occFeatures, occBaselineMatrix);

    expect(forecast.length).toBe(3);

    // At 15m, still high probability of occupancy
    expect(forecast[0].predicted).toBeGreaterThan(0.65);

    // As time passes without re-triggering motion, probability decays toward prior (0.25)
    expect(forecast[1].predicted).toBeLessThan(forecast[0].predicted);
    expect(forecast[2].predicted).toBeCloseTo(0.25, 1);

    // Verify all points remain strictly valid probabilities in [0, 1]
    for (const pt of forecast) {
      expect(pt.predicted).toBeGreaterThanOrEqual(0.0);
      expect(pt.predicted).toBeLessThanOrEqual(1.0);
      expect(pt.standardError).toBeGreaterThan(0);
      expect(pt.confidenceInterval80.lower).toBeGreaterThanOrEqual(0.0);
      expect(pt.confidenceInterval80.upper).toBeLessThanOrEqual(1.0);
    }
  });

  it('RemoteMlAdapterProvider transparently falls back to statistical baseline when unconfigured', async () => {
    // No remote URL configured -> circuit-breaker fallback to SeasonalDecay
    const provider = new RemoteMlAdapterProvider(undefined);
    const req: PredictionRequest = {
      homeId: 'test-home',
      target: 'ROOM_TEMPERATURE',
      horizonMinutes: [15, 60],
    };

    const forecast = await provider.predict(req, mockFeatureVector, mockBaselineMatrix);

    expect(forecast.length).toBe(2);
    expect(forecast[0].predicted).toBeGreaterThan(0);
    expect(forecast[0].standardError).toBeGreaterThan(0);
  });
});
