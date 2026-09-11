import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { Device, ProvisioningStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

/**
 * Generates a high-entropy secret pairing token for physical device authentication.
 */
export function generateDeviceToken(): string {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `dvt_live_${randomBytes}`;
}

/**
 * Computes a salted cryptographic hash of the device token.
 * Format: `<saltHex>:<hashHex>`
 */
export function hashDeviceToken(token: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(token, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext token against the stored `<saltHex>:<hashHex>`.
 */
export function verifyDeviceToken(token: string, storedHash: string): boolean {
  try {
    const [salt, expectedHash] = storedHash.split(':');
    if (!salt || !expectedHash) return false;

    const actualHash = crypto.scryptSync(token, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

/**
 * Verifies that a physical device exists, is provisioned, and belongs to the specified home.
 */
export async function authenticateDeviceForTopic(params: {
  homeId: string;
  deviceId: string;
  authToken?: string;
}): Promise<{
  authorized: boolean;
  device?: Device & { room: { floor: { homeId: string } } };
  reason?: string;
}> {
  const device = await prisma.device.findFirst({
    where: {
      OR: [
        { id: params.deviceId },
        { identifier: params.deviceId },
      ],
    },
    include: {
      room: {
        include: {
          floor: true,
        },
      },
    },
  });

  if (!device) {
    logger.warn('Device authentication failed: device not found', {
      deviceId: params.deviceId,
      homeId: params.homeId,
      module: 'device-auth',
    });
    return { authorized: false, reason: 'Device not found in registry' };
  }

  // Tenant isolation check
  if (device.room.floor.homeId !== params.homeId) {
    logger.warn('Device authentication failed: home tenant mismatch', {
      deviceId: params.deviceId,
      requestedHomeId: params.homeId,
      actualHomeId: device.room.floor.homeId,
      module: 'device-auth',
    });
    return { authorized: false, reason: 'Device does not belong to specified home' };
  }

  // Provisioning state check
  if (device.provisioningStatus === ProvisioningStatus.REVOKED) {
    logger.warn('Device authentication failed: device is revoked', {
      deviceId: params.deviceId,
      homeId: params.homeId,
      module: 'device-auth',
    });
    return { authorized: false, reason: 'Device has been revoked by home administrator' };
  }

  // If token is supplied, verify it
  if (params.authToken && device.authTokenHash) {
    const isValid = verifyDeviceToken(params.authToken, device.authTokenHash);
    if (!isValid) {
      logger.warn('Device authentication failed: invalid token credentials', {
        deviceId: params.deviceId,
        homeId: params.homeId,
        module: 'device-auth',
      });
      return { authorized: false, reason: 'Invalid device credentials' };
    }
  }

  return { authorized: true, device };
}

/**
 * Generates a C++ config.h code template formatted for flashing to the physical ESP32.
 */
export function generateFirmwareConfigSnippet(params: {
  homeId: string;
  deviceId: string;
  authToken: string;
  brokerHost?: string;
  brokerPort?: number;
}): string {
  const host = params.brokerHost || '192.168.1.100';
  const port = params.brokerPort || 1883;

  return `// =========================================================================
// Home Intelligence Platform - Physical ESP32 Node Configuration
// Generated at: ${new Date().toISOString()}
// =========================================================================

#ifndef CONFIG_H
#define CONFIG_H

// Wi-Fi Credentials
#define WIFI_SSID         "YOUR_WIFI_SSID"
#define WIFI_PASSWORD     "YOUR_WIFI_PASSWORD"

// MQTT Broker Settings
#define MQTT_BROKER_HOST  "${host}"
#define MQTT_BROKER_PORT  ${port}

// Device Identity & Security
#define HOME_ID           "${params.homeId}"
#define DEVICE_ID         "${params.deviceId}"
#define DEVICE_SECRET     "${params.authToken}"

// MQTT Topic Hierarchy
#define TOPIC_TELEMETRY   "home/${params.homeId}/device/${params.deviceId}/telemetry"
#define TOPIC_STATUS      "home/${params.homeId}/device/${params.deviceId}/status"
#define TOPIC_COMMAND     "home/${params.homeId}/device/${params.deviceId}/command"

// Sampling & Heartbeat Intervals (Milliseconds)
#define TELEMETRY_INTERVAL_MS 10000 // 10s sensor reporting
#define HEARTBEAT_INTERVAL_MS 30000 // 30s status ping

#endif // CONFIG_H
`;
}
