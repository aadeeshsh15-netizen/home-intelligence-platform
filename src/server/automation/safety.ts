import { prisma } from '@/lib/db';
import {
  AutomationMode,
  DeviceStatus,
  ActuatorType,
  ActuatorAction,
} from '@prisma/client';
import { CandidateAction, SafetyCheckResult } from './types';
import { logger } from '@/lib/logger';

export class SafetyEvaluator {
  /**
   * Evaluates all safety constraints for a candidate action before execution.
   * Returns a structured SafetyCheckResult. Fails closed on any constraint breach.
   */
  public static async evaluate(
    candidate: CandidateAction,
    referenceTime: Date = new Date()
  ): Promise<SafetyCheckResult> {
    const refMs = referenceTime.getTime();

    // 1. Fetch policy from database
    const policy = await prisma.automationPolicy.findUnique({
      where: { id: candidate.policyId },
    });

    if (!policy) {
      return {
        passed: false,
        modeCheck: { mode: AutomationMode.DISABLED, allowed: false, reason: 'Policy does not exist' },
        cooldownCheck: { passed: false, remainingCooldownSec: 0 },
        deviceCheck: { deviceId: '', isOnline: false, isActuator: false, compatible: false },
        rateLimitCheck: { passed: false, activeCommandsCount: 0 },
        rejectionReason: 'Automation policy not found in database',
      };
    }

    // 2. Mode Check: AUTO allowed; MANUAL and DISABLED fail closed
    const modeCheck = {
      mode: policy.mode,
      allowed: policy.mode === AutomationMode.AUTO && policy.isEnabled,
      reason: policy.mode !== AutomationMode.AUTO
        ? `Policy mode is ${policy.mode} (manual override active)`
        : !policy.isEnabled
        ? 'Policy is explicitly disabled'
        : undefined,
    };

    if (!modeCheck.allowed) {
      return {
        passed: false,
        modeCheck,
        cooldownCheck: { passed: true, remainingCooldownSec: 0 },
        deviceCheck: { deviceId: '', isOnline: false, isActuator: false, compatible: false },
        rateLimitCheck: { passed: true, activeCommandsCount: 0 },
        rejectionReason: modeCheck.reason,
      };
    }

    // 3. Device Availability & Capability Check
    // Find target actuator device in the same room or home
    const eligibleDevices = await prisma.device.findMany({
      where: {
        room: { floor: { homeId: candidate.homeId } },
        ...(candidate.roomId ? { roomId: candidate.roomId } : {}),
        status: DeviceStatus.ONLINE,
        OR: [
          { deviceType: candidate.targetDeviceType },
          { actuatorType: candidate.targetDeviceType as ActuatorType },
        ],
      },
    });

    if (eligibleDevices.length === 0) {
      return {
        passed: false,
        modeCheck,
        cooldownCheck: { passed: true, remainingCooldownSec: 0 },
        deviceCheck: {
          deviceId: '',
          isOnline: false,
          isActuator: false,
          compatible: false,
          reason: `No ONLINE actuator device matching type '${candidate.targetDeviceType}' found`,
        },
        rateLimitCheck: { passed: true, activeCommandsCount: 0 },
        rejectionReason: `Device unavailable or offline (fail-closed for ${candidate.targetDeviceType})`,
      };
    }

    const selectedDevice = eligibleDevices[0];

    // Verify electrical safety: prohibit mains voltage control
    const deviceTypeUpper = selectedDevice.deviceType.toUpperCase();
    if (deviceTypeUpper.includes('MAINS') || deviceTypeUpper.includes('HIGH_VOLTAGE')) {
      return {
        passed: false,
        modeCheck,
        cooldownCheck: { passed: true, remainingCooldownSec: 0 },
        deviceCheck: {
          deviceId: selectedDevice.id,
          isOnline: true,
          isActuator: selectedDevice.isActuator,
          compatible: false,
          reason: 'Mains-voltage control is prohibited by safety policy',
        },
        rateLimitCheck: { passed: true, activeCommandsCount: 0 },
        rejectionReason: 'Security safety violation: mains voltage device actuation rejected',
      };
    }

    const deviceCheck = {
      deviceId: selectedDevice.id,
      isOnline: selectedDevice.status === DeviceStatus.ONLINE,
      isActuator: selectedDevice.isActuator || true,
      actuatorType: selectedDevice.actuatorType,
      compatible: true,
    };

    // 4. Cooldown Check
    let cooldownPassed = true;
    let remainingCooldownSec = 0;

    if (policy.lastTriggeredAt) {
      const elapsedSec = Math.floor((refMs - policy.lastTriggeredAt.getTime()) / 1000);
      if (elapsedSec < policy.cooldownSec) {
        cooldownPassed = false;
        remainingCooldownSec = policy.cooldownSec - elapsedSec;
      }
    }

    const cooldownCheck = {
      passed: cooldownPassed,
      remainingCooldownSec,
    };

    if (!cooldownPassed) {
      return {
        passed: false,
        modeCheck,
        cooldownCheck,
        deviceCheck,
        rateLimitCheck: { passed: true, activeCommandsCount: 0 },
        rejectionReason: `Policy in cooldown period (${remainingCooldownSec}s remaining of ${policy.cooldownSec}s)`,
      };
    }

    // 5. Rate Limit / Duplicate Command Check (Idempotency)
    const activeCommandsCount = await prisma.deviceCommand.count({
      where: {
        deviceId: selectedDevice.id,
        action: candidate.action,
        status: { in: ['PENDING', 'SENT', 'ACKNOWLEDGED'] },
        expiresAt: { gt: referenceTime },
      },
    });

    const rateLimitPassed = activeCommandsCount === 0;
    const rateLimitCheck = {
      passed: rateLimitPassed,
      activeCommandsCount,
    };

    if (!rateLimitPassed) {
      return {
        passed: false,
        modeCheck,
        cooldownCheck,
        deviceCheck,
        rateLimitCheck,
        rejectionReason: `Duplicate command suppressed: device ${selectedDevice.identifier} already has active command in flight`,
      };
    }

    // All safety constraints satisfied
    return {
      passed: true,
      modeCheck,
      cooldownCheck,
      deviceCheck,
      rateLimitCheck,
    };
  }
}
