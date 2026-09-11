import { prisma } from '@/lib/db';
import {
  AutomationStatus,
  CommandStatus,
  PredictiveIncidentStatus,
  VerificationStatus,
} from '@prisma/client';
import { CandidateAction, DecisionResult } from './types';
import { SafetyEvaluator } from './safety';
import { CommandDispatcher } from './dispatcher';
import { ensureDefaultPolicies } from './policies';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';

export class AutomationDecisionEngine {
  /**
   * Processes all active predictive incidents for a household and triggers automated decisions
   * that pass policy thresholds and safety constraints.
   */
  public static async processIngestedBatch(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<DecisionResult[]> {
    // 1. Ensure default policies are seeded
    await ensureDefaultPolicies(homeId);

    // 2. Fetch active PREDICTED incidents for the home
    const activeWarnings = await prisma.predictiveIncident.findMany({
      where: {
        homeId,
        status: PredictiveIncidentStatus.PREDICTED,
      },
      include: {
        room: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeWarnings.length === 0) {
      return [];
    }

    // 3. Fetch active automation policies
    const policies = await prisma.automationPolicy.findMany({
      where: {
        homeId,
        isEnabled: true,
      },
    });

    const decisions: DecisionResult[] = [];

    for (const warning of activeWarnings) {
      // Find matching policy for this predictive incident type
      const matchingPolicy = policies.find((p) => p.triggerType === warning.type);
      if (!matchingPolicy) continue;

      // Check if an automation execution already exists for this predictive incident
      const existingExecution = await prisma.automationExecution.findFirst({
        where: {
          predictiveIncidentId: warning.id,
          status: { in: [AutomationStatus.EXECUTING, AutomationStatus.VERIFYING, AutomationStatus.COMPLETED] },
        },
      });

      if (existingExecution) {
        // Already actuated on this incident
        continue;
      }

      // Check threshold crossing probability and confidence bounds
      if (
        warning.probability < matchingPolicy.minProbability ||
        warning.confidence < matchingPolicy.minConfidence
      ) {
        logger.debug('Skipping automation: probability or confidence below policy threshold', {
          policyName: matchingPolicy.name,
          warningId: warning.id,
          probability: warning.probability,
          minProbability: matchingPolicy.minProbability,
          module: 'automation-engine',
        });
        continue;
      }

      // Verify occupancy condition if required by policy
      const safetyConfig = (matchingPolicy.safetyChecks as Record<string, any>) || {};
      let occupancyConfirmed = true;

      if (safetyConfig.requireOccupancy && warning.roomId) {
        const evidence = warning.contributingEvidence as Record<string, any>;
        const occupancySensor = await prisma.sensor.findFirst({
          where: {
            roomId: warning.roomId,
            type: 'OCCUPANCY',
          },
        });

        occupancyConfirmed =
          evidence?.occupancy === true ||
          evidence?.isOccupied === true ||
          (occupancySensor ? occupancySensor.lastReadingValue === 1 : false);

        if (!occupancyConfirmed) {
          logger.debug('Skipping automation: occupancy requirement not met', {
            policyName: matchingPolicy.name,
            warningId: warning.id,
            module: 'automation-engine',
          });
          continue;
        }
      }

      // 4. Formulate candidate action
      const candidate: CandidateAction = {
        policyId: matchingPolicy.id,
        policyName: matchingPolicy.name,
        predictiveIncidentId: warning.id,
        homeId,
        roomId: warning.roomId || undefined,
        targetDeviceType: matchingPolicy.targetDeviceType,
        action: matchingPolicy.action,
        parameters: (matchingPolicy.parameters as Record<string, any>) || undefined,
        triggerReason: warning.summary,
        triggerEvidence: {
          predictiveIncidentType: warning.type,
          targetMetric: warning.target,
          currentValue: warning.currentValue,
          predictedValue: warning.predictedValue,
          thresholdValue: warning.thresholdValue,
          probability: warning.probability,
          confidence: warning.confidence,
          horizonMinutes: warning.horizonMinutes,
          occupancyConfirmed,
          modelName: warning.modelName,
        },
        expectedOutcome: this.deriveExpectedOutcome(matchingPolicy.targetDeviceType, matchingPolicy.action, warning.target),
        baselineMetricValue: warning.currentValue,
        targetMetricValue: warning.thresholdValue,
      };

      // 5. Evaluate safety constraints
      const safety = await SafetyEvaluator.evaluate(candidate, currentTimestamp);

      if (!safety.passed) {
        logger.info('Automation candidate rejected by safety constraints (fail-closed)', {
          policyName: matchingPolicy.name,
          reason: safety.rejectionReason,
          module: 'automation-engine',
        });

        decisions.push({
          approved: false,
          candidateAction: candidate,
          safetyCheck: safety,
          explanation: `Actuation blocked by safety constraint: ${safety.rejectionReason}`,
          rejectionReason: safety.rejectionReason,
        });
        continue;
      }

      // 6. Formulate deterministic explainable proof (no LLM)
      const explanation = this.formatExplanationProof(candidate, safety);

      // 7. Dispatch command to target actuator
      const dispatchResult = await CommandDispatcher.dispatch({
        homeId,
        deviceId: safety.deviceCheck.deviceId,
        action: candidate.action,
        parameters: candidate.parameters,
        expectedState: { action: candidate.action },
        source: 'AUTOMATION_ENGINE',
        expiresInSec: matchingPolicy.maxRuntimeSec,
      });

      // 8. Record immutable automation execution in database
      const execution = await prisma.automationExecution.create({
        data: {
          homeId,
          policyId: matchingPolicy.id,
          predictiveIncidentId: warning.id,
          deviceId: safety.deviceCheck.deviceId,
          commandId: dispatchResult.commandId || null,
          status: dispatchResult.delivered ? AutomationStatus.VERIFYING : AutomationStatus.FAILED,
          triggerReason: candidate.triggerReason,
          triggerEvidence: candidate.triggerEvidence as any,
          decisionExplanation: explanation,
          safetyEvaluation: safety as any,
          actionTaken: candidate.action,
          expectedOutcome: candidate.expectedOutcome,
          baselineMetricValue: candidate.baselineMetricValue,
          targetMetricValue: candidate.targetMetricValue,
          verificationStatus: VerificationStatus.PENDING,
          startedAt: currentTimestamp,
        },
      });

      // 9. Update policy lastTriggeredAt
      await prisma.automationPolicy.update({
        where: { id: matchingPolicy.id },
        data: { lastTriggeredAt: currentTimestamp },
      });

      // 10. Emit realtime SSE event
      systemEventsBus.emit('automation_triggered', {
        executionId: execution.id,
        policyName: matchingPolicy.name,
        deviceId: safety.deviceCheck.deviceId,
        action: candidate.action,
        status: execution.status,
      });

      decisions.push({
        approved: true,
        candidateAction: candidate,
        safetyCheck: safety,
        selectedDeviceId: safety.deviceCheck.deviceId,
        commandId: dispatchResult.commandId,
        explanation,
      });

      logger.info('Automation action approved and executed', {
        executionId: execution.id,
        policyName: matchingPolicy.name,
        action: candidate.action,
        module: 'automation-engine',
      });
    }

    return decisions;
  }

  /**
   * Generates a deterministic, structured explainability proof without LLMs.
   */
  public static formatExplanationProof(candidate: CandidateAction, safety: any): string {
    const ev = candidate.triggerEvidence;
    return [
      `AUTOMATION ACTION: ${candidate.action} on ${candidate.targetDeviceType}`,
      `Reason: ${candidate.triggerReason}`,
      `Evidence:`,
      `  - Current: ${ev.currentValue.toFixed(1)} vs Threshold: ${ev.thresholdValue.toFixed(1)}`,
      `  - Predicted: ${ev.predictedValue.toFixed(1)} across ${ev.horizonMinutes}m horizon`,
      `  - Model: ${ev.modelName} (P=${(ev.probability * 100).toFixed(0)}%, C=${(ev.confidence * 100).toFixed(0)}%)`,
      `  - Room Occupancy: ${ev.occupancyConfirmed ? 'CONFIRMED' : 'UNCONFIRMED'}`,
      `Safety Verification:`,
      `  - Device ID: ${safety.deviceCheck.deviceId} (ONLINE, low-voltage certified)`,
      `  - Mode: AUTO (fail-closed verified)`,
      `Expected Result: ${candidate.expectedOutcome}`,
    ].join('\n');
  }

  private static deriveExpectedOutcome(deviceType: string, action: string, target: string): string {
    if (target === 'ROOM_CO2') {
      return 'Ventilation air exchange will reduce CO2 concentration below 1,000 ppm threshold within 15 minutes.';
    }
    if (target === 'ROOM_TEMPERATURE') {
      return 'Auxiliary cooling airflow will counteract thermal influx and stabilize room temperature below 25.5°C.';
    }
    if (target === 'HOUSEHOLD_POWER') {
      return 'Deactivating non-critical DC circuit loads will shed peak power demand below 2,000W.';
    }
    return `Actuation ${action} on ${deviceType} will stabilize ${target} telemetry within safe operational bounds.`;
  }
}
