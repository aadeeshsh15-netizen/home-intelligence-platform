import { PredictionTarget, ModelType } from '@/domain/types';
import {
  IPredictionProvider,
  PredictionRequest,
  PredictionFeatureVector,
  BaselineMatrix,
  InternalPredictionPoint,
} from '../types';
import { clampValue } from './persistence';

/**
 * Exponential Moving Average (EMA) with Damped Momentum Baseline.
 * Uses recent short-term mean and linearly extrapolates the observed drift rate,
 * damping the momentum over a 30-60 minute relaxation window.
 */
export class EmaProvider implements IPredictionProvider {
  readonly id = 'baseline-ema';
  readonly name = 'Exponential Moving Average with Momentum';
  readonly type: ModelType = 'STATISTICAL_EMA';
  readonly version = '1.0.0';

  supports(target: PredictionTarget): boolean {
    return target !== 'OCCUPANCY_PROBABILITY'; // EMA is designed for continuous signals
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    const baseValue = features.rolling.mean15m ?? features.currentValue;
    const slope = features.rolling.slopePerMinute ?? 0;
    const refMs = features.timestamp.getTime();
    const baseStd = Math.max(0.1, features.rolling.std1h || Math.abs(baseValue) * 0.05);

    // Momentum damping factor: gamma = 0.03 (half-life ~23 minutes)
    const gamma = 0.03;

    return request.horizonMinutes.map((hMin) => {
      const pointTime = new Date(refMs + hMin * 60 * 1000).toISOString();

      // Damped linear momentum projection: hMin * slope * exp(-gamma * hMin)
      const momentumContribution = hMin * slope * Math.exp(-gamma * hMin);
      const rawPredicted = baseValue + momentumContribution;
      const predicted = clampValue(request.target, rawPredicted);

      // Uncertainty expansion
      const expansionFactor = Math.sqrt(1 + (hMin / 30));
      const se = Number((baseStd * expansionFactor).toFixed(2));

      const lower80 = clampValue(request.target, predicted - 1.282 * se);
      const upper80 = clampValue(request.target, predicted + 1.282 * se);
      const lower95 = clampValue(request.target, predicted - 1.96 * se);
      const upper95 = clampValue(request.target, predicted + 1.96 * se);

      return {
        timestamp: pointTime,
        horizonMinutes: hMin,
        predicted: Number(predicted.toFixed(2)),
        confidenceInterval80: {
          lower: Number(lower80.toFixed(2)),
          upper: Number(upper80.toFixed(2)),
        },
        confidenceInterval95: {
          lower: Number(lower95.toFixed(2)),
          upper: Number(upper95.toFixed(2)),
        },
        standardError: se,
      };
    });
  }
}
