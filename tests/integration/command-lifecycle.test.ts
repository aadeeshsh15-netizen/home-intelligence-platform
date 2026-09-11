import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { CommandDispatcher } from '@/server/automation/dispatcher';
import { mqttGateway } from '@/server/iot/mqtt-gateway';
import { simulatorEngine } from '@/server/simulator/engine';
import { ActuatorAction, CommandStatus, DeviceProtocol, DeviceStatus } from '@prisma/client';

describe('Phase 7: Command Lifecycle & Acknowledgement Integration Tests', () => {
  let home: any;
  let room: any;
  let testMqttDevice: any;
  let testSimDevice: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');

    room = await prisma.room.findFirst({
      where: { floor: { homeId: home.id } },
    });
    if (!room) throw new Error('No test room found');

    testMqttDevice = await prisma.device.create({
      data: {
        name: 'Lifecycle Test ESP32',
        deviceType: 'LOW_VOLTAGE_RELAY',
        hardwareType: 'ESP32_WROOM_32',
        protocol: DeviceProtocol.MQTT,
        identifier: `esp32-cmd-${Date.now()}`,
        status: DeviceStatus.ONLINE,
        isActuator: true,
        roomId: room.id,
      },
    });

    testSimDevice = await prisma.device.create({
      data: {
        name: 'Lifecycle Test Simulator Fan',
        deviceType: 'VENTILATION_FAN',
        hardwareType: 'SIMULATED',
        protocol: DeviceProtocol.SIMULATED,
        identifier: `sim-fan-${Date.now()}`,
        status: DeviceStatus.ONLINE,
        isActuator: true,
        roomId: room.id,
      },
    });
  });

  afterAll(async () => {
    if (testMqttDevice) {
      await prisma.deviceCommand.deleteMany({ where: { deviceId: testMqttDevice.id } });
      await prisma.device.delete({ where: { id: testMqttDevice.id } });
    }
    if (testSimDevice) {
      await prisma.deviceCommand.deleteMany({ where: { deviceId: testSimDevice.id } });
      await prisma.device.delete({ where: { id: testSimDevice.id } });
    }
  });

  it('dispatches command to simulated actuator and updates virtual physics state', async () => {
    const result = await CommandDispatcher.dispatch({
      homeId: home.id,
      deviceId: testSimDevice.id,
      action: ActuatorAction.TURN_ON,
      parameters: { speed: 2, durationSec: 1800 },
      expectedState: { power: 'ON' },
    });

    expect(result.delivered).toBe(true);
    expect(result.status).toBe(CommandStatus.ACKNOWLEDGED);

    // Verify virtual physics state in simulator engine
    const state = simulatorEngine.getActuatorState(testSimDevice.id);
    expect(state).toBeDefined();
    expect(state?.active).toBe(true);
    expect(state?.action).toBe(ActuatorAction.TURN_ON);

    // Verify database record
    const command = await prisma.deviceCommand.findUnique({
      where: { commandId: result.commandId },
    });
    expect(command?.status).toBe(CommandStatus.ACKNOWLEDGED);
  });

  it('processes incoming device acknowledgement on MQTT gateway and updates command status', async () => {
    // 1. Create a PENDING command in DB
    const command = await prisma.deviceCommand.create({
      data: {
        homeId: home.id,
        deviceId: testMqttDevice.id,
        commandId: `cmd_ack_test_${Date.now()}`,
        action: ActuatorAction.SHED_LOAD,
        status: CommandStatus.SENT,
        expiresAt: new Date(Date.now() + 300000),
      },
    });

    // 2. Simulate incoming ACK payload from ESP32
    await mqttGateway.handleAck(home.id, testMqttDevice.identifier, {
      commandId: command.commandId,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      actualState: { relayState: 'OPEN' },
      reason: 'Relay successfully opened',
    });

    // 3. Verify status transitioned to COMPLETED
    const updated = await prisma.deviceCommand.findUnique({
      where: { commandId: command.commandId },
    });

    expect(updated?.status).toBe(CommandStatus.COMPLETED);
    expect(updated?.completedAt).not.toBeNull();
  });
});
