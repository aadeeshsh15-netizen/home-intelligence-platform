import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EventStatus, SeverityLevel } from '@prisma/client';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as EventStatus | null;
    const severity = searchParams.get('severity') as SeverityLevel | null;
    const roomId = searchParams.get('roomId');

    const where: any = {
      homeId: auth.user.homeId,
    };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (roomId) where.roomId = roomId;

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, identifier: true } },
        sensor: { select: { id: true, type: true, unit: true } },
      },
      take: 100,
    });

    const counts = {
      total: await prisma.event.count({ where: { homeId: auth.user.homeId } }),
      active: await prisma.event.count({ where: { homeId: auth.user.homeId, status: EventStatus.ACTIVE } }),
      critical: await prisma.event.count({ where: { homeId: auth.user.homeId, status: EventStatus.ACTIVE, severity: SeverityLevel.CRITICAL } }),
      warning: await prisma.event.count({ where: { homeId: auth.user.homeId, status: EventStatus.ACTIVE, severity: SeverityLevel.WARNING } }),
    };

    return NextResponse.json({ events, counts });
  } catch (error: any) {
    logger.error('API /events failure', { module: 'api/events' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
