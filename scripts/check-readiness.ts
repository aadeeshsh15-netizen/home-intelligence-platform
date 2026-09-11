import { prisma } from '../src/lib/db';
import { SystemHealthService } from '../src/server/observability/health';

async function main() {
  console.log('\n================================================================================');
  console.log('       HOME INTELLIGENCE PLATFORM — PROBE & READINESS CHECKER                   ');
  console.log('================================================================================\n');

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  let isHttpRunning = false;

  console.log(`Checking HTTP probes at ${baseUrl}...`);

  try {
    const liveRes = await fetch(`${baseUrl}/api/live`, { signal: AbortSignal.timeout(2000) });
    if (liveRes.ok) {
      isHttpRunning = true;
      const liveData = await liveRes.json();
      console.log(`  ✓ LIVE Probe (200 OK): uptime ${liveData.uptimeSeconds}s`);
    } else {
      console.warn(`  ! LIVE Probe returned status ${liveRes.status}`);
    }

    const readyRes = await fetch(`${baseUrl}/api/ready`, { signal: AbortSignal.timeout(3000) });
    if (readyRes.ok) {
      const readyData = await readyRes.json();
      console.log(`  ✓ READY Probe (200 OK): database ${readyData.dependencies?.database?.status}`);
    } else {
      console.warn(`  ! READY Probe returned status ${readyRes.status}`);
    }

    const healthRes = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const healthData = await healthRes.json();
    console.log(`  ✓ HEALTH Endpoint (${healthRes.status}): overall status ${healthData.status}`);
  } catch (httpErr) {
    console.log('  ! HTTP server not currently reachable on port 3000. Evaluating in-process runtime checks...');
  }

  // In-process database & health diagnostics
  console.log('\nEvaluating in-process subsystem diagnostics:');
  const t0 = performance.now();
  let dbStatus = 'DOWN';
  let dbLatency = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Number((performance.now() - t0).toFixed(2));
    dbStatus = 'UP';
  } catch (err: any) {
    dbStatus = 'FAILED';
  }

  const health = await SystemHealthService.evaluateHealth();

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SUBSYSTEM HEALTH STATUS:');
  console.table([
    {
      Subsystem: 'PostgreSQL Database',
      Status: dbStatus,
      Latency: `${dbLatency}ms`,
      Message: dbStatus === 'UP' ? 'Responsive' : 'Connection failed',
    },
    ...Object.values(health.subsystems).map((s) => ({
      Subsystem: s.name,
      Status: s.status,
      Latency: s.latencyMs ? `${s.latencyMs}ms` : 'N/A',
      Message: s.message,
    })),
  ]);
  console.log('--------------------------------------------------------------------------------');
  console.log(`Overall Health Status: ${health.status}`);
  console.log(`Fleet Connectivity: ${health.fleet.onlineCount} online, ${health.fleet.staleCount} stale, ${health.fleet.offlineCount} offline (total: ${health.fleet.totalDevices})\n`);

  await prisma.$disconnect();
  process.exit(health.status === 'CRITICAL' ? 1 : 0);
}

main().catch((err) => {
  console.error('Readiness check failed:', err);
  process.exit(1);
});
