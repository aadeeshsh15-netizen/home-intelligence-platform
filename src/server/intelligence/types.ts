/**
 * Intelligence Architecture Types & Abstraction Interfaces.
 * Enforces explicit separation between:
 * 1. DETERMINISTIC_RULE (static threshold comparisons)
 * 2. STATISTICAL_BASELINE (parametric Gaussian baselines, Z-scores, linear drift)
 * 3. MACHINE_LEARNING_FORECAST (future time-series predictive models, isolation forests, etc.)
 */

export type IntelligenceParadigm =
  | 'DETERMINISTIC_RULE'
  | 'STATISTICAL_BASELINE'
  | 'MACHINE_LEARNING_FORECAST';

export interface AnomalyDetectionRequest {
  sensorId: string;
  sensorType: string;
  unit: string;
  roomName: string;
  value: number;
  timestamp: Date;
  recentWindow?: { timestamp: Date; value: number }[];
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  detectorId: string;
  paradigm: IntelligenceParadigm;
  score: number; // e.g. Z-Score or Anomaly Probability
  title: string;
  summary: string;
  explanation: string;
  confidence: number; // 0.00 to 1.00
  isHeuristic: boolean;
  evidenceData: Record<string, any>;
}

export interface IAnomalyDetector {
  readonly id: string;
  readonly name: string;
  readonly paradigm: IntelligenceParadigm;
  evaluate(request: AnomalyDetectionRequest): Promise<AnomalyDetectionResult | null>;
}
