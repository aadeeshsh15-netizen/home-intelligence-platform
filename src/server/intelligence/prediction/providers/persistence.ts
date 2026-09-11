import { PredictionTarget, ModelType } from '@/domain/types';
import {
  IPredictionProvider,
  PredictionRequest,
  PredictionFeatureVector,
  BaselineMatrix,
  InternalPredictionPoint,
} from '../types';

/**
 * Clamp predictions within physical laws per target.
 */
export function clampValue(target: PredictionTarget, val: number): number {
  switch (target) {
    case 'HOUSEHOLD_POWER':
      return Math.max(0, val);
    case 'ROOM_TEMPERATURE':
      return Math.max(5, Math.min(50, val));
    case 'ROOM_CO2':
      return Math.max(380, Math.min(5000, val));
    case 'OCCUPANCY_PROBABILITY':
      return Math.max(0.0, Math.min(1.0, val));
    default:
      return val;
  }
}

/**
 * Naive Persistence Baseline:
 * Assumes the future equals the most recently observed value: y_hat(t+h) = y_t
 * Standard error expands with sqrt(horizon).
 */
export class PersistenceProvider implements IPredictionProvider {
  readonly id = 'baseline-persistence';
  readonly name = 'Naive Persistence Baseline';
  readonly type: ModelType = 'STATISTICAL_PERSISTENCE';
  readonly version = '1.0.0';

  supports(target: PredictionTarget): boolean {
    return true; // Supports all targets as baseline
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    const y0 = features.currentValue;
    const refMs = features.timestamp.getTime();

    // Base standard error from rolling 1h std or a nominal fraction of y0
    const baseStd = Math.max(0.1, features.rolling.std1h || Math.abs(y0) * 0.05);

    return request.horizonMinutes.map((hMin) => {
      const pointTime = new Date(refMs + hMin * 60 * 1000).toISOString();
      const predicted = clampValue(request.target, y0);

      // Uncertainty expands as sqrt(hMin / 15)
      const expansionFactor = Math.sqrt(Math.max(1, hMin / 15));
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
