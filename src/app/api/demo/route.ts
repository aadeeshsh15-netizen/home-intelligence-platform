import { NextRequest, NextResponse } from 'next/server';
import { demoRunner } from '@/server/demo/runner';
import { enforceRateLimit } from '@/server/middleware/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    scenarios: demoRunner.getAvailableScenarios(),
    status: demoRunner.getStatus(),
  });
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = enforceRateLimit(req, 'DEMO');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const { action, scenarioId, homeId, stepDelayMs } = body;

    if (action === 'start') {
      if (!scenarioId) {
        return NextResponse.json({ error: 'scenarioId required for start action' }, { status: 400 });
      }
      const status = await demoRunner.startScenario(scenarioId, homeId);
      return NextResponse.json({ message: 'Scenario started', status });
    }

    if (action === 'step') {
      const result = await demoRunner.step();
      return NextResponse.json(result);
    }

    if (action === 'autorun') {
      if (!scenarioId) {
        return NextResponse.json({ error: 'scenarioId required for autorun action' }, { status: 400 });
      }
      const status = await demoRunner.autoRun(scenarioId, stepDelayMs || 1000, homeId);
      return NextResponse.json({ message: 'Scenario autorun complete', status });
    }

    if (action === 'reset') {
      const status = demoRunner.reset();
      return NextResponse.json({ message: 'Demo runner reset', status });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Demo scenario execution failed' },
      { status: 500 }
    );
  }
}
