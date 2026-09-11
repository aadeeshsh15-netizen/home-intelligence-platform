import fs from 'fs';
import path from 'path';
import { TreeNode, HorizonModelArtifact, EnsembleModelArtifact } from './tree-ensemble';
import { TabularDataRow } from './dataset-builder';
import { FEATURE_NAMES_V1_POWER, FEATURE_VERSION_POWER } from './dataset-builder';

export interface TreeTrainParams {
  maxDepth: number;
  minSamplesLeaf: number;
  featureSubsampleRatio?: number; // 0.0 to 1.0 (default 1.0 for GBDT, ~0.6 for RF)
}

export interface GbdtTrainParams {
  nEstimators: number;
  learningRate: number;
  maxDepth: number;
  minSamplesLeaf: number;
  subsampleRatio?: number;
}

export interface RfTrainParams {
  nEstimators: number;
  maxDepth: number;
  minSamplesLeaf: number;
  featureSubsampleRatio?: number;
}

/**
 * Fits a single CART regression tree to (X, y) minimizing squared error.
 */
export function fitRegressionTree(
  X: number[][],
  y: number[],
  params: TreeTrainParams,
  currentDepth: number = 0
): TreeNode {
  const nSamples = y.length;
  if (nSamples === 0) {
    return { isLeaf: true, leafValue: 0 };
  }

  const meanY = y.reduce((a, b) => a + b, 0) / nSamples;

  // Leaf conditions
  if (
    currentDepth >= params.maxDepth ||
    nSamples < 2 * params.minSamplesLeaf ||
    y.every((val) => val === y[0])
  ) {
    return { isLeaf: true, leafValue: Number(meanY.toFixed(4)) };
  }

  const nFeatures = X[0].length;
  let featureIndices = Array.from({ length: nFeatures }, (_, i) => i);

  // Subsample features if specified
  if (params.featureSubsampleRatio && params.featureSubsampleRatio < 1.0) {
    const k = Math.max(1, Math.round(nFeatures * params.featureSubsampleRatio));
    featureIndices = featureIndices.sort(() => 0.5 - Math.random()).slice(0, k);
  }

  let bestSse = Infinity;
  let bestFeature: number | undefined;
  let bestThreshold: number | undefined;
  let bestLeftIndices: number[] = [];
  let bestRightIndices: number[] = [];

  for (const featIdx of featureIndices) {
    // Collect distinct feature values to test potential split points
    const values = X.map((row) => row[featIdx]);
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => a - b);
    if (uniqueValues.length <= 1) continue;

    // Test candidate split thresholds (quantiles or midpoints)
    const step = Math.max(1, Math.floor(uniqueValues.length / 10));
    for (let i = 0; i < uniqueValues.length - 1; i += step) {
      const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;

      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      let leftSum = 0;
      let rightSum = 0;

      for (let s = 0; s < nSamples; s++) {
        if (X[s][featIdx] <= threshold) {
          leftIdx.push(s);
          leftSum += y[s];
        } else {
          rightIdx.push(s);
          rightSum += y[s];
        }
      }

      if (leftIdx.length < params.minSamplesLeaf || rightIdx.length < params.minSamplesLeaf) {
        continue;
      }

      const leftMean = leftSum / leftIdx.length;
      const rightMean = rightSum / rightIdx.length;

      let sse = 0;
      for (const idx of leftIdx) {
        const diff = y[idx] - leftMean;
        sse += diff * diff;
      }
      for (const idx of rightIdx) {
        const diff = y[idx] - rightMean;
        sse += diff * diff;
      }

      if (sse < bestSse) {
        bestSse = sse;
        bestFeature = featIdx;
        bestThreshold = threshold;
        bestLeftIndices = leftIdx;
        bestRightIndices = rightIdx;
      }
    }
  }

  // If no split reduced SSE significantly, return leaf
  if (bestFeature === undefined || bestThreshold === undefined) {
    return { isLeaf: true, leafValue: Number(meanY.toFixed(4)) };
  }

  const leftX = bestLeftIndices.map((i) => X[i]);
  const leftY = bestLeftIndices.map((i) => y[i]);
  const rightX = bestRightIndices.map((i) => X[i]);
  const rightY = bestRightIndices.map((i) => y[i]);

  const leftNode = fitRegressionTree(leftX, leftY, params, currentDepth + 1);
  const rightNode = fitRegressionTree(rightX, rightY, params, currentDepth + 1);

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: Number(bestThreshold.toFixed(4)),
    left: leftNode,
    right: rightNode,
  };
}

/**
 * Evaluates a single tree node on vector x.
 */
function evaluateTreeInternal(node: TreeNode, x: number[]): number {
  let curr = node;
  while (!curr.isLeaf) {
    if (curr.featureIndex === undefined || curr.threshold === undefined) break;
    if (x[curr.featureIndex] <= curr.threshold) {
      curr = curr.left!;
    } else {
      curr = curr.right!;
    }
  }
  return curr.leafValue ?? 0;
}

/**
 * Calculates empirical residual quantiles on validation data for conformalized intervals.
 */
function computeCalibrationQuantiles(
  preds: number[],
  actuals: number[]
): { q80: number; q95: number } {
  const errors = preds.map((p, i) => Math.abs(actuals[i] - p)).sort((a, b) => a - b);
  if (errors.length === 0) return { q80: 10, q95: 25 };

  const idx80 = Math.min(errors.length - 1, Math.floor(errors.length * 0.8));
  const idx95 = Math.min(errors.length - 1, Math.floor(errors.length * 0.95));

  return {
    q80: Number(errors[idx80].toFixed(2)),
    q95: Number(errors[idx95].toFixed(2)),
  };
}

/**
 * Trains a Gradient Boosted Decision Tree model for a specific forecast horizon.
 */
export function trainHorizonGbdt(
  trainRows: TabularDataRow[],
  valRows: TabularDataRow[],
  horizonMinutes: number,
  params: GbdtTrainParams
): HorizonModelArtifact {
  const X_train = trainRows.map((r) => r.features);
  const y_train = trainRows.map((r) => r.targets[horizonMinutes]);

  const X_val = valRows.map((r) => r.features);
  const y_val = valRows.map((r) => r.targets[horizonMinutes]);

  const baseValue = y_train.reduce((a, b) => a + b, 0) / y_train.length;

  const currentPreds = new Array(y_train.length).fill(baseValue);
  const trees: TreeNode[] = [];

  for (let iter = 0; iter < params.nEstimators; iter++) {
    // Negative gradient for L2 loss: residual = y - y_hat
    const residuals = y_train.map((y, i) => y - currentPreds[i]);

    // Subsample rows if configured
    let subX = X_train;
    let subRes = residuals;
    if (params.subsampleRatio && params.subsampleRatio < 1.0) {
      const sampleSize = Math.floor(X_train.length * params.subsampleRatio);
      const indices: number[] = [];
      for (let s = 0; s < sampleSize; s++) {
        indices.push(Math.floor(Math.random() * X_train.length));
      }
      subX = indices.map((i) => X_train[i]);
      subRes = indices.map((i) => residuals[i]);
    }

    const tree = fitRegressionTree(subX, subRes, {
      maxDepth: params.maxDepth,
      minSamplesLeaf: params.minSamplesLeaf,
    });

    trees.push(tree);

    // Update predictions
    for (let i = 0; i < X_train.length; i++) {
      currentPreds[i] += params.learningRate * evaluateTreeInternal(tree, X_train[i]);
    }
  }

  // Calculate validation predictions for conformalized calibration
  const valPreds = X_val.map((x) => {
    let pred = baseValue;
    for (const tree of trees) {
      pred += params.learningRate * evaluateTreeInternal(tree, x);
    }
    return Math.max(0, pred);
  });

  const calibrationQuantiles = computeCalibrationQuantiles(valPreds, y_val);

  return {
    horizonMinutes,
    algorithm: 'GRADIENT_BOOSTING',
    baseValue: Number(baseValue.toFixed(2)),
    learningRate: params.learningRate,
    trees,
    calibrationQuantiles,
  };
}

/**
 * Trains a Random Forest model for a specific forecast horizon.
 */
export function trainHorizonRandomForest(
  trainRows: TabularDataRow[],
  valRows: TabularDataRow[],
  horizonMinutes: number,
  params: RfTrainParams
): HorizonModelArtifact {
  const X_train = trainRows.map((r) => r.features);
  const y_train = trainRows.map((r) => r.targets[horizonMinutes]);

  const X_val = valRows.map((r) => r.features);
  const y_val = valRows.map((r) => r.targets[horizonMinutes]);

  const trees: TreeNode[] = [];
  const nSamples = X_train.length;

  for (let t = 0; t < params.nEstimators; t++) {
    // Bootstrap sampling with replacement
    const bootX: number[][] = [];
    const bootY: number[] = [];
    for (let s = 0; s < nSamples; s++) {
      const idx = Math.floor(Math.random() * nSamples);
      bootX.push(X_train[idx]);
      bootY.push(y_train[idx]);
    }

    const tree = fitRegressionTree(bootX, bootY, {
      maxDepth: params.maxDepth,
      minSamplesLeaf: params.minSamplesLeaf,
      featureSubsampleRatio: params.featureSubsampleRatio || 0.6,
    });

    trees.push(tree);
  }

  // Calculate validation predictions for conformalized calibration
  const valPreds = X_val.map((x) => {
    let sum = 0;
    for (const tree of trees) {
      sum += evaluateTreeInternal(tree, x);
    }
    return Math.max(0, sum / trees.length);
  });

  const calibrationQuantiles = computeCalibrationQuantiles(valPreds, y_val);

  return {
    horizonMinutes,
    algorithm: 'RANDOM_FOREST',
    baseValue: 0,
    trees,
    calibrationQuantiles,
  };
}

/**
 * Saves a trained EnsembleModelArtifact to JSON file in storage/models/.
 */
export function saveModelArtifact(artifact: EnsembleModelArtifact, storageDir: string): string {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filePath = path.join(storageDir, `${artifact.modelId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
  return filePath;
}

/**
 * Loads an EnsembleModelArtifact from JSON file.
 */
export function loadModelArtifact(filePath: string): EnsembleModelArtifact | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as EnsembleModelArtifact;
  } catch {
    return null;
  }
}
