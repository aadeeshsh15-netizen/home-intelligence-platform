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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'ACTIVE';

    const insights = await prisma.insight.findMany({
      where: {
        homeId: auth.user.homeId,
        status,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true, roomType: true } },
        sensor: { select: { id: true, type: true, unit: true } },
      },
    });

    return NextResponse.json({ insights });
  } catch (error: any) {
    logger.error('API /insights failure', { module: 'api/insights' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
