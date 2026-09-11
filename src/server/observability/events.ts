import { prisma } from '@/lib/db';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';
import {
  SystemEventInput,
  SystemEventInputSchema,
  EventQueryFilter,
  EventQueryFilterSchema,
} from '@/domain/observability.schema';
import { SeverityLevel, SystemEventCategory } from '@prisma/client';

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /apikey/i,
  /privatekey/i,
  /hash/i,
];

/**
 * Sanitizes metadata to ensure zero sensitive credentials or hashes leak into the audit event timeline.
 */
export function sanitizeMetadata(metadata?: Record<string, any> | null): Record<string, any> | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Records a structured SystemEvent in PostgreSQL, broadcasts to SSE bus, and outputs to structured logger.
 */
export async function recordSystemEvent(input: SystemEventInput) {
  const parsed = SystemEventInputSchema.parse(input);
  const cleanMetadata = sanitizeMetadata(parsed.metadata);

  try {
    const event = await prisma.systemEvent.create({
      data: {
        homeId: parsed.homeId,
        category: parsed.category as SystemEventCategory,
        eventType: parsed.eventType,
        severity: parsed.severity as SeverityLevel,
        source: parsed.source,
        entityType: parsed.entityType,
        entityId: parsed.entityId || null,
        summary: parsed.summary,
        metadata: cleanMetadata as any,
        correlationId: parsed.correlationId || null,
        timestamp: parsed.timestamp || new Date(),
      },
    });

    // Broadcast in-process for SSE / real-time dashboard updates
    systemEventsBus.emit('system_event', event);

    return event;
  } catch (error) {
    logger.error('Failed to record system event', {
      error: error instanceof Error ? error.message : String(error),
      eventType: parsed.eventType,
      source: parsed.source,
      module: 'observability-events',
    });
    return null;
  }
}

/**
 * Queries the historical system event timeline with multi-attribute filtering, windowing, and pagination.
 */
export async function querySystemEvents(filter: EventQueryFilter) {
  const parsed = EventQueryFilterSchema.parse(filter);

  const where: any = {};

  if (parsed.homeId) where.homeId = parsed.homeId;
  if (parsed.category) where.category = parsed.category;
  if (parsed.severity) where.severity = parsed.severity;
  if (parsed.entityType) where.entityType = parsed.entityType;
  if (parsed.entityId) where.entityId = parsed.entityId;
  if (parsed.correlationId) where.correlationId = parsed.correlationId;

  if (parsed.startDate || parsed.endDate) {
    where.timestamp = {};
    if (parsed.startDate) where.timestamp.gte = parsed.startDate;
    if (parsed.endDate) where.timestamp.lte = parsed.endDate;
  }

  if (parsed.search && parsed.search.trim().length > 0) {
    const term = parsed.search.trim();
    where.OR = [
      { summary: { contains: term, mode: 'insensitive' } },
      { eventType: { contains: term, mode: 'insensitive' } },
      { source: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [events, totalCount] = await Promise.all([
    prisma.systemEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: parsed.limit,
      skip: parsed.offset,
    }),
    prisma.systemEvent.count({ where }),
  ]);

  return {
    events,
    totalCount,
    limit: parsed.limit,
    offset: parsed.offset,
    hasMore: parsed.offset + events.length < totalCount,
  };
}
