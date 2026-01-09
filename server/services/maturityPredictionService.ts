/**
 * Mortgage Maturity Prediction Service
 * 
 * Orchestrates maturity date prediction by:
 * 1. Fetching mortgage data from ATTOM
 * 2. Extracting ML-ready features
 * 3. Predicting term using industry standard rules (ML model later)
 * 4. Saving predictions to database
 */

import { eq, and, gte, desc } from "drizzle-orm";
import { db } from "../db";
import { mortgageMaturityPredictions, type InsertMortgageMaturityPrediction } from "@shared/schema";
import { getMortgageData, getMortgageDataById, getMortgageHistory } from "../providers/AttomMortgageProvider";
import type { AttomMortgageResult, MortgageRecord } from "../providers/AttomMortgageProvider";
import { extractMortgageFeatures, validateFeatures, type MortgageFeatures, type PropertyData } from "./ml/mortgageFeatureExtractor";
import { estimateTermByIndustryStandard, calculatePredictedMaturityDate } from "./ml/industryStandardTerms";
import { predictWithMLModel, isModelAvailable } from "./ml/maturityModelPredictor";
import type { TermBucket } from "@shared/schema";

export interface PredictionOptions {
  forceRefresh?: boolean;
  cacheMaxAgeDays?: number;
  includeRawData?: boolean;
}

export interface PredictionResult {
  propertyId: string;
  mortgageRecordingDate: Date | null;
  predictedMaturityDate: Date | null;
  predictedTermMonths: number;
  termBucket: TermBucket;
  confidenceScore: number;
  predictionMethod: "industry_standard" | "ml_model" | "manual";
  lenderName?: string;
  loanAmount?: number;
  propertyType?: string;
  reasoning?: string;
  cached?: boolean;
  features?: MortgageFeatures;
}

export interface PredictionError {
  error: "no_mortgage_data" | "no_attom_id" | "incomplete_data" | "prediction_failed";
  message: string;
  propertyId: string;
}

const DEFAULT_CACHE_MAX_AGE_DAYS = 90;

/**
 * Check for existing cached prediction
 */
async function getCachedPrediction(
  propertyId: string,
  maxAgeDays: number
): Promise<PredictionResult | null> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  try {
    const existing = await db
      .select()
      .from(mortgageMaturityPredictions)
      .where(
        and(
          eq(mortgageMaturityPredictions.propertyId, propertyId),
          gte(mortgageMaturityPredictions.createdAt, cutoffDate)
        )
      )
      .orderBy(desc(mortgageMaturityPredictions.createdAt))
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    const pred = existing[0];
    
    if (pred.confidenceScore !== null && pred.confidenceScore < 0.5) {
      return null;
    }

    return {
      propertyId: pred.propertyId,
      mortgageRecordingDate: pred.mortgageRecordingDate ? new Date(pred.mortgageRecordingDate) : null,
      predictedMaturityDate: pred.predictedMaturityDate ? new Date(pred.predictedMaturityDate) : null,
      predictedTermMonths: pred.predictedTermMonths || 0,
      termBucket: (pred.termBucket as TermBucket) || "other",
      confidenceScore: pred.confidenceScore || 0,
      predictionMethod: pred.predictionMethod as "industry_standard" | "ml_model" | "manual",
      lenderName: pred.lenderName || undefined,
      loanAmount: pred.loanAmount ? Number(pred.loanAmount) : undefined,
      propertyType: pred.propertyType || undefined,
      cached: true,
      features: pred.features as MortgageFeatures | undefined,
    };
  } catch (error) {
    console.error("[MaturityPrediction] Error checking cache:", error);
    return null;
  }
}

/**
 * Save prediction to database
 */
async function savePrediction(
  propertyId: string,
  features: MortgageFeatures,
  prediction: {
    predictedTermMonths: number;
    termBucket: TermBucket;
    confidenceScore: number;
    reasoning: string;
  },
  attomRawData?: any
): Promise<void> {
  const predictedMaturityDate = calculatePredictedMaturityDate(
    features.recordingDate,
    prediction.predictedTermMonths
  );

  const insertData: InsertMortgageMaturityPrediction = {
    propertyId,
    mortgageRecordingDate: features.recordingDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
    loanAmount: features.loanAmount > 0 ? String(features.loanAmount) : null,
    loanType: features.loanType !== "unknown" ? features.loanType : null,
    lenderName: features.lenderName !== "unknown" ? features.lenderName : null,
    propertyType: features.propertyTypeCategory !== "unknown" ? features.propertyTypeCategory : null,
    predictedMaturityDate: predictedMaturityDate?.toISOString().split("T")[0] || null,
    predictedTermMonths: prediction.predictedTermMonths,
    termBucket: prediction.termBucket,
    confidenceScore: prediction.confidenceScore,
    predictionMethod: "industry_standard",
    features: features as any,
    attomRawData: attomRawData || null,
  };

  try {
    await db.insert(mortgageMaturityPredictions).values(insertData);
    console.log(`[MaturityPrediction] Saved prediction for property ${propertyId}`);
  } catch (error) {
    console.error("[MaturityPrediction] Error saving prediction:", error);
    throw error;
  }
}

/**
 * Predict maturity date for a property by address
 */
export async function predictMaturityDate(
  addressOrAttomId: string,
  options: PredictionOptions = {}
): Promise<PredictionResult | PredictionError> {
  const {
    forceRefresh = false,
    cacheMaxAgeDays = DEFAULT_CACHE_MAX_AGE_DAYS,
    includeRawData = false,
  } = options;

  const isAttomId = /^\d+$/.test(addressOrAttomId);
  const propertyId = addressOrAttomId;

  if (!forceRefresh) {
    const cached = await getCachedPrediction(propertyId, cacheMaxAgeDays);
    if (cached) {
      console.log(`[MaturityPrediction] Returning cached prediction for ${propertyId}`);
      return cached;
    }
  }

  let mortgageData: AttomMortgageResult | null = null;
  let mortgageHistory: MortgageRecord[] = [];

  try {
    if (isAttomId) {
      mortgageData = await getMortgageDataById(addressOrAttomId);
      if (mortgageData?.attomId) {
        mortgageHistory = await getMortgageHistory(mortgageData.attomId);
      }
    } else {
      mortgageData = await getMortgageData(addressOrAttomId);
      if (mortgageData?.attomId) {
        mortgageHistory = await getMortgageHistory(mortgageData.attomId);
      }
    }
  } catch (error) {
    console.error("[MaturityPrediction] Error fetching mortgage data:", error);
    return {
      error: "prediction_failed",
      message: `Failed to fetch mortgage data: ${error instanceof Error ? error.message : String(error)}`,
      propertyId,
    };
  }

  if (!mortgageData || !mortgageData.currentMortgage) {
    return {
      error: "no_mortgage_data",
      message: "No mortgage data found for this property",
      propertyId,
    };
  }

  const propertyData: PropertyData = {
    attomId: mortgageData.attomId,
    address: mortgageData.address ? {
      line1: mortgageData.address.line1,
      city: mortgageData.address.city,
      state: mortgageData.address.state,
      zip: mortgageData.address.zip,
      county: mortgageData.address.county,
    } : undefined,
    propertyType: mortgageData.propertyType,
    propertyUse: mortgageData.propertyUse,
  };

  const features = extractMortgageFeatures(mortgageData, propertyData, mortgageHistory);

  const validation = validateFeatures(features);
  
  let predictionMethod: "ml_model" | "industry_standard" = "industry_standard";
  let predictedTermMonths: number;
  let termBucket: TermBucket;
  let confidenceScore: number;
  let reasoning: string;

  const mlPrediction = await predictWithMLModel(features);
  
  if (mlPrediction && mlPrediction.confidenceScore >= 0.5) {
    console.log(`[MaturityPrediction] Using ML model prediction with confidence ${mlPrediction.confidenceScore}`);
    predictionMethod = "ml_model";
    predictedTermMonths = mlPrediction.predictedTermMonths;
    termBucket = mlPrediction.termBucket;
    confidenceScore = mlPrediction.confidenceScore;
    reasoning = `ML model prediction (v${mlPrediction.modelVersion})`;
  } else {
    const termEstimation = estimateTermByIndustryStandard(features);
    predictedTermMonths = termEstimation.predictedTermMonths;
    termBucket = termEstimation.termBucket;
    confidenceScore = termEstimation.confidenceScore;
    reasoning = termEstimation.reasoning;
    
    if (mlPrediction) {
      console.log(`[MaturityPrediction] ML model confidence too low (${mlPrediction.confidenceScore}), using industry standard`);
    }
  }
  
  if (!validation.isComplete) {
    confidenceScore = Math.max(0.3, confidenceScore * validation.completenessScore);
  }

  const predictedMaturityDate = calculatePredictedMaturityDate(
    features.recordingDate,
    predictedTermMonths
  );

  try {
    await savePrediction(
      propertyId,
      features,
      {
        predictedTermMonths,
        termBucket,
        confidenceScore,
        reasoning,
      },
      includeRawData ? mortgageData.rawResponse : undefined
    );
  } catch (error) {
    console.warn("[MaturityPrediction] Failed to save prediction, returning result anyway");
  }

  return {
    propertyId,
    mortgageRecordingDate: features.recordingDate,
    predictedMaturityDate,
    predictedTermMonths,
    termBucket,
    confidenceScore,
    predictionMethod,
    lenderName: features.lenderName !== "unknown" ? features.lenderName : undefined,
    loanAmount: features.loanAmount > 0 ? features.loanAmount : undefined,
    propertyType: features.propertyTypeCategory !== "unknown" ? features.propertyTypeCategory : undefined,
    reasoning,
    cached: false,
    features: includeRawData ? features : undefined,
  };
}

/**
 * Batch predict maturity dates for multiple properties
 */
export async function batchPredictMaturityDates(
  addressesOrIds: string[],
  options: PredictionOptions = {}
): Promise<Array<PredictionResult | PredictionError>> {
  const results: Array<PredictionResult | PredictionError> = [];

  for (const addressOrId of addressesOrIds) {
    const result = await predictMaturityDate(addressOrId, options);
    results.push(result);
  }

  return results;
}

/**
 * Get all predictions for a property
 */
export async function getPredictionHistory(
  propertyId: string
): Promise<PredictionResult[]> {
  try {
    const predictions = await db
      .select()
      .from(mortgageMaturityPredictions)
      .where(eq(mortgageMaturityPredictions.propertyId, propertyId))
      .orderBy(desc(mortgageMaturityPredictions.createdAt));

    return predictions.map(pred => ({
      propertyId: pred.propertyId,
      mortgageRecordingDate: pred.mortgageRecordingDate ? new Date(pred.mortgageRecordingDate) : null,
      predictedMaturityDate: pred.predictedMaturityDate ? new Date(pred.predictedMaturityDate) : null,
      predictedTermMonths: pred.predictedTermMonths || 0,
      termBucket: (pred.termBucket as TermBucket) || "other",
      confidenceScore: pred.confidenceScore || 0,
      predictionMethod: pred.predictionMethod as "industry_standard" | "ml_model" | "manual",
      lenderName: pred.lenderName || undefined,
      loanAmount: pred.loanAmount ? Number(pred.loanAmount) : undefined,
      propertyType: pred.propertyType || undefined,
      cached: true,
    }));
  } catch (error) {
    console.error("[MaturityPrediction] Error fetching history:", error);
    return [];
  }
}

/**
 * Delete predictions for a property
 */
export async function deletePredictions(propertyId: string): Promise<number> {
  try {
    const result = await db
      .delete(mortgageMaturityPredictions)
      .where(eq(mortgageMaturityPredictions.propertyId, propertyId));
    
    return result.rowCount || 0;
  } catch (error) {
    console.error("[MaturityPrediction] Error deleting predictions:", error);
    return 0;
  }
}

/**
 * Get upcoming maturities within a date range
 */
export async function getUpcomingMaturities(
  startDate: Date,
  endDate: Date,
  minConfidence: number = 0.4
): Promise<PredictionResult[]> {
  try {
    const predictions = await db
      .select()
      .from(mortgageMaturityPredictions)
      .where(
        and(
          gte(mortgageMaturityPredictions.confidenceScore, minConfidence)
        )
      )
      .orderBy(mortgageMaturityPredictions.predictedMaturityDate);

    return predictions
      .filter(pred => {
        if (!pred.predictedMaturityDate) return false;
        const maturityDate = new Date(pred.predictedMaturityDate);
        return maturityDate >= startDate && maturityDate <= endDate;
      })
      .map(pred => ({
        propertyId: pred.propertyId,
        mortgageRecordingDate: pred.mortgageRecordingDate ? new Date(pred.mortgageRecordingDate) : null,
        predictedMaturityDate: pred.predictedMaturityDate ? new Date(pred.predictedMaturityDate) : null,
        predictedTermMonths: pred.predictedTermMonths || 0,
        termBucket: (pred.termBucket as TermBucket) || "other",
        confidenceScore: pred.confidenceScore || 0,
        predictionMethod: pred.predictionMethod as "industry_standard" | "ml_model" | "manual",
        lenderName: pred.lenderName || undefined,
        loanAmount: pred.loanAmount ? Number(pred.loanAmount) : undefined,
        propertyType: pred.propertyType || undefined,
        cached: true,
      }));
  } catch (error) {
    console.error("[MaturityPrediction] Error fetching upcoming maturities:", error);
    return [];
  }
}

/**
 * Check if a prediction result is an error
 */
export function isPredictionError(
  result: PredictionResult | PredictionError
): result is PredictionError {
  return "error" in result;
}
