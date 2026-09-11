import { describe, it, expect } from 'vitest';
import { DEMO_SCENARIOS } from '@/server/demo/scenarios';
import { SensorType } from '@prisma/client';

describe('Phase 8: Demo Scenarios Unit Tests', () => {
  const expectedScenarioIds = [
    'NORMAL_HOUSEHOLD',
    'WATER_LEAK',
    'CO2_VENTILATION',
    'AC_COOLING_FAILURE',
    'ENERGY_SURGE',
    'SAFETY_GUARDRAIL_REJECTION',
  ];

  it('defines all 6 required deterministic presentation scenarios', () => {
    for (const id of expectedScenarioIds) {
      const scenario = DEMO_SCENARIOS[id];
      expect(scenario, `Scenario ${id} must exist`).toBeDefined();
      expect(scenario.id).toBe(id);
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.steps.length).toBeGreaterThanOrEqual(2);
      expect(scenario.estimatedDurationSec).toBeGreaterThan(0);
    }
  });

  it('validates sequential step indices and non-empty step titles', () => {
    for (const [id, scenario] of Object.entries(DEMO_SCENARIOS)) {
      scenario.steps.forEach((step, idx) => {
        expect(step.stepIndex, `Step index in ${id} should be 1-indexed`).toBe(idx + 1);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.expectedOutcome.length).toBeGreaterThan(0);
      });
    }
  });

  it('verifies telemetry values conform to valid physical sensor types and units', () => {
    for (const [id, scenario] of Object.entries(DEMO_SCENARIOS)) {
      for (const step of scenario.steps) {
        expect(step.telemetry.length).toBeGreaterThan(0);
        for (const t of step.telemetry) {
          expect(Object.values(SensorType)).toContain(t.sensorType);
          expect(typeof t.value).toBe('number');
          expect(isNaN(t.value)).toBe(false);
          expect(typeof t.unit).toBe('string');
        }
      }
    }
  });

  it('verifies CO2_VENTILATION scenario models accurate accumulation and drop', () => {
    const co2Scenario = DEMO_SCENARIOS.CO2_VENTILATION;
    expect(co2Scenario).toBeDefined();

    const baselineStep = co2Scenario.steps[0];
    const peakStep = co2Scenario.steps[2];
    const clearedStep = co2Scenario.steps[4];

    const baselineCO2 = baselineStep.telemetry.find((t) => t.sensorType === SensorType.CO2)?.value!;
    const peakCO2 = peakStep.telemetry.find((t) => t.sensorType === SensorType.CO2)?.value!;
    const clearedCO2 = clearedStep.telemetry.find((t) => t.sensorType === SensorType.CO2)?.value!;

    expect(peakCO2).toBeGreaterThan(baselineCO2);
    expect(clearedCO2).toBeLessThan(peakCO2);
    expect(peakCO2 - clearedCO2).toBeGreaterThanOrEqual(250); // Significant ventilation clearance
  });
});
