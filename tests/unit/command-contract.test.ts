import { describe, it, expect } from 'vitest';
import {
  DeviceCommandPayloadSchema,
  DeviceAckPayloadSchema,
  isCommandExpired,
  generateCommandId,
} from '@/domain/command.schema';
import { parseMqttTopic } from '@/domain/mqtt.schema';
import { ActuatorAction } from '@prisma/client';

describe('Phase 7: Command Contract & Acknowledgement Unit Tests', () => {
  it('validates a conforming device command payload', () => {
    const validCommand = {
      commandId: 'cmd_12345_abcde',
      action: ActuatorAction.TURN_ON,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      source: 'AUTOMATION_ENGINE',
      expectedState: { power: 'ON' },
      parameters: { speed: 2, durationSec: 1800 },
    };

    const result = DeviceCommandPayloadSchema.safeParse(validCommand);
    expect(result.success).toBe(true);
  });

  it('rejects command payloads with missing commandId, invalid action, or non-ISO timestamp', () => {
    const missingId = {
      action: ActuatorAction.TURN_ON,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    expect(DeviceCommandPayloadSchema.safeParse(missingId).success).toBe(false);

    const invalidAction = {
      commandId: 'cmd_1',
      action: 'EXPLODE_BATTERY',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    expect(DeviceCommandPayloadSchema.safeParse(invalidAction).success).toBe(false);

    const invalidDate = {
      commandId: 'cmd_1',
      action: ActuatorAction.TURN_OFF,
      issuedAt: 'not-a-date',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    expect(DeviceCommandPayloadSchema.safeParse(invalidDate).success).toBe(false);
  });

  it('validates conforming device acknowledgement payloads', () => {
    const validAck = {
      commandId: 'cmd_12345_abcde',
      status: 'ACKNOWLEDGED',
      timestamp: new Date().toISOString(),
      actualState: { power: 'ON' },
      reason: 'Low-voltage relay engaged',
    };

    const result = DeviceAckPayloadSchema.safeParse(validAck);
    expect(result.success).toBe(true);
  });

  it('rejects acknowledgement with invalid status enum', () => {
    const badStatus = {
      commandId: 'cmd_1',
      status: 'SOME_RANDOM_STATUS',
      timestamp: new Date().toISOString(),
    };
    expect(DeviceAckPayloadSchema.safeParse(badStatus).success).toBe(false);
  });

  it('accurately validates command expiration boundary', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const future = new Date('2026-09-11T12:05:00.000Z');
    const past = new Date('2026-09-11T11:59:59.000Z');

    expect(isCommandExpired(future, now)).toBe(false);
    expect(isCommandExpired(past, now)).toBe(true);
  });

  it('generates collision-resistant command identifiers', () => {
    const id1 = generateCommandId('test');
    const id2 = generateCommandId('test');
    expect(id1.startsWith('test_')).toBe(true);
    expect(id1).not.toBe(id2);
  });

  it('parses command and ack MQTT topic patterns', () => {
    const cmdTopic = 'home/home_123/device/esp32_relay/command';
    const parsedCmd = parseMqttTopic(cmdTopic);
    expect(parsedCmd).not.toBeNull();
    expect(parsedCmd?.action).toBe('command');

    const ackTopic = 'home/home_123/device/esp32_relay/ack';
    const parsedAck = parseMqttTopic(ackTopic);
    expect(parsedAck).not.toBeNull();
    expect(parsedAck?.action).toBe('ack');
  });
});
