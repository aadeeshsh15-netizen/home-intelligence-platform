import { prisma } from '@/lib/db';
import {
  ActuatorAction,
  AutomationMode,
  PredictiveIncidentType,
  PredictionTarget,
} from '@prisma/client';
import { logger } from '@/lib/logger';

export interface DefaultPolicyDefinition {
  name: string;
  description: string;
  triggerType: PredictiveIncidentType;
  targetMetric: PredictionTarget;
  minProbability: number;
  minConfidence: number;
  cooldownSec: number;
  maxRuntimeSec: number;
  targetDeviceType: string;
  action: ActuatorAction;
  parameters: Record<string, any>;
  safetyChecks: Record<string, any>;
}

export const DEFAULT_AUTOMATION_POLICIES: DefaultPolicyDefinition[] = [
  {
    name: 'Ventilation CO2 Predictive Control',
    description: 'Activates room ventilation fan when indoor CO2 is forecast to breach 1,000 ppm while occupied.',
    triggerType: PredictiveIncidentType.PREDICTED_CO2_VENTILATION,
    targetMetric: PredictionTarget.ROOM_CO2,
    minProbability: 0.75,
    minConfidence: 0.70,
    cooldownSec: 900, // 15 min cooldown
    maxRuntimeSec: 1800, // 30 min max run
    targetDeviceType: 'VENTILATION_FAN',
    action: ActuatorAction.TURN_ON,
    parameters: { speed: 2, durationSec: 1800 },
    safetyChecks: { requireOccupancy: true, failClosed: true },
  },
  {
    name: 'Thermal Influx & AC Backup Cooling',
    description: 'Activates auxiliary ventilation or emergency fan when room temperature is forecast to climb above comfort limits.',
    triggerType: PredictiveIncidentType.PREDICTED_AC_FAILURE,
    targetMetric: PredictionTarget.ROOM_TEMPERATURE,
    minProbability: 0.80,
    minConfidence: 0.75,
    cooldownSec: 1200, // 20 min cooldown
    maxRuntimeSec: 3600, // 60 min max run
    targetDeviceType: 'VENTILATION_FAN',
    action: ActuatorAction.TURN_ON,
    parameters: { speed: 3, mode: 'COOLING_ASSIST', durationSec: 3600 },
    safetyChecks: { requireOccupancy: true, failClosed: true },
  },
  {
    name: 'Peak Energy Surge Load Shedding',
    description: 'Signals low-voltage auxiliary relay to shed non-essential DC loads when household power is forecast to spike > 2,000W.',
    triggerType: PredictiveIncidentType.PREDICTED_ENERGY_SURGE,
    targetMetric: PredictionTarget.HOUSEHOLD_POWER,
    minProbability: 0.80,
    minConfidence: 0.75,
    cooldownSec: 1800, // 30 min cooldown
    maxRuntimeSec: 1800, // 30 min max run
    targetDeviceType: 'LOW_VOLTAGE_RELAY',
    action: ActuatorAction.SHED_LOAD,
    parameters: { relayChannel: 1, targetShedWatts: 800, durationSec: 1800 },
    safetyChecks: { failClosed: true, minIntervalSec: 900 },
  },
  {
    name: 'Thermal Breach Visual Warning',
    description: 'Pulses status indicator LED when cold exterior air ingress is forecast to cause rapid temperature drop.',
    triggerType: PredictiveIncidentType.PREDICTED_THERMAL_BREACH,
    targetMetric: PredictionTarget.ROOM_TEMPERATURE,
    minProbability: 0.75,
    minConfidence: 0.70,
    cooldownSec: 600, // 10 min cooldown
    maxRuntimeSec: 300, // 5 min max run
    targetDeviceType: 'STATUS_LED',
    action: ActuatorAction.PULSE,
    parameters: { blinkRateHz: 2, color: 'AMBER', durationSec: 300 },
    safetyChecks: { failClosed: true },
  },
];

/**
 * Ensures default automation policies exist in the database for the given home.
 */
export async function ensureDefaultPolicies(homeId: string): Promise<void> {
  for (const def of DEFAULT_AUTOMATION_POLICIES) {
    const existing = await prisma.automationPolicy.findFirst({
      where: {
        homeId,
        triggerType: def.triggerType,
      },
    });

    if (!existing) {
      await prisma.automationPolicy.create({
        data: {
          homeId,
          name: def.name,
          description: def.description,
          mode: AutomationMode.AUTO,
          triggerType: def.triggerType,
          targetMetric: def.targetMetric,
          minProbability: def.minProbability,
          minConfidence: def.minConfidence,
          cooldownSec: def.cooldownSec,
          maxRuntimeSec: def.maxRuntimeSec,
          targetDeviceType: def.targetDeviceType,
          action: def.action,
          parameters: def.parameters,
          safetyChecks: def.safetyChecks,
          isEnabled: true,
        },
      });

      logger.info('Initialized default automation policy', {
        homeId,
        policyName: def.name,
        triggerType: def.triggerType,
        module: 'automation-policies',
      });
    }
  }
}
