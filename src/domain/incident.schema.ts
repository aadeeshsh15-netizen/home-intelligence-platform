import { z } from 'zod';

export const IncidentStatusEnum = z.enum(['DETECTED', 'ACTIVE', 'RESOLVED', 'DISMISSED']);
export const IncidentTypeEnum = z.enum([
  'COOKING_EVENT',
  'WATER_LEAK',
  'AC_FAILURE',
  'WINDOW_THERMAL_EVENT',
  'MULTI_SENSOR_ANOMALY',
]);

export const ContributingSensorEvidenceSchema = z.object({
  sensorId: z.string(),
  sensorType: z.string(),
  roomName: z.string(),
  signalType: z.enum([
    'ANOMALY_ZSCORE',
    'THRESHOLD_BREACH',
    'STATE_MATCH',
    'RATE_OF_CHANGE',
    'INACTIVITY',
  ]),
  observedValue: z.number(),
  unit: z.string(),
  referenceValue: z.number().optional(),
  deviationPercent: z.number().optional(),
  zScore: z.number().optional(),
  weight: z.number(),
  satisfied: z.boolean(),
  timestamp: z.string(),
  explanation: z.string(),
});

export const UpdateIncidentStatusSchema = z.object({
  status: IncidentStatusEnum,
});

export const QueryIncidentsSchema = z.object({
  status: IncidentStatusEnum.optional(),
  type: IncidentTypeEnum.optional(),
  roomId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});
