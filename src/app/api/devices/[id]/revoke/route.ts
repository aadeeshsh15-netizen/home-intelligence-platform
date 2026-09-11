import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { DeviceStatus, ProvisioningStatus, SensorHealth } from '@prisma/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: {
        id,
        room: {
          floor: { homeId: auth.user.homeId },
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found in home' }, { status: 404 });
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        provisioningStatus: ProvisioningStatus.REVOKED,
        status: DeviceStatus.OFFLINE,
        authTokenHash: null, // Wipe credential
      },
    });

    // Mark attached sensors OFFLINE
    await prisma.sensor.updateMany({
      where: { deviceId: device.id },
      data: { health: SensorHealth.OFFLINE },
    });

    logger.warn('Revoked physical IoT device credentials', {
      deviceId: device.id,
      identifier: device.identifier,
      homeId: auth.user.homeId,
      module: 'api/devices/revoke',
    });

    return NextResponse.json({
      success: true,
      message: `Device ${device.identifier} revoked successfully`,
      device: {
        id: updated.id,
        identifier: updated.identifier,
        status: updated.status,
        provisioningStatus: updated.provisioningStatus,
      },
    });
  } catch (error: any) {
    logger.error('API /devices/[id]/revoke error', { module: 'api/devices/revoke' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
