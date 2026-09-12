import { PrismaClient, UserRole, DeviceProtocol, DeviceStatus, SensorType, SensorHealth, SeverityLevel, EventStatus, InsightType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  getOutdoorConditions,
  stepRoomTemperature,
  stepRoomCO2,
  stepRoomHumidity,
  getSimulatedRoomPower,
} from '../src/server/simulator/physics';
import { calculateMeanAndStdDev } from '../src/lib/statistics';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting High-Fidelity Seeding for Home Intelligence Platform ---');

  // Clean existing tables in reverse dependency order
  await prisma.insight.deleteMany();
  await prisma.event.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.telemetryBaseline.deleteMany();
  await prisma.telemetryReading.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.device.deleteMany();
  await prisma.room.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.home.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Default Engineering User
  const passwordHash = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.create({
    data: {
      email: 'engineer@homeintelligence.internal',
      name: 'Senior Systems Engineer',
      passwordHash,
      role: UserRole.OWNER,
    },
  });
  console.log(`Created User: ${user.email} (password: admin123)`);

  // 2. Create Home
  const home = await prisma.home.create({
    data: {
      name: 'Apex Horizon Estate',
      timezone: 'America/New_York',
      address: '742 Evergreen Terrace, Sector 4',
      ownerId: user.id,
    },
  });
  console.log(`Created Home: ${home.name}`);

  // 3. Create Floors
  const groundFloor = await prisma.floor.create({
    data: {
      homeId: home.id,
      level: 0,
      name: 'Ground Level',
      svgLayout: { width: 100, height: 100 },
    },
  });

  const upperFloor = await prisma.floor.create({
    data: {
      homeId: home.id,
      level: 1,
      name: 'First Floor',
      svgLayout: { width: 100, height: 100 },
    },
  });

  // 4. Create Rooms with 2D Layout Coordinates
  const roomData = [
    // Ground Floor
    {
      floorId: groundFloor.id,
      name: 'Living Room',
      roomType: 'LIVING_ROOM',
      targetTemp: 21.5,
      layoutX: 5,
      layoutY: 8,
      layoutW: 52,
      layoutH: 48,
    },
    {
      floorId: groundFloor.id,
      name: 'Kitchen & Dining',
      roomType: 'KITCHEN',
      targetTemp: 20.5,
      layoutX: 60,
      layoutY: 8,
      layoutW: 36,
      layoutH: 48,
    },
    {
      floorId: groundFloor.id,
      name: 'Powder Room',
      roomType: 'BATHROOM',
      targetTemp: 22.0,
      layoutX: 60,
      layoutY: 60,
      layoutW: 36,
      layoutH: 34,
    },
    // Upper Floor
    {
      floorId: upperFloor.id,
      name: 'Primary Bedroom',
      roomType: 'BEDROOM',
      targetTemp: 20.0,
      layoutX: 5,
      layoutY: 8,
      layoutW: 46,
      layoutH: 44,
    },
    {
      floorId: upperFloor.id,
      name: 'Home Office',
      roomType: 'OFFICE',
      targetTemp: 21.0,
      layoutX: 54,
      layoutY: 8,
      layoutW: 42,
      layoutH: 44,
    },
    {
      floorId: upperFloor.id,
      name: 'Main En-Suite Bath',
      roomType: 'BATHROOM',
      targetTemp: 23.0,
      layoutX: 54,
      layoutY: 56,
      layoutW: 42,
      layoutH: 38,
    },
    {
      floorId: upperFloor.id,
      name: 'Guest Bedroom',
      roomType: 'BEDROOM',
      targetTemp: 20.5,
      layoutX: 5,
      layoutY: 56,
      layoutW: 46,
      layoutH: 38,
    },
  ];

  const rooms: Record<string, any> = {};
  for (const r of roomData) {
    const created = await prisma.room.create({ data: r });
    rooms[r.name] = created;
  }
  console.log(`Created ${Object.keys(rooms).length} Rooms`);

  // 5. Create Devices (Hardware entities ready for MQTT/hardware abstraction)
  const deviceData = [
    {
      roomId: rooms['Living Room'].id,
      name: 'Carrier Infinity Heat Pump & Air Handler',
      deviceType: 'HVAC',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'HVAC-LR-001',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v2.4.1',
    },
    {
      roomId: rooms['Living Room'].id,
      name: 'Sony Bravia Media Hub & Receiver',
      deviceType: 'APPLIANCE',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'MEDIA-LR-002',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v1.12.0',
    },
    {
      roomId: rooms['Kitchen & Dining'].id,
      name: 'Bosch Benchmark Induction Range',
      deviceType: 'APPLIANCE',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'APPL-KT-001',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v3.0.4',
    },
    {
      roomId: rooms['Kitchen & Dining'].id,
      name: 'Samsung Bespoke Smart Refrigerator',
      deviceType: 'APPLIANCE',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'FRDG-KT-002',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v4.1.0',
    },
    {
      roomId: rooms['Home Office'].id,
      name: 'Workstation Power Distribution Unit',
      deviceType: 'APPLIANCE',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'PDU-OF-001',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v1.0.8',
    },
    {
      roomId: rooms['Primary Bedroom'].id,
      name: 'Daikin Emura Split Climate Unit',
      deviceType: 'HVAC',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'HVAC-BR-001',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v2.1.0',
    },
    {
      roomId: rooms['Main En-Suite Bath'].id,
      name: 'Panasonic WhisperWarm Exhaust & Heat',
      deviceType: 'VENTILATION',
      protocol: DeviceProtocol.SIMULATED,
      identifier: 'VENT-MB-001',
      status: DeviceStatus.ONLINE,
      firmwareVersion: 'v1.0.2',
    },
  ];

  const devices: Record<string, any> = {};
  for (const d of deviceData) {
    const created = await prisma.device.create({ data: d });
    devices[d.identifier] = created;
  }
  console.log(`Created ${Object.keys(devices).length} Devices`);

  // 6. Create First-Class Sensors
  const sensorsToCreate = [
    // Living Room
    { roomId: rooms['Living Room'].id, deviceId: devices['HVAC-LR-001'].id, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 35, samplingIntervalSec: 30 },
    { roomId: rooms['Living Room'].id, deviceId: devices['HVAC-LR-001'].id, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 15, maxExpectedValue: 95, samplingIntervalSec: 30 },
    { roomId: rooms['Living Room'].id, deviceId: null, type: SensorType.CO2, unit: 'ppm', minExpectedValue: 350, maxExpectedValue: 3000, samplingIntervalSec: 30 },
    { roomId: rooms['Living Room'].id, deviceId: devices['MEDIA-LR-002'].id, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 4000, samplingIntervalSec: 15 },
    { roomId: rooms['Living Room'].id, deviceId: null, type: SensorType.OCCUPANCY, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },
    { roomId: rooms['Living Room'].id, deviceId: null, type: SensorType.NOISE, unit: 'dB', minExpectedValue: 25, maxExpectedValue: 100, samplingIntervalSec: 15 },
    { roomId: rooms['Living Room'].id, deviceId: null, type: SensorType.CONTACT, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },

    // Kitchen & Dining
    { roomId: rooms['Kitchen & Dining'].id, deviceId: null, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 40, samplingIntervalSec: 30 },
    { roomId: rooms['Kitchen & Dining'].id, deviceId: null, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 15, maxExpectedValue: 95, samplingIntervalSec: 30 },
    { roomId: rooms['Kitchen & Dining'].id, deviceId: devices['APPL-KT-001'].id, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 7500, samplingIntervalSec: 15 },
    { roomId: rooms['Kitchen & Dining'].id, deviceId: null, type: SensorType.PM2_5, unit: 'µg/m³', minExpectedValue: 0, maxExpectedValue: 300, samplingIntervalSec: 30 },
    { roomId: rooms['Kitchen & Dining'].id, deviceId: null, type: SensorType.OCCUPANCY, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },

    // Primary Bedroom
    { roomId: rooms['Primary Bedroom'].id, deviceId: devices['HVAC-BR-001'].id, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 35, samplingIntervalSec: 30 },
    { roomId: rooms['Primary Bedroom'].id, deviceId: devices['HVAC-BR-001'].id, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 15, maxExpectedValue: 90, samplingIntervalSec: 30 },
    { roomId: rooms['Primary Bedroom'].id, deviceId: null, type: SensorType.CO2, unit: 'ppm', minExpectedValue: 350, maxExpectedValue: 3000, samplingIntervalSec: 30 },
    { roomId: rooms['Primary Bedroom'].id, deviceId: devices['HVAC-BR-001'].id, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 2500, samplingIntervalSec: 30 },
    { roomId: rooms['Primary Bedroom'].id, deviceId: null, type: SensorType.OCCUPANCY, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },

    // Home Office
    { roomId: rooms['Home Office'].id, deviceId: null, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 35, samplingIntervalSec: 30 },
    { roomId: rooms['Home Office'].id, deviceId: null, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 15, maxExpectedValue: 90, samplingIntervalSec: 30 },
    { roomId: rooms['Home Office'].id, deviceId: null, type: SensorType.CO2, unit: 'ppm', minExpectedValue: 350, maxExpectedValue: 2500, samplingIntervalSec: 30 },
    { roomId: rooms['Home Office'].id, deviceId: devices['PDU-OF-001'].id, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 1500, samplingIntervalSec: 15 },
    { roomId: rooms['Home Office'].id, deviceId: null, type: SensorType.OCCUPANCY, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },
    { roomId: rooms['Home Office'].id, deviceId: null, type: SensorType.LIGHT, unit: 'lux', minExpectedValue: 0, maxExpectedValue: 2000, samplingIntervalSec: 30 },

    // Main Bathroom
    { roomId: rooms['Main En-Suite Bath'].id, deviceId: devices['VENT-MB-001'].id, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 38, samplingIntervalSec: 30 },
    { roomId: rooms['Main En-Suite Bath'].id, deviceId: devices['VENT-MB-001'].id, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 20, maxExpectedValue: 98, samplingIntervalSec: 15 },
    { roomId: rooms['Main En-Suite Bath'].id, deviceId: devices['VENT-MB-001'].id, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 1800, samplingIntervalSec: 30 },
    { roomId: rooms['Main En-Suite Bath'].id, deviceId: null, type: SensorType.WATER_FLOW, unit: 'L/min', minExpectedValue: 0, maxExpectedValue: 30, samplingIntervalSec: 10 },
    { roomId: rooms['Main En-Suite Bath'].id, deviceId: null, type: SensorType.OCCUPANCY, unit: 'binary', minExpectedValue: 0, maxExpectedValue: 1, samplingIntervalSec: 10 },

    // Guest Bedroom
    { roomId: rooms['Guest Bedroom'].id, deviceId: null, type: SensorType.TEMPERATURE, unit: '°C', minExpectedValue: 10, maxExpectedValue: 35, samplingIntervalSec: 30 },
    { roomId: rooms['Guest Bedroom'].id, deviceId: null, type: SensorType.HUMIDITY, unit: '%', minExpectedValue: 15, maxExpectedValue: 90, samplingIntervalSec: 30 },
    { roomId: rooms['Guest Bedroom'].id, deviceId: null, type: SensorType.POWER, unit: 'W', minExpectedValue: 0, maxExpectedValue: 1000, samplingIntervalSec: 30 },
  ];

  const createdSensors: any[] = [];
  for (const s of sensorsToCreate) {
    const created = await prisma.sensor.create({ data: s });
    createdSensors.push(created);
  }
  console.log(`Created ${createdSensors.length} First-Class Sensors`);

  // 7. Create Standard Evaluator Rules
  await prisma.rule.createMany({
    data: [
      {
        homeId: home.id,
        name: 'Critical CO2 Elevation',
        sensorType: SensorType.CO2,
        operator: 'GT',
        threshold: 1200,
        severity: SeverityLevel.WARNING,
      },
      {
        homeId: home.id,
        name: 'Excessive Aggregate Power Draw',
        sensorType: SensorType.POWER,
        operator: 'GT',
        threshold: 3200,
        severity: SeverityLevel.ERROR,
      },
      {
        homeId: home.id,
        name: 'High Bathroom Humidity Retention',
        sensorType: SensorType.HUMIDITY,
        operator: 'GT',
        threshold: 82,
        severity: SeverityLevel.WARNING,
      },
      {
        homeId: home.id,
        name: 'High Living Room Thermal Drift',
        sensorType: SensorType.TEMPERATURE,
        operator: 'GT',
        threshold: 25.5,
        severity: SeverityLevel.WARNING,
      },
    ],
  });
  console.log('Created System Rules');

  // 8. Generate 30 Days of High-Fidelity Historical Telemetry
  console.log('Synthesizing 30 days of physics-driven correlated telemetry...');
  const now = new Date();
  const startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const stepMinutes = 30; // 30 min intervals for history -> 1,440 points per sensor
  const totalSteps = (30 * 24 * 60) / stepMinutes;

  // Sensor state memory during chronological progression
  const sensorState = new Map<string, number>();
  // Default states
  createdSensors.forEach((s) => {
    let init = 21.0;
    if (s.type === SensorType.HUMIDITY) init = 48.0;
    if (s.type === SensorType.CO2) init = 450.0;
    if (s.type === SensorType.POWER) init = 50.0;
    if (s.type === SensorType.OCCUPANCY) init = 0;
    if (s.type === SensorType.LIGHT) init = 200;
    if (s.type === SensorType.NOISE) init = 32;
    if (s.type === SensorType.PM2_5) init = 7.0;
    if (s.type === SensorType.WATER_FLOW) init = 0.0;
    if (s.type === SensorType.CONTACT) init = 0;
    sensorState.set(s.id, init);
  });

  const sensorReadingBatches: any[] = [];
  const sensorValueBuckets = new Map<string, Map<string, number[]>>();

  // Initialize bucket maps for baselines: sensorId -> "day_hour" -> values[]
  createdSensors.forEach((s) => {
    sensorValueBuckets.set(s.id, new Map());
  });

  for (let step = 0; step < totalSteps; step++) {
    const timestamp = new Date(startTime.getTime() + step * stepMinutes * 60 * 1000);
    const hour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60;
    const outdoor = getOutdoorConditions(timestamp);

    for (const sensor of createdSensors) {
      const room = roomData.find((r) => r.floorId && r.name && createdSensors.find((cs) => cs.id === sensor.id)?.roomId === rooms[r.name]?.id);
      const roomType = room?.roomType || 'LIVING_ROOM';

      // Occupancy model
      let isOccupied = false;
      if (roomType === 'BEDROOM' && (hour >= 22.5 || hour <= 7.0)) isOccupied = true;
      else if (roomType === 'LIVING_ROOM' && hour >= 18.0 && hour <= 22.5) isOccupied = true;
      else if (roomType === 'KITCHEN' && ((hour >= 7.0 && hour <= 8.5) || (hour >= 18.5 && hour <= 20.5))) isOccupied = true;
      else if (roomType === 'OFFICE' && hour >= 9.0 && hour <= 17.5) isOccupied = true;

      const currentVal = sensorState.get(sensor.id)!;
      let nextVal = currentVal;

      switch (sensor.type) {
        case SensorType.TEMPERATURE: {
          let temp = currentVal;
          const targetTemp = 21.5;
          for (let sub = 0; sub < stepMinutes; sub++) {
            let hvacActive = false;
            let hvacMode: 'COOLING' | 'HEATING' | 'OFF' = 'OFF';
            if (temp > targetTemp + 0.3) {
              hvacActive = true;
              hvacMode = 'COOLING';
            } else if (temp < targetTemp - 0.3) {
              hvacActive = true;
              hvacMode = 'HEATING';
            }
            temp = stepRoomTemperature(temp, outdoor.temperature, outdoor.solarRadiation, hvacActive, hvacMode, isOccupied ? 1 : 0, 60);
          }
          nextVal = Number(temp.toFixed(2));
          break;
        }
        case SensorType.HUMIDITY:
          const isShower = roomType === 'BATHROOM' && hour >= 7.0 && hour <= 7.5;
          nextVal = stepRoomHumidity(currentVal, roomType, isOccupied ? 1 : 0, isShower, false, stepMinutes * 60);
          break;
        case SensorType.CO2:
          nextVal = stepRoomCO2(currentVal, isOccupied ? 2 : 0, 0.0004, stepMinutes * 60);
          break;
        case SensorType.POWER:
          nextVal = getSimulatedRoomPower(roomType, timestamp, isOccupied, true);
          break;
        case SensorType.OCCUPANCY:
          nextVal = isOccupied ? 1 : 0;
          break;
        case SensorType.LIGHT:
          let lux = outdoor.solarRadiation * 750;
          if (isOccupied && (hour < 7 || hour > 18)) lux += 300;
          nextVal = Math.max(5, Math.round(lux + (Math.random() - 0.5) * 10));
          break;
        case SensorType.NOISE:
          let db = 30;
          if (isOccupied) db = roomType === 'LIVING_ROOM' ? 55 : 44;
          nextVal = Math.round(db + (Math.random() - 0.5) * 4);
          break;
        case SensorType.PM2_5:
          let pm = 6.0;
          if (roomType === 'KITCHEN' && hour >= 19.0 && hour <= 20.0) pm = 45.0;
          nextVal = Number((pm + (Math.random() - 0.5) * 2).toFixed(1));
          break;
        case SensorType.WATER_FLOW:
          const isBathShower = roomType === 'BATHROOM' && hour >= 7.0 && hour <= 7.5;
          nextVal = isBathShower ? 5.5 : 0.0;
          break;
        case SensorType.CONTACT:
          nextVal = 0; // Windows normally closed
          break;
      }

      sensorState.set(sensor.id, nextVal);

      sensorReadingBatches.push({
        sensorId: sensor.id,
        timestamp,
        value: nextVal,
        quality: 'VALID',
      });

      // Bucket for baseline statistics
      const dayHourKey = `${timestamp.getUTCDay()}_${timestamp.getUTCHours()}`;
      const bucketMap = sensorValueBuckets.get(sensor.id)!;
      const arr = bucketMap.get(dayHourKey) || [];
      arr.push(nextVal);
      bucketMap.set(dayHourKey, arr);
    }
  }

  // Batch insert telemetry readings in chunks of 5000 to optimize PostgreSQL performance
  const chunkSize = 5000;
  for (let i = 0; i < sensorReadingBatches.length; i += chunkSize) {
    const chunk = sensorReadingBatches.slice(i, i + chunkSize);
    await prisma.telemetryReading.createMany({ data: chunk, skipDuplicates: true });
  }
  console.log(`Seeded ${sensorReadingBatches.length} Historical Telemetry Readings`);

  // 9. Compute & Seed Historical Baselines
  console.log('Computing and saving 168-hour baseline distributions...');
  const baselineEntries: any[] = [];
  for (const sensor of createdSensors) {
    const bucketMap = sensorValueBuckets.get(sensor.id)!;
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}_${hour}`;
        const values = bucketMap.get(key) || [];
        if (values.length > 0) {
          const { mean, stdDev } = calculateMeanAndStdDev(values);
          baselineEntries.push({
            sensorId: sensor.id,
            dayOfWeek: day,
            hourOfDay: hour,
            mean,
            stdDev: Math.max(0.1, stdDev),
            sampleCount: values.length,
          });
        }
      }
    }
  }

  for (let i = 0; i < baselineEntries.length; i += 2000) {
    const chunk = baselineEntries.slice(i, i + 2000);
    await prisma.telemetryBaseline.createMany({ data: chunk });
  }
  console.log(`Seeded ${baselineEntries.length} Baseline Distribution records`);

  // 10. Update Sensor Current Values
  for (const sensor of createdSensors) {
    const latestVal = sensorState.get(sensor.id)!;
    await prisma.sensor.update({
      where: { id: sensor.id },
      data: {
        lastReadingValue: latestVal,
        lastReadingTime: now,
        health: SensorHealth.HEALTHY,
      },
    });
  }

  // 11. Seed Realistic Recent Events
  const kitchenPowerSensor = createdSensors.find((s) => s.roomId === rooms['Kitchen & Dining'].id && s.type === SensorType.POWER);
  const bedroomCO2Sensor = createdSensors.find((s) => s.roomId === rooms['Primary Bedroom'].id && s.type === SensorType.CO2);

  await prisma.event.createMany({
    data: [
      {
        homeId: home.id,
        roomId: rooms['Kitchen & Dining'].id,
        deviceId: devices['APPL-KT-001'].id,
        sensorId: kitchenPowerSensor?.id,
        category: 'ENERGY',
        severity: SeverityLevel.WARNING,
        title: 'Kitchen Peak Power Spike',
        description: 'Induction cooktop and auxiliary appliances drew 3,680 W during evening prep cycle.',
        contextData: { value: 3680, threshold: 3200, unit: 'W' },
        status: EventStatus.ACTIVE,
        createdAt: new Date(now.getTime() - 45 * 60 * 1000),
      },
      {
        homeId: home.id,
        roomId: rooms['Primary Bedroom'].id,
        deviceId: devices['HVAC-BR-001'].id,
        sensorId: bedroomCO2Sensor?.id,
        category: 'ENVIRONMENTAL',
        severity: SeverityLevel.WARNING,
        title: 'Primary Bedroom CO2 Exceeded 1,150 ppm',
        description: 'Overnight accumulation reached 1,180 ppm with closed bedroom door.',
        contextData: { value: 1180, threshold: 1200, unit: 'ppm' },
        status: EventStatus.RESOLVED,
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
        resolvedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
    ],
  });

  // 12. Seed High-Value Explainable AI Insights
  const lrPowerSensor = createdSensors.find((s) => s.roomId === rooms['Living Room'].id && s.type === SensorType.POWER);
  const bathHumiditySensor = createdSensors.find((s) => s.roomId === rooms['Main En-Suite Bath'].id && s.type === SensorType.HUMIDITY);

  await prisma.insight.createMany({
    data: [
      {
        homeId: home.id,
        roomId: rooms['Living Room'].id,
        sensorId: lrPowerSensor?.id,
        type: InsightType.ANOMALY,
        title: 'Elevated Evening Baseload Draw',
        summary: 'Living Room power consumption is 34.2% above typical Thursday evening baseline.',
        explanation: 'Observed active power: 480 W. Historical baseline for Thursday 20:00: μ = 358 W, σ = 38 W (n=28). Z-Score = +3.21 (p < 0.001). Audio-visual receiver and ambient accent lighting remained active.',
        confidence: 0.94,
        isHeuristic: false,
        evidenceData: {
          currentValue: 480,
          baselineMean: 358,
          baselineStdDev: 38,
          zScore: 3.21,
          deviationPercent: 34.2,
          unit: 'W',
        },
        status: 'ACTIVE',
        createdAt: new Date(now.getTime() - 25 * 60 * 1000),
      },
      {
        homeId: home.id,
        roomId: rooms['Main En-Suite Bath'].id,
        sensorId: bathHumiditySensor?.id,
        type: InsightType.EFFICIENCY,
        title: 'Efficient Post-Shower Dehumidification',
        summary: 'Bathroom humidity returned to ambient baseline (52%) in 14.5 minutes.',
        explanation: 'Exhaust ventilation fan successfully evacuated moisture surge (+38% RH) with exponential decay constant τ = 4.2 minutes. No mold/condensation risk detected.',
        confidence: 0.91,
        isHeuristic: false,
        evidenceData: {
          peakRH: 89,
          baselineRH: 52,
          recoveryTimeMinutes: 14.5,
          unit: '%',
        },
        status: 'ACTIVE',
        createdAt: new Date(now.getTime() - 110 * 60 * 1000),
      },
    ],
  });
  console.log('Seeded Initial Explainable Insights');

  console.log('--- Seeding Successfully Completed ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
