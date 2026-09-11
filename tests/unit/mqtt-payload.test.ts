import { describe, it, expect } from 'vitest';
import {
  MqttTelemetryPayloadSchema,
  MqttStatusPayloadSchema,
  parseMqttTopic,
  validateMqttTimestamp,
} from '@/domain/mqtt.schema';

describe('Phase 6: MQTT Payload & Topic Validation Unit Tests', () => {
  it('parses conforming MQTT topics according to hierarchy specification', () => {
    const topic1 = 'home/home_123/device/esp32_livingroom/telemetry';
    const parsed1 = parseMqttTopic(topic1);
    expect(parsed1).not.toBeNull();
    expect(parsed1?.homeId).toBe('home_123');
    expect(parsed1?.deviceId).toBe('esp32_livingroom');
    expect(parsed1?.action).toBe('telemetry');

    const topic2 = 'home/h_abc-1/device/dev-99_xyz/status';
    const parsed2 = parseMqttTopic(topic2);
    expect(parsed2).not.toBeNull();
    expect(parsed2?.action).toBe('status');

    const topic3 = 'home/h1/device/d1/command';
    const parsed3 = parseMqttTopic(topic3);
    expect(parsed3?.action).toBe('command');

    // Invalid topics
    expect(parseMqttTopic('home/h1/invalid/d1/telemetry')).toBeNull();
    expect(parseMqttTopic('invalid/topic/structure')).toBeNull();
    expect(parseMqttTopic('home/h1/device/d1/unknown_action')).toBeNull();
  });

  it('validates a standard multi-sensor telemetry payload', () => {
    const validPayload = {
      timestamp: new Date().toISOString(),
      seq: 42,
      metrics: [
        { type: 'TEMPERATURE', value: 22.4, unit: '°C' },
        { type: 'HUMIDITY', value: 48.2, unit: '%' },
        { type: 'CO2', value: 650, unit: 'ppm' },
        { type: 'OCCUPANCY', value: 1, unit: 'binary' },
        { type: 'CONTACT', value: 0, unit: 'binary' },
      ],
    };

    const result = MqttTelemetryPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects telemetry payload missing metrics array or containing non-finite values', () => {
    const emptyMetrics = {
      timestamp: new Date().toISOString(),
      metrics: [],
    };
    expect(MqttTelemetryPayloadSchema.safeParse(emptyMetrics).success).toBe(false);

    const nonFiniteValue = {
      timestamp: new Date().toISOString(),
      metrics: [{ type: 'TEMPERATURE', value: NaN }],
    };
    expect(MqttTelemetryPayloadSchema.safeParse(nonFiniteValue).success).toBe(false);

    const invalidType = {
      timestamp: new Date().toISOString(),
      metrics: [{ type: 'INVALID_SENSOR_TYPE', value: 25.0 }],
    };
    expect(MqttTelemetryPayloadSchema.safeParse(invalidType).success).toBe(false);
  });

  it('validates device status and LWT payloads', () => {
    const onlineStatus = {
      status: 'ONLINE',
      firmwareVersion: 'v1.0.0-esp32',
      ip: '192.168.1.185',
      mac: '24:6F:28:AB:CD:EF',
      uptimeSec: 360,
      rssi: -55,
    };
    expect(MqttStatusPayloadSchema.safeParse(onlineStatus).success).toBe(true);

    const lwtStatus = {
      status: 'OFFLINE',
      reason: 'UNEXPECTED_DISCONNECT',
    };
    expect(MqttStatusPayloadSchema.safeParse(lwtStatus).success).toBe(true);
  });

  it('enforces timestamp sanity and rejects clock skew or replay attacks', () => {
    const now = new Date('2026-09-11T12:00:00Z');

    // Valid: 30s ago
    const validRecent = new Date('2026-09-11T11:59:30Z');
    expect(validateMqttTimestamp(validRecent, now).valid).toBe(true);

    // Valid: 30s in future (slight clock skew)
    const validFuture = new Date('2026-09-11T12:00:30Z');
    expect(validateMqttTimestamp(validFuture, now).valid).toBe(true);

    // Invalid: 15 minutes in past (skew > 10m)
    const oldPast = new Date('2026-09-11T11:40:00Z');
    const pastResult = validateMqttTimestamp(oldPast, now);
    expect(pastResult.valid).toBe(false);
    expect(pastResult.reason).toContain('too far in the past');

    // Invalid: 5 minutes in future (skew > 2m)
    const farFuture = new Date('2026-09-11T12:05:00Z');
    const futureResult = validateMqttTimestamp(farFuture, now);
    expect(futureResult.valid).toBe(false);
    expect(futureResult.reason).toContain('too far in the future');
  });
});
