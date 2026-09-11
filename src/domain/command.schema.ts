import { z } from 'zod';
import { ActuatorAction, AutomationMode, CommandStatus } from '@prisma/client';

export const ActuatorActionEnum = z.nativeEnum(ActuatorAction);
export const AutomationModeEnum = z.nativeEnum(AutomationMode);
export const CommandStatusEnum = z.nativeEnum(CommandStatus);

/**
 * Command schema published to physical or simulated devices over MQTT or internal dispatcher.
 * Topic: home/{homeId}/device/{deviceId}/command
 */
export const DeviceCommandPayloadSchema = z.object({
  commandId: z.string().min(1, 'commandId is required'),
  action: ActuatorActionEnum,
  issuedAt: z.string().datetime({ message: 'issuedAt must be an ISO 8601 timestamp' }).or(z.date()),
  expiresAt: z.string().datetime({ message: 'expiresAt must be an ISO 8601 timestamp' }).or(z.date()),
  source: z.enum(['AUTOMATION_ENGINE', 'MANUAL_OVERRIDE']).default('AUTOMATION_ENGINE'),
  expectedState: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type DeviceCommandPayload = z.infer<typeof DeviceCommandPayloadSchema>;

/**
 * Acknowledgement payload published by devices upon receiving or completing a command.
 * Topic: home/{homeId}/device/{deviceId}/ack
 */
export const DeviceAckPayloadSchema = z.object({
  commandId: z.string().min(1, 'commandId is required'),
  status: z.enum(['ACKNOWLEDGED', 'REJECTED', 'COMPLETED', 'FAILED']),
  timestamp: z.string().datetime({ message: 'timestamp must be an ISO 8601 timestamp' }).or(z.date()),
  actualState: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
});

export type DeviceAckPayload = z.infer<typeof DeviceAckPayloadSchema>;

/**
 * Schema for creating or updating an Automation Policy.
 */
export const AutomationPolicyUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  mode: AutomationModeEnum.optional(),
  minProbability: z.number().min(0).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  cooldownSec: z.number().int().nonnegative().optional(),
  maxRuntimeSec: z.number().int().positive().optional(),
  action: ActuatorActionEnum.optional(),
  parameters: z.record(z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

export type AutomationPolicyUpdateInput = z.infer<typeof AutomationPolicyUpdateSchema>;

/**
 * Checks whether a command has expired relative to current reference time.
 */
export function isCommandExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const expiryDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return now.getTime() > expiryDate.getTime();
}

/**
 * Generates an idempotent, collision-resistant command identifier.
 */
export function generateCommandId(prefix: string = 'cmd'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}
