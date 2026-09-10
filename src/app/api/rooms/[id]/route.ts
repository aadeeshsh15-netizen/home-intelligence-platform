import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downsampleTimeSeries } from '@/lib/statistics';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { id } = await params;

    const room = await prisma.room.findFirst({
      where: {
        id,
        floor: { homeId: auth.user.homeId },
      },
      include: {
        floor: true,
        devices: true,
        sensors: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        insights: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found or unauthorized' }, { status: 404 });
    }

    // Fetch 24-hour historical readings for each sensor in the room
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sensorSparklines: Record<string, any[]> = {};

    for (const sensor of room.sensors) {
      const readings = await prisma.telemetryReading.findMany({
        where: {
          sensorId: sensor.id,
          timestamp: { gte: oneDayAgo },
        },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, value: true },
      });

      sensorSparklines[sensor.type] = downsampleTimeSeries(readings, 48);
    }

    return NextResponse.json({
      room,
      sparklines: sensorSparklines,
    });
  } catch (error: any) {
    logger.error('API /rooms/[id] failure', { module: 'api/rooms/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
