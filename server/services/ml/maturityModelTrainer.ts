/**
 * Maturity Model Trainer
 * 
 * Infrastructure for training ML models on mortgage maturity prediction.
 * Currently a placeholder - will implement actual training logic when ready.
 */

import { db } from "../../db";
import { mortgageMaturityPredictions } from "@shared/schema";
import { isNotNull, sql } from "drizzle-orm";
import { extractMortgageFeatures, featuresToModelInput, type MortgageFeatures } from "./mortgageFeatureExtractor";

export interface TrainingDataRecord {
  propertyId: string;
  features: Record<string, number | string>;
  knownTermMonths: number;
  recordedMaturityDate: Date;
}

export interface TrainingSummary {
  totalRecords: number;
  usableRecords: number;
  termBucketDistribution: Record<string, number>;
  featureCompleteness: number;
  status: "success" | "insufficient_data" | "error";
  message: string;
}

/**
 * Collect training data from predictions with known maturity dates
 */
async function collectTrainingData(): Promise<TrainingDataRecord[]> {
  const records = await db
    .select()
    .from(mortgageMaturityPredictions)
    .where(isNotNull(mortgageMaturityPredictions.knownMaturityDate));

  const trainingData: TrainingDataRecord[] = [];

  for (const record of records) {
    if (!record.knownMaturityDate || !record.mortgageRecordingDate) {
      continue;
    }

    const features = record.features as MortgageFeatures | null;
    if (!features) {
      continue;
    }

    const recordingDate = new Date(record.mortgageRecordingDate);
    const maturityDate = new Date(record.knownMaturityDate);
    const termMonths = Math.round(
      (maturityDate.getTime() - recordingDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    if (termMonths <= 0 || termMonths > 600) {
      continue;
    }

    trainingData.push({
      propertyId: record.propertyId,
      features: featuresToModelInput(features),
      knownTermMonths: termMonths,
      recordedMaturityDate: maturityDate,
    });
  }

  return trainingData;
}

/**
 * Calculate term bucket distribution for training data
 */
function calculateBucketDistribution(data: TrainingDataRecord[]): Record<string, number> {
  const distribution: Record<string, number> = {
    "5yr": 0,
    "7yr": 0,
    "10yr": 0,
    "15yr": 0,
    "20yr": 0,
    "other": 0,
  };

  for (const record of data) {
    const months = record.knownTermMonths;
    if (months <= 66) distribution["5yr"]++;
    else if (months <= 90) distribution["7yr"]++;
    else if (months <= 132) distribution["10yr"]++;
    else if (months <= 192) distribution["15yr"]++;
    else if (months <= 264) distribution["20yr"]++;
    else distribution["other"]++;
  }

  return distribution;
}

/**
 * Train the maturity prediction model
 * 
 * TODO: Implement regression model using TensorFlow.js or scikit-learn via Python subprocess
 * 
 * Potential approaches:
 * 1. TensorFlow.js - Run directly in Node.js
 * 2. Python subprocess - Call scikit-learn or XGBoost via child_process
 * 3. ONNX Runtime - Load pre-trained model in ONNX format
 * 
 * Model architecture options:
 * - Gradient Boosted Trees (XGBoost/LightGBM) - Good for tabular data
 * - Random Forest - Simple, interpretable
 * - Neural Network - For complex patterns
 */
export async function trainMaturityModel(): Promise<TrainingSummary> {
  console.log("[MLTrainer] Starting maturity model training...");

  try {
    const trainingData = await collectTrainingData();
    const distribution = calculateBucketDistribution(trainingData);

    console.log(`[MLTrainer] Training data available: ${trainingData.length} records`);
    console.log("[MLTrainer] Term bucket distribution:", distribution);

    if (trainingData.length < 100) {
      console.log("[MLTrainer] Insufficient training data (need at least 100 records)");
      return {
        totalRecords: trainingData.length,
        usableRecords: trainingData.length,
        termBucketDistribution: distribution,
        featureCompleteness: 0,
        status: "insufficient_data",
        message: `Need at least 100 training records, currently have ${trainingData.length}`,
      };
    }

    const totalFeatures = trainingData.length * Object.keys(trainingData[0]?.features || {}).length;
    const nonNullFeatures = trainingData.reduce((count, record) => {
      return count + Object.values(record.features).filter(v => v !== -1 && v !== "unknown").length;
    }, 0);
    const featureCompleteness = totalFeatures > 0 ? nonNullFeatures / totalFeatures : 0;

    console.log(`[MLTrainer] Feature completeness: ${(featureCompleteness * 100).toFixed(1)}%`);

    console.log("[MLTrainer] Model training placeholder - actual implementation pending");

    return {
      totalRecords: trainingData.length,
      usableRecords: trainingData.length,
      termBucketDistribution: distribution,
      featureCompleteness,
      status: "success",
      message: `Training data prepared: ${trainingData.length} records with ${(featureCompleteness * 100).toFixed(1)}% feature completeness`,
    };
  } catch (error) {
    console.error("[MLTrainer] Training error:", error);
    return {
      totalRecords: 0,
      usableRecords: 0,
      termBucketDistribution: {},
      featureCompleteness: 0,
      status: "error",
      message: `Training failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get current training data statistics without training
 */
export async function getTrainingDataStats(): Promise<{
  recordCount: number;
  bucketDistribution: Record<string, number>;
}> {
  const trainingData = await collectTrainingData();
  return {
    recordCount: trainingData.length,
    bucketDistribution: calculateBucketDistribution(trainingData),
  };
}
