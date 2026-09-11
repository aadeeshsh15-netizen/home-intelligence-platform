import { prisma } from '@/lib/db';
import { IngestTelemetryPayload, validatePhysicalBounds, validateSensorUnit } from '@/domain/telemetry.schema';
import { evaluateSensorRules, systemEventsBus } from '../event-engine/rules';
import { evaluateTelemetryAnomaly } from '../intelligence/anomaly';
import { CrossSensorCorrelationEngine } from '../intelligence/correlation/engine';
import { PredictiveIncidentEngine } from '../intelligence/predictive-incidents/engine';
import { AutomationDecisionEngine } from '../automation/engine';
import { AutomationVerificationEngine } from '../automation/verification';
import { metricsService } from '../observability/metrics';
import { recordSystemEvent } from '../observability/events';
import { SensorHealth, DeviceStatus, InsightType } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface IngestionSummary {
  processedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  errors: string[];
  anomaliesDetected: number;
  eventsTriggered: number;
}

/**
 * Core Telemetry Ingestion Pipeline.
 * Serves as the single unified consumer for both simulated telemetry
 * and external hardware IoT devices (MQTT/ESP32).
 */
export async function processTelemetryIngest(payload: IngestTelemetryPayload): Promise<IngestionSummary> {
  const startTime = Date.now();
  const summary: IngestionSummary = {
    processedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    errors: [],
    anomaliesDetected: 0,
    eventsTriggered: 0,
  };

  const validReadings: {
    sensorId: string;
    timestamp: Date;
    value: number;
    quality: string;
  }[] = [];

  const affectedHomeIds = new Set<string>();

  for (const reading of payload.readings) {
    const sensor = await prisma.sensor.findUnique({
      where: { id: reading.sensorId },
      include: {
        room: {
          include: {
            floor: {
              include: { home: true },
            },
          },
        },
        device: true,
      },
    });

    if (!sensor) {
      summary.rejectedCount++;
      metricsService.recordValidationFailure();
      summary.errors.push(`Sensor ${reading.sensorId} does not exist in home model`);
      continue;
    }

    const homeId = sensor.room.floor.home.id;
    affectedHomeIds.add(homeId);

    // 1. Physical bounds validation
    const bounds = validatePhysicalBounds(sensor.type, reading.value);
    if (!bounds.valid) {
      summary.rejectedCount++;
      metricsService.recordValidationFailure();
      summary.errors.push(`Sensor ${sensor.id} (${sensor.type}): ${bounds.reason}`);
      logger.warn('Physical boundary validation rejected reading', {
        sensorId: sensor.id,
        type: sensor.type,
        value: reading.value,
        reason: bounds.reason,
        module: 'telemetry-ingest',
      });
      recordSystemEvent({
        homeId,
        category: 'TELEMETRY',
        eventType: 'VALIDATION_FAILED',
        severity: 'WARNING',
        source: 'TELEMETRY_PIPELINE',
        entityType: 'SENSOR',
        entityId: sensor.id,
        summary: `Sensor ${sensor.type} rejected: ${bounds.reason}`,
        metadata: { value: reading.value, reason: bounds.reason },
      });
      continue;
    }

    // 2. Unit consistency validation
    if (reading.unit) {
      const unitCheck = validateSensorUnit(sensor.type, reading.unit);
      if (!unitCheck.valid) {
        summary.rejectedCount++;
        metricsService.recordValidationFailure();
        summary.errors.push(
          `Sensor ${sensor.id} (${sensor.type}) invalid unit: "${reading.unit}". Expected: "${unitCheck.expectedUnit}"`
        );
        logger.warn('Unit mismatch rejected reading', {
          sensorId: sensor.id,
          unit: reading.unit,
          expectedUnit: unitCheck.expectedUnit,
          module: 'telemetry-ingest',
        });
        recordSystemEvent({
          homeId,
          category: 'TELEMETRY',
          eventType: 'VALIDATION_FAILED',
          severity: 'WARNING',
          source: 'TELEMETRY_PIPELINE',
          entityType: 'SENSOR',
          entityId: sensor.id,
          summary: `Sensor ${sensor.type} unit mismatch: received ${reading.unit}, expected ${unitCheck.expectedUnit}`,
          metadata: { unit: reading.unit, expectedUnit: unitCheck.expectedUnit },
        });
        continue;
      }
    }

    const readingTime = new Date(reading.timestamp);
    validReadings.push({
      sensorId: reading.sensorId,
      timestamp: readingTime,
      value: reading.value,
      quality: reading.quality,
    });

    // 3. Out-of-order timestamp protection:
    // Update sensor's lastReadingValue/Time ONLY if reading is newer than current record
    const shouldUpdateLastSeen = !sensor.lastReadingTime || readingTime > sensor.lastReadingTime;

    if (shouldUpdateLastSeen) {
      await prisma.sensor.update({
        where: { id: sensor.id },
        data: {
          lastReadingValue: reading.value,
          lastReadingTime: readingTime,
          health: SensorHealth.HEALTHY,
        },
      });

      if (sensor.deviceId) {
        await prisma.device.update({
          where: { id: sensor.deviceId },
          data: {
            lastSeenAt: readingTime,
            status: DeviceStatus.ONLINE,
          },
        });
      }
    }

    // Emit live telemetry tick for SSE consumers
    systemEventsBus.emit('telemetry_tick', {
      sensorId: sensor.id,
      sensorType: sensor.type,
      roomId: sensor.roomId,
      roomName: sensor.room?.name,
      deviceId: sensor.deviceId,
      value: reading.value,
      unit: reading.unit,
      timestamp: readingTime.toISOString(),
      quality: reading.quality,
    });

    // 4. Evaluate rules
    const ruleResults = await evaluateSensorRules(sensor.id, reading.value);
    summary.eventsTriggered += ruleResults.length;

    // 5. Evaluate statistical anomalies
    const anomaly = await evaluateTelemetryAnomaly(sensor.id, reading.value, readingTime);
    if (anomaly && anomaly.isAnomaly) {
      summary.anomaliesDetected++;
      metricsService.recordAnomalyDetected();

      const existingInsight = await prisma.insight.findFirst({
        where: {
          homeId,
          sensorId: sensor.id,
          title: anomaly.title,
          status: 'ACTIVE',
        },
      });

      if (!existingInsight) {
        const createdInsight = await prisma.insight.create({
          data: {
            homeId,
            roomId: sensor.roomId,
            sensorId: sensor.id,
            type: InsightType.ANOMALY,
            title: anomaly.title,
            summary: anomaly.summary,
            explanation: anomaly.explanation,
            confidence: anomaly.confidence,
            isHeuristic: anomaly.isHeuristic,
            evidenceData: {
              value: reading.value,
              baselineMean: anomaly.baselineMean,
              baselineStdDev: anomaly.baselineStdDev,
              zScore: anomaly.zScore,
              deviationPercent: anomaly.deviationPercent,
              timestamp: readingTime.toISOString(),
            },
            status: 'ACTIVE',
          },
        });

        systemEventsBus.emit('insight_generated', createdInsight);

        recordSystemEvent({
          homeId,
          category: 'ANOMALY',
          eventType: 'ANOMALY_DETECTED',
          severity: 'WARNING',
          source: 'TELEMETRY_PIPELINE',
          entityType: 'SENSOR',
          entityId: sensor.id,
          summary: `${anomaly.title} (z-score: ${anomaly.zScore.toFixed(2)})`,
          metadata: {
            zScore: anomaly.zScore,
            deviationPercent: anomaly.deviationPercent,
            currentValue: reading.value,
            baselineMean: anomaly.baselineMean,
          },
        });
      }
    }
  }

  // 6. Batch insert with duplicate suppression
  if (validReadings.length > 0) {
    const result = await prisma.telemetryReading.createMany({
      data: validReadings,
      skipDuplicates: true,
    });
    summary.processedCount = result.count;
    summary.duplicateCount = validReadings.length - result.count;
    metricsService.recordIngestedReadings(summary.processedCount);
    if (summary.duplicateCount > 0) {
      metricsService.recordDuplicateRejection(summary.duplicateCount);
    }
  }

  // 7. Evaluate Cross-Sensor Incident Intelligence Engine
  const corrStart = Date.now();
  for (const homeId of affectedHomeIds) {
    await CrossSensorCorrelationEngine.processIngestedBatch(homeId, new Date());
  }
  metricsService.recordIncidentDetectionLatency(Date.now() - corrStart);

  // 8. Evaluate Predictive Incident Intelligence Engine
  const predStart = Date.now();
  for (const homeId of affectedHomeIds) {
    await PredictiveIncidentEngine.processIngestedBatch(homeId, new Date());
  }
  metricsService.recordPredictionLatency(Date.now() - predStart);

  // 9. Evaluate Closed-Loop Automation Decision Engine (Phase 7)
  const autoStart = Date.now();
  for (const homeId of affectedHomeIds) {
    await AutomationDecisionEngine.processIngestedBatch(homeId, new Date());
  }
  metricsService.recordAutomationDecisionLatency(Date.now() - autoStart);

  // 10. Verify Pending Closed-Loop Automation Interventions (Phase 7)
  const verStart = Date.now();
  for (const homeId of affectedHomeIds) {
    await AutomationVerificationEngine.verifyPendingExecutions(homeId, new Date());
  }
  metricsService.recordVerificationLatency(Date.now() - verStart);

  metricsService.recordIngestionLatency(Date.now() - startTime);
  return summary;
}
