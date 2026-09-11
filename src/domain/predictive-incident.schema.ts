import { z } from 'zod';

export const PredictiveIncidentTypeEnum = z.enum([
  'PREDICTED_CO2_VENTILATION',
  'PREDICTED_AC_FAILURE',
  'PREDICTED_ENERGY_SURGE',
  'PREDICTED_THERMAL_BREACH',
]);

export const PredictiveIncidentStatusEnum = z.enum([
  'PREDICTED',
  'CONFIRMED',
  'EXPIRED',
  'DISMISSED',
]);

export const PredictionOutcomeEnum = z.enum([
  'TRUE_POSITIVE',
  'FALSE_POSITIVE',
  'UNRESOLVED',
]);

export const QueryPredictiveIncidentsSchema = z.object({
  status: PredictiveIncidentStatusEnum.optional(),
  type: PredictiveIncidentTypeEnum.optional(),
  roomId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const EvaluatePredictiveIncidentsSchema = z.object({
  homeId: z.string().optional(),
  referenceTime: z.string().datetime().optional(),
});

export const DismissPredictiveIncidentSchema = z.object({
  reason: z.string().optional(),
});
