import { describe, it, expect } from 'vitest';
import {
  calculateMeanAndStdDev,
  calculateDistribution,
  calculateZScore,
  calculateDriftRatePerMinute,
  downsampleTimeSeries,
} from '../../src/lib/statistics';

describe('Statistical Utilities', () => {
  it('calculates mean and standard deviation accurately', () => {
    const values = [10, 12, 14, 16, 18];
    const { mean, stdDev } = calculateMeanAndStdDev(values);

    expect(mean).toBe(14);
    // Population std dev for [10, 12, 14, 16, 18] is sqrt(8) ≈ 2.83
    expect(stdDev).toBeCloseTo(2.83, 1);
  });

  it('computes Z-scores correctly', () => {
    const mean = 20.0;
    const stdDev = 2.0;

    // Normal point
    expect(calculateZScore(20.0, mean, stdDev)).toBe(0);
    // +2.5 standard deviations
    expect(calculateZScore(25.0, mean, stdDev)).toBe(2.5);
    // -3.0 standard deviations
    expect(calculateZScore(14.0, mean, stdDev)).toBe(-3.0);
  });

  it('calculates percentiles and distribution quantiles', () => {
    const values = Array.from({ length: 101 }, (_, i) => i); // 0 to 100
    const dist = calculateDistribution(values);

    expect(dist.min).toBe(0);
    expect(dist.max).toBe(100);
    expect(dist.p50).toBe(50);
    expect(dist.p10).toBe(10);
    expect(dist.p90).toBe(90);
    expect(dist.count).toBe(101);
  });

  it('computes linear drift rate per minute correctly', () => {
    const baseTime = new Date('2026-01-01T12:00:00Z').getTime();
    // Values increasing by 10 ppm every minute
    const points = [
      { timestamp: baseTime, value: 500 },
      { timestamp: baseTime + 60000, value: 510 },
      { timestamp: baseTime + 120000, value: 520 },
      { timestamp: baseTime + 180000, value: 530 },
    ];

    const drift = calculateDriftRatePerMinute(points);
    expect(drift).toBeCloseTo(10.0, 1);
  });

  it('downsamples high frequency time series preserving peak values', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      value: i === 50 ? 999 : 20, // Extreme spike at index 50
    }));

    const downsampled = downsampleTimeSeries(points, 10);
    expect(downsampled.length).toBeLessThanOrEqual(10);

    const bucketWithSpike = downsampled.find((b) => b.max === 999);
    expect(bucketWithSpike).toBeDefined();
    expect(bucketWithSpike?.max).toBe(999);
  });
});
