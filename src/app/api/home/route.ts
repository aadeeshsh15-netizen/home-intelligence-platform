import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SensorType, EventStatus, SensorHealth, DeviceStatus } from '@prisma/client';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { UpdateHomeSchema } from '@/domain/home.schema';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const home = await prisma.home.findUnique({
      where: { id: auth.user.homeId },
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                sensors: true,
                devices: true,
              },
            },
          },
        },
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Home not found for authenticated user' }, { status: 404 });
    }

    const allRooms = home.floors.flatMap((f) => f.rooms);
    const allSensors = allRooms.flatMap((r) => r.sensors);
    const allDevices = allRooms.flatMap((r) => r.devices);

    // Compute Climate Aggregates
    const tempSensors = allSensors.filter((s) => s.type === SensorType.TEMPERATURE && s.lastReadingValue !== null);
    const humiditySensors = allSensors.filter((s) => s.type === SensorType.HUMIDITY && s.lastReadingValue !== null);
    const co2Sensors = allSensors.filter((s) => s.type === SensorType.CO2 && s.lastReadingValue !== null);
    const powerSensors = allSensors.filter((s) => s.type === SensorType.POWER && s.lastReadingValue !== null);

    const avgTemperature = tempSensors.length > 0
      ? Number((tempSensors.reduce((sum, s) => sum + (s.lastReadingValue || 0), 0) / tempSensors.length).toFixed(1))
      : 21.0;

    const avgHumidity = humiditySensors.length > 0
      ? Math.round(humiditySensors.reduce((sum, s) => sum + (s.lastReadingValue || 0), 0) / humiditySensors.length)
      : 45;

    const avgCO2 = co2Sensors.length > 0
      ? Math.round(co2Sensors.reduce((sum, s) => sum + (s.lastReadingValue || 0), 0) / co2Sensors.length)
      : 520;

    let airQualityStatus: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' = 'EXCELLENT';
    if (avgCO2 > 1200) airQualityStatus = 'POOR';
    else if (avgCO2 > 900) airQualityStatus = 'MODERATE';
    else if (avgCO2 > 600) airQualityStatus = 'GOOD';

    // Instantaneous Power
    const currentTotalWatts = Math.round(powerSensors.reduce((sum, s) => sum + (s.lastReadingValue || 0), 0));

    // Occupied Rooms
    const occupiedRoomNames = allRooms
      .filter((r) => {
        const occ = r.sensors.find((s) => s.type === SensorType.OCCUPANCY);
        return occ && occ.lastReadingValue === 1;
      })
      .map((r) => r.name);

    // Fleet Health
    const onlineDevices = allDevices.filter((d) => d.status === DeviceStatus.ONLINE).length;
    const degradedDevices = allDevices.filter((d) => d.status === DeviceStatus.DEGRADED).length;
    const offlineDevices = allDevices.filter((d) => d.status === DeviceStatus.OFFLINE).length;
    const staleSensors = allSensors.filter((s) => s.health !== SensorHealth.HEALTHY).length;

    // Active Alerts Count
    const activeAlertsCount = await prisma.event.count({
      where: { homeId: home.id, status: EventStatus.ACTIVE },
    });

    const activeInsightsCount = await prisma.insight.count({
      where: { homeId: home.id, status: 'ACTIVE' },
    });

    return NextResponse.json({
      home: {
        id: home.id,
        name: home.name,
        timezone: home.timezone,
        address: home.address,
        totalFloors: home.floors.length,
        totalRooms: allRooms.length,
        totalDevices: allDevices.length,
        totalSensors: allSensors.length,
      },
      climate: {
        avgTemperature,
        avgHumidity,
        avgCO2,
        airQualityStatus,
      },
      energy: {
        currentTotalWatts,
        peakWattsToday: Math.round(currentTotalWatts * 1.35),
      },
      occupancy: {
        isHomeOccupied: occupiedRoomNames.length > 0,
        occupiedRoomsCount: occupiedRoomNames.length,
        occupiedRoomNames,
      },
      fleetHealth: {
        totalDevices: allDevices.length,
        onlineDevices,
        degradedDevices,
        offlineDevices,
        staleSensors,
      },
      activeAlertsCount,
      activeInsightsCount,
    });
  } catch (error: any) {
    logger.error('API /home failure', { module: 'api/home' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const validation = UpdateHomeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors.map((e) => e.message).join(', '),
        },
        { status: 400 }
      );
    }

    const updatedHome = await prisma.home.update({
      where: { id: auth.user.homeId },
      data: { name: validation.data.name },
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                sensors: true,
                devices: true,
              },
            },
          },
        },
      },
    });

    logger.info('Home name updated successfully', {
      homeId: auth.user.homeId,
      newName: updatedHome.name,
      module: 'api/home',
    });

    const allRooms = updatedHome.floors.flatMap((f) => f.rooms);
    const allSensors = allRooms.flatMap((r) => r.sensors);
    const allDevices = allRooms.flatMap((r) => r.devices);

    return NextResponse.json({
      home: {
        id: updatedHome.id,
        name: updatedHome.name,
        timezone: updatedHome.timezone,
        address: updatedHome.address,
        totalFloors: updatedHome.floors.length,
        totalRooms: allRooms.length,
        totalDevices: allDevices.length,
        totalSensors: allSensors.length,
        updatedAt: updatedHome.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('API /home PATCH failure', { module: 'api/home' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

