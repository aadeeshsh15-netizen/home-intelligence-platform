import { PredictionTarget, ModelType } from '@/domain/types';
import {
  IPredictionProvider,
  PredictionRequest,
  PredictionFeatureVector,
  BaselineMatrix,
  InternalPredictionPoint,
} from '../types';
import { SeasonalDecayProvider } from './seasonal-decay';
import { BayesianOccupancyProvider } from './occupancy-prior';
import { logger } from '@/lib/logger';

/**
 * Pluggable Remote ML Microservice Provider.
 *
 * Communicates with an external ML microservice (e.g. LightGBM, ONNX, PyTorch)
 * over HTTP JSON contracts. Features circuit-breaker fallback to statistical baselines
 * when remote service is unavailable, timed out, or unconfigured.
 */
export class RemoteMlAdapterProvider implements IPredictionProvider {
  readonly id = 'model-gradient-boosting-remote';
  readonly name = 'Gradient Boosted Trees (Remote Microservice)';
  readonly type: ModelType = 'REMOTE_MICROSERVICE';
  readonly version = '1.0.0';

  private fallbackSeasonal = new SeasonalDecayProvider();
  private fallbackOccupancy = new BayesianOccupancyProvider();
  private endpointUrl: string | null;

  constructor(endpointUrl?: string) {
    this.endpointUrl = endpointUrl || process.env.PREDICTION_ML_SERVICE_URL || null;
  }

  supports(target: PredictionTarget): boolean {
    return true; // Supports all targets
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    if (!this.endpointUrl) {
      // Graceful fallback to statistical baseline when microservice is unconfigured
      return this.executeFallback(request, features, baselines);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800); // 800ms SLA timeout

      const payload = {
        target: request.target,
        features: {
          currentValue: features.currentValue,
          cyclical: features.cyclical,
          lags: features.lags,
          rolling: features.rolling,
          context: features.context,
        },
        horizonMinutes: request.horizonMinutes,
      };

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Remote ML service responded with status ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data.predictions)) {
        return data.predictions.map((p: any) => ({
          timestamp: p.timestamp || new Date(features.timestamp.getTime() + p.horizonMinutes * 60000).toISOString(),
          horizonMinutes: p.horizonMinutes,
          predicted: p.predicted,
          confidenceInterval80: {
            lower: p.lower80 ?? p.confidenceInterval80?.lower ?? p.predicted * 0.9,
            upper: p.upper80 ?? p.confidenceInterval80?.upper ?? p.predicted * 1.1,
          },
          confidenceInterval95: {
            lower: p.lower95 ?? p.confidenceInterval95?.lower ?? p.predicted * 0.8,
            upper: p.upper95 ?? p.confidenceInterval95?.upper ?? p.predicted * 1.2,
          },
          standardError: p.standardError ?? 0.1,
        }));
      }

      throw new Error('Invalid prediction schema received from remote ML service');
    } catch (err: any) {
      logger.warn('Remote ML service unreachable or timed out, executing baseline fallback', {
        error: err.message,
        target: request.target,
      });
      return this.executeFallback(request, features, baselines);
    }
  }

  private executeFallback(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    if (request.target === 'OCCUPANCY_PROBABILITY') {
      return this.fallbackOccupancy.predict(request, features, baselines);
    }
    return this.fallbackSeasonal.predict(request, features, baselines);
  }
}
