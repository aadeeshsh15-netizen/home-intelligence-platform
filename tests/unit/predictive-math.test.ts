import { describe, it, expect } from 'vitest';
import {
  erf,
  normalCdf,
  calculateThresholdCrossingProbability,
  calculatePredictiveConfidence,
  interpolateCrossingMinute,
} from '@/server/intelligence/predictive-incidents/math';

describe('Predictive Incidents Analytical Math', () => {
  describe('erf(x)', () => {
    it('accurately evaluates known points of the Gauss error function', () => {
      expect(erf(0)).toBe(0);
      expect(erf(1)).toBeCloseTo(0.8427, 3);
      expect(erf(2)).toBeCloseTo(0.9953, 3);
      expect(erf(-1)).toBeCloseTo(-0.8427, 3);
    });
  });

  describe('normalCdf(z)', () => {
    it('evaluates standard normal CDF correctly', () => {
      expect(normalCdf(0)).toBeCloseTo(0.5, 4);
      expect(normalCdf(1.96)).toBeCloseTo(0.975, 2);
      expect(normalCdf(-1.96)).toBeCloseTo(0.025, 2);
      expect(normalCdf(3.0)).toBeCloseTo(0.9986, 3);
    });
  });

  describe('calculateThresholdCrossingProbability()', () => {
    it('calculates probability for upward hazard crossing (e.g. CO2 / Power > threshold)', () => {
      // Forecast 1100 ppm, threshold 1000 ppm, stdDev 50 -> z = (1100-1000)/50 = 2.0 -> ~0.977
      const probHigh = calculateThresholdCrossingProbability(1100, 1000, 50, 'UP');
      expect(probHigh).toBeGreaterThan(0.95);
      expect(probHigh).toBeLessThanOrEqual(0.99);

      // Forecast 900 ppm, threshold 1000 ppm, stdDev 50 -> z = -2.0 -> ~0.023
      const probLow = calculateThresholdCrossingProbability(900, 1000, 50, 'UP');
      expect(probLow).toBeLessThan(0.05);
      expect(probLow).toBeGreaterThanOrEqual(0.01);

      // Forecast exactly at threshold -> 50%
      const probMid = calculateThresholdCrossingProbability(1000, 1000, 50, 'UP');
      expect(probMid).toBeCloseTo(0.5, 2);
    });

    it('calculates probability for downward hazard crossing (e.g. Cold breach < 19°C)', () => {
      // Forecast 17°C, threshold 19°C, stdDev 1.0 -> z = (19-17)/1.0 = 2.0 -> ~0.977
      const probCold = calculateThresholdCrossingProbability(17, 19, 1.0, 'DOWN');
      expect(probCold).toBeGreaterThan(0.95);

      // Forecast 21°C, threshold 19°C, stdDev 1.0 -> ~0.023
      const probWarm = calculateThresholdCrossingProbability(21, 19, 1.0, 'DOWN');
      expect(probWarm).toBeLessThan(0.05);
    });
  });

  describe('calculatePredictiveConfidence()', () => {
    it('correctly blends forecast probability, multimodal evidence, trend, and model reliability', () => {
      // 0.40 * 0.8 + 0.35 * (1.5 / 2.0 = 0.75) + 0.15 * 1.0 + 0.10 * 0.90
      // = 0.32 + 0.2625 + 0.15 + 0.09 = 0.8225 -> 0.82
      const conf = calculatePredictiveConfidence({
        crossingProbability: 0.8,
        satisfiedWeight: 1.5,
        totalWeight: 2.0,
        trendAligned: true,
        modelReliabilityWeight: 0.90,
      });
      expect(conf).toBeCloseTo(0.82, 2);
    });

    it('clamps confidence within [0.10, 0.99]', () => {
      expect(
        calculatePredictiveConfidence({
          crossingProbability: 1.0,
          satisfiedWeight: 1.0,
          totalWeight: 1.0,
          trendAligned: true,
          modelReliabilityWeight: 1.0,
        })
      ).toBeLessThanOrEqual(0.99);

      expect(
        calculatePredictiveConfidence({
          crossingProbability: 0.0,
          satisfiedWeight: 0.0,
          totalWeight: 1.0,
          trendAligned: false,
          modelReliabilityWeight: 0.0,
        })
      ).toBeGreaterThanOrEqual(0.10);
    });
  });

  describe('interpolateCrossingMinute()', () => {
    it('calculates expected minute of threshold breach along horizon', () => {
      const points = [
        { horizonMinutes: 0, predicted: 800 },
        { horizonMinutes: 30, predicted: 1000 },
        { horizonMinutes: 60, predicted: 1200 },
      ];
      const crossingMin = interpolateCrossingMinute(points, 1000, 'UP');
      expect(crossingMin).toBe(30);

      const dropPoints = [
        { horizonMinutes: 0, predicted: 22 },
        { horizonMinutes: 30, predicted: 20 },
        { horizonMinutes: 60, predicted: 18 },
      ];
      const crossingMinDown = interpolateCrossingMinute(dropPoints, 20, 'DOWN');
      expect(crossingMinDown).toBe(30);
    });

    it('returns first horizon if threshold is already crossed or crossing at start', () => {
      const points = [
        { horizonMinutes: 15, predicted: 1050 },
        { horizonMinutes: 30, predicted: 1200 },
      ];
      const crossingImmediate = interpolateCrossingMinute(points, 1000, 'UP');
      expect(crossingImmediate).toBe(15);
    });
  });
});
