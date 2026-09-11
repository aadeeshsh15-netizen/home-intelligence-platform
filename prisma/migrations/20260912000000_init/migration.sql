-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceProtocol" AS ENUM ('SIMULATED', 'MQTT', 'ZIGBEE', 'MATTER', 'HTTP');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'STALE', 'DEGRADED', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('UNPROVISIONED', 'PENDING_PAIRING', 'PROVISIONED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('TEMPERATURE', 'HUMIDITY', 'CO2', 'PM2_5', 'POWER', 'OCCUPANCY', 'LIGHT', 'NOISE', 'WATER_FLOW', 'CONTACT');

-- CreateEnum
CREATE TYPE "SensorHealth" AS ENUM ('HEALTHY', 'STALE', 'FAULTY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('ANOMALY', 'EFFICIENCY', 'CORRELATION', 'EQUIPMENT_HEALTH');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'ACTIVE', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('COOKING_EVENT', 'WATER_LEAK', 'AC_FAILURE', 'WINDOW_THERMAL_EVENT', 'MULTI_SENSOR_ANOMALY');

-- CreateEnum
CREATE TYPE "PredictiveIncidentStatus" AS ENUM ('PREDICTED', 'CONFIRMED', 'EXPIRED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PredictionOutcome" AS ENUM ('TRUE_POSITIVE', 'FALSE_POSITIVE', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "PredictiveIncidentType" AS ENUM ('PREDICTED_CO2_VENTILATION', 'PREDICTED_AC_FAILURE', 'PREDICTED_ENERGY_SURGE', 'PREDICTED_THERMAL_BREACH');

-- CreateEnum
CREATE TYPE "PredictionTarget" AS ENUM ('HOUSEHOLD_POWER', 'ROOM_TEMPERATURE', 'ROOM_CO2', 'OCCUPANCY_PROBABILITY');

-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('STATISTICAL_PERSISTENCE', 'STATISTICAL_EMA', 'STATISTICAL_SEASONAL_DECAY', 'BAYESIAN_OCCUPANCY', 'ML_LINEAR_REGRESSION', 'ML_GRADIENT_BOOSTING', 'ML_RANDOM_FOREST', 'REMOTE_MICROSERVICE');

-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('AUTO', 'MANUAL', 'DISABLED');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('IDLE', 'TRIGGERED', 'EXECUTING', 'VERIFYING', 'COMPLETED', 'COOLDOWN', 'FAILED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'TIMED_OUT', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED_EFFECTIVE', 'VERIFIED_INEFFECTIVE', 'INCONCLUSIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "ActuatorType" AS ENUM ('VENTILATION_FAN', 'STATUS_LED', 'LOW_VOLTAGE_RELAY', 'ALARM_BUZZER', 'THERMOSTAT_SETPOINT');

-- CreateEnum
CREATE TYPE "ActuatorAction" AS ENUM ('TURN_ON', 'TURN_OFF', 'SET_SPEED', 'SET_LEVEL', 'PULSE', 'SHED_LOAD');

-- CreateEnum
CREATE TYPE "SystemEventCategory" AS ENUM ('TELEMETRY', 'ANOMALY', 'INCIDENT', 'PREDICTION', 'AUTOMATION', 'COMMAND', 'SECURITY', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Home" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "address" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "svgLayout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "targetTemp" DOUBLE PRECISION,
    "layoutX" DOUBLE PRECISION NOT NULL,
    "layoutY" DOUBLE PRECISION NOT NULL,
    "layoutW" DOUBLE PRECISION NOT NULL,
    "layoutH" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "hardwareType" TEXT,
    "protocol" "DeviceProtocol" NOT NULL DEFAULT 'SIMULATED',
    "identifier" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ONLINE',
    "provisioningStatus" "ProvisioningStatus" NOT NULL DEFAULT 'PROVISIONED',
    "macAddress" TEXT,
    "authTokenHash" TEXT,
    "firmwareVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3),
    "configuration" JSONB,
    "isActuator" BOOLEAN NOT NULL DEFAULT false,
    "actuatorType" "ActuatorType",
    "actuatorState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "SensorType" NOT NULL,
    "unit" TEXT NOT NULL,
    "samplingIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "minExpectedValue" DOUBLE PRECISION NOT NULL,
    "maxExpectedValue" DOUBLE PRECISION NOT NULL,
    "lastReadingValue" DOUBLE PRECISION,
    "lastReadingTime" TIMESTAMP(3),
    "health" "SensorHealth" NOT NULL DEFAULT 'HEALTHY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" BIGSERIAL NOT NULL,
    "sensorId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'VALID',

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryBaseline" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hourOfDay" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "stdDev" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemetryBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sensorType" "SensorType" NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "severity" "SeverityLevel" NOT NULL DEFAULT 'WARNING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "roomId" TEXT,
    "deviceId" TEXT,
    "sensorId" TEXT,
    "category" TEXT NOT NULL,
    "severity" "SeverityLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contextData" JSONB,
    "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "roomId" TEXT,
    "sensorId" TEXT,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "isHeuristic" BOOLEAN NOT NULL DEFAULT false,
    "evidenceData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "roomId" TEXT,
    "incidentType" "IncidentType" NOT NULL,
    "severity" "SeverityLevel" NOT NULL DEFAULT 'WARNING',
    "status" "IncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "correlationWindowMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastEvidenceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL,
    "auditPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictiveIncident" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "roomId" TEXT,
    "type" "PredictiveIncidentType" NOT NULL,
    "target" "PredictionTarget" NOT NULL,
    "status" "PredictiveIncidentStatus" NOT NULL DEFAULT 'PREDICTED',
    "outcome" "PredictionOutcome" NOT NULL DEFAULT 'UNRESOLVED',
    "severity" "SeverityLevel" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "horizonMinutes" INTEGER NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "predictedValue" DOUBLE PRECISION NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "baselineValue" DOUBLE PRECISION NOT NULL,
    "confidenceInterval80" JSONB,
    "confidenceInterval95" JSONB,
    "modelType" "ModelType" NOT NULL,
    "modelName" TEXT NOT NULL,
    "expectedCrossingTime" TIMESTAMP(3),
    "predictedLeadTimeMin" DOUBLE PRECISION,
    "actualCrossingTime" TIMESTAMP(3),
    "actualLeadTimeMin" DOUBLE PRECISION,
    "contributingEvidence" JSONB NOT NULL,
    "confirmedIncidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "PredictiveIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ModelType" NOT NULL,
    "version" TEXT NOT NULL,
    "target" "PredictionTarget" NOT NULL,
    "hyperparameters" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictionModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "target" "PredictionTarget" NOT NULL,
    "evaluationWindow" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "rmse" DOUBLE PRECISION NOT NULL,
    "horizonMetrics" JSONB NOT NULL,
    "inferenceLatencyMs" DOUBLE PRECISION NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationPolicy" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mode" "AutomationMode" NOT NULL DEFAULT 'AUTO',
    "triggerType" "PredictiveIncidentType" NOT NULL,
    "targetMetric" "PredictionTarget" NOT NULL,
    "minProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.70,
    "cooldownSec" INTEGER NOT NULL DEFAULT 900,
    "maxRuntimeSec" INTEGER NOT NULL DEFAULT 1800,
    "targetDeviceType" TEXT NOT NULL,
    "action" "ActuatorAction" NOT NULL DEFAULT 'TURN_ON',
    "parameters" JSONB,
    "safetyChecks" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "action" "ActuatorAction" NOT NULL,
    "parameters" JSONB,
    "expectedState" JSONB,
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'AUTOMATION_ENGINE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "resultPayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "predictiveIncidentId" TEXT,
    "deviceId" TEXT NOT NULL,
    "commandId" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'TRIGGERED',
    "triggerReason" TEXT NOT NULL,
    "triggerEvidence" JSONB NOT NULL,
    "decisionExplanation" TEXT NOT NULL,
    "safetyEvaluation" JSONB NOT NULL,
    "actionTaken" "ActuatorAction" NOT NULL,
    "expectedOutcome" TEXT NOT NULL,
    "observedOutcome" TEXT,
    "baselineMetricValue" DOUBLE PRECISION NOT NULL,
    "targetMetricValue" DOUBLE PRECISION NOT NULL,
    "finalMetricValue" DOUBLE PRECISION,
    "metricDelta" DOUBLE PRECISION,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "commandLatencyMs" DOUBLE PRECISION,
    "verificationLatencyMs" DOUBLE PRECISION,
    "isEffective" BOOLEAN,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "SystemEventCategory" NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" "SeverityLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "correlationId" TEXT,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Device_identifier_key" ON "Device"("identifier");

-- CreateIndex
CREATE INDEX "Sensor_roomId_type_idx" ON "Sensor"("roomId", "type");

-- CreateIndex
CREATE INDEX "TelemetryReading_sensorId_timestamp_idx" ON "TelemetryReading"("sensorId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "TelemetryReading_timestamp_idx" ON "TelemetryReading"("timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_sensorId_timestamp_key" ON "TelemetryReading"("sensorId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryBaseline_sensorId_dayOfWeek_hourOfDay_key" ON "TelemetryBaseline"("sensorId", "dayOfWeek", "hourOfDay");

-- CreateIndex
CREATE INDEX "Event_homeId_createdAt_idx" ON "Event"("homeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Event_status_severity_idx" ON "Event"("status", "severity");

-- CreateIndex
CREATE INDEX "Insight_homeId_createdAt_idx" ON "Insight"("homeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Incident_homeId_status_createdAt_idx" ON "Incident"("homeId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Incident_homeId_incidentType_status_idx" ON "Incident"("homeId", "incidentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PredictiveIncident_confirmedIncidentId_key" ON "PredictiveIncident"("confirmedIncidentId");

-- CreateIndex
CREATE INDEX "PredictiveIncident_homeId_status_createdAt_idx" ON "PredictiveIncident"("homeId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PredictiveIncident_homeId_type_status_idx" ON "PredictiveIncident"("homeId", "type", "status");

-- CreateIndex
CREATE INDEX "PredictionModel_target_isActive_idx" ON "PredictionModel"("target", "isActive");

-- CreateIndex
CREATE INDEX "ModelEvaluation_modelId_evaluatedAt_idx" ON "ModelEvaluation"("modelId", "evaluatedAt" DESC);

-- CreateIndex
CREATE INDEX "ModelEvaluation_homeId_target_evaluatedAt_idx" ON "ModelEvaluation"("homeId", "target", "evaluatedAt" DESC);

-- CreateIndex
CREATE INDEX "AutomationPolicy_homeId_isEnabled_triggerType_idx" ON "AutomationPolicy"("homeId", "isEnabled", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCommand_commandId_key" ON "DeviceCommand"("commandId");

-- CreateIndex
CREATE INDEX "DeviceCommand_homeId_deviceId_status_idx" ON "DeviceCommand"("homeId", "deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_commandId_idx" ON "DeviceCommand"("commandId");

-- CreateIndex
CREATE INDEX "AutomationExecution_homeId_status_createdAt_idx" ON "AutomationExecution"("homeId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AutomationExecution_policyId_createdAt_idx" ON "AutomationExecution"("policyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SystemEvent_homeId_timestamp_idx" ON "SystemEvent"("homeId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "SystemEvent_homeId_category_timestamp_idx" ON "SystemEvent"("homeId", "category", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "SystemEvent_homeId_severity_timestamp_idx" ON "SystemEvent"("homeId", "severity", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "SystemEvent_correlationId_idx" ON "SystemEvent"("correlationId");

-- AddForeignKey
ALTER TABLE "Home" ADD CONSTRAINT "Home_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryBaseline" ADD CONSTRAINT "TelemetryBaseline_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictiveIncident" ADD CONSTRAINT "PredictiveIncident_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictiveIncident" ADD CONSTRAINT "PredictiveIncident_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictiveIncident" ADD CONSTRAINT "PredictiveIncident_confirmedIncidentId_fkey" FOREIGN KEY ("confirmedIncidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "PredictionModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationPolicy" ADD CONSTRAINT "AutomationPolicy_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AutomationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_predictiveIncidentId_fkey" FOREIGN KEY ("predictiveIncidentId") REFERENCES "PredictiveIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DeviceCommand"("commandId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

