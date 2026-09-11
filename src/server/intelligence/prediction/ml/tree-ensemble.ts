/**
 * Decision Tree Ensemble Evaluation Core.
 *
 * Implements high-performance, in-process binary decision tree traversal
 * and ensemble aggregation for Gradient Boosted Trees and Random Forest.
 * Supports conformalized empirical residual intervals.
 */

export interface TreeNode {
  isLeaf: boolean;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  leafValue?: number;
}

export interface HorizonModelArtifact {
  horizonMinutes: number;
  algorithm: 'GRADIENT_BOOSTING' | 'RANDOM_FOREST';
  baseValue: number; // For GBDT: initial bias (y_mean)
  learningRate?: number; // For GBDT: shrinkage parameter
  trees: TreeNode[];
  calibrationQuantiles: {
    q80: number; // 80% empirical residual quantile
    q95: number; // 95% empirical residual quantile
  };
}

export interface EnsembleModelArtifact {
  modelId: string;
  modelType: 'ML_GRADIENT_BOOSTING' | 'ML_RANDOM_FOREST';
  version: string;
  target: string;
  featureVersion: string;
  featureNames: string[];
  trainingMetadata: {
    trainedAt: string;
    sampleCount: number;
    trainDurationMs: number;
    trainRange: { start: string; end: string };
    hyperparameters: Record<string, any>;
  };
  horizons: Record<number, HorizonModelArtifact>;
}

export interface EnsemblePredictionResult {
  predicted: number;
  lower80: number;
  upper80: number;
  lower95: number;
  upper95: number;
  standardError: number;
}

/**
 * Traverses a binary decision tree to find the leaf prediction value.
 */
export function evaluateTree(node: TreeNode, x: number[]): number {
  let current: TreeNode = node;
  while (!current.isLeaf) {
    if (current.featureIndex === undefined || current.threshold === undefined) {
      break;
    }

    const val = x[current.featureIndex];
    // If value is NaN/undefined, default to left branch
    if (Number.isNaN(val) || val === undefined) {
      current = current.left || current;
    } else if (val <= current.threshold) {
      current = current.left!;
    } else {
      current = current.right!;
    }
  }

  return current.leafValue ?? 0;
}

/**
 * Predicts a target value for a single horizon using the trained ensemble.
 */
export function predictHorizonEnsemble(
  horizonModel: HorizonModelArtifact,
  x: number[]
): EnsemblePredictionResult {
  const { algorithm, trees, baseValue, learningRate = 0.1, calibrationQuantiles } = horizonModel;

  if (trees.length === 0) {
    return {
      predicted: Math.max(0, baseValue),
      lower80: Math.max(0, baseValue - calibrationQuantiles.q80),
      upper80: baseValue + calibrationQuantiles.q80,
      lower95: Math.max(0, baseValue - calibrationQuantiles.q95),
      upper95: baseValue + calibrationQuantiles.q95,
      standardError: calibrationQuantiles.q80 / 1.28155,
    };
  }

  let rawPrediction = baseValue;

  if (algorithm === 'GRADIENT_BOOSTING') {
    let treeSum = 0;
    for (let i = 0; i < trees.length; i++) {
      treeSum += evaluateTree(trees[i], x);
    }
    rawPrediction = baseValue + learningRate * treeSum;
  } else {
    // RANDOM_FOREST: average across all bagged trees
    let treeSum = 0;
    for (let i = 0; i < trees.length; i++) {
      treeSum += evaluateTree(trees[i], x);
    }
    rawPrediction = treeSum / trees.length;
  }

  // Active power (W) cannot be negative
  const predicted = Math.max(0, Number(rawPrediction.toFixed(2)));

  const q80 = calibrationQuantiles.q80;
  const q95 = calibrationQuantiles.q95;

  const lower80 = Math.max(0, Number((predicted - q80).toFixed(2)));
  const upper80 = Number((predicted + q80).toFixed(2));
  const lower95 = Math.max(0, Number((predicted - q95).toFixed(2)));
  const upper95 = Number((predicted + q95).toFixed(2));
  const standardError = Number((q80 / 1.28155).toFixed(2));

  return {
    predicted,
    lower80,
    upper80,
    lower95,
    upper95,
    standardError,
  };
}
