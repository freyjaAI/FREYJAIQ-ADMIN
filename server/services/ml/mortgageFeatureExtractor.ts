/**
 * Mortgage Feature Extractor
 * 
 * Transforms ATTOM mortgage data into ML-ready features for
 * mortgage maturity prediction models.
 */

import type { AttomMortgageResult, MortgageRecord } from "../../providers/AttomMortgageProvider";

export interface PropertyData {
  attomId?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
  };
  propertyType?: string;
  propertyUse?: string;
  assessedValue?: number;
  marketValue?: number;
  sqft?: number;
  yearBuilt?: number;
  msa?: string;
}

export interface MarketIndicators {
  msa: string;
  state: string;
  zipCode: string;
}

export interface MortgageFeatures {
  recordingDate: Date | null;
  loanAmount: number;
  propertyValue: number;
  loanToValueRatio: number;
  propertyType: string;
  propertyTypeCategory: PropertyTypeCategory;
  lenderName: string;
  lenderCategory: LenderCategory;
  loanType: string;
  marketIndicators: MarketIndicators;
  daysSinceRecording: number;
  hasRefinanceHistory: boolean;
  previousLoanCount: number;
  interestRate: number | null;
  interestRateType: string;
  termMonths: number | null;
  maturityDate: Date | null;
}

export type PropertyTypeCategory = "office" | "retail" | "industrial" | "multifamily" | "hospitality" | "mixed_use" | "land" | "other" | "unknown";
export type LenderCategory = "bank" | "cmbs" | "lifeco" | "credit_union" | "private_lender" | "government" | "other" | "unknown";

const MAJOR_BANKS = [
  "wells fargo", "bank of america", "jpmorgan", "chase", "citibank", "citi",
  "us bank", "pnc", "truist", "capital one", "td bank", "fifth third",
  "huntington", "regions", "m&t bank", "citizens bank", "keybank", "bmo",
  "santander", "comerica", "zions", "first republic", "silicon valley",
  "signature bank", "new york community", "western alliance", "east west",
  "umpqua", "wintrust", "glacier", "banner bank", "columbia bank",
  "first national", "national bank", "state bank", "community bank",
  "peoples bank", "union bank", "commerce bank", "firstbank", "webster bank"
];

const CMBS_LENDERS = [
  "cmbs", "commercial mortgage", "mortgage trust", "reit", "starwood",
  "blackstone", "brookfield", "apollo", "ares", "carlyle", "kkr",
  "cerberus", "lone star", "goldman sachs", "morgan stanley", "deutsche bank",
  "credit suisse", "barclays", "societe generale", "natixis", "citigroup",
  "ubs", "nomura", "rbs", "cantor", "ladder capital", "arbor", "ready capital",
  "berkadia", "walker dunlop", "greystone", "newmark", "cbre capital",
  "jll capital", "cushman", "eastdil"
];

const LIFE_INSURANCE_COMPANIES = [
  "prudential", "metlife", "new york life", "northwestern mutual",
  "mass mutual", "john hancock", "principal", "lincoln financial",
  "nationwide", "aig", "aflac", "transamerica", "unum", "cigna",
  "voya", "allianz", "axa", "aegon", "sun life", "manulife",
  "great-west", "pacific life", "protective", "american general",
  "penn mutual", "guardian", "mutual of omaha", "securian"
];

const CREDIT_UNIONS = [
  "credit union", "cu", "federal credit", "employees credit",
  "navy federal", "pentagon federal", "state employees", "teachers credit"
];

const GOVERNMENT_LENDERS = [
  "fannie mae", "freddie mac", "fha", "hud", "usda", "va loan",
  "ginnie mae", "federal home loan", "fhlb", "fhlmc", "fnma",
  "small business administration", "sba"
];

const PROPERTY_TYPE_MAPPINGS: Record<string, PropertyTypeCategory> = {
  "office": "office",
  "off": "office",
  "commercial office": "office",
  "professional": "office",
  "medical office": "office",
  "retail": "retail",
  "rtl": "retail",
  "shopping": "retail",
  "store": "retail",
  "mall": "retail",
  "strip center": "retail",
  "restaurant": "retail",
  "industrial": "industrial",
  "ind": "industrial",
  "warehouse": "industrial",
  "manufacturing": "industrial",
  "distribution": "industrial",
  "flex": "industrial",
  "light industrial": "industrial",
  "heavy industrial": "industrial",
  "multifamily": "multifamily",
  "mf": "multifamily",
  "apartment": "multifamily",
  "multi-family": "multifamily",
  "residential income": "multifamily",
  "duplex": "multifamily",
  "triplex": "multifamily",
  "quadplex": "multifamily",
  "condo": "multifamily",
  "hotel": "hospitality",
  "hospitality": "hospitality",
  "motel": "hospitality",
  "resort": "hospitality",
  "lodging": "hospitality",
  "mixed": "mixed_use",
  "mixed use": "mixed_use",
  "mixed-use": "mixed_use",
  "land": "land",
  "vacant": "land",
  "development": "land",
  "agricultural": "land",
  "farm": "land",
};

/**
 * Normalize lender name to a category
 */
export function normalizeLenderCategory(lenderName: string | null | undefined): LenderCategory {
  if (!lenderName) return "unknown";
  
  const normalized = lenderName.toLowerCase().trim();
  
  if (GOVERNMENT_LENDERS.some(g => normalized.includes(g))) {
    return "government";
  }
  
  if (LIFE_INSURANCE_COMPANIES.some(l => normalized.includes(l))) {
    return "lifeco";
  }
  
  if (CMBS_LENDERS.some(c => normalized.includes(c))) {
    return "cmbs";
  }
  
  if (CREDIT_UNIONS.some(c => normalized.includes(c))) {
    return "credit_union";
  }
  
  if (MAJOR_BANKS.some(b => normalized.includes(b))) {
    return "bank";
  }
  
  if (normalized.includes("bank") || normalized.includes("savings") || normalized.includes("trust")) {
    return "bank";
  }
  
  if (normalized.includes("capital") || normalized.includes("funding") || 
      normalized.includes("finance") || normalized.includes("lending")) {
    return "private_lender";
  }
  
  return "other";
}

/**
 * Normalize property type to standard category
 */
export function normalizePropertyType(rawPropertyType: string | null | undefined): PropertyTypeCategory {
  if (!rawPropertyType) return "unknown";
  
  const normalized = rawPropertyType.toLowerCase().trim();
  
  for (const [key, category] of Object.entries(PROPERTY_TYPE_MAPPINGS)) {
    if (normalized.includes(key)) {
      return category;
    }
  }
  
  if (normalized.includes("single") || normalized.includes("sfr") || 
      normalized.includes("residence") || normalized.includes("house")) {
    return "other";
  }
  
  return "other";
}

/**
 * Parse a date string into a Date object
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Calculate days since a given date
 */
function calculateDaysSince(date: Date | null): number {
  if (!date) return -1;
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract MSA from address data
 */
function extractMsa(propertyData: PropertyData | null | undefined): string {
  if (propertyData?.msa) return propertyData.msa;
  
  if (propertyData?.address?.city && propertyData?.address?.state) {
    return `${propertyData.address.city}, ${propertyData.address.state}`;
  }
  
  return "unknown";
}

/**
 * Extract ML-ready features from ATTOM mortgage data
 */
export function extractMortgageFeatures(
  attomData: AttomMortgageResult | null | undefined,
  propertyData: PropertyData | null | undefined,
  mortgageHistory: MortgageRecord[] = []
): MortgageFeatures {
  const mortgage = attomData?.currentMortgage;
  
  const recordingDate = parseDate(mortgage?.recordingDate || mortgage?.originationDate);
  const loanAmount = mortgage?.loanAmount || 0;
  
  const propertyValue = propertyData?.marketValue || 
                        propertyData?.assessedValue || 
                        0;
  
  const loanToValueRatio = propertyValue > 0 
    ? Math.min(loanAmount / propertyValue, 2)
    : 0;
  
  const rawPropertyType = attomData?.propertyType || 
                          propertyData?.propertyType || 
                          "";
  
  const hasRefinanceHistory = mortgageHistory.some(m => m.isRefinance) || 
                               mortgage?.isRefinance || 
                               false;
  
  const previousLoanCount = mortgageHistory.length;
  
  const maturityDate = parseDate(mortgage?.maturityDate || mortgage?.dueDate);
  
  return {
    recordingDate,
    loanAmount,
    propertyValue,
    loanToValueRatio,
    propertyType: rawPropertyType || "unknown",
    propertyTypeCategory: normalizePropertyType(rawPropertyType),
    lenderName: mortgage?.lenderName || mortgage?.lenderFullName || "unknown",
    lenderCategory: normalizeLenderCategory(mortgage?.lenderName || mortgage?.lenderFullName),
    loanType: mortgage?.loanType || mortgage?.loanTypeCode || "unknown",
    marketIndicators: {
      msa: extractMsa(propertyData),
      state: attomData?.address?.state || propertyData?.address?.state || "unknown",
      zipCode: attomData?.address?.zip || propertyData?.address?.zip || "unknown",
    },
    daysSinceRecording: calculateDaysSince(recordingDate),
    hasRefinanceHistory,
    previousLoanCount,
    interestRate: mortgage?.interestRate || null,
    interestRateType: mortgage?.interestRateType || "unknown",
    termMonths: mortgage?.termMonths || null,
    maturityDate,
  };
}

/**
 * Validate feature completeness for ML model input
 */
export function validateFeatures(features: MortgageFeatures): {
  isComplete: boolean;
  missingFields: string[];
  completenessScore: number;
} {
  const requiredFields: (keyof MortgageFeatures)[] = [
    "recordingDate",
    "loanAmount",
    "propertyValue",
    "lenderCategory",
    "propertyTypeCategory",
  ];
  
  const optionalFields: (keyof MortgageFeatures)[] = [
    "interestRate",
    "termMonths",
    "maturityDate",
  ];
  
  const missingFields: string[] = [];
  
  if (!features.recordingDate) missingFields.push("recordingDate");
  if (features.loanAmount <= 0) missingFields.push("loanAmount");
  if (features.propertyValue <= 0) missingFields.push("propertyValue");
  if (features.lenderCategory === "unknown") missingFields.push("lenderCategory");
  if (features.propertyTypeCategory === "unknown") missingFields.push("propertyTypeCategory");
  
  const optionalMissing: string[] = [];
  if (features.interestRate === null) optionalMissing.push("interestRate");
  if (features.termMonths === null) optionalMissing.push("termMonths");
  if (features.maturityDate === null) optionalMissing.push("maturityDate");
  
  const totalFields = requiredFields.length + optionalFields.length;
  const presentFields = totalFields - missingFields.length - optionalMissing.length;
  const completenessScore = presentFields / totalFields;
  
  return {
    isComplete: missingFields.length === 0,
    missingFields: [...missingFields, ...optionalMissing.map(f => `${f} (optional)`)],
    completenessScore,
  };
}

/**
 * Batch extract features from multiple properties
 */
export function batchExtractFeatures(
  items: Array<{
    attomData: AttomMortgageResult | null | undefined;
    propertyData: PropertyData | null | undefined;
    mortgageHistory?: MortgageRecord[];
  }>
): MortgageFeatures[] {
  return items.map(item => 
    extractMortgageFeatures(item.attomData, item.propertyData, item.mortgageHistory || [])
  );
}

/**
 * Convert features to a flat object for model input
 */
export function featuresToModelInput(features: MortgageFeatures): Record<string, number | string> {
  return {
    loan_amount: features.loanAmount,
    property_value: features.propertyValue,
    ltv_ratio: features.loanToValueRatio,
    property_type: features.propertyTypeCategory,
    lender_category: features.lenderCategory,
    loan_type: features.loanType,
    state: features.marketIndicators.state,
    zip_code: features.marketIndicators.zipCode,
    days_since_recording: features.daysSinceRecording,
    has_refinance_history: features.hasRefinanceHistory ? 1 : 0,
    previous_loan_count: features.previousLoanCount,
    interest_rate: features.interestRate ?? -1,
    interest_rate_type: features.interestRateType,
    term_months: features.termMonths ?? -1,
  };
}
