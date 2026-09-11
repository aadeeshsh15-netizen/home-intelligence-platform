import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../src/lib/db';
import { SystemHealthService } from '../../src/server/observability/health';
import { GET as getReady } from '../../src/app/api/ready/route';
import { mqttGateway } from '../../src/server/iot/mqtt-gateway';
import { processTelemetryIngest } from '../../src/server/telemetry/pipeline';

describe('Phase 9: Operational Resilience & Dependency Failure Integration Tests', () => {
  it('gracefully degrades and reports CRITICAL status when PostgreSQL becomes unavailable', async () => {
    const originalQueryRaw = prisma.$queryRaw;
    // Simulate database failure
    prisma.$queryRaw = vi.fn().mockRejectedValue(new Error('FATAL: connection to server lost'));

    try {
      const health = await SystemHealthService.evaluateHealth();
      expect(health.status).toBe('CRITICAL');

      const dbCheck = health.subsystems.database;
      expect(dbCheck?.status).toBe('CRITICAL');
      expect(dbCheck?.message).toContain('Database unreachable');

      // Readiness probe must return 503 rather than crashing the node process
      const readyRes = await getReady();
      expect(readyRes.status).toBe(503);
    } finally {
      prisma.$queryRaw = originalQueryRaw;
    }
  });

  it('reports DEGRADED health when MQTT broker is offline while keeping HTTP telemetry operational', async () => {
    // Force MQTT gateway to disconnected state
    const originalIsConnected = mqttGateway.isGatewayConnected;
    (mqttGateway as any).isConnected = false;

    try {
      const health = await SystemHealthService.evaluateHealth();
      const mqttCheck = health.subsystems.mqtt_gateway;
      expect(mqttCheck?.status).toBe('DEGRADED');

      // Ingesting HTTP telemetry must still succeed despite MQTT disconnection
      const sensor = await prisma.sensor.findFirst({
        where: { type: 'TEMPERATURE' },
      });

      if (sensor) {
        const summary = await processTelemetryIngest({
          producerId: 'resilience-test-http',
          readings: [
            {
              sensorId: sensor.id,
              value: 21.5,
              timestamp: new Date().toISOString(),
              quality: 'VALID',
            },
          ],
        });

        expect(summary.processedCount).toBe(1);
        expect(summary.rejectedCount).toBe(0);
      }
    } finally {
      (mqttGateway as any).isConnected = originalIsConnected.bind(mqttGateway)();
    }
  });
});
