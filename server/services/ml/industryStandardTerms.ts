/**
 * Industry Standard Term Estimator
 * 
 * Rule-based estimator for commercial mortgage terms using industry knowledge.
 * Serves as a baseline before ML models and fallback when ML cannot predict.
 */

import type { MortgageFeatures, PropertyTypeCategory, LenderCategory } from "./mortgageFeatureExtractor";
import type { TermBucket } from "@shared/schema";

export interface TermEstimation {
  predictedTermMonths: number;
  termBucket: TermBucket;
  confidenceScore: number;
  reasoning: string;
}

interface PropertyTypeTermProfile {
  typicalTermMonths: number;
  minTermMonths: number;
  maxTermMonths: number;
  description: string;
}

interface LenderTermProfile {
  preferredTermMonths: number;
  termRange: [number, number];
  description: string;
}

const PROPERTY_TYPE_PROFILES: Record<PropertyTypeCategory, PropertyTypeTermProfile> = {
  office: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Office properties typically have 7-10 year terms",
  },
  retail: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Retail properties typically have 7-10 year terms",
  },
  industrial: {
    typicalTermMonths: 120,
    minTermMonths: 84,
    maxTermMonths: 180,
    description: "Industrial properties often have longer 10-15 year terms due to stable tenancy",
  },
  multifamily: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Multifamily properties typically have 7-10 year terms",
  },
  hospitality: {
    typicalTermMonths: 60,
    minTermMonths: 36,
    maxTermMonths: 84,
    description: "Hospitality is higher risk, typically 5-7 year terms",
  },
  mixed_use: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Mixed-use properties typically have 7-10 year terms",
  },
  land: {
    typicalTermMonths: 36,
    minTermMonths: 24,
    maxTermMonths: 60,
    description: "Land/development loans are short-term, typically 2-5 years",
  },
  other: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Default assumption of 7-10 year term",
  },
  unknown: {
    typicalTermMonths: 84,
    minTermMonths: 60,
    maxTermMonths: 120,
    description: "Unknown property type, assuming 7-10 year term",
  },
};

const LENDER_PROFILES: Record<LenderCategory, LenderTermProfile> = {
  bank: {
    preferredTermMonths: 60,
    termRange: [36, 84],
    description: "Banks prefer shorter terms (5-7 years) for balance sheet management",
  },
  cmbs: {
    preferredTermMonths: 120,
    termRange: [84, 120],
    description: "CMBS typically structures 10-year loans to match bond maturities",
  },
  lifeco: {
    preferredTermMonths: 120,
    termRange: [84, 180],
    description: "Life insurance companies prefer longer terms (10-15 years) matching liabilities",
  },
  credit_union: {
    preferredTermMonths: 60,
    termRange: [36, 84],
    description: "Credit unions typically offer shorter terms similar to banks",
  },
  private_lender: {
    preferredTermMonths: 36,
    termRange: [12, 60],
    description: "Private/bridge lenders offer short-term financing (1-5 years)",
  },
  government: {
    preferredTermMonths: 240,
    termRange: [180, 420],
    description: "Government-backed loans (HUD/FHA) offer very long terms (15-35 years)",
  },
  other: {
    preferredTermMonths: 84,
    termRange: [60, 120],
    description: "Other lenders typically offer 7-10 year terms",
  },
  unknown: {
    preferredTermMonths: 84,
    termRange: [60, 120],
    description: "Unknown lender, assuming standard 7-10 year term",
  },
};

interface LoanSizeProfile {
  adjustmentMonths: number;
  description: string;
}

function getLoanSizeProfile(loanAmount: number): LoanSizeProfile {
  if (loanAmount < 2_000_000) {
    return {
      adjustmentMonths: -12,
      description: "Small loans (<$2M) tend toward shorter terms (5-7 years)",
    };
  } else if (loanAmount <= 10_000_000) {
    return {
      adjustmentMonths: 0,
      description: "Mid-size loans ($2M-$10M) typically get standard terms",
    };
  } else if (loanAmount <= 50_000_000) {
    return {
      adjustmentMonths: 12,
      description: "Large loans ($10M-$50M) often get longer terms",
    };
  } else {
    return {
      adjustmentMonths: 24,
      description: "Very large loans (>$50M) typically get 10-20 year terms",
    };
  }
}

function getLtvAdjustment(ltv: number): { adjustmentMonths: number; description: string } {
  if (ltv > 0.75) {
    return {
      adjustmentMonths: -12,
      description: "High LTV (>75%) may result in shorter term requirements",
    };
  } else if (ltv < 0.5) {
    return {
      adjustmentMonths: 6,
      description: "Low LTV (<50%) may qualify for longer terms",
    };
  }
  return { adjustmentMonths: 0, description: "" };
}

function monthsToTermBucket(months: number): TermBucket {
  if (months <= 66) return "5yr";
  if (months <= 90) return "7yr";
  if (months <= 132) return "10yr";
  if (months <= 192) return "15yr";
  if (months <= 264) return "20yr";
  return "other";
}

function calculateConfidence(features: MortgageFeatures, factors: string[]): number {
  let confidence = 0.45;
  
  if (features.propertyTypeCategory !== "unknown" && features.propertyTypeCategory !== "other") {
    confidence += 0.05;
  }
  
  if (features.lenderCategory !== "unknown" && features.lenderCategory !== "other") {
    confidence += 0.05;
  }
  
  if (features.loanAmount > 0) {
    confidence += 0.03;
  }
  
  if (features.propertyValue > 0 && features.loanToValueRatio > 0) {
    confidence += 0.02;
  }
  
  if (features.lenderCategory === "cmbs" || features.lenderCategory === "government") {
    confidence += 0.05;
  }
  
  return Math.min(Math.max(confidence, 0.3), 0.6);
}

/**
 * Estimate loan term using industry standard rules
 */
export function estimateTermByIndustryStandard(features: MortgageFeatures): TermEstimation {
  const reasoningParts: string[] = [];
  
  const propertyProfile = PROPERTY_TYPE_PROFILES[features.propertyTypeCategory];
  let baseTermMonths = propertyProfile.typicalTermMonths;
  reasoningParts.push(propertyProfile.description);
  
  const lenderProfile = LENDER_PROFILES[features.lenderCategory];
  
  const lenderWeight = 0.4;
  const propertyWeight = 0.6;
  
  const blendedBase = Math.round(
    (propertyProfile.typicalTermMonths * propertyWeight) + 
    (lenderProfile.preferredTermMonths * lenderWeight)
  );
  
  baseTermMonths = blendedBase;
  reasoningParts.push(lenderProfile.description);
  
  let adjustedTermMonths = baseTermMonths;
  
  if (features.loanAmount > 0) {
    const loanSizeProfile = getLoanSizeProfile(features.loanAmount);
    adjustedTermMonths += loanSizeProfile.adjustmentMonths;
    if (loanSizeProfile.adjustmentMonths !== 0) {
      reasoningParts.push(loanSizeProfile.description);
    }
  }
  
  if (features.loanToValueRatio > 0) {
    const ltvAdjustment = getLtvAdjustment(features.loanToValueRatio);
    adjustedTermMonths += ltvAdjustment.adjustmentMonths;
    if (ltvAdjustment.description) {
      reasoningParts.push(ltvAdjustment.description);
    }
  }
  
  const minTerm = Math.max(
    propertyProfile.minTermMonths,
    lenderProfile.termRange[0]
  );
  const maxTerm = Math.min(
    propertyProfile.maxTermMonths,
    lenderProfile.termRange[1]
  );
  
  const finalTermMonths = Math.max(minTerm, Math.min(maxTerm, adjustedTermMonths));
  
  const roundedTermMonths = Math.round(finalTermMonths / 12) * 12;
  
  const confidenceScore = calculateConfidence(features, reasoningParts);
  
  return {
    predictedTermMonths: roundedTermMonths,
    termBucket: monthsToTermBucket(roundedTermMonths),
    confidenceScore,
    reasoning: reasoningParts.join(". ") + ".",
  };
}

/**
 * Batch estimate terms for multiple properties
 */
export function batchEstimateTerms(featuresList: MortgageFeatures[]): TermEstimation[] {
  return featuresList.map(features => estimateTermByIndustryStandard(features));
}

/**
 * Calculate predicted maturity date based on recording date and term
 */
export function calculatePredictedMaturityDate(
  recordingDate: Date | null,
  termMonths: number
): Date | null {
  if (!recordingDate || termMonths <= 0) return null;
  
  const maturityDate = new Date(recordingDate);
  maturityDate.setMonth(maturityDate.getMonth() + termMonths);
  return maturityDate;
}

/**
 * Get explanation for a term bucket
 */
export function getTermBucketExplanation(bucket: TermBucket): string {
  const explanations: Record<TermBucket, string> = {
    "5yr": "5-year term (60 months) - Common for bank loans and smaller properties",
    "7yr": "7-year term (84 months) - Popular for office, retail, and multifamily",
    "10yr": "10-year term (120 months) - Standard for CMBS and life company loans",
    "15yr": "15-year term (180 months) - Common for life company and government-backed loans",
    "20yr": "20-year term (240 months) - Typically HUD/FHA multifamily loans",
    "other": "Non-standard term - May be bridge loan, construction, or special situation",
  };
  return explanations[bucket];
}
