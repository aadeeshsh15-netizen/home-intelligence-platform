import { describe, it, expect } from 'vitest';
import {
  FEATURE_NAMES_V1_POWER,
  FEATURE_VERSION_POWER,
  extractFeatureVectorFromContext,
  splitDatasetChronologically,
  TabularDataRow,
} from '../../src/server/intelligence/prediction/ml/dataset-builder';
import { PredictionFeatureVector, BaselineMatrix } from '../../src/server/intelligence/prediction/types';

describe('Phase 4 ML Feature Pipeline & Data Integrity', () => {
  it('1. Enforces consistent 24-dimensional feature schema for power forecasting', () => {
    expect(FEATURE_VERSION_POWER).toBe('features_v1_power');
    expect(FEATURE_NAMES_V1_POWER).toHaveLength(24);

    // Verify all feature names are distinct
    const distinctNames = new Set(FEATURE_NAMES_V1_POWER);
    expect(distinctNames.size).toBe(24);

    // Verify presence of critical lag and physical features
    expect(FEATURE_NAMES_V1_POWER).toContain('current_value');
    expect(FEATURE_NAMES_V1_POWER).toContain('lag_15m');
    expect(FEATURE_NAMES_V1_POWER).toContain('lag_1h');
    expect(FEATURE_NAMES_V1_POWER).toContain('lag_24h');
    expect(FEATURE_NAMES_V1_POWER).toContain('mean_1h');
    expect(FEATURE_NAMES_V1_POWER).toContain('slope_1h');
    expect(FEATURE_NAMES_V1_POWER).toContain('hour_sin');
    expect(FEATURE_NAMES_V1_POWER).toContain('outdoor_temp');
    expect(FEATURE_NAMES_V1_POWER).toContain('baseline_mean');
  });

  it('2. Correctly serializes runtime context into ordered numeric vector without NaNs', () => {
    const mockVector: PredictionFeatureVector = {
      timestamp: new Date('2026-09-05T14:30:00Z'),
      target: 'HOUSEHOLD_POWER',
      currentValue: 1250.5,
      cyclical: {
        hourSin: 0.5,
        hourCos: 0.866,
        dayOfWeekSin: -0.7818,
        dayOfWeekCos: 0.6235,
        isWeekend: false,
        hourOfDay: 14.5,
        dayOfWeek: 5,
      },
      lags: {
        lag15m: 1240.0,
        lag30m: 1230.0,
        lag1h: 1100.0,
        lag4h: 450.0,
        lag24h: 1200.0,
        lag168h: 1150.0,
      },
      rolling: {
        mean15m: 1245.0,
        mean1h: 1180.0,
        std1h: 45.2,
        slopePerMinute: 0.5,
        min1h: 1100.0,
        max1h: 1250.5,
      },
      context: {
        outdoorTemperature: 24.5,
        roomTemperature: 21.8,
        roomCo2: 520.0,
        occupancyState: true,
      },
      dataQuality: {
        status: 'HEALTHY',
        historicalHours: 720,
        missingDataPercent: 0,
        validSamplesCount: 1400,
      },
    };

    const mockBaseline: BaselineMatrix = new Map();
    mockBaseline.set('5_14', {
      dayOfWeek: 5,
      hourOfDay: 14,
      mean: 1190.0,
      stdDev: 60.0,
      sampleCount: 4,
    });

    const x = extractFeatureVectorFromContext(mockVector, mockBaseline);

    expect(x).toHaveLength(24);
    // Assert all values are valid numbers and none are NaN
    for (let i = 0; i < x.length; i++) {
      expect(Number.isFinite(x[i])).toBe(true);
      expect(Number.isNaN(x[i])).toBe(false);
    }

    // Check specific positions match definitions
    expect(x[0]).toBe(1250.5); // current_value
    expect(x[1]).toBe(1240.0); // lag_15m
    expect(x[3]).toBe(1100.0); // lag_1h
    expect(x[8]).toBe(1180.0); // mean_1h
    expect(x[12]).toBe(0.5);   // slope_1h
    expect(x[17]).toBe(0);     // is_weekend (false -> 0)
    expect(x[21]).toBe(1);     // occupancy_state (true -> 1)
    expect(x[22]).toBe(1190.0); // baseline_mean
    expect(x[23]).toBe(60.0);   // baseline_std
  });

  it('3. Preserves strict chronological boundary ordering across train/val/test splits', () => {
    // Generate synthetic time series spanning 100 timestamps
    const rows: TabularDataRow[] = [];
    const baseTime = new Date('2026-08-01T00:00:00Z').getTime();

    for (let i = 0; i < 100; i++) {
      rows.push({
        timestamp: new Date(baseTime + i * 3600 * 1000),
        features: new Array(24).fill(i),
        targets: { 15: i + 1, 60: i + 2, 240: i + 3, 1440: i + 4 },
      });
    }

    const { train, val, test } = splitDatasetChronologically(rows, 0.20, 0.25);

    expect(train.length).toBe(55);
    expect(val.length).toBe(20);
    expect(test.length).toBe(25);

    // Strictly monotonically increasing time across partitions
    const lastTrainTime = train[train.length - 1].timestamp.getTime();
    const firstValTime = val[0].timestamp.getTime();
    const lastValTime = val[val.length - 1].timestamp.getTime();
    const firstTestTime = test[0].timestamp.getTime();

    expect(lastTrainTime).toBeLessThan(firstValTime);
    expect(lastValTime).toBeLessThan(firstTestTime);
  });
});
