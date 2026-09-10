import { z } from 'zod';

export const SensorTypeEnum = z.enum([
  'TEMPERATURE',
  'HUMIDITY',
  'CO2',
  'PM2_5',
  'POWER',
  'OCCUPANCY',
  'LIGHT',
  'NOISE',
  'WATER_FLOW',
  'CONTACT'
]);

export const SensorHealthEnum = z.enum(['HEALTHY', 'STALE', 'FAULTY', 'OFFLINE']);

export const SingleReadingSchema = z.object({
  sensorId: z.string().min(1, 'sensorId is required'),
  timestamp: z.string().datetime({ message: 'timestamp must be a valid ISO 8601 string' }).or(z.date()),
  value: z.number().finite({ message: 'value must be a finite number' }),
  quality: z.enum(['VALID', 'DEGRADED', 'INTERPOLATED']).default('VALID'),
  unit: z.string().optional(),
});

export const IngestTelemetryPayloadSchema = z.object({
  producerId: z.string().min(1, 'producerId must identify the publishing source'),
  readings: z.array(SingleReadingSchema).min(1, 'Payload must contain at least one reading'),
});

export type IngestTelemetryPayload = z.infer<typeof IngestTelemetryPayloadSchema>;
export type SingleReading = z.infer<typeof SingleReadingSchema>;

/**
 * Validates whether a sensor reading falls within physical reality boundaries.
 * Prevents impossible sensor values (e.g. relative humidity > 100%, negative absolute temperature in Celsius below -50, etc.)
 */
export function validatePhysicalBounds(type: string, value: number): { valid: boolean; reason?: string } {
  switch (type) {
    case 'TEMPERATURE':
      if (value < -40 || value > 75) return { valid: false, reason: `Temperature ${value}°C is outside physical bounds (-40 to 75°C)` };
      break;
    case 'HUMIDITY':
      if (value < 0 || value > 100) return { valid: false, reason: `Humidity ${value}% is outside physical bounds (0 to 100%)` };
      break;
    case 'CO2':
      if (value < 200 || value > 50000) return { valid: false, reason: `CO2 ${value} ppm is outside plausible atmospheric bounds` };
      break;
    case 'POWER':
      if (value < 0 || value > 100000) return { valid: false, reason: `Power ${value} W cannot be negative or absurdly high` };
      break;
    case 'OCCUPANCY':
    case 'CONTACT':
      if (value !== 0 && value !== 1) return { valid: false, reason: `${type} must be binary (0 or 1)` };
      break;
    case 'LIGHT':
      if (value < 0 || value > 150000) return { valid: false, reason: `Light ${value} lux is outside plausible bounds` };
      break;
    case 'NOISE':
      if (value < 0 || value > 150) return { valid: false, reason: `Noise ${value} dB is outside plausible acoustic bounds` };
      break;
    case 'PM2_5':
      if (value < 0 || value > 1000) return { valid: false, reason: `PM2.5 ${value} µg/m³ is outside plausible atmospheric bounds (0 to 1000)` };
      break;
    case 'WATER_FLOW':
      if (value < 0 || value > 200) return { valid: false, reason: `Water flow ${value} L/min cannot be negative or absurdly high` };
      break;
  }
  return { valid: true };
}

/**
 * Validates that the provided reading unit matches the expected physical unit for the sensor type.
 */
export function validateSensorUnit(type: string, unit: string): { valid: boolean; expectedUnit: string } {
  const EXPECTED_UNITS: Record<string, string[]> = {
    TEMPERATURE: ['°C', '°F'],
    HUMIDITY: ['%'],
    CO2: ['ppm'],
    PM2_5: ['µg/m³', 'ug/m3'],
    POWER: ['W', 'kW'],
    OCCUPANCY: ['binary', 'boolean'],
    LIGHT: ['lux'],
    NOISE: ['dB'],
    WATER_FLOW: ['L/min', 'lpm', 'gpm'],
    CONTACT: ['binary', 'boolean', 'state'],
  };

  const allowed = EXPECTED_UNITS[type];
  if (!allowed || allowed.includes(unit)) {
    return { valid: true, expectedUnit: allowed ? allowed[0] : unit };
  }

  return { valid: false, expectedUnit: allowed[0] };
}
