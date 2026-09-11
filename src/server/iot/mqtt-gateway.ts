import mqtt, { MqttClient } from 'mqtt';
import { prisma } from '@/lib/db';
import {
  parseMqttTopic,
  MqttTelemetryPayloadSchema,
  MqttStatusPayloadSchema,
  validateMqttTimestamp,
} from '@/domain/mqtt.schema';
import { authenticateDeviceForTopic } from './device-auth';
import { processTelemetryIngest, IngestionSummary } from '../telemetry/pipeline';
import { IngestTelemetryPayload, SingleReading } from '@/domain/telemetry.schema';
import { DeviceStatus, DeviceProtocol, SensorHealth, CommandStatus } from '@prisma/client';
import { DeviceCommandPayload, DeviceAckPayloadSchema } from '@/domain/command.schema';
import { logger } from '@/lib/logger';
import { systemEventsBus } from '../event-engine/rules';

export interface MqttGatewayConfig {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
  reconnectPeriod?: number;
  connectTimeout?: number;
}

export class MqttGatewayService {
  private static instance: MqttGatewayService | null = null;
  private client: MqttClient | null = null;
  private isConnected: boolean = false;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private config: MqttGatewayConfig;

  private constructor(config?: Partial<MqttGatewayConfig>) {
    this.config = {
      brokerUrl: config?.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      clientId: config?.clientId || `hip_gateway_${process.pid}_${Math.floor(Math.random() * 10000)}`,
      username: config?.username || process.env.MQTT_USERNAME,
      password: config?.password || process.env.MQTT_PASSWORD,
      reconnectPeriod: config?.reconnectPeriod || 5000,
      connectTimeout: config?.connectTimeout || 10000,
    };
  }

  public static getInstance(config?: Partial<MqttGatewayConfig>): MqttGatewayService {
    if (!MqttGatewayService.instance) {
      MqttGatewayService.instance = new MqttGatewayService(config);
    }
    return MqttGatewayService.instance;
  }

  /**
   * Initializes connection to the MQTT broker and begins listening to device telemetry.
   */
  public async start(): Promise<void> {
    if (this.client) return;

    logger.info('Starting MQTT Gateway consumer service', {
      brokerUrl: this.config.brokerUrl,
      clientId: this.config.clientId,
      module: 'mqtt-gateway',
    });

    try {
      this.client = mqtt.connect(this.config.brokerUrl, {
        clientId: this.config.clientId,
        username: this.config.username,
        password: this.config.password,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout,
        clean: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('MQTT Gateway connected to broker', {
          brokerUrl: this.config.brokerUrl,
          module: 'mqtt-gateway',
        });

        // Subscribe to all home device topics
        this.client?.subscribe('home/+/device/+/+', { qos: 1 }, (err) => {
          if (err) {
            logger.error('Failed to subscribe to home device MQTT wildcard topic', { module: 'mqtt-gateway' }, err);
          } else {
            logger.info('Subscribed to MQTT topic: home/+/device/+/+', { module: 'mqtt-gateway' });
          }
        });
      });

      this.client.on('message', (topic, message) => {
        this.handleIncomingMessage(topic, message).catch((err: any) => {
          logger.error('Unhandled error processing MQTT message', { topic, module: 'mqtt-gateway' }, err);
        });
      });

      this.client.on('error', (err) => {
        logger.error('MQTT Gateway client error', { module: 'mqtt-gateway' }, err);
      });

      this.client.on('close', () => {
        if (this.isConnected) {
          this.isConnected = false;
          logger.warn('MQTT Gateway disconnected from broker', { module: 'mqtt-gateway' });
        }
      });

      this.startHeartbeatWatchdog();
    } catch (err: any) {
      logger.error('Failed to start MQTT Gateway', { module: 'mqtt-gateway' }, err);
      throw err;
    }
  }

  /**
   * Dispatches and processes an incoming MQTT message.
   */
  public async handleIncomingMessage(topic: string, message: Buffer): Promise<IngestionSummary | null> {
    const parsedTopic = parseMqttTopic(topic);
    if (!parsedTopic) {
      logger.debug('Ignoring non-conforming MQTT topic', { topic, module: 'mqtt-gateway' });
      return null;
    }

    const { homeId, deviceId, action } = parsedTopic;

    let payloadJson: any;
    try {
      payloadJson = JSON.parse(message.toString('utf-8'));
    } catch (err) {
      logger.warn('Rejected malformed JSON from MQTT message', { topic, module: 'mqtt-gateway' });
      return null;
    }

    switch (action) {
      case 'telemetry':
        return await this.handleTelemetry(homeId, deviceId, payloadJson);
      case 'status':
        await this.handleStatus(homeId, deviceId, payloadJson);
        return null;
      case 'command':
        logger.debug('Received command topic message (loopback/audit)', { homeId, deviceId, module: 'mqtt-gateway' });
        return null;
      case 'ack':
        await this.handleAck(homeId, deviceId, payloadJson);
        return null;
      default:
        return null;
    }
  }

  /**
   * Translates MQTT telemetry to the platform's normalized pipeline.
   */
  public async handleTelemetry(
    homeId: string,
    deviceId: string,
    rawPayload: unknown
  ): Promise<IngestionSummary | null> {
    // 1. Zod payload validation
    const parsed = MqttTelemetryPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      logger.warn('Rejected invalid MQTT telemetry payload', {
        homeId,
        deviceId,
        errors: parsed.error.issues,
        module: 'mqtt-gateway',
      });
      return null;
    }

    const data = parsed.data;

    // 2. Timestamp sanity & replay attack check
    const timeCheck = validateMqttTimestamp(data.timestamp);
    if (!timeCheck.valid) {
      logger.warn('Rejected MQTT telemetry with invalid timestamp', {
        homeId,
        deviceId,
        reason: timeCheck.reason,
        timestamp: data.timestamp,
        module: 'mqtt-gateway',
      });
      return null;
    }

    // 3. Authenticate device and verify home tenancy
    const auth = await authenticateDeviceForTopic({ homeId, deviceId });
    if (!auth.authorized || !auth.device) {
      logger.warn('Rejected unauthorized MQTT telemetry packet', {
        homeId,
        deviceId,
        reason: auth.reason,
        module: 'mqtt-gateway',
      });
      return null;
    }

    const device = auth.device;

    // 4. Fetch device sensors from database
    const deviceSensors = await prisma.sensor.findMany({
      where: { deviceId: device.id },
    });

    if (deviceSensors.length === 0) {
      logger.warn('Device has no registered sensors in database', {
        deviceId: device.id,
        homeId,
        module: 'mqtt-gateway',
      });
      return null;
    }

    // 5. Map MQTT metrics to normalized SingleReading contract
    const readings: SingleReading[] = [];

    for (const metric of data.metrics) {
      // Find matching sensor by explicit sensorId or type
      let matchingSensor = metric.sensorId
        ? deviceSensors.find((s) => s.id === metric.sensorId)
        : deviceSensors.find((s) => s.type === metric.type);

      if (!matchingSensor) {
        logger.debug('No matching sensor on device for metric type', {
          deviceId: device.id,
          metricType: metric.type,
          module: 'mqtt-gateway',
        });
        continue;
      }

      readings.push({
        sensorId: matchingSensor.id,
        timestamp: timeCheck.parsedDate,
        value: metric.value,
        quality: 'VALID',
        unit: metric.unit || matchingSensor.unit,
      });
    }

    if (readings.length === 0) {
      return null;
    }

    // 6. Form normalized IngestTelemetryPayload
    const normalizedPayload: IngestTelemetryPayload = {
      producerId: `mqtt:${device.identifier}`,
      readings,
    };

    // 7. Route to existing authoritative Ingestion Pipeline
    const summary = await processTelemetryIngest(normalizedPayload);

    // 8. Update device health and lastSeen timestamp
    await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: timeCheck.parsedDate,
        status: DeviceStatus.ONLINE,
      },
    });

    return summary;
  }

  /**
   * Processes device status and Last Will & Testament (LWT) packets.
   */
  public async handleStatus(homeId: string, deviceId: string, rawPayload: unknown): Promise<void> {
    const parsed = MqttStatusPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      logger.warn('Rejected invalid MQTT status payload', {
        homeId,
        deviceId,
        errors: parsed.error.issues,
        module: 'mqtt-gateway',
      });
      return;
    }

    const data = parsed.data;

    const auth = await authenticateDeviceForTopic({ homeId, deviceId });
    if (!auth.authorized || !auth.device) {
      logger.warn('Rejected unauthorized MQTT status packet', {
        homeId,
        deviceId,
        reason: auth.reason,
        module: 'mqtt-gateway',
      });
      return;
    }

    const device = auth.device;
    const now = new Date();

    const targetStatus = data.status === 'OFFLINE' ? DeviceStatus.OFFLINE : DeviceStatus.ONLINE;

    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: targetStatus,
        lastSeenAt: now,
        lastHeartbeatAt: targetStatus === DeviceStatus.ONLINE ? now : device.lastHeartbeatAt,
        ...(data.firmwareVersion ? { firmwareVersion: data.firmwareVersion } : {}),
        ...(data.mac ? { macAddress: data.mac } : {}),
      },
    });

    if (targetStatus === DeviceStatus.OFFLINE) {
      // Mark attached sensors OFFLINE without fabricating zero values
      await prisma.sensor.updateMany({
        where: { deviceId: device.id },
        data: { health: SensorHealth.OFFLINE },
      });

      logger.info('Device transitioned to OFFLINE via MQTT status/LWT', {
        deviceId: device.id,
        identifier: device.identifier,
        reason: data.reason || 'LWT or explicit disconnect',
        module: 'mqtt-gateway',
      });

      systemEventsBus.emit('sensor_health_changed', {
        deviceId: device.id,
        status: DeviceStatus.OFFLINE,
        timestamp: now.toISOString(),
      });
    }
  }

  /**
   * Periodic watchdog sweep checking for devices that missed heartbeats.
   */
  private startHeartbeatWatchdog(): void {
    if (this.watchdogInterval) return;

    this.watchdogInterval = setInterval(async () => {
      try {
        await this.sweepStaleDevices();
      } catch (err: any) {
        logger.error('Error during MQTT device watchdog sweep', { module: 'mqtt-gateway' }, err);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Sweeps all physical MQTT devices:
   * - > 180s without contact -> OFFLINE
   * - > 60s without contact -> STALE
   */
  public async sweepStaleDevices(referenceTime: Date = new Date()): Promise<{ staleCount: number; offlineCount: number }> {
    const refMs = referenceTime.getTime();
    const staleThreshold = new Date(refMs - 60 * 1000);
    const offlineThreshold = new Date(refMs - 180 * 1000);

    // 1. Transition to OFFLINE
    const offlineResult = await prisma.device.updateMany({
      where: {
        protocol: DeviceProtocol.MQTT,
        status: { in: [DeviceStatus.ONLINE, DeviceStatus.STALE] },
        lastSeenAt: { lt: offlineThreshold },
      },
      data: {
        status: DeviceStatus.OFFLINE,
      },
    });

    if (offlineResult.count > 0) {
      logger.info(`Watchdog marked ${offlineResult.count} physical devices OFFLINE due to inactivity (>180s)`, {
        module: 'mqtt-gateway',
      });
    }

    // 2. Transition to STALE
    const staleResult = await prisma.device.updateMany({
      where: {
        protocol: DeviceProtocol.MQTT,
        status: DeviceStatus.ONLINE,
        lastSeenAt: { lt: staleThreshold, gte: offlineThreshold },
      },
      data: {
        status: DeviceStatus.STALE,
      },
    });

    if (staleResult.count > 0) {
      logger.info(`Watchdog marked ${staleResult.count} physical devices STALE due to inactivity (>60s)`, {
        module: 'mqtt-gateway',
      });
    }

    return {
      staleCount: staleResult.count,
      offlineCount: offlineResult.count,
    };
  }

  /**
   * Publishes a command payload to an external MQTT device.
   * Topic: home/{homeId}/device/{deviceId}/command
   */
  public async publishCommand(
    homeId: string,
    deviceId: string,
    payload: DeviceCommandPayload
  ): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      logger.warn('Cannot publish MQTT command: broker client not connected', {
        homeId,
        deviceId,
        commandId: payload.commandId,
        module: 'mqtt-gateway',
      });
      return false;
    }

    const topic = `home/${homeId}/device/${deviceId}/command`;
    const message = JSON.stringify(payload);

    return new Promise<boolean>((resolve) => {
      this.client?.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          logger.error('Failed to publish command to MQTT broker', { topic, error: err.message, module: 'mqtt-gateway' });
          resolve(false);
        } else {
          logger.info('Published command to MQTT topic', { topic, commandId: payload.commandId, module: 'mqtt-gateway' });
          resolve(true);
        }
      });
    });
  }

  /**
   * Processes device acknowledgement payloads received on home/{homeId}/device/{deviceId}/ack
   */
  public async handleAck(homeId: string, deviceId: string, rawPayload: unknown): Promise<void> {
    const parsed = DeviceAckPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      logger.warn('Rejected invalid MQTT ack payload', { homeId, deviceId, errors: parsed.error.issues, module: 'mqtt-gateway' });
      return;
    }

    const { commandId, status, actualState, reason } = parsed.data;
    const now = new Date();

    const command = await prisma.deviceCommand.findUnique({
      where: { commandId },
    });

    if (!command) {
      logger.warn('Received acknowledgement for unknown commandId', { commandId, homeId, deviceId, module: 'mqtt-gateway' });
      return;
    }

    const nextStatus = status === 'REJECTED'
      ? CommandStatus.REJECTED
      : status === 'COMPLETED'
      ? CommandStatus.COMPLETED
      : status === 'FAILED'
      ? CommandStatus.FAILED
      : CommandStatus.ACKNOWLEDGED;

    await prisma.deviceCommand.update({
      where: { commandId },
      data: {
        status: nextStatus,
        acknowledgedAt: now,
        completedAt: nextStatus === CommandStatus.COMPLETED ? now : undefined,
        resultPayload: (actualState || { reason }) as any,
      },
    });

    logger.info('Device command acknowledgement processed', {
      commandId,
      status: nextStatus,
      deviceId,
      module: 'mqtt-gateway',
    });

    systemEventsBus.emit('command_acknowledged', {
      commandId,
      deviceId,
      status: nextStatus,
      timestamp: now.toISOString(),
    });
  }

  /**
   * Stops the MQTT client and shuts down watchdog timers.
   */
  public async stop(): Promise<void> {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    if (this.client) {
      return new Promise<void>((resolve) => {
        this.client?.end(false, () => {
          this.client = null;
          this.isConnected = false;
          logger.info('MQTT Gateway consumer stopped', { module: 'mqtt-gateway' });
          resolve();
        });
      });
    }
  }
}

export const mqttGateway = MqttGatewayService.getInstance();
