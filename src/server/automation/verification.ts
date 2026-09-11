import { prisma } from '@/lib/db';
import {
  AutomationStatus,
  CommandStatus,
  SensorType,
  VerificationStatus,
} from '@prisma/client';
import { VerificationEvaluation } from './types';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';

export class AutomationVerificationEngine {
  /**
   * Evaluates all open automation executions awaiting empirical verification.
   * Compares post-actuation telemetry against pre-actuation baseline.
   */
  public static async verifyPendingExecutions(
    homeId: string,
    currentTimestamp: Date = new Date()
  ): Promise<VerificationEvaluation[]> {
    const pendingExecutions = await prisma.automationExecution.findMany({
      where: {
        homeId,
        verificationStatus: VerificationStatus.PENDING,
        status: { in: [AutomationStatus.VERIFYING, AutomationStatus.EXECUTING] },
      },
      include: {
        policy: true,
        device: { include: { room: true } },
      },
    });

    if (pendingExecutions.length === 0) {
      return [];
    }

    const evaluations: VerificationEvaluation[] = [];

    for (const execution of pendingExecutions) {
      const startedMs = execution.startedAt.getTime();
      const currentMs = currentTimestamp.getTime();
      const elapsedMinutes = (currentMs - startedMs) / 60000;

      // Allow at least 1 minute of telemetry observation before concluding verification
      if (elapsedMinutes < 0.5) {
        continue;
      }

      const targetMetric = execution.policy.targetMetric;
      let sensorType: SensorType = SensorType.CO2;

      if (targetMetric === 'ROOM_CO2') {
        sensorType = SensorType.CO2;
      } else if (targetMetric === 'ROOM_TEMPERATURE') {
        sensorType = SensorType.TEMPERATURE;
      } else if (targetMetric === 'HOUSEHOLD_POWER') {
        sensorType = SensorType.POWER;
      }

      // Query latest telemetry reading for the target room/sensor since execution started
      const roomId = execution.device.roomId;
      const latestReading = await prisma.telemetryReading.findFirst({
        where: {
          sensor: {
            type: sensorType,
            ...(roomId ? { roomId } : { room: { floor: { homeId } } }),
          },
          timestamp: { gte: execution.startedAt, lte: currentTimestamp },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (!latestReading) {
        // If elapsed time exceeds 30 minutes with zero readings, mark INCONCLUSIVE
        if (elapsedMinutes > 30) {
          await prisma.automationExecution.update({
            where: { id: execution.id },
            data: {
              verificationStatus: VerificationStatus.INCONCLUSIVE,
              status: AutomationStatus.COMPLETED,
              observedOutcome: 'No telemetry readings received within 30-minute verification window.',
              isEffective: false,
              verifiedAt: currentTimestamp,
              completedAt: currentTimestamp,
            },
          });
          if (execution.commandId) {
            await prisma.deviceCommand.updateMany({
              where: { commandId: execution.commandId },
              data: { status: CommandStatus.EXPIRED, completedAt: currentTimestamp },
            }).catch(() => {});
          }
        }
        continue;
      }

      const observedValue = latestReading.value;
      const baseline = execution.baselineMetricValue;
      const delta = Number((observedValue - baseline).toFixed(2));
      const latencyMs = currentMs - startedMs;

      let isEffective = false;
      let outcomeSummary = '';

      if (targetMetric === 'ROOM_CO2') {
        // Effective if CO2 decreased by at least 30 ppm or stayed below 1,000 ppm threshold
        if (delta <= -30 || observedValue < execution.targetMetricValue) {
          isEffective = true;
          outcomeSummary = `CO2 decreased by ${Math.abs(delta)} ppm (current: ${observedValue} ppm) following ventilation activation.`;
        } else if (elapsedMinutes >= 15) {
          isEffective = false;
          outcomeSummary = `CO2 failed to improve within 15 minutes (delta: +${delta} ppm).`;
        } else {
          // Still in observation window
          continue;
        }
      } else if (targetMetric === 'ROOM_TEMPERATURE') {
        // Effective if temp decreased or remained below threshold
        if (delta <= -0.3 || observedValue <= execution.targetMetricValue) {
          isEffective = true;
          outcomeSummary = `Room temperature stabilized at ${observedValue}°C (delta: ${delta}°C).`;
        } else if (elapsedMinutes >= 20) {
          isEffective = false;
          outcomeSummary = `Temperature failed to decrease within 20 minutes (delta: +${delta}°C).`;
        } else {
          continue;
        }
      } else if (targetMetric === 'HOUSEHOLD_POWER') {
        // Effective if power dropped by at least 300W
        if (delta <= -300 || observedValue < execution.targetMetricValue) {
          isEffective = true;
          outcomeSummary = `Household power dropped by ${Math.abs(delta)}W (current: ${observedValue}W) following load shedding.`;
        } else if (elapsedMinutes >= 10) {
          isEffective = false;
          outcomeSummary = `Power draw remained elevated (delta: ${delta}W).`;
        } else {
          continue;
        }
      }

      const finalVerificationStatus = isEffective
        ? VerificationStatus.VERIFIED_EFFECTIVE
        : VerificationStatus.VERIFIED_INEFFECTIVE;

      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: {
          verificationStatus: finalVerificationStatus,
          status: AutomationStatus.COMPLETED,
          finalMetricValue: observedValue,
          metricDelta: delta,
          isEffective,
          observedOutcome: outcomeSummary,
          verificationLatencyMs: latencyMs,
          verifiedAt: currentTimestamp,
          completedAt: currentTimestamp,
        },
      });

      if (execution.commandId) {
        await prisma.deviceCommand.updateMany({
          where: { commandId: execution.commandId },
          data: { status: CommandStatus.COMPLETED, completedAt: currentTimestamp },
        }).catch(() => {});
      }

      const evalRecord: VerificationEvaluation = {
        executionId: execution.id,
        status: finalVerificationStatus,
        baselineValue: baseline,
        targetValue: execution.targetMetricValue,
        observedValue,
        delta,
        isEffective,
        verificationLatencyMs: latencyMs,
        summary: outcomeSummary,
      };

      evaluations.push(evalRecord);

      systemEventsBus.emit('automation_verified', {
        executionId: execution.id,
        policyName: execution.policy.name,
        verificationStatus: finalVerificationStatus,
        isEffective,
        delta,
        summary: outcomeSummary,
      });

      logger.info('Automation intervention verified', {
        executionId: execution.id,
        status: finalVerificationStatus,
        isEffective,
        delta,
        module: 'automation-verification',
      });
    }

    return evaluations;
  }
}
