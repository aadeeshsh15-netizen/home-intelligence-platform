import path from 'path';
import { PredictionTarget, ModelType } from '@/domain/types';
import {
  IPredictionProvider,
  PredictionRequest,
  PredictionFeatureVector,
  BaselineMatrix,
  InternalPredictionPoint,
} from '../types';
import { EnsembleModelArtifact, predictHorizonEnsemble } from '../ml/tree-ensemble';
import { loadModelArtifact } from '../ml/trainer';
import { extractFeatureVectorFromContext } from '../ml/dataset-builder';
import { SeasonalDecayProvider } from './seasonal-decay';
import { logger } from '@/lib/logger';

/**
 * Gradient Boosted Decision Trees (GBDT) Predictor Provider.
 *
 * Evaluates in-process decision tree ensembles for multi-horizon power forecasting.
 * Incorporates conformalized prediction intervals and fallback circuit breaker.
 */
export class GradientBoostingProvider implements IPredictionProvider {
  readonly id = 'model-gradient-boosting-v1';
  readonly name = 'Gradient Boosted Trees (GBDT)';
  readonly type: ModelType = 'ML_GRADIENT_BOOSTING';
  readonly version = '1.0.0';

  private fallbackSeasonal = new SeasonalDecayProvider();
  private artifact: EnsembleModelArtifact | null = null;
  private readonly artifactPath: string;

  constructor(customArtifactPath?: string) {
    this.artifactPath =
      customArtifactPath ||
      path.join(process.cwd(), 'storage', 'models', 'power', 'gbdt_v1.json');
    this.loadArtifact();
  }

  public reloadModel(): boolean {
    return this.loadArtifact();
  }

  private loadArtifact(): boolean {
    try {
      this.artifact = loadModelArtifact(this.artifactPath);
      if (this.artifact) {
        logger.info('GBDT model loaded successfully', {
          modelId: this.artifact.modelId,
          version: this.artifact.version,
          horizons: Object.keys(this.artifact.horizons),
        });
        return true;
      }
    } catch (err: any) {
      logger.warn('Failed to load GBDT model artifact', { error: err.message });
    }
    return false;
  }

  supports(target: PredictionTarget): boolean {
    return target === 'HOUSEHOLD_POWER';
  }

  async predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]> {
    // If model artifact is not loaded, execute fallback
    if (!this.artifact) {
      this.loadArtifact();
    }

    if (!this.artifact || !this.artifact.horizons) {
      logger.warn('GBDT artifact unavailable, falling back to Seasonal Decay', {
        target: request.target,
      });
      return this.fallbackSeasonal.predict(request, features, baselines);
    }

    const x = extractFeatureVectorFromContext(features, baselines);
    const originMs = features.timestamp.getTime();
    const results: InternalPredictionPoint[] = [];

    // Horizon mapping helper (find exact or closest trained horizon)
    const trainedHorizons = Object.keys(this.artifact.horizons)
      .map(Number)
      .sort((a, b) => a - b);

    for (const h of request.horizonMinutes) {
      let closestH = trainedHorizons[0];
      let minDiff = Infinity;
      for (const th of trainedHorizons) {
        const diff = Math.abs(th - h);
        if (diff < minDiff) {
          minDiff = diff;
          closestH = th;
        }
      }

      const horizonModel = this.artifact.horizons[closestH];
      const ensembleRes = predictHorizonEnsemble(horizonModel, x);

      results.push({
        timestamp: new Date(originMs + h * 60 * 1000).toISOString(),
        horizonMinutes: h,
        predicted: ensembleRes.predicted,
        confidenceInterval80: {
          lower: ensembleRes.lower80,
          upper: ensembleRes.upper80,
        },
        confidenceInterval95: {
          lower: ensembleRes.lower95,
          upper: ensembleRes.upper95,
        },
        standardError: ensembleRes.standardError,
      });
    }

    return results;
  }
}
