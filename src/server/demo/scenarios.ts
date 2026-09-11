import { SensorType } from '@prisma/client';

export interface DemoStep {
  stepIndex: number;
  title: string;
  description: string;
  expectedOutcome: string;
  telemetry: {
    sensorType: SensorType;
    roomType?: string; // e.g. "OFFICE", "LIVING_ROOM", "KITCHEN"
    value: number;
    unit: string;
  }[];
}

export interface DemoScenarioDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  targetMetric: string;
  estimatedDurationSec: number;
  steps: DemoStep[];
}

export const DEMO_SCENARIOS: Record<string, DemoScenarioDefinition> = {
  NORMAL_HOUSEHOLD: {
    id: 'NORMAL_HOUSEHOLD',
    title: 'Nominal Household Baseline',
    category: 'BASELINE',
    description: 'Continuous nominal telemetry across all household zones. Baselines satisfied, zero anomalies, zero alerts.',
    targetMetric: 'ALL_METRICS',
    estimatedDurationSec: 10,
    steps: [
      {
        stepIndex: 1,
        title: 'Nominal Baseline Sampling 1',
        description: 'Living room and office telemetry operating within normal Gaussian baseline distribution.',
        expectedOutcome: 'Valid ingestion, 0 anomalies, 0 incidents.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 21.5, unit: '°C' },
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 450, unit: 'ppm' },
          { sensorType: SensorType.POWER, value: 350, unit: 'W' },
        ],
      },
      {
        stepIndex: 2,
        title: 'Nominal Baseline Sampling 2',
        description: 'Second sampling cycle confirming continuous steady-state equilibrium.',
        expectedOutcome: 'Valid ingestion, normal operation.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 21.6, unit: '°C' },
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 460, unit: 'ppm' },
          { sensorType: SensorType.POWER, value: 360, unit: 'W' },
        ],
      },
      {
        stepIndex: 3,
        title: 'Nominal Baseline Verification',
        description: 'System health remains HEALTHY across all subsystems.',
        expectedOutcome: 'Zero alerts or warnings generated.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 21.4, unit: '°C' },
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 455, unit: 'ppm' },
          { sensorType: SensorType.POWER, value: 355, unit: 'W' },
        ],
      },
    ],
  },

  WATER_LEAK: {
    id: 'WATER_LEAK',
    title: 'Unoccupied Water Flow Leak Detection',
    category: 'INCIDENT',
    description: 'Continuous water flow detected during zero-occupancy night period. Phase 2 correlation engine forms cross-sensor incident.',
    targetMetric: 'WATER_FLOW',
    estimatedDurationSec: 15,
    steps: [
      {
        stepIndex: 1,
        title: 'Pre-Incident Baseline',
        description: 'Zero flow and zero occupancy recorded.',
        expectedOutcome: 'Nominal readings.',
        telemetry: [
          { sensorType: SensorType.WATER_FLOW, value: 0.0, unit: 'L/min' },
          { sensorType: SensorType.OCCUPANCY, value: 0.0, unit: '' },
        ],
      },
      {
        stepIndex: 2,
        title: 'Abnormal Water Flow Onset',
        description: 'Continuous pipe flow starts at 14.5 L/min with zero occupancy confirmed.',
        expectedOutcome: 'Single-sensor flow anomaly detected (z > 3.0).',
        telemetry: [
          { sensorType: SensorType.WATER_FLOW, value: 14.5, unit: 'L/min' },
          { sensorType: SensorType.OCCUPANCY, value: 0.0, unit: '' },
        ],
      },
      {
        stepIndex: 3,
        title: 'Multi-Sensor Incident Correlation',
        description: 'Corroboration window elapses with sustaining water flow.',
        expectedOutcome: 'Phase 2 Cross-Sensor Incident: WATER_LEAK formed with confidence > 80%.',
        telemetry: [
          { sensorType: SensorType.WATER_FLOW, value: 18.2, unit: 'L/min' },
          { sensorType: SensorType.OCCUPANCY, value: 0.0, unit: '' },
        ],
      },
    ],
  },

  CO2_VENTILATION: {
    id: 'CO2_VENTILATION',
    title: 'CO₂ Accumulation & Autonomous Closed-Loop Ventilation',
    category: 'CLOSED_LOOP_AUTOMATION',
    description: 'Office CO₂ climbs. Anticipatory engine forecasts threshold breach. Policy dispatches ventilation fan. CO₂ drops and intervention is verified effective.',
    targetMetric: 'ROOM_CO2',
    estimatedDurationSec: 25,
    steps: [
      {
        stepIndex: 1,
        title: 'Pre-Meeting Baseline',
        description: 'Office occupied with normal air quality.',
        expectedOutcome: 'Baseline readings logged.',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 750, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
      {
        stepIndex: 2,
        title: 'CO₂ Rapid Buildup',
        description: 'CO₂ climbs to 1,180 ppm with steep positive gradient. Predictive CDF crosses 1,200 ppm threshold.',
        expectedOutcome: 'Early Warning: PREDICTED_CO2_VENTILATION generated (P > 0.85, lead time ~12m).',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 1180, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
      {
        stepIndex: 3,
        title: 'Policy Evaluation & Command Dispatch',
        description: 'Fail-closed safety constraints pass. Actuator command TURN_ON dispatched to Ventilation Fan.',
        expectedOutcome: 'Automation execution created (status: VERIFYING). Command dispatched via MQTT / simulator.',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 1240, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
      {
        stepIndex: 4,
        title: 'Fresh Air Influx Response',
        description: 'Ventilation fan clears air; CO₂ concentration drops by over 250 ppm.',
        expectedOutcome: 'CO₂ concentration falls to 920 ppm.',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 920, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
      {
        stepIndex: 5,
        title: 'Empirical Closed-Loop Verification',
        description: 'Closed-Loop Verification Engine evaluates delta against baseline.',
        expectedOutcome: 'Execution marked VERIFIED_EFFECTIVE (observed delta < -30 ppm).',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 850, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
    ],
  },

  AC_COOLING_FAILURE: {
    id: 'AC_COOLING_FAILURE',
    title: 'AC Compressor Failure & Thermal Breach Forecast',
    category: 'PREDICTION',
    description: 'Indoor temperature rises on hot afternoon despite AC power draw. Early warning issued before room overheats.',
    targetMetric: 'ROOM_TEMPERATURE',
    estimatedDurationSec: 20,
    steps: [
      {
        stepIndex: 1,
        title: 'Cooling Baseline',
        description: 'Indoor temperature at setpoint (22.0°C).',
        expectedOutcome: 'Nominal temperature.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 22.0, unit: '°C' },
          { sensorType: SensorType.POWER, value: 1800, unit: 'W' },
        ],
      },
      {
        stepIndex: 2,
        title: 'Compressor Stall & Thermal Rise',
        description: 'Temperature diverges upward to 23.8°C with high drift rate.',
        expectedOutcome: 'Statistical anomaly detected.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 23.8, unit: '°C' },
          { sensorType: SensorType.POWER, value: 1800, unit: 'W' },
        ],
      },
      {
        stepIndex: 3,
        title: 'Anticipatory Incident Trigger',
        description: 'Forecast projects 26°C breach within 25 minutes.',
        expectedOutcome: 'PREDICTED_AC_FAILURE early warning created with high confidence.',
        telemetry: [
          { sensorType: SensorType.TEMPERATURE, roomType: 'LIVING_ROOM', value: 24.9, unit: '°C' },
          { sensorType: SensorType.POWER, value: 1800, unit: 'W' },
        ],
      },
    ],
  },

  ENERGY_SURGE: {
    id: 'ENERGY_SURGE',
    title: 'Peak Demand Energy Surge & Load Shedding',
    category: 'CLOSED_LOOP_AUTOMATION',
    description: 'Household power exceeds 3,500W threshold. Learned GBDT model forecasts sustained peak. Load shedding policy sheds non-essential relays.',
    targetMetric: 'HOUSEHOLD_POWER',
    estimatedDurationSec: 20,
    steps: [
      {
        stepIndex: 1,
        title: 'Nominal Load',
        description: 'Baseline household draw at 850W.',
        expectedOutcome: 'Nominal power readings.',
        telemetry: [{ sensorType: SensorType.POWER, value: 850, unit: 'W' }],
      },
      {
        stepIndex: 2,
        title: 'Simultaneous High-Draw Appliances',
        description: 'Power draw surges to 3,650W. GBDT forecasts sustained overload.',
        expectedOutcome: 'PREDICTED_ENERGY_SURGE early warning triggered.',
        telemetry: [{ sensorType: SensorType.POWER, value: 3650, unit: 'W' }],
      },
      {
        stepIndex: 3,
        title: 'Load-Shedding Actuation',
        description: 'Policy triggers SHED_LOAD on high-draw auxiliary circuits.',
        expectedOutcome: 'Command dispatched; power draw reduces by over 1,500W.',
        telemetry: [{ sensorType: SensorType.POWER, value: 1650, unit: 'W' }],
      },
      {
        stepIndex: 4,
        title: 'Load Stabilization Verification',
        description: 'Power draw stabilizes safely below threshold.',
        expectedOutcome: 'Intervention verified VERIFIED_EFFECTIVE (delta < -300W).',
        telemetry: [{ sensorType: SensorType.POWER, value: 1420, unit: 'W' }],
      },
    ],
  },

  SAFETY_GUARDRAIL_REJECTION: {
    id: 'SAFETY_GUARDRAIL_REJECTION',
    title: 'Fail-Closed Safety Guardrail Rejection',
    category: 'SAFETY',
    description: 'Candidate action triggers in disabled/locked policy mode. Decision engine enforces fail-closed guardrail and logs rejection proof.',
    targetMetric: 'ROOM_CO2',
    estimatedDurationSec: 15,
    steps: [
      {
        stepIndex: 1,
        title: 'Warning Condition Influx',
        description: 'CO₂ rises to warning level while policy is set to MANUAL mode.',
        expectedOutcome: 'Predictive warning generated.',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 1280, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
      {
        stepIndex: 2,
        title: 'Safety Evaluation Check',
        description: 'Safety Evaluator validates mode check and detects MANUAL mode requirement.',
        expectedOutcome: 'Actuation blocked by safety constraint: policy mode is MANUAL. Logged to audit timeline.',
        telemetry: [
          { sensorType: SensorType.CO2, roomType: 'OFFICE', value: 1300, unit: 'ppm' },
          { sensorType: SensorType.OCCUPANCY, roomType: 'OFFICE', value: 1.0, unit: '' },
        ],
      },
    ],
  },
};
