import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { AutomationPolicyUpdateSchema } from '@/domain/command.schema';
import { logger } from '@/lib/logger';
import { systemEventsBus } from '@/server/event-engine/rules';

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

    const validation = AutomationPolicyUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues }, { status: 400 });
    }

    const existingPolicy = await prisma.automationPolicy.findUnique({
      where: { id },
    });

    if (!existingPolicy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    if (existingPolicy.homeId !== auth.user.homeId) {
      return NextResponse.json({ error: 'Unauthorized to modify policy for this home' }, { status: 403 });
    }

    const updated = await prisma.automationPolicy.update({
      where: { id },
      data: validation.data as any,
    });

    logger.info('Updated automation policy', {
      policyId: id,
      name: updated.name,
      mode: updated.mode,
      isEnabled: updated.isEnabled,
      module: 'api/automations/policies',
    });

    systemEventsBus.emit('automation_mode_changed', {
      policyId: id,
      mode: updated.mode,
      isEnabled: updated.isEnabled,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    logger.error('Error updating policy', { module: 'api/automations/policies' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
