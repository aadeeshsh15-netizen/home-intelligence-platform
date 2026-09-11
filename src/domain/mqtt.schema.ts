import { z } from 'zod';
import { SensorTypeEnum } from './telemetry.schema';

/**
 * Topic pattern regex: home/{homeId}/device/{deviceId}/{action}
 * action: telemetry | status | command | ack
 */
export const MQTT_TOPIC_REGEX = /^home\/([a-zA-Z0-9_-]+)\/device\/([a-zA-Z0-9_-]+)\/(telemetry|status|command|ack)$/;

export interface ParsedMqttTopic {
  homeId: string;
  deviceId: string;
  action: 'telemetry' | 'status' | 'command' | 'ack';
}

export function parseMqttTopic(topic: string): ParsedMqttTopic | null {
  const match = topic.match(MQTT_TOPIC_REGEX);
  if (!match) return null;
  return {
    homeId: match[1],
    deviceId: match[2],
    action: match[3] as 'telemetry' | 'status' | 'command' | 'ack',
  };
}

/**
 * Schema for an individual metric inside an MQTT telemetry reading.
 */
export const MqttTelemetryMetricSchema = z.object({
  type: SensorTypeEnum,
  value: z.number().finite({ message: 'Metric value must be a finite number' }),
  unit: z.string().optional(),
  sensorId: z.string().optional(),
});

/**
 * Schema for the complete MQTT telemetry packet published by an ESP32/ESP8266 device.
 */
export const MqttTelemetryPayloadSchema = z.object({
  timestamp: z.string().datetime({ message: 'timestamp must be a valid ISO 8601 string' }).or(z.date()),
  seq: z.number().int().nonnegative().optional(),
  metrics: z.array(MqttTelemetryMetricSchema).min(1, 'Telemetry packet must contain at least one metric'),
});

export type MqttTelemetryPayloadInput = z.infer<typeof MqttTelemetryPayloadSchema>;

/**
 * Schema for device status and Last Will & Testament (LWT) payloads.
 */
export const MqttStatusPayloadSchema = z.object({
  status: z.enum(['ONLINE', 'STALE', 'DEGRADED', 'OFFLINE', 'ERROR']),
  firmwareVersion: z.string().optional(),
  ip: z.string().optional(),
  mac: z.string().optional(),
  uptimeSec: z.number().int().nonnegative().optional(),
  rssi: z.number().int().optional(),
  timestamp: z.string().datetime().or(z.date()).optional(),
  reason: z.string().optional(),
});

export type MqttStatusPayloadInput = z.infer<typeof MqttStatusPayloadSchema>;

/**
 * Schema for self-service hardware provisioning requests.
 */
export const DeviceProvisioningRequestSchema = z.object({
  homeId: z.string().min(1, 'homeId is required'),
  roomId: z.string().min(1, 'roomId is required'),
  name: z.string().min(2, 'Device name must be at least 2 characters'),
  deviceType: z.string().default('ENVIRONMENTAL_HUB'),
  hardwareType: z.enum(['ESP32_WROOM_32', 'ESP8266', 'SIMULATED']).default('ESP32_WROOM_32'),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address format').optional(),
  sensorTypes: z.array(SensorTypeEnum).min(1, 'Must equip at least one sensor'),
});

export type DeviceProvisioningRequestInput = z.infer<typeof DeviceProvisioningRequestSchema>;

/**
 * Validates timestamp sanity to prevent replay attacks and excessive historical skew.
 * Allows timestamps within [-10 minutes, +2 minutes] of server clock.
 */
export function validateMqttTimestamp(
  timestamp: string | Date,
  now: Date = new Date()
): { valid: boolean; reason?: string; parsedDate: Date } {
  const parsedDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const timeMs = parsedDate.getTime();

  if (isNaN(timeMs)) {
    return { valid: false, reason: 'Invalid date format', parsedDate };
  }

  const nowMs = now.getTime();
  const pastLimitMs = nowMs - 10 * 60 * 1000; // -10 minutes
  const futureLimitMs = nowMs + 2 * 60 * 1000; // +2 minutes

  if (timeMs < pastLimitMs) {
    return {
      valid: false,
      reason: `Timestamp too far in the past (${Math.round((nowMs - timeMs) / 1000)}s old; max 600s)`,
      parsedDate,
    };
  }

  if (timeMs > futureLimitMs) {
    return {
      valid: false,
      reason: `Timestamp too far in the future (${Math.round((timeMs - nowMs) / 1000)}s ahead; max 120s)`,
      parsedDate,
    };
  }

  return { valid: true, parsedDate };
}
