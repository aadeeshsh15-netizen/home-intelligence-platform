/**
 * Statistical utilities for deterministic telemetry analysis,
 * baseline calculations, anomaly detection, and time-series downsampling.
 */

export interface TimeSeriesPoint {
  timestamp: string | Date;
  value: number;
}

export interface DownsampledPoint {
  timestamp: string;
  value: number;
  min: number;
  max: number;
  count: number;
}

export interface DistributionStats {
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  count: number;
}

/**
 * Calculates arithmetic mean and population standard deviation.
 */
export function calculateMeanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (values.length === 1) return { mean, stdDev: 0 };

  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(Math.sqrt(variance).toFixed(2)),
  };
}

/**
 * Calculates full statistical distribution including percentiles.
 */
export function calculateDistribution(values: number[]): DistributionStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, p10: 0, p50: 0, p90: 0, min: 0, max: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const { mean, stdDev } = calculateMeanAndStdDev(sorted);

  const getPercentile = (p: number) => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  };

  return {
    mean,
    stdDev,
    p10: Number(getPercentile(10).toFixed(2)),
    p50: Number(getPercentile(50).toFixed(2)),
    p90: Number(getPercentile(90).toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    count: sorted.length,
  };
}

/**
 * Computes the Z-Score (standard score) for a value against an established baseline.
 * Z = (x - mean) / stdDev
 * Handles zero-variance situation: if stdDev is near zero, uses a minimum scale factor (0.1)
 * so that genuine deviations from a constant baseline are not masked as Z = 0.
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (Math.abs(value - mean) < 1e-6) return 0;
  const effectiveStd = Math.max(0.1, stdDev);
  return Number(((value - mean) / effectiveStd).toFixed(2));
}

/**
 * Calculates linear regression slope (rate of change per unit of time in minutes).
 * Used for persistent drift detection (e.g. rising CO2 or heating failure).
 */
export function calculateDriftRatePerMinute(points: { timestamp: Date | number; value: number }[]): number {
  if (points.length < 2) return 0;

  const n = points.length;
  const t0 = typeof points[0].timestamp === 'number' ? points[0].timestamp : points[0].timestamp.getTime();

  // Convert time to minutes relative to t0
  const x = points.map((p) => {
    const t = typeof p.timestamp === 'number' ? p.timestamp : p.timestamp.getTime();
    return (t - t0) / 60000;
  });
  const y = points.map((p) => p.value);

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-6) return 0;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return Number(slope.toFixed(4));
}

/**
 * Downsamples high-frequency time series into bucketed representations
 * for chart rendering without losing peak extremes (min/max).
 */
export function downsampleTimeSeries(
  readings: { timestamp: Date | string; value: number }[],
  targetBuckets: number = 100
): DownsampledPoint[] {
  if (readings.length === 0) return [];
  if (readings.length <= targetBuckets) {
    return readings.map((r) => ({
      timestamp: new Date(r.timestamp).toISOString(),
      value: Number(r.value.toFixed(2)),
      min: Number(r.value.toFixed(2)),
      max: Number(r.value.toFixed(2)),
      count: 1,
    }));
  }

  const bucketSize = Math.ceil(readings.length / targetBuckets);
  const results: DownsampledPoint[] = [];

  for (let i = 0; i < readings.length; i += bucketSize) {
    const chunk = readings.slice(i, i + bucketSize);
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const item of chunk) {
      sum += item.value;
      if (item.value < min) min = item.value;
      if (item.value > max) max = item.value;
    }

    const midIndex = Math.floor(chunk.length / 2);
    results.push({
      timestamp: new Date(chunk[midIndex].timestamp).toISOString(),
      value: Number((sum / chunk.length).toFixed(2)),
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      count: chunk.length,
    });
  }

  return results;
}
