import { prisma } from '@/lib/db';
import { PREDICTIVE_RULES } from './rules';
import {
  PredictiveCandidate,
  PredictiveIncidentRuleContext,
} from './types';
import {
  IncidentType,
  SensorType,
  PredictiveIncidentType,
} from '@prisma/client';
import {
  PredictivePerformanceMetrics,
} from '@/domain/types';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';

export class PredictiveIncidentEngine {
  /**
   * Maps PredictiveIncidentType to corresponding confirmed Phase 2 IncidentType.
   */
  public static mapPredictiveToConfirmedType(type: PredictiveIncidentType): IncidentType | null {
    switch (type) {
      case 'PREDICTED_AC_FAILURE':
        return IncidentType.AC_FAILURE;
      case 'PREDICTED_THERMAL_BREACH':
        return IncidentType.WINDOW_THERMAL_EVENT;
      case 'PREDICTED_CO2_VENTILATION':
        return IncidentType.MULTI_SENSOR_ANOMALY;
      case 'PREDICTED_ENERGY_SURGE':
        return IncidentType.MULTI_SENSOR_ANOMALY;
      default:
        return null;
    }
  }

  /**
   * Evaluates all predictive rules for a home and persists newly formed early warnings.
   */
  public static async evaluateHome(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<PredictiveCandidate[]> {
    const context: PredictiveIncidentRuleContext = {
      homeId,
      currentTimestamp,
    };

    const formedCandidates: PredictiveCandidate[] = [];

    for (const rule of PREDICTIVE_RULES) {
      try {
        const candidate = await rule.evaluate(context);
        if (!candidate) continue;

        // Deduplication: check if an active PREDICTED warning of the same type/room exists within 30 min
        const thirtyMinAgo = new Date(currentTimestamp.getTime() - 30 * 60 * 1000);
        const existing = await prisma.predictiveIncident.findFirst({
          where: {
            homeId,
            roomId: candidate.roomId,
            type: candidate.type,
            status: 'PREDICTED',
            createdAt: { gte: thirtyMinAgo },
          },
        });

        if (existing) {
          // Suppress duplicate active warning
          continue;
        }

        const created = await prisma.predictiveIncident.create({
          data: {
            homeId: candidate.homeId,
            roomId: candidate.roomId,
            type: candidate.type,
            target: candidate.target,
            severity: candidate.severity,
            status: 'PREDICTED',
            outcome: 'UNRESOLVED',
            title: candidate.title,
            summary: candidate.summary,
            explanation: candidate.explanation,
            probability: candidate.probability,
            confidence: candidate.confidence,
            horizonMinutes: candidate.horizonMinutes,
            currentValue: candidate.currentValue,
            predictedValue: candidate.predictedValue,
            thresholdValue: candidate.thresholdValue,
            baselineValue: candidate.baselineValue,
            confidenceInterval80: candidate.confidenceInterval80 as any,
            confidenceInterval95: candidate.confidenceInterval95 as any,
            modelType: candidate.modelType,
            modelName: candidate.modelName,
            expectedCrossingTime: candidate.expectedCrossingTime,
            predictedLeadTimeMin: candidate.predictedLeadTimeMin,
            contributingEvidence: candidate.contributingEvidence as any,
            createdAt: currentTimestamp,
          },
        });

        formedCandidates.push(candidate);
        systemEventsBus.emit('predictive_incident_created', created);

        logger.info('Early Warning Generated', {
          id: created.id,
          type: created.type,
          probability: created.probability,
          leadTimeMin: created.predictedLeadTimeMin,
        });
      } catch (err: any) {
        logger.error('Error evaluating predictive rule', {
          ruleId: rule.id,
          error: err.message,
        });
      }
    }

    return formedCandidates;
  }

  /**
   * Checks pending PREDICTED incidents against new ground-truth telemetry and Phase 2 incidents.
   * Transitions incidents to CONFIRMED (True Positive) or EXPIRED (False Positive).
   */
  public static async evaluatePendingIncidents(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<{ confirmedCount: number; expiredCount: number }> {
    const pendingIncidents = await prisma.predictiveIncident.findMany({
      where: {
        homeId,
        status: 'PREDICTED',
      },
      include: { room: true },
    });

    let confirmedCount = 0;
    let expiredCount = 0;

    for (const pred of pendingIncidents) {
      const createdMs = pred.createdAt.getTime();
      const currentMs = currentTimestamp.getTime();
      const horizonWindowMs = (pred.horizonMinutes + 15) * 60 * 1000; // Horizon + 15 min grace window

      // Check 1: Has a matching Phase 2 Incident materialized?
      const targetConfirmedType = this.mapPredictiveToConfirmedType(pred.type);
      if (targetConfirmedType) {
        const matchingIncident = await prisma.incident.findFirst({
          where: {
            homeId,
            ...(pred.roomId ? { roomId: pred.roomId } : {}),
            incidentType: targetConfirmedType,
            startedAt: { gte: pred.createdAt, lte: currentTimestamp },
          },
          orderBy: { startedAt: 'asc' },
        });

        if (matchingIncident) {
          const actualLeadTime = Math.max(
            1,
            Number(((matchingIncident.startedAt.getTime() - createdMs) / 60000).toFixed(1))
          );

          await prisma.predictiveIncident.update({
            where: { id: pred.id },
            data: {
              status: 'CONFIRMED',
              outcome: 'TRUE_POSITIVE',
              confirmedIncidentId: matchingIncident.id,
              actualCrossingTime: matchingIncident.startedAt,
              actualLeadTimeMin: actualLeadTime,
              evaluatedAt: currentTimestamp,
              updatedAt: currentTimestamp,
            },
          });

          confirmedCount++;
          continue;
        }
      }

      // Check 2: Check raw telemetry readings to see if threshold was crossed
      let sensorTypeToCheck: SensorType | null = null;
      let checkDirection: 'UP' | 'DOWN' = 'UP';

      if (pred.type === 'PREDICTED_CO2_VENTILATION') {
        sensorTypeToCheck = SensorType.CO2;
        checkDirection = 'UP';
      } else if (pred.type === 'PREDICTED_AC_FAILURE') {
        sensorTypeToCheck = SensorType.TEMPERATURE;
        checkDirection = 'UP';
      } else if (pred.type === 'PREDICTED_ENERGY_SURGE') {
        sensorTypeToCheck = SensorType.POWER;
        checkDirection = 'UP';
      } else if (pred.type === 'PREDICTED_THERMAL_BREACH') {
        sensorTypeToCheck = SensorType.TEMPERATURE;
        checkDirection = 'DOWN';
      }

      if (sensorTypeToCheck) {
        const breachedReading = await prisma.telemetryReading.findFirst({
          where: {
            sensor: {
              type: sensorTypeToCheck,
              ...(pred.roomId ? { roomId: pred.roomId } : { room: { floor: { homeId } } }),
            },
            timestamp: { gte: pred.createdAt, lte: currentTimestamp },
            ...(checkDirection === 'UP'
              ? { value: { gte: pred.thresholdValue } }
              : { value: { lte: pred.thresholdValue } }),
          },
          orderBy: { timestamp: 'asc' },
        });

        if (breachedReading) {
          const actualLeadTime = Math.max(
            1,
            Number(((breachedReading.timestamp.getTime() - createdMs) / 60000).toFixed(1))
          );

          await prisma.predictiveIncident.update({
            where: { id: pred.id },
            data: {
              status: 'CONFIRMED',
              outcome: 'TRUE_POSITIVE',
              actualCrossingTime: breachedReading.timestamp,
              actualLeadTimeMin: actualLeadTime,
              evaluatedAt: currentTimestamp,
              updatedAt: currentTimestamp,
            },
          });

          confirmedCount++;
          continue;
        }
      }

      // Check 3: Has the prediction horizon expired without threshold crossing?
      if (currentMs > createdMs + horizonWindowMs) {
        await prisma.predictiveIncident.update({
          where: { id: pred.id },
          data: {
            status: 'EXPIRED',
            outcome: 'FALSE_POSITIVE',
            evaluatedAt: currentTimestamp,
            updatedAt: currentTimestamp,
          },
        });

        expiredCount++;
      }
    }

    return { confirmedCount, expiredCount };
  }

  /**
   * Unified processor hook invoked after telemetry batch ingestion.
   */
  public static async processIngestedBatch(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<void> {
    await this.evaluatePendingIncidents(homeId, currentTimestamp);
    await this.evaluateHome(homeId, currentTimestamp);
  }

  /**
   * Aggregates predictive performance metrics (Precision, Recall, Mean Lead Time, Buckets).
   */
  public static async getPerformanceMetrics(homeId: string): Promise<PredictivePerformanceMetrics> {
    const all = await prisma.predictiveIncident.findMany({
      where: { homeId },
    });

    const totalWarnings = all.length;
    const confirmed = all.filter((i) => i.status === 'CONFIRMED' && i.outcome === 'TRUE_POSITIVE');
    const expired = all.filter((i) => i.status === 'EXPIRED' && i.outcome === 'FALSE_POSITIVE');
    const pending = all.filter((i) => i.status === 'PREDICTED');

    const tp = confirmed.length;
    const fp = expired.length;
    const precision = tp + fp > 0 ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : 100.0;
    const fpr = tp + fp > 0 ? Number(((fp / (tp + fp)) * 100).toFixed(1)) : 0.0;

    const leadTimes = confirmed
      .map((c) => c.actualLeadTimeMin)
      .filter((t): t is number => t !== null && t > 0);

    const avgLeadTime =
      leadTimes.length > 0
        ? Number((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1))
        : 0;

    const b0_15 = leadTimes.filter((t) => t <= 15).length;
    const b15_30 = leadTimes.filter((t) => t > 15 && t <= 30).length;
    const b30_60 = leadTimes.filter((t) => t > 30 && t <= 60).length;
    const b60plus = leadTimes.filter((t) => t > 60).length;

    return {
      totalWarnings,
      confirmedTruePositives: tp,
      expiredFalsePositives: fp,
      unresolvedPending: pending.length,
      precisionPercent: precision,
      falsePositiveRatePercent: fpr,
      averageLeadTimeMinutes: avgLeadTime,
      leadTimeBuckets: [
        { bucket: '0-15m', count: b0_15 },
        { bucket: '15-30m', count: b15_30 },
        { bucket: '30-60m', count: b30_60 },
        { bucket: '60m+', count: b60plus },
      ],
    };
  }
}
