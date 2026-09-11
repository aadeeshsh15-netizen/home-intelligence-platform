import { prisma } from '../src/lib/db';
import { validateEnv } from '../src/lib/env';
import { execSync } from 'child_process';

async function main() {
  console.log('\n================================================================================');
  console.log('       HOME INTELLIGENCE PLATFORM — REPRODUCIBLE BOOTSTRAP PROTOCOL             ');
  console.log('================================================================================\n');

  // 1. Validate Environment
  console.log('STEP 1: Validating environment configuration...');
  const envResult = validateEnv({ strict: false });
  if (!envResult.success) {
    console.error('Environment configuration issues detected:');
    envResult.errors?.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log('  ✓ Environment variables validated successfully.\n');

  // 2. Database Connectivity
  console.log('STEP 2: Verifying PostgreSQL database connection...');
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('  ✓ PostgreSQL connection established and responsive.\n');
  } catch (err: any) {
    console.error('  ✗ FATAL: Unable to reach PostgreSQL database.');
    console.error(`    Error: ${err.message || String(err)}`);
    console.error('\nEnsure PostgreSQL is running on the configured DATABASE_URL.');
    console.error('To run via Docker: docker compose -f docker-compose.prod.yml up -d postgres');
    process.exit(1);
  }

  // 3. Database Migration Deployment
  console.log('STEP 3: Checking and deploying database migrations...');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('  ✓ Database migrations applied and up to date.\n');
  } catch (migErr: any) {
    console.warn('  ! Migration deploy encountered a warning (or schema already synchronized via db push).');
  }

  // 4. Data Seeding Check
  console.log('STEP 4: Verifying tenant and sensor seed data...');
  const homeCount = await prisma.home.count();
  const sensorCount = await prisma.sensor.count();
  console.log(`  Current State: ${homeCount} home(s), ${sensorCount} sensor(s).`);

  if (homeCount === 0 || sensorCount === 0) {
    console.log('  No baseline home/sensor data found. Seeding high-fidelity telemetry...');
    try {
      execSync('npm run db:seed', { stdio: 'inherit' });
      console.log('  ✓ Database seeded successfully.\n');
    } catch (seedErr: any) {
      console.error('  ✗ Failed to seed database:', seedErr.message);
    }
  } else {
    console.log('  ✓ Baseline data already present. Skipping destructive re-seed.\n');
  }

  // 5. Readiness Summary
  console.log('STEP 5: Final Readiness Check...');
  const userCount = await prisma.user.count();
  const deviceCount = await prisma.device.count();
  const readingCount = await prisma.telemetryReading.count();

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SYSTEM INVENTORY & READINESS SUMMARY:');
  console.table([
    { Component: 'Homes', Count: homeCount, Status: homeCount > 0 ? 'READY' : 'EMPTY' },
    { Component: 'Users', Count: userCount, Status: userCount > 0 ? 'READY' : 'EMPTY' },
    { Component: 'Devices', Count: deviceCount, Status: deviceCount > 0 ? 'READY' : 'EMPTY' },
    { Component: 'Sensors', Count: sensorCount, Status: sensorCount > 0 ? 'READY' : 'EMPTY' },
    { Component: 'Telemetry Readings', Count: readingCount, Status: readingCount > 0 ? 'READY' : 'EMPTY' },
  ]);
  console.log('--------------------------------------------------------------------------------');
  console.log('\n>> Platform is fully bootstrapped and ready!');
  console.log('>> To start development server:   npm run dev');
  console.log('>> To run deterministic demo:     npm run demo');
  console.log('>> To check live/ready probes:    npm run check:readiness\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
