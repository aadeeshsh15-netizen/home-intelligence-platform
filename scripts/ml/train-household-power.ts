import path from 'path';
import { prisma } from '../../src/lib/db';
import {
  buildHouseholdPowerDataset,
  splitDatasetChronologically,
  FEATURE_VERSION_POWER,
  FEATURE_NAMES_V1_POWER,
} from '../../src/server/intelligence/prediction/ml/dataset-builder';
import {
  trainHorizonGbdt,
  trainHorizonRandomForest,
  saveModelArtifact,
} from '../../src/server/intelligence/prediction/ml/trainer';
import {
  EnsembleModelArtifact,
  HorizonModelArtifact,
} from '../../src/server/intelligence/prediction/ml/tree-ensemble';

async function main() {
  console.log('================================================================');
  console.log('      PHASE 4: HOUSEHOLD_POWER ML TRAINING PIPELINE            ');
  console.log('================================================================\n');

  const home = await prisma.home.findFirst();
  if (!home) {
    throw new Error('No home found in database. Run prisma/seed.ts first.');
  }

  console.log(`[1/4] Extracting 30-day telemetry and constructing feature matrix...`);
  const t0 = performance.now();
  const dataset = await buildHouseholdPowerDataset(home.id);
  const extractDurationMs = performance.now() - t0;

  console.log(`  ✓ Built ${dataset.length} tabular samples across 24 features`);
  console.log(`  ✓ Time span: ${dataset[0].timestamp.toISOString()} to ${dataset[dataset.length - 1].timestamp.toISOString()}`);
  console.log(`  ✓ Extraction latency: ${(extractDurationMs / 1000).toFixed(2)}s\n`);

  console.log(`[2/4] Applying strict chronological train / validation / test partition...`);
  const { train, val, test } = splitDatasetChronologically(dataset, 0.20, 0.25);

  console.log(`  ✓ Train partition:      ${train.length} samples (${train[0].timestamp.toISOString().split('T')[0]} to ${train[train.length - 1].timestamp.toISOString().split('T')[0]})`);
  console.log(`  ✓ Validation partition: ${val.length} samples (${val[0].timestamp.toISOString().split('T')[0]} to ${val[val.length - 1].timestamp.toISOString().split('T')[0]})`);
  console.log(`  ✓ Holdout Test set:     ${test.length} samples (${test[0].timestamp.toISOString().split('T')[0]} to ${test[test.length - 1].timestamp.toISOString().split('T')[0]})\n`);

  const horizons = [15, 60, 240, 1440];
  const storageDir = path.join(process.cwd(), 'storage', 'models', 'power');

  // -------------------------------------------------------------
  // Train GBDT
  // -------------------------------------------------------------
  console.log(`[3/4] Training Gradient Boosted Decision Trees (GBDT)...`);
  const gbdtStart = performance.now();
  const gbdtHorizons: Record<number, HorizonModelArtifact> = {};

  for (const h of horizons) {
    const hStart = performance.now();
    const horizonModel = trainHorizonGbdt(train, val, h, {
      nEstimators: 60,
      learningRate: 0.08,
      maxDepth: 4,
      minSamplesLeaf: 6,
      subsampleRatio: 0.85,
    });
    const hDuration = performance.now() - hStart;
    gbdtHorizons[h] = horizonModel;
    console.log(`  ✓ Horizon ${h >= 60 ? `${h / 60}h` : `${h}m`}: 60 trees fit in ${hDuration.toFixed(0)}ms (80% CI residual: ±${horizonModel.calibrationQuantiles.q80}W, 95% CI: ±${horizonModel.calibrationQuantiles.q95}W)`);
  }

  const gbdtTotalDurationMs = performance.now() - gbdtStart;

  const gbdtArtifact: EnsembleModelArtifact = {
    modelId: 'gbdt_v1',
    modelType: 'ML_GRADIENT_BOOSTING',
    version: '1.0.0',
    target: 'HOUSEHOLD_POWER',
    featureVersion: FEATURE_VERSION_POWER,
    featureNames: FEATURE_NAMES_V1_POWER,
    trainingMetadata: {
      trainedAt: new Date().toISOString(),
      sampleCount: train.length,
      trainDurationMs: Math.round(gbdtTotalDurationMs),
      trainRange: {
        start: train[0].timestamp.toISOString(),
        end: train[train.length - 1].timestamp.toISOString(),
      },
      hyperparameters: {
        nEstimators: 60,
        learningRate: 0.08,
        maxDepth: 4,
        minSamplesLeaf: 6,
        subsampleRatio: 0.85,
      },
    },
    horizons: gbdtHorizons,
  };

  const gbdtSavedPath = saveModelArtifact(gbdtArtifact, storageDir);
  console.log(`  ✓ Saved GBDT artifact to: ${gbdtSavedPath} (Total training time: ${(gbdtTotalDurationMs / 1000).toFixed(2)}s)\n`);

  // -------------------------------------------------------------
  // Train Random Forest
  // -------------------------------------------------------------
  console.log(`[4/4] Training Random Forest Regressor (RF)...`);
  const rfStart = performance.now();
  const rfHorizons: Record<number, HorizonModelArtifact> = {};

  for (const h of horizons) {
    const hStart = performance.now();
    const horizonModel = trainHorizonRandomForest(train, val, h, {
      nEstimators: 50,
      maxDepth: 7,
      minSamplesLeaf: 5,
      featureSubsampleRatio: 0.65,
    });
    const hDuration = performance.now() - hStart;
    rfHorizons[h] = horizonModel;
    console.log(`  ✓ Horizon ${h >= 60 ? `${h / 60}h` : `${h}m`}: 50 trees fit in ${hDuration.toFixed(0)}ms (80% CI residual: ±${horizonModel.calibrationQuantiles.q80}W, 95% CI: ±${horizonModel.calibrationQuantiles.q95}W)`);
  }

  const rfTotalDurationMs = performance.now() - rfStart;

  const rfArtifact: EnsembleModelArtifact = {
    modelId: 'rf_v1',
    modelType: 'ML_RANDOM_FOREST',
    version: '1.0.0',
    target: 'HOUSEHOLD_POWER',
    featureVersion: FEATURE_VERSION_POWER,
    featureNames: FEATURE_NAMES_V1_POWER,
    trainingMetadata: {
      trainedAt: new Date().toISOString(),
      sampleCount: train.length,
      trainDurationMs: Math.round(rfTotalDurationMs),
      trainRange: {
        start: train[0].timestamp.toISOString(),
        end: train[train.length - 1].timestamp.toISOString(),
      },
      hyperparameters: {
        nEstimators: 50,
        maxDepth: 7,
        minSamplesLeaf: 5,
        featureSubsampleRatio: 0.65,
      },
    },
    horizons: rfHorizons,
  };

  const rfSavedPath = saveModelArtifact(rfArtifact, storageDir);
  console.log(`  ✓ Saved Random Forest artifact to: ${rfSavedPath} (Total training time: ${(rfTotalDurationMs / 1000).toFixed(2)}s)\n`);

  // Register in PostgreSQL PredictionModel table
  await prisma.predictionModel.upsert({
    where: { id: 'model-gradient-boosting-v1' },
    update: {
      version: '1.0.0',
      hyperparameters: gbdtArtifact.trainingMetadata.hyperparameters,
      updatedAt: new Date(),
    },
    create: {
      id: 'model-gradient-boosting-v1',
      name: 'Gradient Boosted Trees (GBDT)',
      type: 'ML_GRADIENT_BOOSTING',
      version: '1.0.0',
      target: 'HOUSEHOLD_POWER',
      hyperparameters: gbdtArtifact.trainingMetadata.hyperparameters,
      isActive: true,
      isDefault: false,
    },
  });

  await prisma.predictionModel.upsert({
    where: { id: 'model-random-forest-v1' },
    update: {
      version: '1.0.0',
      hyperparameters: rfArtifact.trainingMetadata.hyperparameters,
      updatedAt: new Date(),
    },
    create: {
      id: 'model-random-forest-v1',
      name: 'Random Forest Regressor (RF)',
      type: 'ML_RANDOM_FOREST',
      version: '1.0.0',
      target: 'HOUSEHOLD_POWER',
      hyperparameters: rfArtifact.trainingMetadata.hyperparameters,
      isActive: true,
      isDefault: false,
    },
  });

  console.log('================================================================');
  console.log('  TRAINING COMPLETE: Both GBDT & RF Artifacts Ready For Benchmark');
  console.log('================================================================');
}

main()
  .catch((e) => {
    console.error('Training failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
