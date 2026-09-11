import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { authenticateDeviceForTopic, generateDeviceToken, hashDeviceToken } from '@/server/iot/device-auth';
import { DeviceProtocol, DeviceStatus, ProvisioningStatus } from '@prisma/client';

describe('Phase 6: Device Lifecycle & Watchdog Integration Tests', () => {
  let home: any;
  let room: any;
  let testDevice: any;
  const token = generateDeviceToken();

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');

    room = await prisma.room.findFirst({
      where: { floor: { homeId: home.id } },
    });
    if (!room) throw new Error('No test room found');

    testDevice = await prisma.device.create({
      data: {
        name: 'Lifecycle Watchdog Test ESP32',
        deviceType: 'ENVIRONMENTAL_HUB',
        hardwareType: 'ESP32_WROOM_32',
        protocol: DeviceProtocol.MQTT,
        identifier: `esp32-lifecycle-${Date.now()}`,
        status: DeviceStatus.ONLINE,
        provisioningStatus: ProvisioningStatus.PROVISIONED,
        authTokenHash: hashDeviceToken(token),
        roomId: room.id,
        lastSeenAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (testDevice) {
      await prisma.device.delete({ where: { id: testDevice.id } });
    }
  });

  it('authenticates valid provisioned device with matching token', async () => {
    const auth = await authenticateDeviceForTopic({
      homeId: home.id,
      deviceId: testDevice.identifier,
      authToken: token,
    });

    expect(auth.authorized).toBe(true);
    expect(auth.device?.id).toBe(testDevice.id);
  });

  it('transitions active physical devices to STALE after 60s of silence', async () => {
    const now = new Date();
    // Simulate last seen 90s ago (stale window: 60s - 180s)
    const ninetySecAgo = new Date(now.getTime() - 90 * 1000);

    await prisma.device.update({
      where: { id: testDevice.id },
      data: { status: DeviceStatus.ONLINE, lastSeenAt: ninetySecAgo },
    });

    await mqttGateway.sweepStaleDevices(now);

    const refreshed = await prisma.device.findUnique({ where: { id: testDevice.id } });
    expect(refreshed?.status).toBe(DeviceStatus.STALE);
  });

  it('transitions physical devices to OFFLINE after 180s of silence', async () => {
    const now = new Date();
    // Simulate last seen 240s ago (> 180s)
    const fourMinAgo = new Date(now.getTime() - 240 * 1000);

    await prisma.device.update({
      where: { id: testDevice.id },
      data: { status: DeviceStatus.STALE, lastSeenAt: fourMinAgo },
    });

    await mqttGateway.sweepStaleDevices(now);

    const refreshed = await prisma.device.findUnique({ where: { id: testDevice.id } });
    expect(refreshed?.status).toBe(DeviceStatus.OFFLINE);
  });

  it('blocks telemetry and authentication when device is revoked', async () => {
    // Revoke device
    await prisma.device.update({
      where: { id: testDevice.id },
      data: {
        provisioningStatus: ProvisioningStatus.REVOKED,
        status: DeviceStatus.OFFLINE,
        authTokenHash: null,
      },
    });

    const auth = await authenticateDeviceForTopic({
      homeId: home.id,
      deviceId: testDevice.identifier,
      authToken: token,
    });

    expect(auth.authorized).toBe(false);
    expect(auth.reason).toContain('revoked');
  });
});
