import { describe, it, expect } from 'vitest';
import { CrossSensorCorrelationEngine } from '../../src/server/intelligence/correlation/engine';
import { STANDARD_CORRELATION_RULES } from '../../src/server/intelligence/correlation/rules';
import { ContributingSensorEvidence } from '../../src/server/intelligence/correlation/types';

describe('Cross-Sensor Correlation Engine - Mathematical Derivations', () => {
  it('returns 0 confidence when no signals are satisfied', () => {
    const allEvidence: ContributingSensorEvidence[] = [
      {
        sensorId: 'sensor-temp-1',
        sensorType: 'TEMPERATURE',
        roomName: 'Kitchen',
        signalType: 'RATE_OF_CHANGE_GT',
        observedValue: 0.01,
        unit: '°C',
        weight: 0.35,
        satisfied: false,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-power-1',
        sensorType: 'POWER',
        roomName: 'Kitchen',
        signalType: 'VALUE_GT',
        observedValue: 120,
        unit: 'W',
        weight: 0.65,
        satisfied: false,
        timestamp: new Date().toISOString(),
      },
    ];

    const satisfied: ContributingSensorEvidence[] = [];
    const confidence = CrossSensorCorrelationEngine.calculateConfidence(satisfied, allEvidence);
    expect(confidence).toBe(0);
  });

  it('correctly scales raw confidence by single sensor corroboration factor (0.70)', () => {
    const allEvidence: ContributingSensorEvidence[] = [
      {
        sensorId: 'sensor-temp-1',
        sensorType: 'TEMPERATURE',
        roomName: 'Kitchen',
        signalType: 'VALUE_GT',
        observedValue: 28.5,
        unit: '°C',
        weight: 0.40,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-power-1',
        sensorType: 'POWER',
        roomName: 'Kitchen',
        signalType: 'VALUE_GT',
        observedValue: 200,
        unit: 'W',
        weight: 0.60,
        satisfied: false,
        timestamp: new Date().toISOString(),
      },
    ];

    const satisfied = allEvidence.filter((e) => e.satisfied);
    // Raw confidence = 0.40 / 1.0 = 0.40
    // Distinct sensors = 1 -> Corroboration factor = 0.70 + 0.10 * 0 = 0.70
    // Final confidence = 0.40 * 0.70 = 0.28
    const confidence = CrossSensorCorrelationEngine.calculateConfidence(satisfied, allEvidence);
    expect(confidence).toBe(0.28);
  });

  it('rewards multi-sensor corroboration for distinct physical sensing channels', () => {
    const allEvidence: ContributingSensorEvidence[] = [
      {
        sensorId: 'sensor-occ-1',
        sensorType: 'OCCUPANCY',
        roomName: 'Kitchen',
        signalType: 'VALUE_EQ',
        observedValue: 1,
        unit: '',
        weight: 0.25,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-power-1',
        sensorType: 'POWER',
        roomName: 'Kitchen',
        signalType: 'VALUE_GT',
        observedValue: 1800,
        unit: 'W',
        weight: 0.30,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-pm25-1',
        sensorType: 'PM2_5',
        roomName: 'Kitchen',
        signalType: 'VALUE_GT',
        observedValue: 42,
        unit: 'µg/m³',
        weight: 0.20,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-temp-1',
        sensorType: 'TEMPERATURE',
        roomName: 'Kitchen',
        signalType: 'RATE_OF_CHANGE_GT',
        observedValue: 0.08,
        unit: '°C/min',
        weight: 0.25,
        satisfied: false,
        timestamp: new Date().toISOString(),
      },
    ];

    const satisfied = allEvidence.filter((e) => e.satisfied);
    // Satisfied weight = 0.25 + 0.30 + 0.20 = 0.75
    // Total weight = 1.00
    // Distinct sensors = 3 -> Corroboration factor = 0.70 + 0.10 * 2 = 0.90
    // Expected confidence = 0.75 * 0.90 = 0.675 -> (0.675).toFixed(2) in JS is 0.67
    const confidence = CrossSensorCorrelationEngine.calculateConfidence(satisfied, allEvidence);
    expect(confidence).toBe(0.67);
  });

  it('caps maximum incident confidence at 0.99 (no fictitious 100% certainty)', () => {
    const allEvidence: ContributingSensorEvidence[] = [
      {
        sensorId: 'sensor-1',
        sensorType: 'OCCUPANCY',
        roomName: 'Powder Room',
        signalType: 'VALUE_EQ',
        observedValue: 0,
        unit: '',
        weight: 0.35,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-2',
        sensorType: 'WATER_FLOW',
        roomName: 'Powder Room',
        signalType: 'VALUE_GT',
        observedValue: 4.2,
        unit: 'L/min',
        weight: 0.40,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-3',
        sensorType: 'HUMIDITY',
        roomName: 'Powder Room',
        signalType: 'VALUE_GT',
        observedValue: 88,
        unit: '%',
        weight: 0.25,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-4',
        sensorType: 'TEMPERATURE',
        roomName: 'Powder Room',
        signalType: 'RATE_OF_CHANGE_LT',
        observedValue: -0.2,
        unit: '°C/min',
        weight: 0.20,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
    ];

    const satisfied = [...allEvidence];
    // Satisfied weight = 1.20, Total weight = 1.20 -> Raw = 1.0
    // Distinct sensors = 4 -> Corroboration factor = 0.70 + 0.10 * 3 = 1.0
    // 1.0 * 1.0 = 1.0 -> Capped at 0.99
    const confidence = CrossSensorCorrelationEngine.calculateConfidence(satisfied, allEvidence);
    expect(confidence).toBe(0.99);
  });

  it('does not inflate corroboration factor when multiple signals originate from the SAME physical sensor', () => {
    // Both signals originate from sensor-multi-1
    const allEvidence: ContributingSensorEvidence[] = [
      {
        sensorId: 'sensor-multi-1',
        sensorType: 'TEMPERATURE',
        roomName: 'Living Room',
        signalType: 'VALUE_GT',
        observedValue: 27,
        unit: '°C',
        weight: 0.50,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
      {
        sensorId: 'sensor-multi-1',
        sensorType: 'TEMPERATURE',
        roomName: 'Living Room',
        signalType: 'RATE_OF_CHANGE_GT',
        observedValue: 0.15,
        unit: '°C/min',
        weight: 0.50,
        satisfied: true,
        timestamp: new Date().toISOString(),
      },
    ];

    const satisfied = [...allEvidence];
    // Raw = 1.0 / 1.0 = 1.0
    // Distinct sensors = 1 -> Corroboration factor = 0.70
    // Final = 0.70
    const confidence = CrossSensorCorrelationEngine.calculateConfidence(satisfied, allEvidence);
    expect(confidence).toBe(0.70);
  });

  it('verifies standard correlation rule definitions are complete and mathematically sound', () => {
    expect(STANDARD_CORRELATION_RULES.length).toBeGreaterThanOrEqual(4);

    const ruleIds = new Set<string>();
    for (const rule of STANDARD_CORRELATION_RULES) {
      // Unique rule ID
      expect(ruleIds.has(rule.id)).toBe(false);
      ruleIds.add(rule.id);

      // Temporal window is bounded between 5 and 30 minutes
      expect(rule.correlationWindowSeconds).toBeGreaterThanOrEqual(300);
      expect(rule.correlationWindowSeconds).toBeLessThanOrEqual(1800);

      // Confidence threshold is rigorous (>= 0.65)
      expect(rule.minimumConfidenceThreshold).toBeGreaterThanOrEqual(0.65);

      // Contains at least 2 distinct signal conditions
      expect(rule.signals.length).toBeGreaterThanOrEqual(2);

      // Has at least one required signal or weighted multi-channel signals
      const weightsSum = rule.signals.reduce((acc, s) => acc + s.weight, 0);
      expect(weightsSum).toBeGreaterThanOrEqual(0.95);

      // Test description evaluator produces explainable narrative
      const mockResult = rule.evaluateContext({
        room: { id: 'test-room', name: 'Kitchen & Dining', roomType: 'KITCHEN' },
        signalsSatisfied: [
          {
            sensorId: 's1',
            sensorType: 'OCCUPANCY',
            roomName: 'Kitchen',
            signalType: 'VALUE_EQ',
            observedValue: 1,
            unit: '',
            weight: 0.25,
            satisfied: true,
            timestamp: new Date().toISOString(),
            explanation: 'Occupant presence verified',
          },
        ],
        allEvidence: [],
        allSignals: [],
        windowSeconds: rule.correlationWindowSeconds,
      });

      expect(mockResult.title).toBeDefined();
      expect(mockResult.summary).toBeDefined();
      expect(mockResult.explanation).toBeDefined();
      expect(mockResult.summary).toContain('Kitchen');
    }
  });
});
