import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { DeviceProvisioningRequestSchema } from '@/domain/mqtt.schema';
import { generateDeviceToken, hashDeviceToken, generateFirmwareConfigSnippet } from '@/server/iot/device-auth';
import { DeviceProtocol, DeviceStatus, ProvisioningStatus, SensorType } from '@prisma/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function getDefaultSensorMeta(type: SensorType): { unit: string; min: number; max: number; intervalSec: number } {
  switch (type) {
    case SensorType.TEMPERATURE:
      return { unit: '°C', min: -10, max: 50, intervalSec: 10 };
    case SensorType.HUMIDITY:
      return { unit: '%', min: 0, max: 100, intervalSec: 10 };
    case SensorType.CO2:
      return { unit: 'ppm', min: 350, max: 3000, intervalSec: 10 };
    case SensorType.OCCUPANCY:
      return { unit: 'binary', min: 0, max: 1, intervalSec: 5 };
    case SensorType.CONTACT:
      return { unit: 'binary', min: 0, max: 1, intervalSec: 5 };
    case SensorType.POWER:
      return { unit: 'W', min: 0, max: 10000, intervalSec: 10 };
    case SensorType.LIGHT:
      return { unit: 'lux', min: 0, max: 100000, intervalSec: 15 };
    case SensorType.NOISE:
      return { unit: 'dB', min: 20, max: 130, intervalSec: 10 };
    case SensorType.PM2_5:
      return { unit: 'µg/m³', min: 0, max: 500, intervalSec: 30 };
    case SensorType.WATER_FLOW:
      return { unit: 'L/min', min: 0, max: 50, intervalSec: 5 };
    default:
      return { unit: 'units', min: 0, max: 1000, intervalSec: 30 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const parsed = DeviceProvisioningRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const data = parsed.data;

    // Verify room belongs to home
    const room = await prisma.room.findFirst({
      where: {
        id: data.roomId,
        floor: { homeId: auth.user.homeId },
      },
    });

    if (!room) {
      return NextResponse.json({ error: 'Selected room does not exist in home' }, { status: 404 });
    }

    // Generate unique device identifier
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const identifier = data.macAddress
      ? `esp32-${data.macAddress.replace(/[:-]/g, '').toLowerCase()}`
      : `esp32-${room.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${randomSuffix}`;

    // Generate pairing secret and salted hash
    const authToken = generateDeviceToken();
    const authTokenHash = hashDeviceToken(authToken);

    // Create physical device record
    const device = await prisma.device.create({
      data: {
        name: data.name,
        deviceType: data.deviceType,
        hardwareType: data.hardwareType,
        protocol: DeviceProtocol.MQTT,
        identifier,
        status: DeviceStatus.OFFLINE,
        provisioningStatus: ProvisioningStatus.PROVISIONED,
        authTokenHash,
        macAddress: data.macAddress,
        roomId: data.roomId,
      },
    });

    // Create attached sensor definitions
    const createdSensors = [];
    for (const sensorType of data.sensorTypes) {
      const meta = getDefaultSensorMeta(sensorType);
      const sensor = await prisma.sensor.create({
        data: {
          roomId: data.roomId,
          deviceId: device.id,
          type: sensorType,
          unit: meta.unit,
          minExpectedValue: meta.min,
          maxExpectedValue: meta.max,
          samplingIntervalSec: meta.intervalSec,
        },
      });
      createdSensors.push(sensor);
    }

    const brokerHost = process.env.MQTT_BROKER_HOST || '192.168.1.100';
    const brokerPort = Number(process.env.MQTT_BROKER_PORT) || 1883;

    const configSnippet = generateFirmwareConfigSnippet({
      homeId: auth.user.homeId,
      deviceId: device.identifier,
      authToken,
      brokerHost,
      brokerPort,
    });

    logger.info('Provisioned new physical IoT hardware device', {
      deviceId: device.id,
      identifier: device.identifier,
      hardwareType: device.hardwareType,
      sensorsCount: createdSensors.length,
      homeId: auth.user.homeId,
      module: 'api/devices/provision',
    });

    return NextResponse.json(
      {
        device: {
          id: device.id,
          identifier: device.identifier,
          name: device.name,
          homeId: auth.user.homeId,
          roomId: device.roomId,
          hardwareType: device.hardwareType,
          protocol: device.protocol,
          provisioningStatus: device.provisioningStatus,
          sensors: createdSensors,
        },
        credentials: {
          topicPrefix: `home/${auth.user.homeId}/device/${device.identifier}`,
          telemetryTopic: `home/${auth.user.homeId}/device/${device.identifier}/telemetry`,
          statusTopic: `home/${auth.user.homeId}/device/${device.identifier}/status`,
          commandTopic: `home/${auth.user.homeId}/device/${device.identifier}/command`,
          deviceId: device.identifier,
          authToken, // Only returned ONCE during provisioning
        },
        configSnippet,
      },
      { status: 201 }
    );
  } catch (error: any) {
    logger.error('API /devices/provision error', { module: 'api/devices/provision' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
