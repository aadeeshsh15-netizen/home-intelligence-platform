import { PredictionTarget, ModelType } from '@/domain/types';

export interface CyclicalFeatures {
  hourSin: number;
  hourCos: number;
  dayOfWeekSin: number;
  dayOfWeekCos: number;
  isWeekend: boolean;
  hourOfDay: number;
  dayOfWeek: number;
}

export interface LagFeatures {
  lag15m?: number;
  lag30m?: number;
  lag1h?: number;
  lag4h?: number;
  lag24h?: number;
  lag168h?: number; // 7 days prior
}

export interface RollingMoments {
  mean15m?: number;
  mean1h?: number;
  std1h?: number;
  slopePerMinute?: number;
  min1h?: number;
  max1h?: number;
}

export interface EnvironmentalContext {
  roomTemperature?: number;
  outdoorTemperature?: number;
  roomCo2?: number;
  occupancyState?: boolean;
  hvacState?: string;
  totalHouseholdPower?: number;
}

export interface PredictionFeatureVector {
  timestamp: Date;
  target: PredictionTarget;
  currentValue: number;
  cyclical: CyclicalFeatures;
  lags: LagFeatures;
  rolling: RollingMoments;
  context: EnvironmentalContext;
  dataQuality: {
    status: 'HEALTHY' | 'DEGRADED' | 'INSUFFICIENT_DATA';
    historicalHours: number;
    missingDataPercent: number;
    validSamplesCount: number;
  };
}

export interface BaselineCell {
  dayOfWeek: number;
  hourOfDay: number;
  mean: number;
  stdDev: number;
  sampleCount: number;
  p10?: number;
  p90?: number;
}

export type BaselineMatrix = Map<string, BaselineCell>; // key: `${dayOfWeek}_${hourOfDay}`

export interface PredictionRequest {
  homeId: string;
  target: PredictionTarget;
  roomId?: string | null;
  sensorId?: string;
  horizonMinutes: number[]; // e.g. [15, 30, ..., 1440]
  referenceTimestamp?: Date; // For historical backtests (walk-forward)
  modelType?: ModelType;
}

export interface InternalPredictionPoint {
  timestamp: string;
  horizonMinutes: number;
  predicted: number;
  confidenceInterval80: {
    lower: number;
    upper: number;
  };
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
  standardError: number;
}

export interface IPredictionProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ModelType;
  readonly version: string;

  supports(target: PredictionTarget): boolean;

  predict(
    request: PredictionRequest,
    features: PredictionFeatureVector,
    baselines?: BaselineMatrix | null
  ): Promise<InternalPredictionPoint[]>;
}
