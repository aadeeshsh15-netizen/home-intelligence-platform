import { prisma } from '@/lib/db';
import { SeverityLevel, EventStatus, SensorHealth, DeviceStatus } from '@prisma/client';
import { EventEmitter } from 'events';

// Global singleton event emitter for internal event bus and SSE dispatch
export const systemEventsBus = new EventEmitter();
systemEventsBus.setMaxListeners(100);

export interface EvaluationResult {
  triggered: boolean;
  ruleId?: string;
  category: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  contextData?: Record<string, any>;
}

/**
 * Evaluates active rules for a specific sensor reading.
 */
export async function evaluateSensorRules(
  sensorId: string,
  value: number
): Promise<EvaluationResult[]> {
  const sensor = await prisma.sensor.findUnique({
    where: { id: sensorId },
    include: {
      room: {
        include: {
          floor: {
            include: { home: true },
          },
        },
      },
      device: true,
    },
  });

  if (!sensor) return [];

  const homeId = sensor.room.floor.home.id;

  const rules = await prisma.rule.findMany({
    where: {
      homeId,
      sensorType: sensor.type,
      isActive: true,
    },
  });

  const results: EvaluationResult[] = [];

  for (const rule of rules) {
    let triggered = false;

    if (rule.operator === 'GT' && value > rule.threshold) {
      triggered = true;
    } else if (rule.operator === 'LT' && value < rule.threshold) {
      triggered = true;
    }

    if (triggered) {
      const title = `${sensor.room.name}: ${sensor.type} Threshold Exceeded`;
      const description = `${sensor.type} measured ${value} ${sensor.unit}, exceeding configured rule limit of ${rule.threshold} ${sensor.unit}.`;

      // Check if an ACTIVE event for this rule/sensor already exists to avoid spamming duplicate events
      const existingActiveEvent = await prisma.event.findFirst({
        where: {
          homeId,
          sensorId: sensor.id,
          title,
          status: EventStatus.ACTIVE,
        },
      });

      if (!existingActiveEvent) {
        const createdEvent = await prisma.event.create({
          data: {
            homeId,
            roomId: sensor.roomId,
            deviceId: sensor.deviceId,
            sensorId: sensor.id,
            category: 'ENVIRONMENTAL',
            severity: rule.severity,
            title,
            description,
            contextData: {
              value,
              threshold: rule.threshold,
              operator: rule.operator,
              unit: sensor.unit,
            },
            status: EventStatus.ACTIVE,
          },
        });

        // Broadcast to realtime bus
        systemEventsBus.emit('event_created', createdEvent);

        results.push({
          triggered: true,
          ruleId: rule.id,
          category: 'ENVIRONMENTAL',
          severity: rule.severity,
          title,
          description,
        });
      }
    }
  }

  return results;
}

/**
 * Checks for stale sensors or disconnected devices based on lastSeenAt.
 */
export async function evaluateDeviceAndSensorConnectivity(staleThresholdSec: number = 120) {
  const cutoff = new Date(Date.now() - staleThresholdSec * 1000);

  // Mark stale sensors
  const staleSensors = await prisma.sensor.findMany({
    where: {
      lastReadingTime: { lt: cutoff },
      health: { not: SensorHealth.STALE },
    },
    include: { room: true },
  });

  for (const sensor of staleSensors) {
    await prisma.sensor.update({
      where: { id: sensor.id },
      data: { health: SensorHealth.STALE },
    });

    systemEventsBus.emit('sensor_health_changed', {
      sensorId: sensor.id,
      health: SensorHealth.STALE,
      roomName: sensor.room.name,
    });
  }

  // Mark disconnected devices
  const offlineDevices = await prisma.device.findMany({
    where: {
      lastSeenAt: { lt: cutoff },
      status: { not: DeviceStatus.OFFLINE },
    },
    include: {
      room: {
        include: {
          floor: {
            include: { home: true },
          },
        },
      },
    },
  });

  for (const device of offlineDevices) {
    await prisma.device.update({
      where: { id: device.id },
      data: { status: DeviceStatus.OFFLINE },
    });

    const homeId = device.room.floor.home.id;
    const title = `Device Disconnected: ${device.name}`;
    const description = `Device ${device.name} in ${device.room.name} has not published telemetry for > ${staleThresholdSec} seconds.`;

    const existing = await prisma.event.findFirst({
      where: {
        homeId,
        deviceId: device.id,
        title,
        status: EventStatus.ACTIVE,
      },
    });

    if (!existing) {
      const createdEvent = await prisma.event.create({
        data: {
          homeId,
          roomId: device.roomId,
          deviceId: device.id,
          category: 'CONNECTIVITY',
          severity: SeverityLevel.WARNING,
          title,
          description,
          status: EventStatus.ACTIVE,
        },
      });

      systemEventsBus.emit('event_created', createdEvent);
    }
  }
}
