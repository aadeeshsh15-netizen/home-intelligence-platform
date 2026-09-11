import { describe, it, expect } from 'vitest';
import {
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
  generateFirmwareConfigSnippet,
} from '@/server/iot/device-auth';

describe('Phase 6: Device Authentication & Cryptography Unit Tests', () => {
  it('generates high-entropy device pairing tokens with standard prefix', () => {
    const token1 = generateDeviceToken();
    const token2 = generateDeviceToken();

    expect(token1.startsWith('dvt_live_')).toBe(true);
    expect(token2.startsWith('dvt_live_')).toBe(true);
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(40);
  });

  it('hashes pairing tokens with unique random salts', () => {
    const token = 'dvt_live_abcdef1234567890abcdef1234567890';
    const hash1 = hashDeviceToken(token);
    const hash2 = hashDeviceToken(token);

    expect(hash1).toContain(':');
    expect(hash2).toContain(':');
    // Salting ensures identical tokens produce distinct hashes
    expect(hash1).not.toBe(hash2);
  });

  it('verifies valid tokens and rejects tampered or invalid tokens', () => {
    const token = generateDeviceToken();
    const storedHash = hashDeviceToken(token);

    // Correct token matches
    expect(verifyDeviceToken(token, storedHash)).toBe(true);

    // Incorrect token rejected
    expect(verifyDeviceToken('dvt_live_wrong_token', storedHash)).toBe(false);

    // Tampered hash rejected
    expect(verifyDeviceToken(token, 'malformed_hash')).toBe(false);
  });

  it('generates a complete and syntactically valid C++ config.h code block', () => {
    const snippet = generateFirmwareConfigSnippet({
      homeId: 'home_test_123',
      deviceId: 'esp32_master_bed',
      authToken: 'dvt_live_secret_sample',
      brokerHost: '192.168.1.50',
      brokerPort: 1883,
    });

    expect(snippet).toContain('#ifndef CONFIG_H');
    expect(snippet).toContain('#define CONFIG_H');
    expect(snippet).toContain('#define HOME_ID           "home_test_123"');
    expect(snippet).toContain('#define DEVICE_ID         "esp32_master_bed"');
    expect(snippet).toContain('#define DEVICE_SECRET     "dvt_live_secret_sample"');
    expect(snippet).toContain('#define MQTT_BROKER_HOST  "192.168.1.50"');
    expect(snippet).toContain('#define MQTT_BROKER_PORT  1883');
    expect(snippet).toContain('#define TOPIC_TELEMETRY   "home/home_test_123/device/esp32_master_bed/telemetry"');
    expect(snippet).toContain('#endif // CONFIG_H');
  });
});
