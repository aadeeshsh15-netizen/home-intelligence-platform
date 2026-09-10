import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { CrossSensorCorrelationEngine } from '@/server/intelligence/correlation/engine';
import { logger } from '@/lib/logger';
import { IncidentStatus, IncidentType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const typeParam = searchParams.get('type');
    const roomId = searchParams.get('roomId');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const where: any = {
      homeId: auth.user.homeId,
    };

    if (statusParam && Object.values(IncidentStatus).includes(statusParam as any)) {
      where.status = statusParam;
    }
    if (typeParam && Object.values(IncidentType).includes(typeParam as any)) {
      where.incidentType = typeParam;
    }
    if (roomId) {
      where.roomId = roomId;
    }

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        room: {
          select: {
            id: true,
            name: true,
            roomType: true,
          },
        },
      },
    });

    const activeCount = await prisma.incident.count({
      where: { homeId: auth.user.homeId, status: IncidentStatus.ACTIVE },
    });

    return NextResponse.json({
      incidents,
      activeCount,
      total: incidents.length,
    });
  } catch (error: any) {
    logger.error('API /incidents failure', { module: 'api/incidents' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'evaluate';

    if (action === 'evaluate') {
      const candidates = await CrossSensorCorrelationEngine.evaluateHomeCorrelations(
        auth.user.homeId,
        new Date()
      );
      const result = await CrossSensorCorrelationEngine.processIncidentCandidates(
        candidates,
        auth.user.homeId,
        new Date()
      );

      return NextResponse.json({
        success: true,
        action: 'evaluated',
        candidatesFound: candidates.length,
        ...result,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    logger.error('API /incidents POST failure', { module: 'api/incidents' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
