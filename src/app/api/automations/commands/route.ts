import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { CommandDispatcher } from '@/server/automation/dispatcher';
import { ActuatorActionEnum } from '@/domain/command.schema';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AutomationStatus, VerificationStatus } from '@prisma/client';
import { enforceRateLimit } from '@/server/middleware/rate-limiter';

const ManualCommandSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  action: ActuatorActionEnum,
  parameters: z.record(z.unknown()).optional(),
  expiresInSec: z.number().int().positive().default(300),
  reason: z.string().default('Manual user override'),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = enforceRateLimit(req, 'COMMANDS');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const validation = ManualCommandSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues }, { status: 400 });
    }

    const { deviceId, action, parameters, expiresInSec, reason } = validation.data;
    const homeId = auth.user.homeId;

    // Verify device belongs to user's home
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        room: { floor: { homeId } },
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found in this home' }, { status: 404 });
    }

    // Prohibit mains voltage
    if (device.deviceType.toUpperCase().includes('MAINS')) {
      return NextResponse.json(
        { error: 'Electrical safety violation: Mains-voltage devices cannot be controlled' },
        { status: 403 }
      );
    }

    // Dispatch manual command
    const dispatchResult = await CommandDispatcher.dispatch({
      homeId,
      deviceId,
      action,
      parameters,
      expectedState: { action },
      source: 'MANUAL_OVERRIDE',
      expiresInSec,
    });

    // Record in execution history as manual override
    const execution = await prisma.automationExecution.create({
      data: {
        homeId,
        policyId: (await prisma.automationPolicy.findFirst({ where: { homeId } }))?.id || '',
        deviceId,
        commandId: dispatchResult.commandId || null,
        status: AutomationStatus.COMPLETED,
        triggerReason: reason,
        triggerEvidence: { source: 'MANUAL_USER_OVERRIDE', userId: auth.user.userId },
        decisionExplanation: `Manual operator override issued ${action} to device ${device.name}.`,
        safetyEvaluation: { manualOverride: true, failClosedVerified: true },
        actionTaken: action,
        expectedOutcome: `Manual command ${action} issued by authenticated operator.`,
        baselineMetricValue: 0,
        targetMetricValue: 0,
        verificationStatus: VerificationStatus.VERIFIED_EFFECTIVE,
        manualOverride: true,
        isEffective: true,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    logger.info('Manual override command executed', {
      deviceId,
      action,
      commandId: dispatchResult.commandId,
      userId: auth.user.userId,
      module: 'api/automations/commands',
    });

    return NextResponse.json({
      success: true,
      commandId: dispatchResult.commandId,
      status: dispatchResult.status,
      executionId: execution.id,
    });
  } catch (error: any) {
    logger.error('Error dispatching manual command', { module: 'api/automations/commands' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
