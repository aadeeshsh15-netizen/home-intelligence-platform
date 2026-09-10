import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EventStatus } from '@prisma/client';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const rooms = await prisma.room.findMany({
      where: { floor: { homeId: auth.user.homeId } },
      include: {
        floor: { select: { id: true, name: true, level: true } },
        devices: true,
        sensors: true,
        events: {
          where: { status: EventStatus.ACTIVE },
          select: { id: true, severity: true, title: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const data = rooms.map((room) => {
      const metrics: Record<string, any> = {};
      room.sensors.forEach((s) => {
        metrics[s.type.toLowerCase()] = {
          sensorId: s.id,
          value: s.lastReadingValue,
          unit: s.unit,
          health: s.health,
          lastSeen: s.lastReadingTime,
        };
      });

      return {
        id: room.id,
        name: room.name,
        roomType: room.roomType,
        targetTemp: room.targetTemp,
        floor: room.floor,
        deviceCount: room.devices.length,
        sensorCount: room.sensors.length,
        activeAlertCount: room.events.length,
        metrics,
      };
    });

    return NextResponse.json({ rooms: data });
  } catch (error: any) {
    logger.error('API /rooms failure', { module: 'api/rooms' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
