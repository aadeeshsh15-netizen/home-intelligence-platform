import { prisma } from '@/lib/db';
import { ActuatorAction, CommandStatus, DeviceProtocol } from '@prisma/client';
import { generateCommandId, DeviceCommandPayload } from '@/domain/command.schema';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { simulatorEngine } from '@/server/simulator/engine';
import { systemEventsBus } from '@/server/event-engine/rules';
import { logger } from '@/lib/logger';

export interface DispatchCommandOptions {
  homeId: string;
  deviceId: string;
  action: ActuatorAction;
  parameters?: Record<string, any>;
  expectedState?: Record<string, any>;
  source?: 'AUTOMATION_ENGINE' | 'MANUAL_OVERRIDE';
  expiresInSec?: number;
}

export class CommandDispatcher {
  /**
   * Dispatches a command to a physical, simulated, or emulated device using a unified wire contract.
   */
  public static async dispatch(options: DispatchCommandOptions): Promise<{
    commandId: string;
    status: CommandStatus;
    delivered: boolean;
    error?: string;
  }> {
    const {
      homeId,
      deviceId,
      action,
      parameters,
      expectedState,
      source = 'AUTOMATION_ENGINE',
      expiresInSec = 300,
    } = options;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      return {
        commandId: '',
        status: CommandStatus.FAILED,
        delivered: false,
        error: `Device ${deviceId} not found`,
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInSec * 1000);
    const commandId = generateCommandId('cmd');

    // 1. Create durable DeviceCommand record in database
    const createdCommand = await prisma.deviceCommand.create({
      data: {
        homeId,
        deviceId,
        commandId,
        action,
        parameters: parameters as any,
        expectedState: expectedState as any,
        status: CommandStatus.PENDING,
        source,
        issuedAt: now,
        expiresAt,
      },
    });

    const payload: DeviceCommandPayload = {
      commandId,
      action,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source,
      expectedState,
      parameters,
    };

    logger.info('Dispatching device command', {
      commandId,
      action,
      deviceId,
      protocol: device.protocol,
      module: 'command-dispatcher',
    });

    try {
      if (device.protocol === DeviceProtocol.MQTT) {
        // Physical ESP32 hardware node over MQTT
        const published = await mqttGateway.publishCommand(homeId, device.identifier, payload);
        const nextStatus = published ? CommandStatus.SENT : CommandStatus.FAILED;

        await prisma.deviceCommand.update({
          where: { id: createdCommand.id },
          data: { status: nextStatus },
        });

        systemEventsBus.emit('command_dispatched', {
          commandId,
          deviceId,
          action,
          status: nextStatus,
        });

        return { commandId, status: nextStatus, delivered: published };
      } else if (device.protocol === DeviceProtocol.SIMULATED) {
        // Virtual actuator in thermodynamic physics engine
        simulatorEngine.setActuatorState(deviceId, action, true, parameters);

        // Update device actuatorState in DB
        await prisma.device.update({
          where: { id: deviceId },
          data: {
            actuatorState: {
              action,
              active: true,
              parameters,
              updatedAt: now.toISOString(),
            },
          },
        });

        // Auto-acknowledge simulated command
        await prisma.deviceCommand.update({
          where: { id: createdCommand.id },
          data: {
            status: CommandStatus.ACKNOWLEDGED,
            acknowledgedAt: now,
          },
        });

        systemEventsBus.emit('command_dispatched', {
          commandId,
          deviceId,
          action,
          status: CommandStatus.ACKNOWLEDGED,
        });

        return { commandId, status: CommandStatus.ACKNOWLEDGED, delivered: true };
      } else {
        // Emulated test device
        await prisma.deviceCommand.update({
          where: { id: createdCommand.id },
          data: {
            status: CommandStatus.ACKNOWLEDGED,
            acknowledgedAt: now,
          },
        });

        return { commandId, status: CommandStatus.ACKNOWLEDGED, delivered: true };
      }
    } catch (err: any) {
      logger.error('Failed to dispatch device command', {
        commandId,
        error: err.message,
        module: 'command-dispatcher',
      });

      await prisma.deviceCommand.update({
        where: { id: createdCommand.id },
        data: {
          status: CommandStatus.FAILED,
          errorMessage: err.message,
        },
      });

      return {
        commandId,
        status: CommandStatus.FAILED,
        delivered: false,
        error: err.message,
      };
    }
  }
}
