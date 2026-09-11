import {
  ActuatorAction,
  ActuatorType,
  AutomationMode,
  AutomationStatus,
  CommandStatus,
  PredictiveIncidentType,
  PredictionTarget,
  VerificationStatus,
} from '@prisma/client';

export interface SafetyCheckResult {
  passed: boolean;
  modeCheck: {
    mode: AutomationMode;
    allowed: boolean;
    reason?: string;
  };
  cooldownCheck: {
    passed: boolean;
    remainingCooldownSec: number;
  };
  deviceCheck: {
    deviceId: string;
    isOnline: boolean;
    isActuator: boolean;
    actuatorType?: ActuatorType | null;
    compatible: boolean;
    reason?: string;
  };
  rateLimitCheck: {
    passed: boolean;
    activeCommandsCount: number;
  };
  rejectionReason?: string;
}

export interface CandidateAction {
  policyId: string;
  policyName: string;
  predictiveIncidentId?: string;
  homeId: string;
  roomId?: string;
  targetDeviceType: string;
  action: ActuatorAction;
  parameters?: Record<string, any>;
  triggerReason: string;
  triggerEvidence: {
    predictiveIncidentType: PredictiveIncidentType;
    targetMetric: PredictionTarget;
    currentValue: number;
    predictedValue: number;
    thresholdValue: number;
    probability: number;
    confidence: number;
    horizonMinutes: number;
    occupancyConfirmed: boolean;
    modelName: string;
  };
  expectedOutcome: string;
  baselineMetricValue: number;
  targetMetricValue: number;
}

export interface DecisionResult {
  approved: boolean;
  candidateAction: CandidateAction;
  safetyCheck: SafetyCheckResult;
  selectedDeviceId?: string;
  commandId?: string;
  explanation: string;
  rejectionReason?: string;
}

export interface VerificationEvaluation {
  executionId: string;
  status: VerificationStatus;
  baselineValue: number;
  targetValue: number;
  observedValue: number;
  delta: number;
  isEffective: boolean;
  verificationLatencyMs: number;
  summary: string;
}
