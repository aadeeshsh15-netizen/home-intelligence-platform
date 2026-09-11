import { prisma } from '@/lib/db';
import { PredictionTarget, ModelType, ForecastHorizon, PredictionResponse, ModelMetadata } from '@/domain/types';
import {
  IPredictionProvider,
  PredictionRequest,
  InternalPredictionPoint,
} from './types';
import { extractFeatures } from './features';
import { PersistenceProvider } from './providers/persistence';
import { EmaProvider } from './providers/ema';
import { SeasonalDecayProvider } from './providers/seasonal-decay';
import { BayesianOccupancyProvider } from './providers/occupancy-prior';
import { RemoteMlAdapterProvider } from './providers/remote-adapter';
import { logger } from '@/lib/logger';

interface CacheEntry {
  expiresAt: number;
  data: PredictionResponse;
}

export class PredictionEngine {
  private static instance: PredictionEngine;
  private providers: Map<ModelType, IPredictionProvider> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs = 30 * 1000; // 30-second TTL
  private modelsInitialized = false;

  private constructor() {
    this.registerProvider(new PersistenceProvider());
    this.registerProvider(new EmaProvider());
    this.registerProvider(new SeasonalDecayProvider());
    this.registerProvider(new BayesianOccupancyProvider());
    this.registerProvider(new RemoteMlAdapterProvider());
  }

  public static getInstance(): PredictionEngine {
    if (!PredictionEngine.instance) {
      PredictionEngine.instance = new PredictionEngine();
    }
    return PredictionEngine.instance;
  }

  public registerProvider(provider: IPredictionProvider): void {
    this.providers.set(provider.type, provider);
  }

  public getProvider(type: ModelType): IPredictionProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Initializes default prediction models in the database if not already present.
   */
  public async ensureModelsSeeded(): Promise<void> {
    if (this.modelsInitialized) return;

    try {
      const defaultConfigs: {
        name: string;
        type: ModelType;
        version: string;
        target: PredictionTarget;
        hyperparameters: any;
        isDefault: boolean;
      }[] = [
        {
          name: 'Seasonal Diurnal with Residual Decay',
          type: 'STATISTICAL_SEASONAL_DECAY',
          version: '1.0.0',
          target: 'HOUSEHOLD_POWER',
          hyperparameters: { halfLifeMinutes: 20, seasonalPeriodHours: 168 },
          isDefault: true,
        },
        {
          name: 'Seasonal Diurnal with Residual Decay',
          type: 'STATISTICAL_SEASONAL_DECAY',
          version: '1.0.0',
          target: 'ROOM_TEMPERATURE',
          hyperparameters: { halfLifeMinutes: 90, seasonalPeriodHours: 168 },
          isDefault: true,
        },
        {
          name: 'Seasonal Diurnal with Residual Decay',
          type: 'STATISTICAL_SEASONAL_DECAY',
          version: '1.0.0',
          target: 'ROOM_CO2',
          hyperparameters: { halfLifeMinutes: 45, seasonalPeriodHours: 168 },
          isDefault: true,
        },
        {
          name: 'Bayesian Occupancy Prior with Motion Decay',
          type: 'BAYESIAN_OCCUPANCY',
          version: '1.0.0',
          target: 'OCCUPANCY_PROBABILITY',
          hyperparameters: { occupiedHalfLife: 30, vacantHalfLife: 15 },
          isDefault: true,
        },
        {
          name: 'Naive Persistence Baseline',
          type: 'STATISTICAL_PERSISTENCE',
          version: '1.0.0',
          target: 'HOUSEHOLD_POWER',
          hyperparameters: {},
          isDefault: false,
        },
        {
          name: 'Exponential Moving Average',
          type: 'STATISTICAL_EMA',
          version: '1.0.0',
          target: 'ROOM_TEMPERATURE',
          hyperparameters: { gamma: 0.03 },
          isDefault: false,
        },
      ];

      for (const config of defaultConfigs) {
        const existing = await prisma.predictionModel.findFirst({
          where: {
            target: config.target,
            type: config.type,
          },
        });

        if (!existing) {
          await prisma.predictionModel.create({
            data: {
              name: config.name,
              type: config.type,
              version: config.version,
              target: config.target,
              hyperparameters: config.hyperparameters,
              isActive: true,
              isDefault: config.isDefault,
            },
          });
        }
      }

      this.modelsInitialized = true;
    } catch (err: any) {
      logger.warn('Failed to seed prediction models in database', { error: err.message });
    }
  }

  /**
   * Translates ForecastHorizon string into minutes and step intervals.
   */
  public getHorizonMinutes(horizon: ForecastHorizon = '24h', stepMinutes = 15): number[] {
    let totalMinutes = 24 * 60;
    if (horizon === '15m') totalMinutes = 15;
    else if (horizon === '1h') totalMinutes = 60;
    else if (horizon === '4h') totalMinutes = 240;
    else if (horizon === '24h') totalMinutes = 1440;

    const steps: number[] = [];
    for (let m = stepMinutes; m <= totalMinutes; m += stepMinutes) {
      steps.push(m);
    }
    if (steps.length === 0 || steps[steps.length - 1] !== totalMinutes) {
      steps.push(totalMinutes);
    }
    return steps;
  }

  /**
   * Resolves the default provider for a target if none is explicitly requested.
   */
  public resolveProvider(target: PredictionTarget, requestedModelType?: ModelType): IPredictionProvider {
    if (requestedModelType) {
      const provider = this.providers.get(requestedModelType);
      if (provider && provider.supports(target)) {
        return provider;
      }
    }

    if (target === 'OCCUPANCY_PROBABILITY') {
      return this.providers.get('BAYESIAN_OCCUPANCY')!;
    }

    return this.providers.get('STATISTICAL_SEASONAL_DECAY')!;
  }

  /**
   * Generates time-series forecast with in-memory caching and quality guarantees.
   */
  public async getForecast(params: {
    homeId: string;
    target: PredictionTarget;
    roomId?: string | null;
    modelType?: ModelType;
    horizon?: ForecastHorizon;
    stepMinutes?: number;
    referenceTime?: Date;
  }): Promise<PredictionResponse> {
    const horizon = params.horizon || '24h';
    const stepMinutes = params.stepMinutes || 15;
    const isLive = !params.referenceTime;
    const refTime = params.referenceTime || new Date();

    const cacheKey = `${params.homeId}_${params.target}_${params.roomId || 'default'}_${
      params.modelType || 'auto'
    }_${horizon}_${stepMinutes}`;

    if (isLive) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    await this.ensureModelsSeeded();

    const provider = this.resolveProvider(params.target, params.modelType);
    const { features, sensor, baselineMatrix } = await extractFeatures(
      params.homeId,
      params.target,
      params.roomId,
      refTime
    );

    const horizonMinutes = this.getHorizonMinutes(horizon, stepMinutes);

    const request: PredictionRequest = {
      homeId: params.homeId,
      target: params.target,
      roomId: params.roomId,
      sensorId: sensor.id,
      horizonMinutes,
      referenceTimestamp: refTime,
      modelType: provider.type,
    };

    const predictions: InternalPredictionPoint[] = await provider.predict(
      request,
      features,
      baselineMatrix
    );

    const response: PredictionResponse = {
      target: params.target,
      roomId: sensor.roomId,
      roomName: sensor.roomName,
      unit: sensor.unit,
      currentObserved: {
        value: features.currentValue,
        timestamp: features.timestamp.toISOString(),
      },
      model: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        version: provider.version,
      },
      dataQuality: {
        status: features.dataQuality.status,
        historicalHours: features.dataQuality.historicalHours,
        missingDataPercent: features.dataQuality.missingDataPercent,
      },
      forecast: predictions,
      generatedAt: new Date().toISOString(),
    };

    if (isLive) {
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + this.cacheTtlMs,
        data: response,
      });
    }

    return response;
  }

  /**
   * Lists all available prediction models and their status.
   */
  public async listModels(target?: PredictionTarget): Promise<ModelMetadata[]> {
    await this.ensureModelsSeeded();

    const where: any = {};
    if (target) {
      where.target = target;
    }

    const models = await prisma.predictionModel.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type as ModelType,
      version: m.version,
      target: m.target as PredictionTarget,
      hyperparameters: m.hyperparameters as Record<string, any>,
      isActive: m.isActive,
      isDefault: m.isDefault,
    }));
  }
}

export const predictionEngine = PredictionEngine.getInstance();
