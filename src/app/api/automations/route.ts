import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { ensureDefaultPolicies } from '@/server/automation/policies';
import { AutomationStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const homeId = auth.user.homeId;
    await ensureDefaultPolicies(homeId);

    // 1. Fetch policies
    const policies = await prisma.automationPolicy.findMany({
      where: { homeId },
      orderBy: { createdAt: 'asc' },
    });

    // 2. Fetch active automations (EXECUTING or VERIFYING)
    const activeAutomations = await prisma.automationExecution.findMany({
      where: {
        homeId,
        status: { in: [AutomationStatus.EXECUTING, AutomationStatus.VERIFYING] },
      },
      include: {
        policy: true,
        device: { include: { room: true } },
        command: true,
        predictiveIncident: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    // 3. Fetch execution history (last 50)
    const history = await prisma.automationExecution.findMany({
      where: { homeId },
      include: {
        policy: true,
        device: { include: { room: true } },
        command: true,
        predictiveIncident: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    // 4. Summarize system mode
    const modeCounts = {
      AUTO: policies.filter((p) => p.mode === 'AUTO' && p.isEnabled).length,
      MANUAL: policies.filter((p) => p.mode === 'MANUAL').length,
      DISABLED: policies.filter((p) => p.mode === 'DISABLED' || !p.isEnabled).length,
    };

    return NextResponse.json({
      policies,
      activeAutomations,
      history,
      modeCounts,
    });
  } catch (error: any) {
    logger.error('Error fetching automations', { module: 'api/automations' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
