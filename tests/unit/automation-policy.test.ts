import { describe, it, expect } from 'vitest';
import { DEFAULT_AUTOMATION_POLICIES } from '@/server/automation/policies';
import { AutomationDecisionEngine } from '@/server/automation/engine';
import { CandidateAction } from '@/server/automation/types';
import { ActuatorAction, AutomationMode, DeviceStatus, PredictiveIncidentType, PredictionTarget } from '@prisma/client';

describe('Phase 7: Automation Policy & Explainability Unit Tests', () => {
  it('validates default declarative policy definitions', () => {
    expect(DEFAULT_AUTOMATION_POLICIES.length).toBeGreaterThanOrEqual(4);

    for (const p of DEFAULT_AUTOMATION_POLICIES) {
      expect(p.name).toBeTruthy();
      expect(p.cooldownSec).toBeGreaterThan(0);
      expect(p.maxRuntimeSec).toBeGreaterThan(0);
      expect(p.minProbability).toBeGreaterThan(0);
      expect(p.minConfidence).toBeGreaterThan(0);
      expect(p.targetDeviceType).toBeTruthy();
      expect(p.action).toBeTruthy();
      expect(p.safetyChecks).toBeDefined();
    }
  });

  it('generates a deterministic, structured explainability proof without LLMs', () => {
    const candidate: CandidateAction = {
      policyId: 'policy_1',
      policyName: 'Ventilation CO2 Predictive Control',
      homeId: 'home_test',
      roomId: 'room_office',
      targetDeviceType: 'VENTILATION_FAN',
      action: ActuatorAction.TURN_ON,
      triggerReason: 'Room CO2 predicted to exceed 1,000 ppm threshold within 25 minutes',
      triggerEvidence: {
        predictiveIncidentType: PredictiveIncidentType.PREDICTED_CO2_VENTILATION,
        targetMetric: PredictionTarget.ROOM_CO2,
        currentValue: 742,
        predictedValue: 1034,
        thresholdValue: 1000,
        probability: 0.96,
        confidence: 0.97,
        horizonMinutes: 24,
        occupancyConfirmed: true,
        modelName: 'Seasonal Diurnal with Autoregressive Residual Decay',
      },
      expectedOutcome: 'Ventilation air exchange will reduce CO2 concentration below 1,000 ppm threshold.',
      baselineMetricValue: 742,
      targetMetricValue: 1000,
    };

    const mockSafety = {
      deviceCheck: { deviceId: 'dev_fan_office' },
    };

    const proof = AutomationDecisionEngine.formatExplanationProof(candidate, mockSafety);

    expect(proof).toContain('AUTOMATION ACTION: TURN_ON on VENTILATION_FAN');
    expect(proof).toContain('Reason: Room CO2 predicted to exceed 1,000 ppm threshold');
    expect(proof).toContain('Current: 742.0 vs Threshold: 1000.0');
    expect(proof).toContain('Predicted: 1034.0 across 24m horizon');
    expect(proof).toContain('Model: Seasonal Diurnal with Autoregressive Residual Decay');
    expect(proof).toContain('P=96%, C=97%');
    expect(proof).toContain('Room Occupancy: CONFIRMED');
    expect(proof).toContain('Mode: AUTO (fail-closed verified)');
  });
});
