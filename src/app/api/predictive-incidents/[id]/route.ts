import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { PredictiveIncidentStatus, PredictionOutcome } from '@prisma/client';

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
    const predictiveIncident = await prisma.predictiveIncident.findFirst({
      where: {
        id,
        homeId: auth.user.homeId,
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            roomType: true,
          },
        },
        confirmedIncident: {
          include: {
            room: true,
          },
        },
      },
    });

    if (!predictiveIncident) {
      return NextResponse.json({ error: 'Predictive incident not found' }, { status: 404 });
    }

    return NextResponse.json({ predictiveIncident });
  } catch (error: any) {
    logger.error('API /predictive-incidents/[id] GET failure', { module: 'api/predictive-incidents/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status, outcome } = body;

    const existing = await prisma.predictiveIncident.findFirst({
      where: {
        id,
        homeId: auth.user.homeId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Predictive incident not found or unauthorized' }, { status: 404 });
    }

    const updateData: any = { updatedAt: new Date() };

    if (status) {
      if (!Object.values(PredictiveIncidentStatus).includes(status)) {
        return NextResponse.json(
          { error: `Invalid status: ${status}. Valid values: ${Object.values(PredictiveIncidentStatus).join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (outcome) {
      if (!Object.values(PredictionOutcome).includes(outcome)) {
        return NextResponse.json(
          { error: `Invalid outcome: ${outcome}. Valid values: ${Object.values(PredictionOutcome).join(', ')}` },
          { status: 400 }
        );
      }
      updateData.outcome = outcome;
    }

    const updated = await prisma.predictiveIncident.update({
      where: { id },
      data: updateData,
    });

    logger.info('Predictive incident updated', {
      id,
      status: updated.status,
      outcome: updated.outcome,
      homeId: auth.user.homeId,
      module: 'predictive-incidents',
    });

    return NextResponse.json({ predictiveIncident: updated });
  } catch (error: any) {
    logger.error('API /predictive-incidents/[id] PATCH failure', { module: 'api/predictive-incidents/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
