import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';
import { IncidentStatus } from '@prisma/client';

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
    const incident = await prisma.incident.findFirst({
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
      },
    });

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    return NextResponse.json({ incident });
  } catch (error: any) {
    logger.error('API /incidents/[id] GET failure', { module: 'api/incidents/[id]' }, error);
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
    const { status } = body;

    if (!Object.values(IncidentStatus).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}. Valid values: ${Object.values(IncidentStatus).join(', ')}` },
        { status: 400 }
      );
    }

    const existing = await prisma.incident.findFirst({
      where: {
        id,
        homeId: auth.user.homeId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Incident not found or unauthorized' }, { status: 404 });
    }

    const updateData: any = { status };
    if (status === IncidentStatus.RESOLVED && !existing.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: updateData,
    });

    if (status === IncidentStatus.RESOLVED) {
      systemEventsBus.emit('incident_resolved', updated);
    } else {
      systemEventsBus.emit('incident_updated', updated);
    }

    logger.info('Incident status updated', {
      incidentId: id,
      newStatus: status,
      homeId: auth.user.homeId,
      module: 'incidents',
    });

    return NextResponse.json({ incident: updated });
  } catch (error: any) {
    logger.error('API /incidents/[id] PATCH failure', { module: 'api/incidents/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
