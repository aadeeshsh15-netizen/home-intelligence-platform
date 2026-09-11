import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { AutomationDecisionEngine } from '@/server/automation/engine';
import { ensureDefaultPolicies } from '@/server/automation/policies';
import {
  ActuatorAction,
  ActuatorType,
  AutomationMode,
  AutomationStatus,
  DeviceProtocol,
  DeviceStatus,
  ModelType,
  PredictiveIncidentStatus,
  PredictiveIncidentType,
  PredictionOutcome,
  PredictionTarget,
  SeverityLevel,
} from '@prisma/client';

describe('Phase 7: Automation Decision Engine Integration Tests', () => {
  let home: any;
  let room: any;
  let fanDevice: any;
  let warningIncident: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');

    room = await prisma.room.findFirst({
      where: { floor: { homeId: home.id } },
    });
    if (!room) throw new Error('No test room found');

    await ensureDefaultPolicies(home.id);

    // Create a simulated low-voltage actuator device
    fanDevice = await prisma.device.create({
      data: {
        name: 'Office Ventilation Fan',
        deviceType: 'VENTILATION_FAN',
        hardwareType: 'SIMULATED',
        protocol: DeviceProtocol.SIMULATED,
        identifier: `sim-fan-${Date.now()}`,
        status: DeviceStatus.ONLINE,
        isActuator: true,
        actuatorType: ActuatorType.VENTILATION_FAN,
        roomId: room.id,
      },
    });
  });

  beforeEach(async () => {
    await prisma.automationPolicy.updateMany({
      where: { homeId: home.id },
      data: { mode: AutomationMode.AUTO, lastTriggeredAt: null, isEnabled: true },
    });
  });

  afterAll(async () => {
    if (warningIncident) {
      await prisma.automationExecution.deleteMany({ where: { predictiveIncidentId: warningIncident.id } });
      await prisma.predictiveIncident.delete({ where: { id: warningIncident.id } }).catch(() => {});
    }
    if (fanDevice) {
      await prisma.deviceCommand.deleteMany({ where: { deviceId: fanDevice.id } });
      await prisma.automationExecution.deleteMany({ where: { deviceId: fanDevice.id } });
      await prisma.device.delete({ where: { id: fanDevice.id } });
    }
    await prisma.automationPolicy.updateMany({
      where: { homeId: home.id },
      data: { mode: AutomationMode.AUTO, lastTriggeredAt: null, isEnabled: true },
    });
  });

  it('evaluates predictive warning, enforces safety checks, and executes candidate action', async () => {
    // 1. Create a simulated predictive incident
    warningIncident = await prisma.predictiveIncident.create({
      data: {
        homeId: home.id,
        roomId: room.id,
        type: PredictiveIncidentType.PREDICTED_CO2_VENTILATION,
        target: PredictionTarget.ROOM_CO2,
        status: PredictiveIncidentStatus.PREDICTED,
        outcome: PredictionOutcome.UNRESOLVED,
        severity: SeverityLevel.WARNING,
        title: 'Office: Predicted CO2 Threshold Breach',
        summary: 'CO2 projected to exceed 1,000 ppm within 20 minutes',
        explanation: 'Diurnal accumulation with 2 occupants present',
        probability: 0.95,
        confidence: 0.96,
        horizonMinutes: 20,
        currentValue: 820,
        predictedValue: 1045,
        thresholdValue: 1000,
        baselineValue: 600,
        modelType: ModelType.STATISTICAL_SEASONAL_DECAY,
        modelName: 'Seasonal Diurnal with Autoregressive Residual Decay',
        contributingEvidence: { occupancy: true },
      },
    });

    // 2. Execute decision engine
    const decisions = await AutomationDecisionEngine.processIngestedBatch(home.id);
    const co2Decision = decisions.find((d) => d.candidateAction.predictiveIncidentId === warningIncident.id);

    expect(co2Decision).toBeDefined();
    expect(co2Decision?.approved).toBe(true);
    expect(co2Decision?.selectedDeviceId).toBe(fanDevice.id);
    expect(co2Decision?.candidateAction.action).toBe(ActuatorAction.TURN_ON);

    // 3. Verify execution record in database
    const execution = await prisma.automationExecution.findFirst({
      where: { predictiveIncidentId: warningIncident.id },
      include: { command: true },
    });

    expect(execution).not.toBeNull();
    expect(execution?.status).toBe(AutomationStatus.VERIFYING);
    expect(execution?.decisionExplanation).toContain('AUTOMATION ACTION: TURN_ON on VENTILATION_FAN');
    expect(execution?.command?.status).toBe('ACKNOWLEDGED');
  });

  it('fails closed and blocks automation when policy is DISABLED or set to MANUAL', async () => {
    // Update CO2 policy to DISABLED
    const policy = await prisma.automationPolicy.findFirst({
      where: { homeId: home.id, triggerType: PredictiveIncidentType.PREDICTED_CO2_VENTILATION },
    });
    if (!policy) throw new Error('Policy not found');

    await prisma.automationPolicy.update({
      where: { id: policy.id },
      data: { mode: AutomationMode.DISABLED, lastTriggeredAt: null },
    });

    // Create a new warning
    const secondWarning = await prisma.predictiveIncident.create({
      data: {
        homeId: home.id,
        roomId: room.id,
        type: PredictiveIncidentType.PREDICTED_CO2_VENTILATION,
        target: PredictionTarget.ROOM_CO2,
        status: PredictiveIncidentStatus.PREDICTED,
        outcome: PredictionOutcome.UNRESOLVED,
        severity: SeverityLevel.WARNING,
        title: 'Office: Second Warning',
        summary: 'CO2 projected to exceed limit',
        explanation: 'Test explanation',
        probability: 0.95,
        confidence: 0.95,
        horizonMinutes: 15,
        currentValue: 850,
        predictedValue: 1080,
        thresholdValue: 1000,
        baselineValue: 600,
        modelType: ModelType.STATISTICAL_SEASONAL_DECAY,
        modelName: 'Seasonal Diurnal with Autoregressive Residual Decay',
        contributingEvidence: { occupancy: true },
      },
    });

    const decisions = await AutomationDecisionEngine.processIngestedBatch(home.id);
    const blockedDecision = decisions.find((d) => d.candidateAction.predictiveIncidentId === secondWarning.id);

    expect(blockedDecision).toBeDefined();
    expect(blockedDecision?.approved).toBe(false);
    expect(blockedDecision?.rejectionReason).toContain('DISABLED');

    // Restore policy mode to AUTO
    await prisma.automationPolicy.update({
      where: { id: policy.id },
      data: { mode: AutomationMode.AUTO },
    });

    // Cleanup second warning
    await prisma.predictiveIncident.delete({ where: { id: secondWarning.id } });
  });

  it('fails closed and blocks actuation if the target device is OFFLINE', async () => {
    // Set device to OFFLINE
    await prisma.device.update({
      where: { id: fanDevice.id },
      data: { status: DeviceStatus.OFFLINE },
    });

    await prisma.automationPolicy.updateMany({
      where: { homeId: home.id },
      data: { mode: AutomationMode.AUTO, lastTriggeredAt: null },
    });

    const thirdWarning = await prisma.predictiveIncident.create({
      data: {
        homeId: home.id,
        roomId: room.id,
        type: PredictiveIncidentType.PREDICTED_CO2_VENTILATION,
        target: PredictionTarget.ROOM_CO2,
        status: PredictiveIncidentStatus.PREDICTED,
        outcome: PredictionOutcome.UNRESOLVED,
        severity: SeverityLevel.WARNING,
        title: 'Office: Offline Device Warning',
        summary: 'CO2 rising',
        explanation: 'Test offline',
        probability: 0.95,
        confidence: 0.95,
        horizonMinutes: 15,
        currentValue: 880,
        predictedValue: 1090,
        thresholdValue: 1000,
        baselineValue: 600,
        modelType: ModelType.STATISTICAL_SEASONAL_DECAY,
        modelName: 'Seasonal Diurnal with Autoregressive Residual Decay',
        contributingEvidence: { occupancy: true },
      },
    });

    const decisions = await AutomationDecisionEngine.processIngestedBatch(home.id);
    const offlineDecision = decisions.find((d) => d.candidateAction.predictiveIncidentId === thirdWarning.id);

    expect(offlineDecision).toBeDefined();
    expect(offlineDecision?.approved).toBe(false);
    expect(offlineDecision?.rejectionReason).toContain('offline');

    // Restore device to ONLINE
    await prisma.device.update({
      where: { id: fanDevice.id },
      data: { status: DeviceStatus.ONLINE },
    });

    // Cleanup
    await prisma.predictiveIncident.delete({ where: { id: thirdWarning.id } });
  });
});
