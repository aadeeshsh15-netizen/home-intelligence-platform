import { describe, it, expect } from 'vitest';
import {
  IngestTelemetryPayloadSchema,
  validatePhysicalBounds,
} from '../../src/domain/telemetry.schema';

describe('Telemetry Schema & Validation', () => {
  it('validates physical reality bounds correctly', () => {
    // Valid cases
    expect(validatePhysicalBounds('TEMPERATURE', 22.5).valid).toBe(true);
    expect(validatePhysicalBounds('HUMIDITY', 55).valid).toBe(true);
    expect(validatePhysicalBounds('POWER', 450).valid).toBe(true);
    expect(validatePhysicalBounds('OCCUPANCY', 1).valid).toBe(true);

    // Physically impossible cases
    expect(validatePhysicalBounds('TEMPERATURE', -80).valid).toBe(false);
    expect(validatePhysicalBounds('TEMPERATURE', 120).valid).toBe(false);
    expect(validatePhysicalBounds('HUMIDITY', 105).valid).toBe(false);
    expect(validatePhysicalBounds('HUMIDITY', -5).valid).toBe(false);
    expect(validatePhysicalBounds('POWER', -50).valid).toBe(false);
    expect(validatePhysicalBounds('OCCUPANCY', 2).valid).toBe(false);
  });

  it('validates ingestion payload structure with Zod', () => {
    const validPayload = {
      producerId: 'test-mqtt-broker',
      readings: [
        {
          sensorId: 'sensor-123',
          timestamp: new Date().toISOString(),
          value: 23.4,
          quality: 'VALID' as const,
        },
      ],
    };

    const parsed = IngestTelemetryPayloadSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);

    const invalidPayload = {
      producerId: '',
      readings: [],
    };

    const failed = IngestTelemetryPayloadSchema.safeParse(invalidPayload);
    expect(failed.success).toBe(false);
  });
});
