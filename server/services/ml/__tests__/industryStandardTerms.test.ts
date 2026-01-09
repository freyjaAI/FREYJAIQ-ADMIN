/**
 * Unit tests for Industry Standard Term Estimator
 */

import { describe, it, expect } from "vitest";
import { 
  estimateTermByIndustryStandard, 
  calculatePredictedMaturityDate,
  getTermBucketExplanation,
  batchEstimateTerms
} from "../industryStandardTerms";
import type { MortgageFeatures } from "../mortgageFeatureExtractor";

function createMockFeatures(overrides: Partial<MortgageFeatures> = {}): MortgageFeatures {
  return {
    recordingDate: new Date("2020-01-15"),
    loanAmount: 5_000_000,
    propertyValue: 7_500_000,
    loanToValueRatio: 0.67,
    propertyType: "Office Building",
    propertyTypeCategory: "office",
    lenderName: "Wells Fargo Bank",
    lenderCategory: "bank",
    loanType: "Conventional",
    marketIndicators: {
      msa: "Los Angeles, CA",
      state: "CA",
      zipCode: "90210",
    },
    daysSinceRecording: 1000,
    hasRefinanceHistory: false,
    previousLoanCount: 0,
    interestRate: 4.5,
    interestRateType: "Fixed",
    termMonths: null,
    maturityDate: null,
    ...overrides,
  };
}

describe("estimateTermByIndustryStandard", () => {
  describe("Property Type Influence", () => {
    it("should estimate shorter terms for hospitality properties", () => {
      const features = createMockFeatures({ propertyTypeCategory: "hospitality" });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeLessThanOrEqual(84);
      expect(result.termBucket).toMatch(/5yr|7yr/);
      expect(result.reasoning).toContain("Hospitality");
    });

    it("should estimate longer terms for industrial properties", () => {
      const features = createMockFeatures({ 
        propertyTypeCategory: "industrial",
        lenderCategory: "lifeco"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeGreaterThanOrEqual(84);
      expect(result.reasoning).toContain("Industrial");
    });

    it("should estimate short terms for land/development", () => {
      const features = createMockFeatures({ propertyTypeCategory: "land" });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeLessThanOrEqual(60);
      expect(result.termBucket).toMatch(/5yr|7yr/);
    });

    it("should handle unknown property type with default assumption", () => {
      const features = createMockFeatures({ propertyTypeCategory: "unknown" });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeGreaterThan(0);
      expect(result.reasoning).toContain("Unknown property type");
    });
  });

  describe("Lender Category Influence", () => {
    it("should estimate shorter terms for bank lenders", () => {
      const features = createMockFeatures({ 
        lenderCategory: "bank",
        propertyTypeCategory: "office"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeLessThanOrEqual(84);
      expect(result.reasoning).toContain("Banks prefer shorter terms");
    });

    it("should estimate 10-year terms for CMBS lenders", () => {
      const features = createMockFeatures({ 
        lenderCategory: "cmbs",
        propertyTypeCategory: "office"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeGreaterThanOrEqual(84);
      expect(result.predictedTermMonths).toBeLessThanOrEqual(120);
      expect(result.termBucket).toMatch(/7yr|10yr/);
      expect(result.reasoning).toContain("CMBS");
    });

    it("should estimate longer terms for life insurance companies", () => {
      const features = createMockFeatures({ 
        lenderCategory: "lifeco",
        propertyTypeCategory: "multifamily"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeGreaterThanOrEqual(84);
      expect(result.reasoning).toContain("Life insurance");
    });

    it("should estimate very long terms for government-backed loans", () => {
      const features = createMockFeatures({ 
        lenderCategory: "government",
        propertyTypeCategory: "multifamily"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeGreaterThanOrEqual(120);
      expect(result.reasoning).toContain("Government");
    });

    it("should estimate short terms for private/bridge lenders", () => {
      const features = createMockFeatures({ 
        lenderCategory: "private_lender",
        propertyTypeCategory: "office"
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.predictedTermMonths).toBeLessThanOrEqual(60);
      expect(result.reasoning).toContain("Private");
    });
  });

  describe("Loan Size Influence", () => {
    it("should adjust toward shorter terms for small loans", () => {
      const smallLoan = createMockFeatures({ 
        loanAmount: 1_500_000,
        lenderCategory: "other",
        propertyTypeCategory: "other"
      });
      const mediumLoan = createMockFeatures({ 
        loanAmount: 5_000_000,
        lenderCategory: "other",
        propertyTypeCategory: "other"
      });
      
      const smallResult = estimateTermByIndustryStandard(smallLoan);
      const mediumResult = estimateTermByIndustryStandard(mediumLoan);
      
      expect(smallResult.predictedTermMonths).toBeLessThanOrEqual(mediumResult.predictedTermMonths);
    });

    it("should adjust toward longer terms for large loans", () => {
      const largeLoan = createMockFeatures({ 
        loanAmount: 25_000_000,
        lenderCategory: "lifeco",
        propertyTypeCategory: "office"
      });
      const result = estimateTermByIndustryStandard(largeLoan);
      
      expect(result.reasoning).toContain("Large loans");
    });

    it("should handle very large loans (>$50M)", () => {
      const veryLargeLoan = createMockFeatures({ 
        loanAmount: 75_000_000,
        lenderCategory: "cmbs",
        propertyTypeCategory: "office"
      });
      const result = estimateTermByIndustryStandard(veryLargeLoan);
      
      expect(result.reasoning).toContain("Very large loans");
    });
  });

  describe("LTV Influence", () => {
    it("should adjust toward shorter terms for high LTV", () => {
      const highLtv = createMockFeatures({ 
        loanToValueRatio: 0.80,
        lenderCategory: "bank"
      });
      const result = estimateTermByIndustryStandard(highLtv);
      
      expect(result.reasoning).toContain("High LTV");
    });

    it("should adjust toward longer terms for low LTV", () => {
      const lowLtv = createMockFeatures({ 
        loanToValueRatio: 0.45,
        lenderCategory: "lifeco"
      });
      const result = estimateTermByIndustryStandard(lowLtv);
      
      expect(result.reasoning).toContain("Low LTV");
    });
  });

  describe("Confidence Scoring", () => {
    it("should have higher confidence for known property type and lender", () => {
      const wellKnown = createMockFeatures({
        propertyTypeCategory: "office",
        lenderCategory: "cmbs",
        loanAmount: 10_000_000,
        propertyValue: 15_000_000,
      });
      const result = estimateTermByIndustryStandard(wellKnown);
      
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.5);
      expect(result.confidenceScore).toBeLessThanOrEqual(0.6);
    });

    it("should have lower confidence for unknown fields", () => {
      const unknown = createMockFeatures({
        propertyTypeCategory: "unknown",
        lenderCategory: "unknown",
        loanAmount: 0,
        propertyValue: 0,
      });
      const result = estimateTermByIndustryStandard(unknown);
      
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.3);
      expect(result.confidenceScore).toBeLessThanOrEqual(0.5);
    });

    it("should always return confidence between 0.3 and 0.6", () => {
      const testCases = [
        createMockFeatures({ propertyTypeCategory: "office", lenderCategory: "bank" }),
        createMockFeatures({ propertyTypeCategory: "unknown", lenderCategory: "unknown" }),
        createMockFeatures({ propertyTypeCategory: "hospitality", lenderCategory: "private_lender" }),
        createMockFeatures({ propertyTypeCategory: "multifamily", lenderCategory: "government" }),
      ];
      
      for (const features of testCases) {
        const result = estimateTermByIndustryStandard(features);
        expect(result.confidenceScore).toBeGreaterThanOrEqual(0.3);
        expect(result.confidenceScore).toBeLessThanOrEqual(0.6);
      }
    });
  });

  describe("Term Bucket Assignment", () => {
    it("should assign 5yr bucket for terms up to 66 months", () => {
      const features = createMockFeatures({
        propertyTypeCategory: "land",
        lenderCategory: "private_lender",
      });
      const result = estimateTermByIndustryStandard(features);
      
      if (result.predictedTermMonths <= 66) {
        expect(result.termBucket).toBe("5yr");
      }
    });

    it("should assign 10yr bucket for CMBS loans on standard properties", () => {
      const features = createMockFeatures({
        propertyTypeCategory: "retail",
        lenderCategory: "cmbs",
        loanAmount: 15_000_000,
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.termBucket).toMatch(/7yr|10yr/);
    });
  });

  describe("Reasoning Output", () => {
    it("should provide meaningful reasoning", () => {
      const features = createMockFeatures({
        propertyTypeCategory: "multifamily",
        lenderCategory: "lifeco",
        loanAmount: 20_000_000,
      });
      const result = estimateTermByIndustryStandard(features);
      
      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning.length).toBeGreaterThan(50);
      expect(result.reasoning).toContain(".");
    });
  });
});

describe("calculatePredictedMaturityDate", () => {
  it("should calculate correct maturity date", () => {
    const recordingDate = new Date("2020-01-15");
    const termMonths = 120;
    
    const result = calculatePredictedMaturityDate(recordingDate, termMonths);
    
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2030);
    expect(result!.getMonth()).toBe(0);
  });

  it("should return null for null recording date", () => {
    const result = calculatePredictedMaturityDate(null, 120);
    expect(result).toBeNull();
  });

  it("should return null for zero or negative term", () => {
    const recordingDate = new Date("2020-01-15");
    
    expect(calculatePredictedMaturityDate(recordingDate, 0)).toBeNull();
    expect(calculatePredictedMaturityDate(recordingDate, -12)).toBeNull();
  });

  it("should handle year-end calculations correctly", () => {
    const recordingDate = new Date("2020-11-15");
    const termMonths = 84;
    
    const result = calculatePredictedMaturityDate(recordingDate, termMonths);
    
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2027);
  });
});

describe("getTermBucketExplanation", () => {
  it("should return explanations for all term buckets", () => {
    const buckets = ["5yr", "7yr", "10yr", "15yr", "20yr", "other"] as const;
    
    for (const bucket of buckets) {
      const explanation = getTermBucketExplanation(bucket);
      expect(explanation).toBeTruthy();
      expect(explanation.length).toBeGreaterThan(20);
    }
  });
});

describe("batchEstimateTerms", () => {
  it("should process multiple features", () => {
    const featuresList = [
      createMockFeatures({ propertyTypeCategory: "office" }),
      createMockFeatures({ propertyTypeCategory: "retail" }),
      createMockFeatures({ propertyTypeCategory: "industrial" }),
    ];
    
    const results = batchEstimateTerms(featuresList);
    
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.predictedTermMonths).toBeGreaterThan(0);
      expect(result.termBucket).toBeTruthy();
      expect(result.confidenceScore).toBeGreaterThan(0);
    }
  });

  it("should handle empty array", () => {
    const results = batchEstimateTerms([]);
    expect(results).toHaveLength(0);
  });
});

describe("Real-world Scenarios", () => {
  it("Scenario: Class A office building with CMBS financing", () => {
    const features = createMockFeatures({
      propertyTypeCategory: "office",
      lenderCategory: "cmbs",
      loanAmount: 50_000_000,
      propertyValue: 75_000_000,
      loanToValueRatio: 0.67,
    });
    
    const result = estimateTermByIndustryStandard(features);
    
    expect(result.predictedTermMonths).toBe(120);
    expect(result.termBucket).toBe("10yr");
    expect(result.confidenceScore).toBeGreaterThan(0.5);
  });

  it("Scenario: Small retail strip with local bank financing", () => {
    const features = createMockFeatures({
      propertyTypeCategory: "retail",
      lenderCategory: "bank",
      loanAmount: 1_200_000,
      propertyValue: 1_800_000,
      loanToValueRatio: 0.67,
    });
    
    const result = estimateTermByIndustryStandard(features);
    
    expect(result.predictedTermMonths).toBeLessThanOrEqual(84);
    expect(result.termBucket).toMatch(/5yr|7yr/);
  });

  it("Scenario: Large multifamily with HUD/FHA financing", () => {
    const features = createMockFeatures({
      propertyTypeCategory: "multifamily",
      lenderCategory: "government",
      loanAmount: 30_000_000,
      propertyValue: 45_000_000,
      loanToValueRatio: 0.67,
    });
    
    const result = estimateTermByIndustryStandard(features);
    
    expect(result.predictedTermMonths).toBeGreaterThanOrEqual(120);
    expect(result.termBucket).toMatch(/10yr|15yr|20yr/);
    expect(result.confidenceScore).toBeGreaterThan(0.5);
  });

  it("Scenario: Bridge loan for repositioning", () => {
    const features = createMockFeatures({
      propertyTypeCategory: "office",
      lenderCategory: "private_lender",
      loanAmount: 8_000_000,
      propertyValue: 12_000_000,
      loanToValueRatio: 0.67,
    });
    
    const result = estimateTermByIndustryStandard(features);
    
    expect(result.predictedTermMonths).toBeLessThanOrEqual(60);
    expect(result.termBucket).toBe("5yr");
  });

  it("Scenario: Industrial warehouse with life company financing", () => {
    const features = createMockFeatures({
      propertyTypeCategory: "industrial",
      lenderCategory: "lifeco",
      loanAmount: 15_000_000,
      propertyValue: 22_000_000,
      loanToValueRatio: 0.68,
    });
    
    const result = estimateTermByIndustryStandard(features);
    
    expect(result.predictedTermMonths).toBeGreaterThanOrEqual(84);
    expect(result.termBucket).toMatch(/7yr|10yr/);
  });
});
