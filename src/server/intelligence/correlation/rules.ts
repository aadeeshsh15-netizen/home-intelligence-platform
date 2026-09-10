import { CorrelationRule } from './types';
import { SeverityLevel } from '@prisma/client';

export const STANDARD_CORRELATION_RULES: CorrelationRule[] = [
  // 1. Cooking Event Rule
  {
    id: 'rule-cooking-event',
    incidentType: 'COOKING_EVENT',
    name: 'Culinary Activity & Thermal Load',
    description: 'Correlates kitchen occupancy with elevated stove/appliance power, thermal rise, and particulate matter increase.',
    severity: SeverityLevel.INFO,
    correlationWindowSeconds: 900, // 15-minute rolling window
    minimumConfidenceThreshold: 0.70,
    signals: [
      {
        name: 'Kitchen Occupancy',
        sensorType: 'OCCUPANCY',
        scope: 'SAME_ROOM',
        condition: 'VALUE_EQ',
        threshold: 1,
        weight: 0.25,
        required: true,
        description: 'Occupant presence detected in cooking area.',
      },
      {
        name: 'Appliance / Cooktop Power Draw',
        sensorType: 'POWER',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 600, // W
        weight: 0.30,
        required: false,
        description: 'Significant electrical draw from kitchen appliances or cooktop.',
      },
      {
        name: 'Thermal Plume / Temperature Rise',
        sensorType: 'TEMPERATURE',
        scope: 'SAME_ROOM',
        condition: 'RATE_OF_CHANGE_GT',
        threshold: 0.05, // °C / min
        weight: 0.25,
        required: false,
        description: 'Upward indoor temperature slope from culinary heat.',
      },
      {
        name: 'Aerosol / PM2.5 Elevation',
        sensorType: 'PM2_5',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 20, // µg/m³
        weight: 0.20,
        required: false,
        description: 'Elevated particulate matter from cooking vapor and searing.',
      },
    ],
    evaluateContext({ room, signalsSatisfied, windowSeconds }) {
      const title = `${room.name} Cooking Activity`;
      const summary = `Correlated culinary activity detected in ${room.name} across ${signalsSatisfied.length} independent physical sensor channels over a ${Math.round(windowSeconds / 60)}-minute window.`;
      
      const evidenceLines = signalsSatisfied.map(
        (s) => `• ${s.sensorType}: ${s.observedValue} ${s.unit} (${s.explanation})`
      );

      const explanation =
        `Unified cooking event established via multi-sensor temporal correlation:\n` +
        evidenceLines.join('\n') +
        `\nAll contributing signals occurred synchronously within the ${Math.round(windowSeconds / 60)}-minute correlation window.`;

      return { title, summary, explanation };
    },
  },

  // 2. Water Leak / Unmonitored Flow Rule
  {
    id: 'rule-water-leak',
    incidentType: 'WATER_LEAK',
    name: 'Unmonitored Moisture & Continuous Flow',
    description: 'Detects active water flow or moisture saturation in a space with no occupant presence.',
    severity: SeverityLevel.CRITICAL,
    correlationWindowSeconds: 600, // 10-minute window
    minimumConfidenceThreshold: 0.70,
    signals: [
      {
        name: 'Absence of Occupancy',
        sensorType: 'OCCUPANCY',
        scope: 'SAME_ROOM',
        condition: 'VALUE_EQ',
        threshold: 0,
        weight: 0.35,
        required: true,
        description: 'Room is confirmed unoccupied (unintended water usage).',
      },
      {
        name: 'Continuous Water Flow',
        sensorType: 'WATER_FLOW',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 0.5, // L/min
        weight: 0.40,
        required: false,
        description: 'Continuous water flow through fixtures without resident intent.',
      },
      {
        name: 'Moisture / Humidity Saturation',
        sensorType: 'HUMIDITY',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 82.0, // % RH
        weight: 0.25,
        required: false,
        description: 'Relative humidity saturation or sudden upward drift.',
      },
    ],
    evaluateContext({ room, signalsSatisfied, windowSeconds }) {
      const title = `Critical Water Leak Detected: ${room.name}`;
      const summary = `Unattended moisture/water flow anomaly in ${room.name} while space is unoccupied. Immediate attention required to prevent property damage.`;

      const evidenceLines = signalsSatisfied.map(
        (s) => `• ${s.sensorType}: ${s.observedValue} ${s.unit} (${s.explanation})`
      );

      const explanation =
        `Critical water leak incident identified:\n` +
        evidenceLines.join('\n') +
        `\nCorrelated over a ${Math.round(windowSeconds / 60)}-minute window with verified absence of room occupants.`;

      return { title, summary, explanation };
    },
  },

  // 3. AC Failure / Cooling Loss Rule
  {
    id: 'rule-ac-failure',
    incidentType: 'AC_FAILURE',
    name: 'Climate System Cooling Inefficiency / Compressor Failure',
    description: 'Correlates active HVAC electrical power consumption with rising room temperatures away from setpoint.',
    severity: SeverityLevel.ERROR,
    correlationWindowSeconds: 900, // 15-minute window
    minimumConfidenceThreshold: 0.75,
    signals: [
      {
        name: 'HVAC Power Draw',
        sensorType: 'POWER',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 500, // W
        weight: 0.35,
        required: true,
        description: 'HVAC unit is drawing electrical power in active state.',
      },
      {
        name: 'Upward Temperature Departure',
        sensorType: 'TEMPERATURE',
        scope: 'SAME_ROOM',
        condition: 'RATE_OF_CHANGE_GT',
        threshold: 0.04, // °C / min upward drift
        weight: 0.45,
        required: true,
        description: 'Indoor temperature continues rising despite active cooling effort.',
      },
      {
        name: 'Occupant Presence',
        sensorType: 'OCCUPANCY',
        scope: 'SAME_ROOM',
        condition: 'VALUE_EQ',
        threshold: 1,
        weight: 0.20,
        required: false,
        description: 'Occupants present suffering thermal discomfort.',
      },
    ],
    evaluateContext({ room, signalsSatisfied, windowSeconds }) {
      const title = `AC Inefficiency / Cooling Failure in ${room.name}`;
      const summary = `HVAC unit in ${room.name} is consuming power, yet temperature is actively climbing away from thermostat setpoint.`;

      const evidenceLines = signalsSatisfied.map(
        (s) => `• ${s.sensorType}: ${s.observedValue} ${s.unit} (${s.explanation})`
      );

      const explanation =
        `Thermodynamic divergence detected:\n` +
        evidenceLines.join('\n') +
        `\nCompressor is consuming energy without achieving thermal heat exchange. Possible refrigerant loss, clogged filter, or compressor fault.`;

      return { title, summary, explanation };
    },
  },

  // 4. Window Thermal Breach Rule
  {
    id: 'rule-window-thermal',
    incidentType: 'WINDOW_THERMAL_EVENT',
    name: 'Thermal Envelope Breach with Active HVAC Counter-Action',
    description: 'Correlates window opening or steep thermal plunge with active HVAC heating/cooling response.',
    severity: SeverityLevel.WARNING,
    correlationWindowSeconds: 600, // 10-minute window
    minimumConfidenceThreshold: 0.70,
    signals: [
      {
        name: 'Window Opening / Contact Sensor',
        sensorType: 'CONTACT',
        scope: 'SAME_ROOM',
        condition: 'VALUE_EQ',
        threshold: 1, // Open
        weight: 0.35,
        required: false,
        description: 'Physical contact sensor reports window/door open to exterior.',
      },
      {
        name: 'Rapid Thermal Departure (Plunge or Influx)',
        sensorType: 'TEMPERATURE',
        scope: 'SAME_ROOM',
        condition: 'RATE_OF_CHANGE_LT',
        threshold: -0.10, // °C / min
        weight: 0.40,
        required: false,
        description: 'Steep indoor temperature slope towards outdoor ambient.',
      },
      {
        name: 'HVAC Energy Counter-Action',
        sensorType: 'POWER',
        scope: 'SAME_ROOM',
        condition: 'VALUE_GT',
        threshold: 400, // W
        weight: 0.25,
        required: false,
        description: 'Heating or cooling system running to compensate for heat transfer.',
      },
    ],
    evaluateContext({ room, signalsSatisfied, windowSeconds }) {
      const title = `Thermal Breach: Window Open in ${room.name}`;
      const summary = `Rapid thermal transfer and energy loss detected in ${room.name} while climate control system is running.`;

      const evidenceLines = signalsSatisfied.map(
        (s) => `• ${s.sensorType}: ${s.observedValue} ${s.unit} (${s.explanation})`
      );

      const explanation =
        `Building envelope compromise established:\n` +
        evidenceLines.join('\n') +
        `\nCondition causes avoidable thermodynamic energy expenditure. Close windows or pause HVAC.`;

      return { title, summary, explanation };
    },
  },
];
