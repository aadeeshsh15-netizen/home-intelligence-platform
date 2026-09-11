import { SensorType, SeverityLevel, IncidentStatus, IncidentType } from '@prisma/client';
import { ContributingSensorEvidence } from '@/domain/types';

export type { ContributingSensorEvidence };

export interface CorrelationSignalCondition {
  name: string;
  sensorType: SensorType;
  scope: 'SAME_ROOM' | 'CROSS_ROOM' | 'HOUSEHOLD';
  condition:
    | 'Z_SCORE_GT'
    | 'Z_SCORE_LT'
    | 'VALUE_GT'
    | 'VALUE_LT'
    | 'VALUE_EQ'
    | 'RATE_OF_CHANGE_GT'
    | 'RATE_OF_CHANGE_LT';
  threshold: number;
  weight: number;    // Relative weight of this signal [0.0 - 1.0]
  required: boolean; // Must be satisfied for the incident candidate to form
  description: string;
}

export interface CorrelationRule {
  id: string;
  incidentType: IncidentType;
  name: string;
  description: string;
  severity: SeverityLevel;
  correlationWindowSeconds: number;
  minimumConfidenceThreshold: number;
  signals: CorrelationSignalCondition[];
  evaluateContext(context: {
    room: { id: string; name: string; roomType?: string };
    signalsSatisfied: ContributingSensorEvidence[];
    allEvidence: ContributingSensorEvidence[];
    allSignals?: any;
    windowSeconds: number;
  }): {
    title: string;
    summary: string;
    explanation: string;
  };
}

export interface IncidentCandidate {
  homeId: string;
  roomId: string | null;
  roomName?: string;
  incidentType: IncidentType;
  severity: SeverityLevel;
  confidence: number;
  correlationWindowMs?: number;
  startedAt?: Date;
  detectedAt?: Date;
  firstDetectedAt?: Date;
  lastEvidenceAt?: Date;
  ruleId?: string;
  auditPayload?: Record<string, any>;
  title: string;
  summary: string;
  explanation: string;
  evidence: ContributingSensorEvidence[];
}

export interface IncidentResolutionCheck {
  incidentId: string;
  resolved: boolean;
  resolvedAt?: Date;
  reason?: string;
}
