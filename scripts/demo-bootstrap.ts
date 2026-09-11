import { prisma } from '../src/lib/db';
import { demoRunner } from '../src/server/demo/runner';

async function main() {
  console.log('\n================================================================================');
  console.log('       HOME INTELLIGENCE PLATFORM — DEMO PRESENTATION BOOTSTRAP                 ');
  console.log('================================================================================\n');

  console.log('STEP 1: Verifying platform prerequisites for presentation...');

  // 1. Verify Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('  ✓ PostgreSQL database connection verified.');
  } catch (err: any) {
    console.error('  ✗ PostgreSQL connection failed. Ensure database container is running.');
    console.error('    Command: docker compose -f docker-compose.prod.yml up -d postgres\n');
    process.exit(1);
  }

  // 2. Verify Home & Sensors
  const home = await prisma.home.findFirst({ include: { floors: { include: { rooms: { include: { sensors: true } } } } } });
  if (!home) {
    console.error('  ✗ No home environment found in database. Run bootstrap first:');
    console.error('    Command: npm run bootstrap\n');
    process.exit(1);
  }
  console.log(`  ✓ Target home found: "${home.name}" (${home.id})`);

  // 3. Reset Demo Runner State
  demoRunner.reset();
  console.log('  ✓ Presentation scenario runner reset to clean IDLE state.');

  // 4. List Scenarios
  const scenarios = demoRunner.getAvailableScenarios();
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`AVAILABLE DETERMINISTIC PRESENTATION SCENARIOS (${scenarios.length}):`);
  console.table(
    scenarios.map((s, idx) => ({
      Index: idx + 1,
      ID: s.id,
      Title: s.title,
      Category: s.category,
      Steps: s.steps.length,
    }))
  );
  console.log(`--------------------------------------------------------------------------------`);

  const port = process.env.PORT || 3000;
  console.log('\n>> PRESENTATION CONSOLE IS READY!');
  console.log(`>> Open in browser:  http://localhost:${port}/demo`);
  console.log(`>> 2-Minute Script:  docs/demo-guide.md`);
  console.log(`>> To start web app: npm run dev\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Demo bootstrap failed:', err);
  process.exit(1);
});
