import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { PredictiveIncidentEngine } from '@/server/intelligence/predictive-incidents/engine';
import { logger } from '@/lib/logger';
import { PredictiveIncidentStatus, PredictiveIncidentType, PredictionOutcome } from '@prisma/client';

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
    const outcomeParam = searchParams.get('outcome');
    const roomId = searchParams.get('roomId');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const where: any = {
      homeId: auth.user.homeId,
    };

    if (statusParam && Object.values(PredictiveIncidentStatus).includes(statusParam as any)) {
      where.status = statusParam;
    }
    if (typeParam && Object.values(PredictiveIncidentType).includes(typeParam as any)) {
      where.type = typeParam;
    }
    if (outcomeParam && Object.values(PredictionOutcome).includes(outcomeParam as any)) {
      where.outcome = outcomeParam;
    }
    if (roomId) {
      where.roomId = roomId;
    }

    const [predictiveIncidents, total, predictedCount, confirmedCount, expiredCount] = await Promise.all([
      prisma.predictiveIncident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          room: {
            select: {
              id: true,
              name: true,
              roomType: true,
            },
          },
          confirmedIncident: {
            select: {
              id: true,
              title: true,
              incidentType: true,
              startedAt: true,
              status: true,
            },
          },
        },
      }),
      prisma.predictiveIncident.count({ where }),
      prisma.predictiveIncident.count({
        where: { homeId: auth.user.homeId, status: PredictiveIncidentStatus.PREDICTED },
      }),
      prisma.predictiveIncident.count({
        where: { homeId: auth.user.homeId, status: PredictiveIncidentStatus.CONFIRMED },
      }),
      prisma.predictiveIncident.count({
        where: { homeId: auth.user.homeId, status: PredictiveIncidentStatus.EXPIRED },
      }),
    ]);

    return NextResponse.json({
      predictiveIncidents,
      total,
      counts: {
        predicted: predictedCount,
        confirmed: confirmedCount,
        expired: expiredCount,
      },
    });
  } catch (error: any) {
    logger.error('API /predictive-incidents GET failure', { module: 'api/predictive-incidents' }, error);
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
      const candidates = await PredictiveIncidentEngine.evaluateHome(
        auth.user.homeId,
        new Date()
      );
      const pendingResults = await PredictiveIncidentEngine.evaluatePendingIncidents(
        auth.user.homeId,
        new Date()
      );

      return NextResponse.json({
        success: true,
        action: 'evaluated',
        candidatesGenerated: candidates.length,
        ...pendingResults,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    logger.error('API /predictive-incidents POST failure', { module: 'api/predictive-incidents' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
