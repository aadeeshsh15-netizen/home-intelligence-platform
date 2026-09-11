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
 * Seasonal Diurnal with Autoregressive Residual Decay.
 *
 * Mathematical formulation:
 *   y_hat(t+h) = mu_{d(t+h), h(t+h)} + exp(-lambda * h) * (y_t - mu_{d(t), h(t)})
 *
 * As h -> 0, predictions anchor tightly to current real-time deviation.
 * As h -> inf (4h to 24h), predictions smoothly relax to the empirical 168h baseline expectation.
 * Uncertainty interval smoothly expands from short-term residual variance to full diurnal variance.
 */
export class SeasonalDecayProvider implements IPredictionProvider {
  readonly id = 'baseline-seasonal-decay';
  readonly name = 'Seasonal Diurnal with Autoregressive Residual Decay';
  readonly type: ModelType = 'STATISTICAL_SEASONAL_DECAY';
  readonly version = '1.0.0';

  supports(target: PredictionTarget): boolean {
    return target !== 'OCCUPANCY_PROBABILITY';
  }

  /**
   * Half-life (in minutes) for residual autocorrelation decay based on physical dynamics.
   */
  private getHalfLifeMinutes(target: PredictionTarget): number {
    switch (target) {
      case 'ROOM_TEMPERATURE':
        return 90; // High thermal inertia of building envelope
      case 'ROOM_CO2':
        return 45; // Air exchange rate dissipation
      case 'HOUSEHOLD_POWER':
        return 20; // Fast appliance cycle shifts
      default:
        return 45;
    }
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    const t0 = features.timestamp;
    const refMs = t0.getTime();
    const y0 = features.currentValue;

    // Current baseline lookup
    const currentDow = t0.getUTCDay();
    const currentHour = t0.getUTCHours();
    const currentBaselineKey = `${currentDow}_${currentHour}`;
    const currentCell = baselines?.get(currentBaselineKey);

    const mu0 = currentCell?.mean ?? y0;
    const currentResidual = y0 - mu0;

    const halfLife = this.getHalfLifeMinutes(request.target);
    const lambda = Math.LN2 / halfLife;
    const recentStd = Math.max(0.1, features.rolling.std1h || currentCell?.stdDev || 1.0);

    return request.horizonMinutes.map((hMin) => {
      const targetDate = new Date(refMs + hMin * 60 * 1000);
      const targetDow = targetDate.getUTCDay();
      const targetHour = targetDate.getUTCHours();
      const targetKey = `${targetDow}_${targetHour}`;
      const targetCell = baselines?.get(targetKey);

      // Expected diurnal baseline at target time
      const muFuture = targetCell?.mean ?? mu0;
      const sigmaFuture = targetCell?.stdDev ?? recentStd;

      // Autoregressive residual decay
      const decayWeight = Math.exp(-lambda * hMin);
      const predictedResidual = decayWeight * currentResidual;
      const rawPredicted = muFuture + predictedResidual;
      const predicted = clampValue(request.target, rawPredicted);

      // Blended uncertainty: transitions from short-term residual variance to diurnal baseline variance
      const varianceBlended =
        decayWeight * Math.pow(recentStd, 2) + (1 - decayWeight) * Math.pow(sigmaFuture, 2);
      const se = Number(Math.max(0.05, Math.sqrt(varianceBlended)).toFixed(2));

      const lower80 = clampValue(request.target, predicted - 1.282 * se);
      const upper80 = clampValue(request.target, predicted + 1.282 * se);
      const lower95 = clampValue(request.target, predicted - 1.96 * se);
      const upper95 = clampValue(request.target, predicted + 1.96 * se);

      return {
        timestamp: targetDate.toISOString(),
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
