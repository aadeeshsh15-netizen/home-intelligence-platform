import { z } from 'zod';

export const SystemEventCategoryEnum = [
  'TELEMETRY',
  'ANOMALY',
  'INCIDENT',
  'PREDICTION',
  'AUTOMATION',
  'COMMAND',
  'SECURITY',
  'SYSTEM',
] as const;

export const SeverityLevelEnum = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

export const HealthStatusEnum = ['HEALTHY', 'DEGRADED', 'CRITICAL'] as const;

export type SystemEventCategoryType = (typeof SystemEventCategoryEnum)[number];
export type SeverityLevelType = (typeof SeverityLevelEnum)[number];
export type HealthStatusType = (typeof HealthStatusEnum)[number];

export const SystemEventInputSchema = z.object({
  homeId: z.string().min(1),
  category: z.enum(SystemEventCategoryEnum),
  eventType: z.string().min(1),
  severity: z.enum(SeverityLevelEnum).default('INFO'),
  source: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().nullable().optional(),
  summary: z.string().min(1),
  metadata: z.record(z.any()).nullable().optional(),
  correlationId: z.string().nullable().optional(),
  timestamp: z.date().optional(),
});

export type SystemEventInput = z.infer<typeof SystemEventInputSchema>;

export const EventQueryFilterSchema = z.object({
  homeId: z.string().optional(),
  category: z.enum(SystemEventCategoryEnum).optional(),
  severity: z.enum(SeverityLevelEnum).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  correlationId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type EventQueryFilter = z.input<typeof EventQueryFilterSchema>;
export type EventQueryFilterOutput = z.output<typeof EventQueryFilterSchema>;

export const SubsystemHealthCheckSchema = z.object({
  name: z.string(),
  status: z.enum(HealthStatusEnum),
  latencyMs: z.number().optional(),
  message: z.string(),
  details: z.record(z.any()).optional(),
});

export type SubsystemHealthCheck = z.infer<typeof SubsystemHealthCheckSchema>;

export const SystemHealthReportSchema = z.object({
  status: z.enum(HealthStatusEnum),
  timestamp: z.string(),
  subsystems: z.record(SubsystemHealthCheckSchema),
  fleet: z.object({
    totalDevices: z.number(),
    onlineCount: z.number(),
    staleCount: z.number(),
    offlineCount: z.number(),
  }),
  metrics: z.object({
    lastTelemetryTimestamp: z.string().nullable(),
    eventProcessingLatencyMs: z.number(),
    commandSuccessRate: z.number(),
    activeIncidentsCount: z.number(),
    predictedIncidentsCount: z.number(),
  }),
});

export type SystemHealthReport = z.infer<typeof SystemHealthReportSchema>;
