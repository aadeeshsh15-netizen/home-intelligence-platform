import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from '@/server/observability/metrics';

describe('Phase 8: MetricsService Unit Tests', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = MetricsService.getInstance();
    metrics.reset();
  });

  it('calculates exact percentiles and mean for empty and populated distributions', () => {
    const emptyDist = metrics.calculateDistribution([]);
    expect(emptyDist).toEqual({ p50: 0, p95: 0, p99: 0, mean: 0, count: 0 });

    // Populate 100 deterministic values: 1 to 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const dist = metrics.calculateDistribution(values);

    expect(dist.count).toBe(100);
    expect(dist.mean).toBe(50.5);
    expect(dist.p50).toBe(51);
    expect(dist.p95).toBe(96);
    expect(dist.p99).toBe(100);
  });

  it('tracks latency samples across all pipeline stages', () => {
    metrics.recordIngestionLatency(15);
    metrics.recordIngestionLatency(25);
    metrics.recordIncidentDetectionLatency(10);
    metrics.recordPredictionLatency(40);
    metrics.recordAutomationDecisionLatency(5);
    metrics.recordCommandAckLatency(120);
    metrics.recordVerificationLatency(300);

    const snapshot = metrics.getSnapshot();

    expect(snapshot.latencies.ingestion.count).toBe(2);
    expect(snapshot.latencies.ingestion.mean).toBe(20);
    expect(snapshot.latencies.incidentDetection.mean).toBe(10);
    expect(snapshot.latencies.predictionGeneration.mean).toBe(40);
    expect(snapshot.latencies.automationDecision.mean).toBe(5);
    expect(snapshot.latencies.commandAck.mean).toBe(120);
    expect(snapshot.latencies.verification.mean).toBe(300);
  });

  it('calculates rolling 60-second telemetry and command throughputs', () => {
    metrics.recordIngestedReadings(120);
    metrics.recordCommandDispatched();
    metrics.recordCommandDispatched();

    const snapshot = metrics.getSnapshot();

    // 120 readings / 60s = 2 readings/sec
    expect(snapshot.throughputs.telemetryPerSec).toBe(2);
    // 2 commands in last 60s = 2 commands/min
    expect(snapshot.throughputs.commandsPerMin).toBe(2);
  });

  it('increments error, rejection, and verification outcome counters', () => {
    metrics.recordValidationFailure();
    metrics.recordValidationFailure();
    metrics.recordDuplicateRejection(5);
    metrics.recordAnomalyDetected();
    metrics.recordIncidentDetected();
    metrics.recordIncidentPredicted();
    metrics.recordCommandRejected();
    metrics.recordCommandTimedOut();
    metrics.recordVerificationOutcome('VERIFIED_EFFECTIVE');
    metrics.recordVerificationOutcome('VERIFIED_INEFFECTIVE');
    metrics.recordVerificationOutcome('INCONCLUSIVE');

    const snapshot = metrics.getSnapshot();

    expect(snapshot.counters.validationFailures).toBe(2);
    expect(snapshot.counters.duplicateRejections).toBe(5);
    expect(snapshot.counters.anomaliesDetected).toBe(1);
    expect(snapshot.counters.incidentsDetected).toBe(1);
    expect(snapshot.counters.incidentsPredicted).toBe(1);
    expect(snapshot.counters.commandsRejected).toBe(1);
    expect(snapshot.counters.commandsTimedOut).toBe(1);
    expect(snapshot.counters.verificationsEffective).toBe(1);
    expect(snapshot.counters.verificationsIneffective).toBe(1);
    expect(snapshot.counters.verificationsInconclusive).toBe(1);
  });

  it('resets all buffers and counters cleanly', () => {
    metrics.recordIngestionLatency(50);
    metrics.recordValidationFailure();
    metrics.reset();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.latencies.ingestion.count).toBe(0);
    expect(snapshot.counters.validationFailures).toBe(0);
  });
});
