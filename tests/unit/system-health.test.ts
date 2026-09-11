import { describe, it, expect } from 'vitest';
import { SystemHealthService } from '@/server/observability/health';
import { HealthStatusEnum } from '@/domain/observability.schema';

describe('Phase 8: SystemHealthService Unit & Contract Tests', () => {
  it('evaluates system health returning deterministic structure and valid health enums', async () => {
    const report = await SystemHealthService.evaluateHealth();

    expect(HealthStatusEnum).toContain(report.status);
    expect(report.timestamp).toBeDefined();

    // Check Subsystems
    const subsystems = report.subsystems;
    expect(subsystems.database).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.database.status);

    expect(subsystems.mqtt_gateway).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.mqtt_gateway.status);

    expect(subsystems.ingestion_pipeline).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.ingestion_pipeline.status);

    expect(subsystems.simulator_engine).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.simulator_engine.status);

    expect(subsystems.intelligence_engine).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.intelligence_engine.status);

    expect(subsystems.automation_engine).toBeDefined();
    expect(HealthStatusEnum).toContain(subsystems.automation_engine.status);

    // Check Fleet Counts
    expect(report.fleet.totalDevices).toBeGreaterThanOrEqual(0);
    expect(report.fleet.onlineCount).toBeGreaterThanOrEqual(0);
    expect(report.fleet.staleCount).toBeGreaterThanOrEqual(0);
    expect(report.fleet.offlineCount).toBeGreaterThanOrEqual(0);

    // Check Metrics
    expect(report.metrics.commandSuccessRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.commandSuccessRate).toBeLessThanOrEqual(1);
    expect(report.metrics.eventProcessingLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
