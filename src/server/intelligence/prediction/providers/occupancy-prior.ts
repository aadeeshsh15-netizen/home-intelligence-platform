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
 * Bayesian Occupancy Prior with Motion State Decay.
 *
 * Predicts Bernoulli occupancy probability p in [0.0, 1.0].
 * At h=0, anchors on real-time binary motion/occupancy state.
 * As h grows, relaxes exponentially toward historical occupancy habit prior P_base(dow, hour).
 */
export class BayesianOccupancyProvider implements IPredictionProvider {
  readonly id = 'baseline-bayesian-occupancy';
  readonly name = 'Bayesian Occupancy Prior with Motion Decay';
  readonly type: ModelType = 'BAYESIAN_OCCUPANCY';
  readonly version = '1.0.0';

  supports(target: PredictionTarget): boolean {
    return target === 'OCCUPANCY_PROBABILITY';
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    const t0 = features.timestamp;
    const refMs = t0.getTime();

    // Binary motion/occupancy state (1.0 = occupied, 0.0 = unoccupied)
    const currentState = features.currentValue >= 0.5 ? 1.0 : 0.0;

    const currentDow = t0.getUTCDay();
    const currentHour = t0.getUTCHours();
    const currentBaselineKey = `${currentDow}_${currentHour}`;
    const currentCell = baselines?.get(currentBaselineKey);

    // Prior baseline probability from historical mean
    const prior0 = Math.max(0.05, Math.min(0.95, currentCell?.mean ?? 0.3));
    const delta0 = currentState - prior0;

    // Decay half-life: 30 minutes if occupied, 15 minutes if vacant
    const halfLife = currentState === 1.0 ? 30 : 15;
    const kappa = Math.LN2 / halfLife;

    return request.horizonMinutes.map((hMin) => {
      const targetDate = new Date(refMs + hMin * 60 * 1000);
      const targetDow = targetDate.getUTCDay();
      const targetHour = targetDate.getUTCHours();
      const targetKey = `${targetDow}_${targetHour}`;
      const targetCell = baselines?.get(targetKey);

      const priorFuture = Math.max(0.05, Math.min(0.95, targetCell?.mean ?? 0.3));

      // Relax from current state toward diurnal prior
      const decayWeight = Math.exp(-kappa * hMin);
      const prob = Math.max(0.01, Math.min(0.99, priorFuture + decayWeight * delta0));

      // Bernoulli standard error: sqrt(p * (1 - p))
      const se = Number(Math.sqrt(prob * (1 - prob)).toFixed(3));

      // Confidence intervals for probability
      const lower80 = clampValue('OCCUPANCY_PROBABILITY', prob - 1.282 * se);
      const upper80 = clampValue('OCCUPANCY_PROBABILITY', prob + 1.282 * se);
      const lower95 = clampValue('OCCUPANCY_PROBABILITY', prob - 1.96 * se);
      const upper95 = clampValue('OCCUPANCY_PROBABILITY', prob + 1.96 * se);

      return {
        timestamp: targetDate.toISOString(),
        horizonMinutes: hMin,
        predicted: Number(prob.toFixed(3)),
        confidenceInterval80: {
          lower: Number(lower80.toFixed(3)),
          upper: Number(upper80.toFixed(3)),
        },
        confidenceInterval95: {
          lower: Number(lower95.toFixed(3)),
          upper: Number(upper95.toFixed(3)),
        },
        standardError: se,
      };
    });
  }
}
