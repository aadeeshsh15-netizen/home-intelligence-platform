import {
  SensorType,
  SensorHealth,
  DeviceStatus,
  DeviceProtocol,
  SeverityLevel,
  EventStatus,
  InsightType,
  IncidentStatus,
  IncidentType,
  PredictionTarget,
  ModelType,
  PredictiveIncidentStatus,
  PredictionOutcome,
  PredictiveIncidentType,
  ProvisioningStatus,
  AutomationMode,
  AutomationStatus,
  CommandStatus,
  VerificationStatus,
  ActuatorType,
  ActuatorAction,
} from '@prisma/client';

export type {
  SensorType,
  SensorHealth,
  DeviceStatus,
  DeviceProtocol,
  SeverityLevel,
  EventStatus,
  InsightType,
  IncidentStatus,
  IncidentType,
  PredictionTarget,
  ModelType,
  PredictiveIncidentStatus,
  PredictionOutcome,
  PredictiveIncidentType,
  ProvisioningStatus,
  AutomationMode,
  AutomationStatus,
  CommandStatus,
  VerificationStatus,
  ActuatorType,
  ActuatorAction,
};

export interface RoomWithSensors {
  id: string;
  floorId: string;
  name: string;
  roomType: string;
  targetTemp: number | null;
  layoutX: number;
  layoutY: number;
  layoutW: number;
  layoutH: number;
  devices: DeviceSummary[];
  sensors: SensorSummary[];
  metrics: {
    temperature?: number;
    humidity?: number;
    co2?: number;
    power?: number;
    occupancy?: boolean;
    noise?: number;
    pm2_5?: number;
  };
  activeAlertCount: number;
}

export interface DeviceSummary {
  id: string;
  roomId: string;
  name: string;
  deviceType: string;
  protocol: DeviceProtocol;
  identifier: string;
  status: DeviceStatus;
  lastSeenAt: Date | string;
  firmwareVersion?: string | null;
}

export interface SensorSummary {
  id: string;
  roomId: string;
  deviceId?: string | null;
  type: SensorType;
  unit: string;
  samplingIntervalSec: number;
  lastReadingValue?: number | null;
  lastReadingTime?: Date | string | null;
  health: SensorHealth;
}

export interface HomeOverview {
  home: {
    id: string;
    name: string;
    timezone: string;
    totalFloors: number;
    totalRooms: number;
    totalDevices: number;
    totalSensors: number;
  };
  climate: {
    avgTemperature: number;
    avgHumidity: number;
    avgCO2: number;
    airQualityStatus: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR';
  };
  energy: {
    currentTotalWatts: number;
    todayKwh: number;
    peakWattsToday: number;
    baselineComparisonPercent: number;
  };
  occupancy: {
    isHomeOccupied: boolean;
    occupiedRoomsCount: number;
    occupiedRoomNames: string[];
  };
  fleetHealth: {
    totalDevices: number;
    onlineDevices: number;
    degradedDevices: number;
    offlineDevices: number;
    staleSensors: number;
  };
  activeAlertsCount: number;
}

export interface AnomalyExplanation {
  sensorId: string;
  sensorType: SensorType;
  roomName: string;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  deviationPercent: number;
  isHeuristic: boolean;
  timestamp: string;
  narrative: string;
}

export interface ContributingSensorEvidence {
  sensorId: string;
  sensorType: SensorType;
  roomName: string;
  signalType:
    | 'ANOMALY_ZSCORE'
    | 'THRESHOLD_BREACH'
    | 'STATE_MATCH'
    | 'RATE_OF_CHANGE'
    | 'INACTIVITY'
    | 'VALUE_GT'
    | 'VALUE_LT'
    | 'VALUE_EQ'
    | 'RATE_OF_CHANGE_GT'
    | 'RATE_OF_CHANGE_LT'
    | 'Z_SCORE_GT'
    | 'Z_SCORE_LT'
    | string;
  observedValue: number;
  unit: string;
  referenceValue?: number;
  deviationPercent?: number;
  zScore?: number;
  weight: number;
  satisfied: boolean;
  timestamp: string;
  explanation?: string;
}

export interface IncidentSummary {
  id: string;
  homeId: string;
  roomId?: string | null;
  roomName?: string | null;
  incidentType: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  title: string;
  summary: string;
  explanation: string;
  confidence: number;
  correlationWindowMs: number;
  startedAt: string;
  detectedAt: string;
  resolvedAt?: string | null;
  lastEvidenceAt: string;
  evidence: ContributingSensorEvidence[];
  createdAt: string;
  updatedAt: string;
}

export type ForecastHorizon = '15m' | '1h' | '4h' | '24h';

export interface PredictionPoint {
  timestamp: string;
  horizonMinutes: number;
  predicted: number;
  confidenceInterval80: {
    lower: number;
    upper: number;
  };
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
  standardError: number;
}

export interface PredictionResponse {
  target: PredictionTarget;
  roomId?: string | null;
  roomName?: string | null;
  unit: string;
  currentObserved: {
    value: number;
    timestamp: string;
  } | null;
  model: {
    id: string;
    name: string;
    type: ModelType;
    version: string;
  };
  dataQuality: {
    status: 'HEALTHY' | 'DEGRADED' | 'INSUFFICIENT_DATA';
    historicalHours: number;
    missingDataPercent: number;
  };
  forecast: PredictionPoint[];
  generatedAt: string;
}

export interface ModelMetadata {
  id: string;
  name: string;
  type: ModelType;
  version: string;
  target: PredictionTarget;
  hyperparameters: Record<string, any>;
  isActive: boolean;
  isDefault: boolean;
}

export interface HorizonEvaluationMetric {
  horizonMinutes: number;
  horizonLabel: string;
  mae: number;
  rmse: number;
  mape?: number;
  sampleCount: number;
}

export interface EvaluationReport {
  modelId: string;
  modelName: string;
  modelType: ModelType;
  target: PredictionTarget;
  overallMae: number;
  overallRmse: number;
  overallMape?: number;
  inferenceLatencyMs: number;
  evaluatedAt: string;
  horizonMetrics: HorizonEvaluationMetric[];
}

export interface PredictiveIncidentEntity {
  id: string;
  homeId: string;
  roomId: string | null;
  roomName?: string;
  type: PredictiveIncidentType;
  target: PredictionTarget;
  status: PredictiveIncidentStatus;
  outcome: PredictionOutcome;
  severity: SeverityLevel;
  title: string;
  summary: string;
  explanation: string;
  probability: number;
  confidence: number;
  horizonMinutes: number;
  currentValue: number;
  predictedValue: number;
  thresholdValue: number;
  baselineValue: number;
  confidenceInterval80?: { lower: number; upper: number } | null;
  confidenceInterval95?: { lower: number; upper: number } | null;
  modelType: ModelType;
  modelName: string;
  expectedCrossingTime: string | null;
  predictedLeadTimeMin: number | null;
  actualCrossingTime: string | null;
  actualLeadTimeMin: number | null;
  contributingEvidence: any;
  confirmedIncidentId: string | null;
  createdAt: string;
  updatedAt: string;
  evaluatedAt: string | null;
}

export interface PredictivePerformanceMetrics {
  totalWarnings: number;
  confirmedTruePositives: number;
  expiredFalsePositives: number;
  unresolvedPending: number;
  precisionPercent: number;
  falsePositiveRatePercent: number;
  averageLeadTimeMinutes: number;
  leadTimeBuckets: {
    bucket: string; // "0-15m", "15-30m", "30-60m", "60m+"
    count: number;
  }[];
}

export interface MqttTelemetryMetric {
  type: SensorType;
  value: number;
  unit?: string;
  sensorId?: string;
}

export interface MqttTelemetryPayload {
  timestamp: string | Date;
  seq?: number;
  metrics: MqttTelemetryMetric[];
}

export interface MqttStatusPayload {
  status: DeviceStatus;
  firmwareVersion?: string;
  ip?: string;
  mac?: string;
  uptimeSec?: number;
  rssi?: number;
  timestamp?: string | Date;
  reason?: string;
}

export interface DeviceProvisioningRequest {
  homeId: string;
  roomId: string;
  name: string;
  deviceType?: string;
  hardwareType?: string;
  macAddress?: string;
  sensorTypes: SensorType[];
}

export interface DeviceProvisioningResponse {
  device: {
    id: string;
    identifier: string;
    name: string;
    homeId: string;
    roomId: string;
    hardwareType: string;
    protocol: DeviceProtocol;
    provisioningStatus: ProvisioningStatus;
  };
  credentials: {
    topicPrefix: string;
    telemetryTopic: string;
    statusTopic: string;
    commandTopic: string;
    deviceId: string;
    authToken: string;
  };
  configSnippet: string;
}

export interface AutomationPolicySummary {
  id: string;
  homeId: string;
  name: string;
  description: string;
  mode: AutomationMode;
  triggerType: PredictiveIncidentType;
  targetMetric: PredictionTarget;
  minProbability: number;
  minConfidence: number;
  cooldownSec: number;
  maxRuntimeSec: number;
  targetDeviceType: string;
  action: ActuatorAction;
  parameters?: any;
  safetyChecks?: any;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
}

export interface DeviceCommandSummary {
  id: string;
  homeId: string;
  deviceId: string;
  commandId: string;
  action: ActuatorAction;
  parameters?: any;
  expectedState?: any;
  status: CommandStatus;
  source: string;
  issuedAt: string;
  expiresAt: string;
  acknowledgedAt?: string | null;
  completedAt?: string | null;
  retryCount: number;
  resultPayload?: any;
  errorMessage?: string | null;
}

export interface AutomationExecutionSummary {
  id: string;
  homeId: string;
  policyId: string;
  policyName?: string;
  predictiveIncidentId?: string | null;
  deviceId: string;
  deviceName?: string;
  commandId?: string | null;
  status: AutomationStatus;
  triggerReason: string;
  triggerEvidence: any;
  decisionExplanation: string;
  safetyEvaluation: any;
  actionTaken: ActuatorAction;
  expectedOutcome: string;
  observedOutcome?: string | null;
  baselineMetricValue: number;
  targetMetricValue: number;
  finalMetricValue?: number | null;
  metricDelta?: number | null;
  verificationStatus: VerificationStatus;
  commandLatencyMs?: number | null;
  verificationLatencyMs?: number | null;
  isEffective?: boolean | null;
  manualOverride: boolean;
  startedAt: string;
  verifiedAt?: string | null;
  completedAt?: string | null;
}

export interface ClosedLoopBenchmarkMetrics {
  totalDecisions: number;
  successfulInterventions: number;
  failedCommands: number;
  unnecessaryActions: number;
  falseActuationRate: number;
  interventionSuccessRate: number;
  avgCommandLatencyMs: number;
  avgVerificationLatencyMs: number;
  avgEffectivenessDelta: number;
}




