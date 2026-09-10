import { NextRequest, NextResponse } from 'next/server';
import { simulatorEngine } from '@/server/simulator/engine';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const auth = await enforceHomeAccess(req);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  return NextResponse.json({
    status: simulatorEngine.getStatus(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const { action, anomaly } = body;

    if (action === 'start') {
      const interval = body.intervalMs || 4000;
      simulatorEngine.start(interval);
      logger.info('Simulator engine started', { interval, module: 'simulator', userId: auth.user.userId });
      return NextResponse.json({ message: 'Simulator started', interval });
    }

    if (action === 'stop') {
      simulatorEngine.stop();
      logger.info('Simulator engine stopped', { module: 'simulator', userId: auth.user.userId });
      return NextResponse.json({ message: 'Simulator stopped' });
    }

    if (action === 'tick') {
      await simulatorEngine.tick();
      return NextResponse.json({ message: 'Single simulation tick executed' });
    }

    if (action === 'inject_anomaly' && anomaly) {
      simulatorEngine.injectAnomaly(anomaly);
      logger.warn('Physical anomaly injected into simulator', {
        type: anomaly.type,
        roomId: anomaly.roomId,
        module: 'simulator',
        userId: auth.user.userId,
      });
      // Run an immediate tick to propagate the anomaly
      await simulatorEngine.tick();
      return NextResponse.json({
        message: `Injected anomaly ${anomaly.type}`,
        active: simulatorEngine.getActiveAnomalies(),
      });
    }

    if (action === 'clear_anomaly' && body.roomId && body.type) {
      simulatorEngine.clearAnomaly(body.roomId, body.type);
      logger.info('Physical anomaly cleared from simulator', {
        type: body.type,
        roomId: body.roomId,
        module: 'simulator',
        userId: auth.user.userId,
      });
      return NextResponse.json({
        message: `Cleared anomaly ${body.type}`,
        active: simulatorEngine.getActiveAnomalies(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    logger.error('API /simulator failure', { module: 'api/simulator' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
