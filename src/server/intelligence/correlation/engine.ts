import { prisma } from '@/lib/db';
import { calculateDriftRatePerMinute, calculateZScore } from '@/lib/statistics';
import { getBaselineForTimestamp } from '../baseline';
import { STANDARD_CORRELATION_RULES } from './rules';
import {
  CorrelationRule,
  ContributingSensorEvidence,
  IncidentCandidate,
} from './types';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';
import { IncidentStatus, SeverityLevel } from '@prisma/client';
import { metricsService } from '@/server/observability/metrics';
import { recordSystemEvent } from '@/server/observability/events';

export class CrossSensorCorrelationEngine {
  /**
   * Deterministically calculates incident confidence based on satisfied signal weights
   * and physical sensor corroboration count.
   * Eliminates invented or hallucinated confidence metrics.
   */
  public static calculateConfidence(
    satisfiedEvidence: ContributingSensorEvidence[],
    allEvidence: ContributingSensorEvidence[]
  ): number {
    const totalWeight = allEvidence.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight <= 0) return 0;

    const satisfiedWeight = satisfiedEvidence.reduce((sum, e) => sum + e.weight, 0);
    const rawConfidence = satisfiedWeight / totalWeight;

    // Distinct sensor corroboration factor (rewards multiple distinct physical sensing channels)
    const distinctSensors = new Set(satisfiedEvidence.map((e) => e.sensorId)).size;
    const corroborationFactor = Math.min(1.0, 0.70 + 0.10 * Math.max(0, distinctSensors - 1));

    return Number(Math.min(0.99, rawConfidence * corroborationFactor).toFixed(2));
  }

  /**
   * Evaluates all correlation rules across rooms for a home at a given reference timestamp.
   * Returns newly formed incident candidates.
   */
  public static async evaluateHomeCorrelations(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<IncidentCandidate[]> {
    const t0 = performance.now();

    const rooms = await prisma.room.findMany({
      where: { floor: { homeId } },
      include: {
        sensors: true,
        devices: true,
      },
    });

    // Single batched query for all sensor readings across the entire home
    const allSensorIds = rooms.flatMap((r) => r.sensors.map((s) => s.id));
    const maxWindowSeconds = Math.max(...STANDARD_CORRELATION_RULES.map((r) => r.correlationWindowSeconds));
    const maxWindowStart = new Date(currentTimestamp.getTime() - maxWindowSeconds * 1000);

    const allReadings = await prisma.telemetryReading.findMany({
      where: {
        sensorId: { in: allSensorIds },
        timestamp: { gte: maxWindowStart, lte: currentTimestamp },
      },
      orderBy: { timestamp: 'asc' },
      select: { sensorId: true, timestamp: true, value: true },
    });

    const readingsBySensor = new Map<string, { timestamp: Date; value: number }[]>();
    for (const r of allReadings) {
      let list = readingsBySensor.get(r.sensorId);
      if (!list) {
        list = [];
        readingsBySensor.set(r.sensorId, list);
      }
      list.push({ timestamp: r.timestamp, value: r.value });
    }

    const candidates: IncidentCandidate[] = [];

    for (const room of rooms) {
      for (const rule of STANDARD_CORRELATION_RULES) {
        const candidate = await this.evaluateRoomRule(homeId, room, rule, currentTimestamp, readingsBySensor);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    const latency = performance.now() - t0;
    logger.debug('Cross-sensor correlation evaluation complete', {
      homeId,
      candidatesFound: candidates.length,
      latencyMs: Number(latency.toFixed(2)),
      module: 'correlation-engine',
    });

    return candidates;
  }

  /**
   * Evaluates a single correlation rule within the context of a room.
   */
  private static async evaluateRoomRule(
    homeId: string,
    room: any,
    rule: CorrelationRule,
    currentTimestamp: Date,
    readingsBySensor?: Map<string, { timestamp: Date; value: number }[]>
  ): Promise<IncidentCandidate | null> {
    const windowStart = new Date(currentTimestamp.getTime() - rule.correlationWindowSeconds * 1000);

    const allEvidence: ContributingSensorEvidence[] = [];
    let allRequiredSatisfied = true;
    let earliestEvidenceTime: Date = currentTimestamp;

    for (const signal of rule.signals) {
      // Locate sensor in room matching the signal sensorType
      const sensor = room.sensors.find((s: any) => s.type === signal.sensorType);

      if (!sensor) {
        if (signal.required) {
          allRequiredSatisfied = false;
        }
        allEvidence.push({
          sensorId: `missing-${signal.sensorType}`,
          sensorType: signal.sensorType,
          roomName: room.name,
          signalType: 'STATE_MATCH',
          observedValue: 0,
          unit: '',
          weight: signal.weight,
          satisfied: false,
          timestamp: currentTimestamp.toISOString(),
          explanation: `Sensor of type ${signal.sensorType} is not installed in ${room.name}`,
        });
        continue;
      }

      // Fetch readings for this sensor within the correlation window from map or db
      let readings: { timestamp: Date; value: number }[] = [];
      if (readingsBySensor) {
        const allSensorPoints = readingsBySensor.get(sensor.id) || [];
        const windowStartMs = windowStart.getTime();
        readings = allSensorPoints.filter((p) => p.timestamp.getTime() >= windowStartMs);
      } else {
        readings = await prisma.telemetryReading.findMany({
          where: {
            sensorId: sensor.id,
            timestamp: { gte: windowStart, lte: currentTimestamp },
          },
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true, value: true },
        });
      }

      const currentValue = sensor.lastReadingValue ?? (readings.length > 0 ? readings[readings.length - 1].value : 0);
      const latestReadingTime = sensor.lastReadingTime ? new Date(sensor.lastReadingTime) : currentTimestamp;

      let satisfied = false;
      let explanation = '';
      let observedValue = currentValue;
      let referenceValue: number | undefined;
      let zScoreVal: number | undefined;

      switch (signal.condition) {
        case 'VALUE_EQ': {
          satisfied = Math.abs(currentValue - signal.threshold) < 0.01;
          explanation = `Observed state ${currentValue} (expected: ${signal.threshold})`;
          break;
        }
        case 'VALUE_GT': {
          satisfied = currentValue > signal.threshold;
          explanation = `Value ${currentValue} ${sensor.unit} exceeds threshold of ${signal.threshold} ${sensor.unit}`;
          break;
        }
        case 'VALUE_LT': {
          satisfied = currentValue < signal.threshold;
          explanation = `Value ${currentValue} ${sensor.unit} is below threshold of ${signal.threshold} ${sensor.unit}`;
          break;
        }
        case 'RATE_OF_CHANGE_GT': {
          const recentPoints = readings.length > 6 ? readings.slice(-6) : readings;
          let slope = calculateDriftRatePerMinute(recentPoints);
          if (readings.length >= 2) {
            const last = readings[readings.length - 1];
            const prev = readings[Math.max(0, readings.length - 3)];
            const durMin = (new Date(last.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000;
            if (durMin > 0) {
              const deltaSlope = Number(((last.value - prev.value) / durMin).toFixed(3));
              if (deltaSlope > slope) {
                slope = deltaSlope;
              }
            }
          }
          observedValue = slope;
          referenceValue = signal.threshold;
          satisfied = slope > signal.threshold;
          explanation = `Rate of change ${slope > 0 ? '+' : ''}${slope} ${sensor.unit}/min (threshold: > +${signal.threshold} ${sensor.unit}/min)`;
          break;
        }
        case 'RATE_OF_CHANGE_LT': {
          const recentPoints = readings.length > 6 ? readings.slice(-6) : readings;
          let slope = calculateDriftRatePerMinute(recentPoints);
          if (readings.length >= 2) {
            const last = readings[readings.length - 1];
            const prev = readings[Math.max(0, readings.length - 3)];
            const durMin = (new Date(last.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000;
            if (durMin > 0) {
              const deltaSlope = Number(((last.value - prev.value) / durMin).toFixed(3));
              if (deltaSlope < slope) {
                slope = deltaSlope;
              }
            }
          }
          observedValue = slope;
          referenceValue = signal.threshold;
          satisfied = slope < signal.threshold;
          explanation = `Rate of change ${slope} ${sensor.unit}/min (threshold: < ${signal.threshold} ${sensor.unit}/min)`;
          break;
        }
        case 'Z_SCORE_GT': {
          const baseline = await getBaselineForTimestamp(sensor.id, currentTimestamp);
          const mean = baseline?.mean ?? currentValue;
          const stdDev = baseline?.stdDev ?? 1.0;
          zScoreVal = calculateZScore(currentValue, mean, stdDev);
          referenceValue = mean;
          satisfied = zScoreVal > signal.threshold;
          explanation = `Z-score Z = ${zScoreVal > 0 ? '+' : ''}${zScoreVal} (baseline: ${mean} ${sensor.unit}, σ: ${stdDev})`;
          break;
        }
        case 'Z_SCORE_LT': {
          const baseline = await getBaselineForTimestamp(sensor.id, currentTimestamp);
          const mean = baseline?.mean ?? currentValue;
          const stdDev = baseline?.stdDev ?? 1.0;
          zScoreVal = calculateZScore(currentValue, mean, stdDev);
          referenceValue = mean;
          satisfied = zScoreVal < signal.threshold;
          explanation = `Z-score Z = ${zScoreVal} (baseline: ${mean} ${sensor.unit}, σ: ${stdDev})`;
          break;
        }
      }

      if (readings.length > 0 && readings[0].timestamp < earliestEvidenceTime) {
        earliestEvidenceTime = readings[0].timestamp;
      }

      if (signal.required && !satisfied) {
        allRequiredSatisfied = false;
      }

      allEvidence.push({
        sensorId: sensor.id,
        sensorType: sensor.type,
        roomName: room.name,
        signalType: signal.condition.startsWith('Z_SCORE')
          ? 'ANOMALY_ZSCORE'
          : signal.condition.startsWith('RATE_OF_CHANGE')
          ? 'RATE_OF_CHANGE'
          : 'THRESHOLD_BREACH',
        observedValue,
        unit: sensor.unit,
        referenceValue,
        zScore: zScoreVal,
        weight: signal.weight,
        satisfied,
        timestamp: latestReadingTime.toISOString(),
        explanation,
      });
    }

    if (!allRequiredSatisfied) {
      return null;
    }

    const satisfiedEvidence = allEvidence.filter((e) => e.satisfied);
    const confidence = this.calculateConfidence(satisfiedEvidence, allEvidence);

    if (confidence < rule.minimumConfidenceThreshold) {
      return null;
    }

    const contextResult = rule.evaluateContext({
      room: { id: room.id, name: room.name },
      signalsSatisfied: satisfiedEvidence,
      allEvidence,
      windowSeconds: rule.correlationWindowSeconds,
    });

    const distinctSensors = new Set(satisfiedEvidence.map((e) => e.sensorId)).size;
    const totalWeight = allEvidence.reduce((sum, e) => sum + e.weight, 0);
    const satisfiedWeight = satisfiedEvidence.reduce((sum, e) => sum + e.weight, 0);
    const rawConfidence = totalWeight > 0 ? Number((satisfiedWeight / totalWeight).toFixed(2)) : 0;
    const corroborationFactor = Number((Math.min(1.0, 0.70 + 0.10 * Math.max(0, distinctSensors - 1))).toFixed(2));

    return {
      homeId,
      roomId: room.id,
      roomName: room.name,
      incidentType: rule.incidentType,
      severity: rule.severity,
      confidence,
      correlationWindowMs: rule.correlationWindowSeconds * 1000,
      startedAt: earliestEvidenceTime,
      detectedAt: currentTimestamp,
      title: contextResult.title,
      summary: contextResult.summary,
      explanation: contextResult.explanation,
      evidence: allEvidence,
      auditPayload: {
        ruleId: rule.id,
        timeWindowMinutes: Math.round(rule.correlationWindowSeconds / 60),
        distinctSensorCount: distinctSensors,
        rawConfidence,
        corroborationFactor,
      },
    };
  }

  /**
   * Processes incident candidates: handles duplicate suppression, state updates,
   * persistence, and resolution checks.
   */
  public static async processIncidentCandidates(
    candidates: IncidentCandidate[],
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<{
    created: number;
    updated: number;
    resolved: number;
    newCount: number;
    updatedCount: number;
    resolvedCount: number;
  }> {
    let newCount = 0;
    let updatedCount = 0;

    for (const candidate of candidates) {
      // Find existing active incident for this home, room, and type
      const existing = await prisma.incident.findFirst({
        where: {
          homeId: candidate.homeId,
          roomId: candidate.roomId,
          incidentType: candidate.incidentType,
          status: IncidentStatus.ACTIVE,
        },
      });

      const startedAt = candidate.startedAt ?? candidate.firstDetectedAt ?? currentTimestamp;
      const detectedAt = candidate.detectedAt ?? candidate.lastEvidenceAt ?? currentTimestamp;
      const correlationWindowMs = candidate.correlationWindowMs ?? 600000;

      if (existing) {
        // DUPLICATE SUPPRESSION / UPDATE: Same incident is still ongoing
        const updated = await prisma.incident.update({
          where: { id: existing.id },
          data: {
            confidence: Math.max(existing.confidence, candidate.confidence),
            lastEvidenceAt: detectedAt,
            evidence: candidate.evidence as any,
            auditPayload: (candidate.auditPayload ?? existing.auditPayload ?? null) as any,
            status: IncidentStatus.ACTIVE,
          },
        });
        updatedCount++;
        systemEventsBus.emit('incident_updated', updated);
      } else {
        // NEW INCIDENT DETECTED
        const created = await prisma.incident.create({
          data: {
            homeId: candidate.homeId,
            roomId: candidate.roomId,
            incidentType: candidate.incidentType,
            severity: candidate.severity,
            status: IncidentStatus.ACTIVE,
            title: candidate.title,
            summary: candidate.summary,
            explanation: candidate.explanation,
            confidence: candidate.confidence,
            correlationWindowMs,
            startedAt,
            detectedAt,
            lastEvidenceAt: detectedAt,
            evidence: candidate.evidence as any,
            auditPayload: (candidate.auditPayload ?? null) as any,
          },
        });
        newCount++;
        metricsService.recordIncidentDetected();
        systemEventsBus.emit('incident_detected', created);

        recordSystemEvent({
          homeId: candidate.homeId,
          category: 'INCIDENT',
          eventType: 'INCIDENT_DETECTED',
          severity: candidate.severity,
          source: 'CORRELATION_ENGINE',
          entityType: 'INCIDENT',
          entityId: created.id,
          summary: `${candidate.title} (confidence: ${(candidate.confidence * 100).toFixed(0)}%)`,
          metadata: {
            incidentType: candidate.incidentType,
            confidence: candidate.confidence,
            roomId: candidate.roomId,
          },
        });
      }
    }

    // RESOLUTION LIFECYCLE: Check if existing active incidents have normalized
    const resolvedCount = await this.evaluateResolutions(homeId, candidates, currentTimestamp);

    return {
      created: newCount,
      updated: updatedCount,
      resolved: resolvedCount,
      newCount,
      updatedCount,
      resolvedCount,
    };
  }

  /**
   * Checks whether previously active incidents have returned to baseline and can be resolved.
   */
  private static async evaluateResolutions(
    homeId: string,
    currentActiveCandidates: IncidentCandidate[],
    currentTimestamp: Date
  ): Promise<number> {
    const activeIncidents = await prisma.incident.findMany({
      where: {
        homeId,
        status: IncidentStatus.ACTIVE,
      },
    });

    let resolvedCount = 0;
    const cooldownMs = 180 * 1000; // 3 minutes of absence of evidence before resolving

    for (const incident of activeIncidents) {
      // Is this incident still firing in the current candidates?
      const stillFiring = currentActiveCandidates.some(
        (c) => c.roomId === incident.roomId && c.incidentType === incident.incidentType
      );

      if (!stillFiring) {
        const timeSinceLastEvidence = currentTimestamp.getTime() - new Date(incident.lastEvidenceAt).getTime();
        if (timeSinceLastEvidence >= cooldownMs) {
          const resolved = await prisma.incident.update({
            where: { id: incident.id },
            data: {
              status: IncidentStatus.RESOLVED,
              resolvedAt: currentTimestamp,
            },
          });
          resolvedCount++;
          systemEventsBus.emit('incident_resolved', resolved);

          recordSystemEvent({
            homeId,
            category: 'INCIDENT',
            eventType: 'INCIDENT_RESOLVED',
            severity: 'INFO',
            source: 'CORRELATION_ENGINE',
            entityType: 'INCIDENT',
            entityId: incident.id,
            summary: `Incident ${incident.incidentType} resolved (normalized to baseline)`,
            metadata: {
              incidentType: incident.incidentType,
              roomId: incident.roomId,
            },
          });

          logger.info('Incident transitioned to RESOLVED', {
            incidentId: incident.id,
            incidentType: incident.incidentType,
            roomId: incident.roomId ?? undefined,
            module: 'correlation-engine',
          });
        }
      }
    }

    return resolvedCount;
  }

  /**
   * Full ingestion trigger: evaluates and persists correlations for a home.
   */
  public static async processIngestedBatch(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<void> {
    try {
      const candidates = await this.evaluateHomeCorrelations(homeId, currentTimestamp);
      await this.processIncidentCandidates(candidates, homeId, currentTimestamp);
    } catch (err: any) {
      logger.error('Error executing cross-sensor correlation engine', {
        homeId,
        error: err?.message,
        module: 'correlation-engine',
      });
    }
  }
}
