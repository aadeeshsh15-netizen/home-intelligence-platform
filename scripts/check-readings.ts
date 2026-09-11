import { prisma } from '../src/lib/db';

async function main() {
  const home = await prisma.home.findFirst();
  console.log('Home ID:', home?.id, home?.name);

  const readingCount = await prisma.telemetryReading.count();
  console.log('Total Telemetry Readings:', readingCount);

  const firstFew = await prisma.telemetryReading.findMany({
    take: 5,
    orderBy: { timestamp: 'asc' },
    select: { sensorId: true, timestamp: true, value: true }
  });
  console.log('First 5 readings:', firstFew);

  const lastFew = await prisma.telemetryReading.findMany({
    take: 5,
    orderBy: { timestamp: 'desc' },
    select: { sensorId: true, timestamp: true, value: true }
  });
  console.log('Last 5 readings:', lastFew);

  // Check intervals for a single sensor
  if (firstFew.length > 0) {
    const sId = firstFew[0].sensorId;
    const sReadings = await prisma.telemetryReading.findMany({
      where: { sensorId: sId },
      take: 6,
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, value: true }
    });
    console.log('Sample consecutive timestamps for sensor:', sReadings);
    for (let i = 1; i < sReadings.length; i++) {
      const diffMs = sReadings[i].timestamp.getTime() - sReadings[i - 1].timestamp.getTime();
      console.log(`Step ${i}: diff = ${diffMs / 60000} minutes`);
    }
  }
}

main().catch(console.error).finally(() => process.exit());
