/**
 * Mathematical foundation for Predictive Incident Intelligence.
 *
 * Provides analytical error functions, normal cumulative distribution functions,
 * empirical threshold crossing probabilities, and multimodal confidence synthesis.
 * Eliminates fabricated or guessed probabilities.
 */

/**
 * Standard Error Function erf(x) approximation.
 * Abramowitz and Stegun formula 7.1.26. Maximum error: < 1.5e-7.
 */
export function erf(x: number): number {
  // Sign of x
  if (x === 0) return 0;
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);

  // Constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // A&S formula 7.1.26
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return sign * y;
}

/**
 * Standard Normal Cumulative Distribution Function Phi(z).
 * Probability that a standard normal random variable is <= z.
 */
export function normalCdf(z: number): number {
  return 0.5 * (1.0 + erf(z / Math.SQRT2));
}

/**
 * Computes statistically grounded probability that a future observation
 * will cross threshold T given point forecast y_hat and calibrated standard error s.
 *
 * @param predicted Point prediction y_hat
 * @param threshold Critical threshold T
 * @param standardError Calibrated empirical standard error s (from prediction interval)
 * @param direction 'UP' for rising breach (e.g. CO2 > 1000), 'DOWN' for falling breach (e.g. Temp < 17)
 */
export function calculateThresholdCrossingProbability(
  predicted: number,
  threshold: number,
  standardError: number,
  direction: 'UP' | 'DOWN' = 'UP'
): number {
  if (standardError <= 0.001) {
    if (direction === 'UP') {
      return predicted >= threshold ? 0.99 : 0.01;
    } else {
      return predicted <= threshold ? 0.99 : 0.01;
    }
  }

  if (direction === 'UP') {
    // P(Y >= T) = P(Z >= (T - y_hat)/s) = 1 - Phi((T - y_hat)/s) = Phi((y_hat - T)/s)
    const z = (predicted - threshold) / standardError;
    const p = normalCdf(z);
    return Number(Math.max(0.01, Math.min(0.99, p)).toFixed(2));
  } else {
    // P(Y <= T) = P(Z <= (T - y_hat)/s) = Phi((T - y_hat)/s)
    const z = (threshold - predicted) / standardError;
    const p = normalCdf(z);
    return Number(Math.max(0.01, Math.min(0.99, p)).toFixed(2));
  }
}

/**
 * Multimodal Predictive Confidence Score C in [0.0, 1.0].
 * Blends:
 * - Statistical threshold crossing probability (40%)
 * - Corroborating physical sensor evidence satisfaction (35%)
 * - Real-time trend alignment (15%)
 * - Historical model accuracy weight (10%)
 */
export function calculatePredictiveConfidence(params: {
  crossingProbability: number;
  satisfiedWeight: number;
  totalWeight: number;
  trendAligned: boolean;
  modelReliabilityWeight?: number; // default 0.9
}): number {
  const pCross = Math.max(0, Math.min(1, params.crossingProbability));
  const sensorRatio =
    params.totalWeight > 0 ? Math.min(1, params.satisfiedWeight / params.totalWeight) : 0;
  const trendScore = params.trendAligned ? 1.0 : 0.0;
  const modelScore = params.modelReliabilityWeight ?? 0.85;

  const rawScore =
    0.4 * pCross + 0.35 * sensorRatio + 0.15 * trendScore + 0.1 * modelScore;

  return Number(Math.max(0.1, Math.min(0.99, rawScore)).toFixed(2));
}

/**
 * Linearly interpolates the projected minute along a trajectory when a threshold is breached.
 */
export function interpolateCrossingMinute(
  points: { horizonMinutes: number; predicted: number }[],
  threshold: number,
  direction: 'UP' | 'DOWN' = 'UP'
): number | null {
  if (points.length < 2) return null;

  // Sort ascending by horizon
  const sorted = [...points].sort((a, b) => a.horizonMinutes - b.horizonMinutes);

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];

    if (direction === 'UP') {
      if (p1.predicted < threshold && p2.predicted >= threshold) {
        const fraction = (threshold - p1.predicted) / (p2.predicted - p1.predicted);
        const crossingMin = p1.horizonMinutes + fraction * (p2.horizonMinutes - p1.horizonMinutes);
        return Math.max(1, Math.round(crossingMin));
      }
    } else {
      if (p1.predicted > threshold && p2.predicted <= threshold) {
        const fraction = (p1.predicted - threshold) / (p1.predicted - p2.predicted);
        const crossingMin = p1.horizonMinutes + fraction * (p2.horizonMinutes - p1.horizonMinutes);
        return Math.max(1, Math.round(crossingMin));
      }
    }
  }

  // If already breached at first point
  if (direction === 'UP' && sorted[0].predicted >= threshold) {
    return sorted[0].horizonMinutes;
  }
  if (direction === 'DOWN' && sorted[0].predicted <= threshold) {
    return sorted[0].horizonMinutes;
  }

  return null;
}
