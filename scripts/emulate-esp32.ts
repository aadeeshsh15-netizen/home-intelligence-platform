import mqtt from 'mqtt';

/**
 * Headless ESP32 Hardware Emulator.
 * Simulates an authentic physical microcontroller running the Phase 6 firmware stack.
 */
async function runEmulator() {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const homeId = process.env.HOME_ID || 'cmtvouk5w0002k6dgq9u5mwye'; // Default seed home
  const deviceId = process.env.DEVICE_ID || 'esp32-living-room-prototype';
  const deviceToken = process.env.DEVICE_SECRET || 'dvt_live_prototype_secret';

  const telemetryTopic = `home/${homeId}/device/${deviceId}/telemetry`;
  const statusTopic = `home/${homeId}/device/${deviceId}/status`;
  const commandTopic = `home/${homeId}/device/${deviceId}/command`;

  console.log(`[ESP32 Emulator] Booting virtual ESP32 DevKit v1...`);
  console.log(`[ESP32 Emulator] Target Broker: ${brokerUrl}`);
  console.log(`[ESP32 Emulator] Device ID:     ${deviceId}`);
  console.log(`[ESP32 Emulator] Telemetry:     ${telemetryTopic}`);

  // Configure MQTT client with Last Will and Testament (LWT)
  const lwtPayload = JSON.stringify({
    status: 'OFFLINE',
    reason: 'UNEXPECTED_CONNECTION_LOSS',
    timestamp: new Date().toISOString(),
  });

  const client = mqtt.connect(brokerUrl, {
    clientId: deviceId,
    username: deviceId,
    password: deviceToken,
    clean: true,
    will: {
      topic: statusTopic,
      payload: Buffer.from(lwtPayload),
      qos: 1,
      retain: true,
    },
  });

  let seq = 1;
  let uptimeSec = 0;

  client.on('connect', () => {
    console.log(`[ESP32 Emulator] Connected to MQTT broker successfully.`);

    // 1. Publish initial ONLINE status (retained)
    const initialStatus = JSON.stringify({
      status: 'ONLINE',
      firmwareVersion: 'v1.0.0-esp32',
      ip: '192.168.1.185',
      mac: '24:6F:28:9B:4C:1A',
      uptimeSec: 0,
      rssi: -58,
      timestamp: new Date().toISOString(),
    });
    client.publish(statusTopic, initialStatus, { qos: 1, retain: true });

    // 2. Subscribe to downstream commands
    client.subscribe(commandTopic, { qos: 1 }, (err) => {
      if (!err) console.log(`[ESP32 Emulator] Listening for commands on: ${commandTopic}`);
    });

    // 3. Periodic telemetry transmission loop (every 10s)
    setInterval(() => {
      uptimeSec += 10;
      seq++;

      // Generate realistic physical sensor telemetry
      const temperature = Number((21.5 + Math.sin(seq / 10) * 1.5).toFixed(1));
      const humidity = Number((48.0 + Math.cos(seq / 10) * 3.0).toFixed(1));
      const co2 = Math.round(620 + Math.sin(seq / 5) * 80);
      const isOccupied = seq % 6 < 4 ? 1 : 0;
      const windowContact = seq % 12 === 0 ? 1 : 0;

      const payload = {
        timestamp: new Date().toISOString(),
        seq,
        metrics: [
          { type: 'TEMPERATURE', value: temperature, unit: '°C' },
          { type: 'HUMIDITY', value: humidity, unit: '%' },
          { type: 'CO2', value: co2, unit: 'ppm' },
          { type: 'OCCUPANCY', value: isOccupied, unit: 'binary' },
          { type: 'CONTACT', value: windowContact, unit: 'binary' },
        ],
      };

      client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
        if (!err) {
          console.log(`[ESP32 Emulator] Telemetry published (#${seq}): Temp=${temperature}°C, CO2=${co2}ppm, Occ=${isOccupied}`);
        } else {
          console.error(`[ESP32 Emulator] Failed to publish telemetry:`, err);
        }
      });
    }, 10000);

    // 4. Periodic heartbeat ping (every 30s)
    setInterval(() => {
      const ping = JSON.stringify({
        status: 'ONLINE',
        firmwareVersion: 'v1.0.0-esp32',
        uptimeSec,
        rssi: -60 + Math.round(Math.random() * 5),
        timestamp: new Date().toISOString(),
      });
      client.publish(statusTopic, ping, { qos: 1, retain: true });
      console.log(`[ESP32 Emulator] Heartbeat published (uptime: ${uptimeSec}s)`);
    }, 30000);
  });

  client.on('message', (topic, message) => {
    console.log(`[ESP32 Emulator] Received command on ${topic}: ${message.toString()}`);
  });

  client.on('error', (err) => {
    console.error(`[ESP32 Emulator] Broker error:`, err.message);
  });

  // Graceful shutdown with explicit clean disconnect
  process.on('SIGINT', () => {
    console.log(`[ESP32 Emulator] Shutting down, sending OFFLINE status...`);
    const shutdownStatus = JSON.stringify({
      status: 'OFFLINE',
      reason: 'GRACEFUL_SHUTDOWN',
      timestamp: new Date().toISOString(),
    });
    client.publish(statusTopic, shutdownStatus, { qos: 1, retain: true }, () => {
      client.end(false, () => {
        console.log(`[ESP32 Emulator] Stopped.`);
        process.exit(0);
      });
    });
  });
}

runEmulator().catch(console.error);
