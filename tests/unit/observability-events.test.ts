import { describe, it, expect } from 'vitest';
import { sanitizeMetadata } from '@/server/observability/events';
import {
  SystemEventInputSchema,
  EventQueryFilterSchema,
  SystemEventCategoryEnum,
} from '@/domain/observability.schema';

describe('Phase 8: Observability Events & Sanitization Unit Tests', () => {
  it('sanitizes passwords, secrets, tokens, and apiKeys from metadata', () => {
    const rawMetadata = {
      sensorType: 'TEMPERATURE',
      readingValue: 24.5,
      authToken: 'secret_token_12345',
      userPassword: 'plaintext_password',
      config: {
        apiKey: 'sk-live-abcdef',
        retryCount: 3,
        privateKeyHash: 'abc123def456',
      },
    };

    const sanitized = sanitizeMetadata(rawMetadata);

    expect(sanitized).toBeDefined();
    expect(sanitized?.sensorType).toBe('TEMPERATURE');
    expect(sanitized?.readingValue).toBe(24.5);
    expect(sanitized?.authToken).toBe('[REDACTED]');
    expect(sanitized?.userPassword).toBe('[REDACTED]');
    expect(sanitized?.config?.apiKey).toBe('[REDACTED]');
    expect(sanitized?.config?.privateKeyHash).toBe('[REDACTED]');
    expect(sanitized?.config?.retryCount).toBe(3);
  });

  it('handles null, undefined, or primitive metadata gracefully', () => {
    expect(sanitizeMetadata(null)).toBeNull();
    expect(sanitizeMetadata(undefined)).toBeNull();
    expect(sanitizeMetadata('string' as any)).toBeNull();
  });

  it('validates correct SystemEventInput payload using Zod schema', () => {
    const valid = {
      homeId: 'home-123',
      category: 'AUTOMATION',
      eventType: 'COMMAND_DISPATCHED',
      severity: 'INFO',
      source: 'COMMAND_DISPATCHER',
      entityType: 'COMMAND',
      entityId: 'cmd-999',
      summary: 'Turned on ventilation fan',
      metadata: { target: 'FAN' },
      correlationId: 'corr-xyz-123',
    };

    const parsed = SystemEventInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid categories and missing required fields in SystemEventInput', () => {
    const invalidCategory = {
      homeId: 'home-123',
      category: 'INVALID_CATEGORY',
      eventType: 'TEST_EVENT',
      source: 'TEST',
      entityType: 'TEST',
      summary: 'Test summary',
    };

    const parsed = SystemEventInputSchema.safeParse(invalidCategory);
    expect(parsed.success).toBe(false);
  });

  it('validates and coerces EventQueryFilter query parameters', () => {
    const filterParams = {
      limit: '25',
      offset: '50',
      category: 'INCIDENT',
      severity: 'WARNING',
      startDate: '2026-09-10T00:00:00.000Z',
    };

    const parsed = EventQueryFilterSchema.parse(filterParams);
    expect(parsed.limit).toBe(25);
    expect(parsed.offset).toBe(50);
    expect(parsed.category).toBe('INCIDENT');
    expect(parsed.severity).toBe('WARNING');
    expect(parsed.startDate).toBeInstanceOf(Date);
  });

  it('clamps EventQueryFilter limit between 1 and 200', () => {
    const exceedsMax = { limit: '500' };
    expect(() => EventQueryFilterSchema.parse(exceedsMax)).toThrow();

    const belowMin = { limit: '0' };
    expect(() => EventQueryFilterSchema.parse(belowMin)).toThrow();
  });
});
