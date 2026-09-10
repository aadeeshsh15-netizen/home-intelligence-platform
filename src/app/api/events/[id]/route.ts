import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EventStatus } from '@prisma/client';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

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

    if (!status || !Object.values(EventStatus).includes(status)) {
      return NextResponse.json({ error: 'Invalid event status' }, { status: 400 });
    }

    // Verify ownership of the event
    const existing = await prisma.event.findFirst({
      where: {
        id,
        homeId: auth.user.homeId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Event not found or unauthorized' }, { status: 404 });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === EventStatus.RESOLVED ? new Date() : null,
      },
    });

    logger.info('Event status updated', {
      eventId: id,
      newStatus: status,
      userId: auth.user.userId,
      homeId: auth.user.homeId,
      module: 'events',
    });

    return NextResponse.json({ event: updated });
  } catch (error: any) {
    logger.error('API /events/[id] failure', { module: 'api/events/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
