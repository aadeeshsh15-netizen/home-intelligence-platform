import { describe, it, expect } from 'vitest';
import {
  TreeNode,
  HorizonModelArtifact,
  evaluateTree,
  predictHorizonEnsemble,
} from '../../src/server/intelligence/prediction/ml/tree-ensemble';
import { fitRegressionTree } from '../../src/server/intelligence/prediction/ml/trainer';

describe('Phase 4 ML Tree Ensemble Inference & Conformalization', () => {
  it('1. Correctly traverses binary regression tree nodes according to split thresholds', () => {
    // Tree: if x[0] <= 10.0 -> left (if x[1] <= 5.0 -> 2.0 else 4.0) else -> right (8.0)
    const mockTree: TreeNode = {
      isLeaf: false,
      featureIndex: 0,
      threshold: 10.0,
      left: {
        isLeaf: false,
        featureIndex: 1,
        threshold: 5.0,
        left: { isLeaf: true, leafValue: 2.0 },
        right: { isLeaf: true, leafValue: 4.0 },
      },
      right: { isLeaf: true, leafValue: 8.0 },
    };

    expect(evaluateTree(mockTree, [5.0, 3.0])).toBe(2.0);
    expect(evaluateTree(mockTree, [5.0, 7.0])).toBe(4.0);
    expect(evaluateTree(mockTree, [12.0, 1.0])).toBe(8.0);
  });

  it('2. Fits a CART regression tree and reduces sample variance', () => {
    // 1D feature step function: x < 5 -> y = 10; x >= 5 -> y = 50
    const X = [[1], [2], [3], [4], [6], [7], [8], [9]];
    const y = [10, 10, 10, 10, 50, 50, 50, 50];

    const tree = fitRegressionTree(X, y, { maxDepth: 2, minSamplesLeaf: 2 });

    expect(tree.isLeaf).toBe(false);
    expect(tree.featureIndex).toBe(0);
    expect(tree.threshold).toBeGreaterThanOrEqual(4.0);
    expect(tree.threshold).toBeLessThanOrEqual(6.0);

    // Assert low prediction for x=2 and high for x=8
    expect(evaluateTree(tree, [2])).toBe(10);
    expect(evaluateTree(tree, [8])).toBe(50);
  });

  it('3. Computes GBDT predictions using baseValue + learningRate * sum(trees)', () => {
    const horizonModel: HorizonModelArtifact = {
      horizonMinutes: 15,
      algorithm: 'GRADIENT_BOOSTING',
      baseValue: 100.0,
      learningRate: 0.1,
      trees: [
        { isLeaf: true, leafValue: 20.0 },
        { isLeaf: true, leafValue: 30.0 },
      ],
      calibrationQuantiles: {
        q80: 5.0,
        q95: 12.0,
      },
    };

    // raw = 100 + 0.1 * (20 + 30) = 100 + 5 = 105.0
    const result = predictHorizonEnsemble(horizonModel, [0, 0]);

    expect(result.predicted).toBe(105.0);
    expect(result.lower80).toBe(100.0); // 105 - 5
    expect(result.upper80).toBe(110.0); // 105 + 5
    expect(result.lower95).toBe(93.0);  // 105 - 12
    expect(result.upper95).toBe(117.0); // 105 + 12
    expect(result.standardError).toBeCloseTo(5.0 / 1.28155, 1);
  });

  it('4. Computes Random Forest predictions by averaging tree leaf outputs', () => {
    const horizonModel: HorizonModelArtifact = {
      horizonMinutes: 60,
      algorithm: 'RANDOM_FOREST',
      baseValue: 0,
      trees: [
        { isLeaf: true, leafValue: 100.0 },
        { isLeaf: true, leafValue: 120.0 },
        { isLeaf: true, leafValue: 140.0 },
      ],
      calibrationQuantiles: {
        q80: 8.0,
        q95: 16.0,
      },
    };

    // raw = (100 + 120 + 140) / 3 = 120.0
    const result = predictHorizonEnsemble(horizonModel, [0, 0]);

    expect(result.predicted).toBe(120.0);
    expect(result.lower80).toBe(112.0);
    expect(result.upper80).toBe(128.0);
    expect(result.lower95).toBe(104.0);
    expect(result.upper95).toBe(136.0);
  });

  it('5. Clamps electrical active power forecasts to non-negative wattage', () => {
    const horizonModel: HorizonModelArtifact = {
      horizonMinutes: 240,
      algorithm: 'GRADIENT_BOOSTING',
      baseValue: 10.0,
      learningRate: 1.0,
      trees: [{ isLeaf: true, leafValue: -50.0 }], // large negative residual
      calibrationQuantiles: {
        q80: 5.0,
        q95: 10.0,
      },
    };

    // raw = 10 - 50 = -40 -> clamped to 0
    const result = predictHorizonEnsemble(horizonModel, [0, 0]);

    expect(result.predicted).toBe(0.0);
    expect(result.lower80).toBe(0.0);
    expect(result.lower95).toBe(0.0);
  });
});
