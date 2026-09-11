export interface LatencyDistribution {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  count: number;
}

export interface MetricSnapshot {
  timestamp: string;
  latencies: {
    ingestion: LatencyDistribution;
    incidentDetection: LatencyDistribution;
    predictionGeneration: LatencyDistribution;
    automationDecision: LatencyDistribution;
    commandAck: LatencyDistribution;
    verification: LatencyDistribution;
  };
  throughputs: {
    telemetryPerSec: number;
    commandsPerMin: number;
  };
  counters: {
    totalIngestedReadings: number;
    validationFailures: number;
    duplicateRejections: number;
    anomaliesDetected: number;
    incidentsDetected: number;
    incidentsPredicted: number;
    commandsDispatched: number;
    commandsAcknowledged: number;
    commandsTimedOut: number;
    commandsRejected: number;
    verificationsEffective: number;
    verificationsIneffective: number;
    verificationsInconclusive: number;
  };
}

const MAX_SAMPLES = 500;

export class MetricsService {
  private static instance: MetricsService | null = null;

  // Latency ring buffers
  private ingestionLatencies: number[] = [];
  private incidentDetectionLatencies: number[] = [];
  private predictionLatencies: number[] = [];
  private automationDecisionLatencies: number[] = [];
  private commandAckLatencies: number[] = [];
  private verificationLatencies: number[] = [];

  // Throughput sliding windows (timestamps in ms)
  private telemetryTimestamps: { time: number; count: number }[] = [];
  private commandTimestamps: number[] = [];

  // Cumulative counters
  private counters = {
    totalIngestedReadings: 0,
    validationFailures: 0,
    duplicateRejections: 0,
    anomaliesDetected: 0,
    incidentsDetected: 0,
    incidentsPredicted: 0,
    commandsDispatched: 0,
    commandsAcknowledged: 0,
    commandsTimedOut: 0,
    commandsRejected: 0,
    verificationsEffective: 0,
    verificationsIneffective: 0,
    verificationsInconclusive: 0,
  };

  private constructor() {}

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  // --- Record Latencies ---
  public recordIngestionLatency(ms: number) {
    this.addSample(this.ingestionLatencies, ms);
  }

  public recordIncidentDetectionLatency(ms: number) {
    this.addSample(this.incidentDetectionLatencies, ms);
  }

  public recordPredictionLatency(ms: number) {
    this.addSample(this.predictionLatencies, ms);
  }

  public recordAutomationDecisionLatency(ms: number) {
    this.addSample(this.automationDecisionLatencies, ms);
  }

  public recordCommandAckLatency(ms: number) {
    this.addSample(this.commandAckLatencies, ms);
  }

  public recordVerificationLatency(ms: number) {
    this.addSample(this.verificationLatencies, ms);
  }

  // --- Record Throughput & Events ---
  public recordIngestedReadings(count: number) {
    this.counters.totalIngestedReadings += count;
    this.telemetryTimestamps.push({ time: Date.now(), count });
    this.pruneTelemetryTimestamps();
  }

  public recordValidationFailure() {
    this.counters.validationFailures++;
  }

  public recordDuplicateRejection(count: number = 1) {
    this.counters.duplicateRejections += count;
  }

  public recordAnomalyDetected() {
    this.counters.anomaliesDetected++;
  }

  public recordIncidentDetected() {
    this.counters.incidentsDetected++;
  }

  public recordIncidentPredicted() {
    this.counters.incidentsPredicted++;
  }

  public recordCommandDispatched() {
    this.counters.commandsDispatched++;
    this.commandTimestamps.push(Date.now());
    this.pruneCommandTimestamps();
  }

  public recordCommandAcknowledged() {
    this.counters.commandsAcknowledged++;
  }

  public recordCommandTimedOut() {
    this.counters.commandsTimedOut++;
  }

  public recordCommandRejected() {
    this.counters.commandsRejected++;
  }

  public recordVerificationOutcome(outcome: 'VERIFIED_EFFECTIVE' | 'VERIFIED_INEFFECTIVE' | 'INCONCLUSIVE') {
    if (outcome === 'VERIFIED_EFFECTIVE') this.counters.verificationsEffective++;
    else if (outcome === 'VERIFIED_INEFFECTIVE') this.counters.verificationsIneffective++;
    else this.counters.verificationsInconclusive++;
  }

  // --- Computations ---
  private addSample(buffer: number[], value: number) {
    if (buffer.length >= MAX_SAMPLES) {
      buffer.shift();
    }
    buffer.push(Math.max(0, value));
  }

  public calculateDistribution(buffer: number[]): LatencyDistribution {
    if (buffer.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, count: 0 };
    }

    const sorted = [...buffer].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    const getP = (p: number) => {
      const idx = Math.min(count - 1, Math.floor(count * p));
      return Number(sorted[idx].toFixed(2));
    };

    return {
      p50: getP(0.5),
      p95: getP(0.95),
      p99: getP(0.99),
      mean: Number((sum / count).toFixed(2)),
      count,
    };
  }

  private pruneTelemetryTimestamps() {
    const cutoff = Date.now() - 60000;
    this.telemetryTimestamps = this.telemetryTimestamps.filter((t) => t.time >= cutoff);
  }

  private pruneCommandTimestamps() {
    const cutoff = Date.now() - 60000;
    this.commandTimestamps = this.commandTimestamps.filter((t) => t >= cutoff);
  }

  public getSnapshot(): MetricSnapshot {
    this.pruneTelemetryTimestamps();
    this.pruneCommandTimestamps();

    const telemetryCount60s = this.telemetryTimestamps.reduce((sum, item) => sum + item.count, 0);
    const telemetryPerSec = Number((telemetryCount60s / 60).toFixed(2));
    const commandsPerMin = this.commandTimestamps.length;

    return {
      timestamp: new Date().toISOString(),
      latencies: {
        ingestion: this.calculateDistribution(this.ingestionLatencies),
        incidentDetection: this.calculateDistribution(this.incidentDetectionLatencies),
        predictionGeneration: this.calculateDistribution(this.predictionLatencies),
        automationDecision: this.calculateDistribution(this.automationDecisionLatencies),
        commandAck: this.calculateDistribution(this.commandAckLatencies),
        verification: this.calculateDistribution(this.verificationLatencies),
      },
      throughputs: {
        telemetryPerSec,
        commandsPerMin,
      },
      counters: { ...this.counters },
    };
  }

  public reset() {
    this.ingestionLatencies = [];
    this.incidentDetectionLatencies = [];
    this.predictionLatencies = [];
    this.automationDecisionLatencies = [];
    this.commandAckLatencies = [];
    this.verificationLatencies = [];
    this.telemetryTimestamps = [];
    this.commandTimestamps = [];
    this.counters = {
      totalIngestedReadings: 0,
      validationFailures: 0,
      duplicateRejections: 0,
      anomaliesDetected: 0,
      incidentsDetected: 0,
      incidentsPredicted: 0,
      commandsDispatched: 0,
      commandsAcknowledged: 0,
      commandsTimedOut: 0,
      commandsRejected: 0,
      verificationsEffective: 0,
      verificationsIneffective: 0,
      verificationsInconclusive: 0,
    };
  }
}

export const metricsService = MetricsService.getInstance();
