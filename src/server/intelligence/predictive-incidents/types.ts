import {
  PredictiveIncidentType,
  PredictionTarget,
  SeverityLevel,
  SensorType,
  ModelType,
} from '@/domain/types';

export interface PredictiveSensorEvidence {
  sensorId: string;
  sensorType: SensorType;
  roomName?: string;
  role: 'PRIMARY_TARGET' | 'CORROBORATING_CONTEXT' | 'HVAC_ACTUATOR';
  observedValue: number;
  unit: string;
  weight: number;
  satisfied: boolean;
  explanation: string;
}

export interface PredictiveIncidentRuleContext {
  homeId: string;
  roomId?: string | null;
  roomName?: string;
  currentTimestamp: Date;
}

export interface PredictiveCandidate {
  homeId: string;
  roomId?: string | null;
  roomName?: string;
  type: PredictiveIncidentType;
  target: PredictionTarget;
  severity: SeverityLevel;
  title: string;
  summary: string;
  explanation: string;
  probability: number;      // Derived crossing probability [0.0 - 1.0]
  confidence: number;       // Multimodal corroboration confidence [0.0 - 1.0]
  horizonMinutes: number;
  currentValue: number;
  predictedValue: number;
  thresholdValue: number;
  baselineValue: number;
  confidenceInterval80?: { lower: number; upper: number } | null;
  confidenceInterval95?: { lower: number; upper: number } | null;
  modelType: ModelType;
  modelName: string;
  expectedCrossingTime: Date | null;
  predictedLeadTimeMin: number | null;
  contributingEvidence: PredictiveSensorEvidence[];
}

export interface PredictiveIncidentRule {
  id: string;
  type: PredictiveIncidentType;
  target: PredictionTarget;
  name: string;
  description: string;
  severity: SeverityLevel;
  defaultHorizonMinutes: number;
  evaluate(context: PredictiveIncidentRuleContext): Promise<PredictiveCandidate | null>;
}
