import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { recordSystemEvent, querySystemEvents } from '@/server/observability/events';
import { metricsService } from '@/server/observability/metrics';
import { processTelemetryIngest } from '@/server/telemetry/pipeline';
import { SeverityLevel } from '@prisma/client';

describe('Phase 8: Observability Pipeline Integration Tests', () => {
  let home: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');
  });

  afterAll(async () => {
    // Cleanup created test system events
    await prisma.systemEvent.deleteMany({
      where: { homeId: home.id, source: 'TEST_OBSERVABILITY' },
    });
  });

  it('records structured SystemEvent to PostgreSQL and retrieves it via timeline query', async () => {
    const testCorrelationId = `corr_test_${Date.now()}`;

    const created = await recordSystemEvent({
      homeId: home.id,
      category: 'AUTOMATION',
      eventType: 'TEST_DISPATCH',
      severity: 'INFO',
      source: 'TEST_OBSERVABILITY',
      entityType: 'COMMAND',
      entityId: 'cmd_test_1',
      summary: 'Test command dispatched for observability verification',
      metadata: { action: 'TURN_ON', testRun: true },
      correlationId: testCorrelationId,
    });

    expect(created).toBeDefined();
    expect(created?.id).toBeDefined();
    expect(created?.category).toBe('AUTOMATION');
    expect(created?.correlationId).toBe(testCorrelationId);

    // Query timeline with correlationId filter
    const timeline = await querySystemEvents({
      homeId: home.id,
      correlationId: testCorrelationId,
      limit: 10,
      offset: 0,
    });

    expect(timeline.totalCount).toBeGreaterThanOrEqual(1);
    expect(timeline.events.length).toBeGreaterThanOrEqual(1);
    expect(timeline.events[0].correlationId).toBe(testCorrelationId);
    expect(timeline.events[0].summary).toContain('Test command dispatched');
  });

  it('filters timeline by category, severity, and search term', async () => {
    const uniqueTerm = `SearchTerm_${Date.now()}`;

    await recordSystemEvent({
      homeId: home.id,
      category: 'SECURITY',
      eventType: 'AUTH_FAILED',
      severity: 'WARNING',
      source: 'TEST_OBSERVABILITY',
      entityType: 'DEVICE',
      summary: `Unauthorized access attempt ${uniqueTerm}`,
      metadata: { ip: '192.168.1.100' },
    });

    const filtered = await querySystemEvents({
      homeId: home.id,
      category: 'SECURITY',
      severity: 'WARNING',
      search: uniqueTerm,
    });

    expect(filtered.totalCount).toBe(1);
    expect(filtered.events[0].summary).toContain(uniqueTerm);
    expect(filtered.events[0].category).toBe('SECURITY');
    expect(filtered.events[0].severity).toBe(SeverityLevel.WARNING);
  });

  it('records validation failure event and metrics when ingesting out-of-bounds telemetry', async () => {
    const sensor = await prisma.sensor.findFirst({
      where: { room: { floor: { homeId: home.id } }, type: 'TEMPERATURE' },
    });
    if (!sensor) return;

    const initialFailures = metricsService.getSnapshot().counters.validationFailures;

    // Ingest physically impossible temperature (150°C exceeds bounds)
    const summary = await processTelemetryIngest({
      producerId: 'test-observability-producer',
      readings: [
        {
          sensorId: sensor.id,
          value: 150.0,
          unit: '°C',
          timestamp: new Date().toISOString(),
          quality: 'VALID',
        },
      ],
    });

    expect(summary.rejectedCount).toBe(1);
    const updatedFailures = metricsService.getSnapshot().counters.validationFailures;
    expect(updatedFailures).toBe(initialFailures + 1);

    // Verify SystemEvent was persisted for the validation failure
    const events = await querySystemEvents({
      homeId: home.id,
      category: 'TELEMETRY',
      entityId: sensor.id,
      limit: 5,
    });

    const failureEvent = events.events.find((e) => e.eventType === 'VALIDATION_FAILED');
    expect(failureEvent).toBeDefined();
    expect(failureEvent?.severity).toBe(SeverityLevel.WARNING);
  });
});
