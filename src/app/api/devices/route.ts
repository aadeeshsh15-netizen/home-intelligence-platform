import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const devices = await prisma.device.findMany({
      where: {
        room: {
          floor: { homeId: auth.user.homeId },
        },
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            floor: { select: { id: true, name: true } },
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
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ devices });
  } catch (error: any) {
    logger.error('API /devices failure', { module: 'api/devices' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
