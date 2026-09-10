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

    const floors = await prisma.floor.findMany({
      where: { homeId: auth.user.homeId },
      orderBy: { level: 'asc' },
      include: {
        rooms: {
          include: {
            devices: {
              select: {
                id: true,
                name: true,
                deviceType: true,
                status: true,
                protocol: true,
                identifier: true,
                lastSeenAt: true,
              },
            },
            sensors: {
              select: {
                id: true,
                type: true,
                unit: true,
                lastReadingValue: true,
                lastReadingTime: true,
                health: true,
              },
            },
            events: {
              where: { status: EventStatus.ACTIVE },
              select: { id: true, severity: true, title: true },
            },
          },
        },
      },
    });

    const payload = floors.map((floor) => ({
      id: floor.id,
      level: floor.level,
      name: floor.name,
      rooms: floor.rooms.map((room) => {
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
          layout: {
            x: room.layoutX,
            y: room.layoutY,
            w: room.layoutW,
            h: room.layoutH,
          },
          metrics,
          activeAlertCount: room.events.length,
          deviceCount: room.devices.length,
          devices: room.devices,
        };
      }),
    }));

    return NextResponse.json({ floors: payload });
  } catch (error: any) {
    logger.error('API /floors failure', { module: 'api/floors' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
