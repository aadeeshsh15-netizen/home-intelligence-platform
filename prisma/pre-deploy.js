const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

console.log('[pre-deploy] Checking and resolving any failed migration records...');
try {
  execSync('npx prisma migrate resolve --rolled-back 20260912000000_init', { stdio: 'inherit' });
  console.log('[pre-deploy] Successfully rolled back failed 20260912000000_init migration record.');
} catch (err) {
  console.log('[pre-deploy] No failed migration record to roll back (or already clean). Proceeding.');
}

console.log('[pre-deploy] Running prisma migrate deploy with retry...');
const maxAttempts = 10;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[pre-deploy] Database migrations applied successfully.');
    break;
  } catch (err) {
    console.warn(`[pre-deploy] Migration attempt ${attempt}/${maxAttempts} failed. Waiting 5s for database...`);
    if (attempt === maxAttempts) {
      console.error('[pre-deploy] Failed to apply migrations after max attempts.');
      process.exit(1);
    }
    const waitTill = new Date(new Date().getTime() + 5000);
    while (waitTill > new Date()) {}
  }
}

async function checkSeed() {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[pre-deploy] Database is empty. Running initial seed...');
      execSync('node prisma/seed.js', { stdio: 'inherit' });
      console.log('[pre-deploy] Initial seed completed successfully.');
    } else {
      console.log(`[pre-deploy] Database already seeded (${userCount} user(s) found). Skipping seed.`);
    }
  } catch (err) {
    console.warn('[pre-deploy] Warning during seed check:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSeed().catch(console.error);
