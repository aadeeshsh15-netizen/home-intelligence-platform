import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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

    if (!['ACTIVE', 'ACKNOWLEDGED', 'DISMISSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid insight status' }, { status: 400 });
    }

    const existing = await prisma.insight.findFirst({
      where: {
        id,
        homeId: auth.user.homeId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Insight not found or unauthorized' }, { status: 404 });
    }

    const updated = await prisma.insight.update({
      where: { id },
      data: { status },
    });

    logger.info('Insight status updated', {
      insightId: id,
      newStatus: status,
      userId: auth.user.userId,
      homeId: auth.user.homeId,
      module: 'insights',
    });

    return NextResponse.json({ insight: updated });
  } catch (error: any) {
    logger.error('API /insights/[id] failure', { module: 'api/insights/[id]' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
