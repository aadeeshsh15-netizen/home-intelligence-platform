import { z } from 'zod';

export const PredictionTargetEnum = z.enum([
  'HOUSEHOLD_POWER',
  'ROOM_TEMPERATURE',
  'ROOM_CO2',
  'OCCUPANCY_PROBABILITY',
]);

export const ModelTypeEnum = z.enum([
  'STATISTICAL_PERSISTENCE',
  'STATISTICAL_EMA',
  'STATISTICAL_SEASONAL_DECAY',
  'BAYESIAN_OCCUPANCY',
  'ML_LINEAR_REGRESSION',
  'ML_GRADIENT_BOOSTING',
  'ML_RANDOM_FOREST',
  'REMOTE_MICROSERVICE',
]);

export const ForecastHorizonEnum = z.enum(['15m', '1h', '4h', '24h']);

export const QueryPredictionSchema = z.object({
  target: PredictionTargetEnum,
  roomId: z.string().optional(),
  modelType: ModelTypeEnum.optional(),
  horizon: ForecastHorizonEnum.optional().default('24h'),
  stepMinutes: z.coerce.number().min(5).max(60).default(15),
});

export const EvaluateModelSchema = z.object({
  target: PredictionTargetEnum,
  modelType: ModelTypeEnum.optional(),
  days: z.coerce.number().min(1).max(30).default(7),
  roomId: z.string().optional(),
});

export const PredictionPointSchema = z.object({
  timestamp: z.string(),
  horizonMinutes: z.number(),
  predicted: z.number(),
  confidenceInterval80: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  confidenceInterval95: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  standardError: z.number(),
});

export const PredictionResponseSchema = z.object({
  target: PredictionTargetEnum,
  roomId: z.string().nullable().optional(),
  roomName: z.string().nullable().optional(),
  unit: z.string(),
  currentObserved: z
    .object({
      value: z.number(),
      timestamp: z.string(),
    })
    .nullable(),
  model: z.object({
    id: z.string(),
    name: z.string(),
    type: ModelTypeEnum,
    version: z.string(),
  }),
  dataQuality: z.object({
    status: z.enum(['HEALTHY', 'DEGRADED', 'INSUFFICIENT_DATA']),
    historicalHours: z.number(),
    missingDataPercent: z.number(),
  }),
  forecast: z.array(PredictionPointSchema),
  generatedAt: z.string(),
});

// Pluggable Remote ML Microservice schemas
export const RemotePredictionRequestSchema = z.object({
  target: PredictionTargetEnum,
  features: z.record(z.any()),
  horizonMinutes: z.array(z.number()),
  recentHistory: z.array(
    z.object({
      timestamp: z.string(),
      value: z.number(),
    })
  ),
  context: z.record(z.any()).optional(),
});

export const RemotePredictionResponseSchema = z.object({
  modelName: z.string(),
  modelVersion: z.string(),
  predictions: z.array(
    z.object({
      horizonMinutes: z.number(),
      predicted: z.number(),
      lower80: z.number(),
      upper80: z.number(),
      lower95: z.number(),
      upper95: z.number(),
      standardError: z.number(),
    })
  ),
});
