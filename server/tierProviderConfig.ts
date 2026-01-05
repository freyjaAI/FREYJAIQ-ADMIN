/**
 * Tier-Based Provider Configuration
 * 
 * Defines provider sequences for each subscription tier.
 * Provider order matters - cheaper/free providers first, expensive providers as fallback.
 * Waterfall logic stops calling additional providers once sufficient data is found.
 */

import { Tier } from "@shared/schema";

// Re-export Tier for consumers
export { Tier };

export type ProviderCategory = 
  | 'propertyOwnership'    // Property and ownership lookup
  | 'contactEnrichment'    // Contact info (phones, emails)
  | 'addressValidation'    // Address normalization/validation
  | 'aiResearch';          // AI-powered research (LLC unmasking, etc.)

export interface ProviderConfig {
  name: string;
  key: string;                    // Internal key for provider lookup
  costPerCall: number;            // Estimated USD cost
  isRequired?: boolean;           // If true, always call even if previous providers succeeded
  minConfidence?: number;         // Minimum confidence threshold to consider "sufficient"
  stopOnSuccess?: boolean;        // If true, stop waterfall when this provider returns data
}

export interface TierProviderSequence {
  tierId?: string;
  tierName: string;
  propertyOwnershipProviders: ProviderConfig[];
  contactEnrichmentProviders: ProviderConfig[];
  addressValidationProviders: ProviderConfig[];
  aiResearchProviders: ProviderConfig[];
}

export interface WaterfallResult<T> {
  data: T | null;
  providersUsed: string[];
  stopped: boolean;
  reason?: string;
}

export interface SufficiencyCheck {
  hasOwnership?: boolean;
  ownerCount?: number;
  hasContacts?: boolean;
  contactConfidence?: number;
  hasAddress?: boolean;
}

const TIER_1_CONFIG: TierProviderSequence = {
  tierName: "Tier 1",
  
  propertyOwnershipProviders: [
    {
      name: "HomeHarvest",
      key: "homeharvest",
      costPerCall: 0,
      stopOnSuccess: true,
    },
    {
      name: "RealEstateAPI",
      key: "realestateapi",
      costPerCall: 0.04,
      stopOnSuccess: true,
    },
    {
      name: "SEC EDGAR",
      key: "sec_edgar",
      costPerCall: 0,
      stopOnSuccess: false,
    },
    {
      name: "ATTOM",
      key: "attom",
      costPerCall: 0.08,
      stopOnSuccess: true,
    },
    {
      name: "OpenCorporates",
      key: "opencorporates",
      costPerCall: 0.15,
      stopOnSuccess: true,
    },
  ],

  contactEnrichmentProviders: [
    {
      name: "Apify Skip Trace",
      key: "apify_skip_trace",
      costPerCall: 0.03,
      minConfidence: 70,
      stopOnSuccess: true,
    },
    {
      name: "Data Axle",
      key: "dataaxle",
      costPerCall: 0.05,
      minConfidence: 60,
      stopOnSuccess: true,
    },
    {
      name: "A-Leads",
      key: "aleads",
      costPerCall: 0.06,
      minConfidence: 50,
      stopOnSuccess: true,
    },
    {
      name: "Pacific East",
      key: "pacificeast",
      costPerCall: 0.04,
      minConfidence: 50,
      stopOnSuccess: true,
    },
  ],

  addressValidationProviders: [
    {
      name: "USPS",
      key: "usps",
      costPerCall: 0,
      stopOnSuccess: true,
    },
    {
      name: "Google Address Validation",
      key: "google_address",
      costPerCall: 0.005,
      stopOnSuccess: true,
    },
  ],

  aiResearchProviders: [
    {
      name: "Gemini Deep Research",
      key: "gemini",
      costPerCall: 0.002,
      stopOnSuccess: true,
    },
    {
      name: "Perplexity Sonar",
      key: "perplexity",
      costPerCall: 0.05,
      stopOnSuccess: true,
    },
    {
      name: "OpenAI",
      key: "openai",
      costPerCall: 0.01,
      stopOnSuccess: true,
    },
  ],
};

const TIER_2_CONFIG: TierProviderSequence = {
  tierName: "Tier 2",
  propertyOwnershipProviders: [
    {
      name: "HomeHarvest",
      key: "homeharvest",
      costPerCall: 0,
      stopOnSuccess: true,
    },
    {
      name: "ATTOM",
      key: "attom",
      costPerCall: 0.08,
      stopOnSuccess: true,
    },
  ],
  
  contactEnrichmentProviders: [
    {
      name: "Apify Skip Trace",
      key: "apify_skip_trace",
      costPerCall: 0.03,
      minConfidence: 70,
      stopOnSuccess: true,
    },
    {
      name: "Data Axle",
      key: "dataaxle",
      costPerCall: 0.05,
      minConfidence: 60,
      stopOnSuccess: true,
    },
  ],
  
  addressValidationProviders: [
    {
      name: "USPS",
      key: "usps",
      costPerCall: 0,
      stopOnSuccess: true,
    },
  ],
  
  aiResearchProviders: [
    {
      name: "OpenAI",
      key: "openai",
      costPerCall: 0.01,
      stopOnSuccess: true,
    },
  ],
};

const DEFAULT_CONFIG: TierProviderSequence = {
  tierName: "Default",
  propertyOwnershipProviders: [
    {
      name: "HomeHarvest",
      key: "homeharvest",
      costPerCall: 0,
      stopOnSuccess: true,
    },
    {
      name: "ATTOM",
      key: "attom",
      costPerCall: 0.08,
      stopOnSuccess: true,
    },
  ],
  
  contactEnrichmentProviders: [
    {
      name: "Apify Skip Trace",
      key: "apify_skip_trace",
      costPerCall: 0.03,
      minConfidence: 70,
      stopOnSuccess: true,
    },
  ],
  
  addressValidationProviders: [
    {
      name: "USPS",
      key: "usps",
      costPerCall: 0,
      stopOnSuccess: true,
    },
  ],
  
  aiResearchProviders: [
    {
      name: "OpenAI",
      key: "openai",
      costPerCall: 0.01,
      stopOnSuccess: true,
    },
  ],
};

const TIER_CONFIGS: Record<string, TierProviderSequence> = {
  "tier_1": TIER_1_CONFIG,
  "tier_2": TIER_2_CONFIG,
  "default": DEFAULT_CONFIG,
};

export function getProvidersForTier(tier: Tier | null | undefined): TierProviderSequence {
  if (!tier) {
    console.log("[TierProviderConfig] No tier provided, using default config");
    return DEFAULT_CONFIG;
  }
  
  const tierNameLower = tier.name.toLowerCase().replace(/\s+/g, '_');
  const config = TIER_CONFIGS[tierNameLower] || TIER_CONFIGS[tier.id] || DEFAULT_CONFIG;
  
  console.log(`[TierProviderConfig] Using config for tier: ${tier.name}`);
  return config;
}

export function getProviderSequence(
  tier: Tier | null | undefined,
  category: ProviderCategory
): ProviderConfig[] {
  const config = getProvidersForTier(tier);
  
  switch (category) {
    case 'propertyOwnership':
      return config.propertyOwnershipProviders;
    case 'contactEnrichment':
      return config.contactEnrichmentProviders;
    case 'addressValidation':
      return config.addressValidationProviders;
    case 'aiResearch':
      return config.aiResearchProviders;
    default:
      console.warn(`[TierProviderConfig] Unknown category: ${category}`);
      return [];
  }
}

export function checkOwnershipSufficiency(result: {
  owners?: Array<{ name: string }>;
  ownerName?: string;
} | null): boolean {
  if (!result) return false;
  
  if (result.owners && result.owners.length > 0) {
    return true;
  }
  
  if (result.ownerName && result.ownerName.trim().length > 0) {
    return true;
  }
  
  return false;
}

export function checkContactSufficiency(
  contacts: Array<{
    email?: string | null;
    phone?: string | null;
    confidence?: number;
  }> | null,
  minConfidence: number = 50
): boolean {
  if (!contacts || contacts.length === 0) return false;
  
  const hasQualifiedContact = contacts.some(c => {
    const hasContactInfo = !!(c.email || c.phone);
    const meetsConfidence = (c.confidence ?? 100) >= minConfidence;
    return hasContactInfo && meetsConfidence;
  });
  
  return hasQualifiedContact;
}

export function checkAddressSufficiency(result: {
  isValid?: boolean;
  normalizedAddress?: string;
  standardizedAddress?: string;
} | null): boolean {
  if (!result) return false;
  
  return !!(result.isValid || result.normalizedAddress || result.standardizedAddress);
}

export async function executeWaterfallProviders<T>(
  providers: ProviderConfig[],
  executeFn: (provider: ProviderConfig) => Promise<T | null>,
  checkSufficiency: (result: T | null) => boolean
): Promise<WaterfallResult<T>> {
  const providersUsed: string[] = [];
  let lastResult: T | null = null;
  
  for (const provider of providers) {
    try {
      console.log(`[Waterfall] Trying provider: ${provider.name} (cost: $${provider.costPerCall})`);
      providersUsed.push(provider.key);
      
      const result = await executeFn(provider);
      
      if (result) {
        lastResult = result;
        
        if (checkSufficiency(result)) {
          console.log(`[Waterfall] Sufficient data from ${provider.name}, stopping`);
          
          if (provider.stopOnSuccess) {
            return {
              data: result,
              providersUsed,
              stopped: true,
              reason: `Sufficient data from ${provider.name}`,
            };
          }
        }
      }
    } catch (error) {
      console.error(`[Waterfall] Error from ${provider.name}:`, error);
    }
  }
  
  return {
    data: lastResult,
    providersUsed,
    stopped: false,
    reason: "All providers attempted",
  };
}

export function shouldCallNextProvider(
  currentResult: any,
  nextProvider: ProviderConfig,
  category: ProviderCategory
): boolean {
  switch (category) {
    case 'propertyOwnership':
      return !checkOwnershipSufficiency(currentResult);
    
    case 'contactEnrichment':
      if (!currentResult) return true;
      return !checkContactSufficiency(
        Array.isArray(currentResult) ? currentResult : [currentResult],
        nextProvider.minConfidence
      );
    
    case 'addressValidation':
      return !checkAddressSufficiency(currentResult);
    
    case 'aiResearch':
      return !currentResult;
    
    default:
      return true;
  }
}

export function isLlcName(name: string): boolean {
  const llcPatterns = [
    /\bllc\b/i,
    /\bl\.?l\.?c\.?\b/i,
    /\blimited\s+liability\s+company\b/i,
    /\binc\.?\b/i,
    /\bcorp\.?\b/i,
    /\bcorporation\b/i,
    /\blp\b/i,
    /\bl\.?p\.?\b/i,
    /\bltd\.?\b/i,
    /\bholdings?\b/i,
    /\bproperties\b/i,
    /\binvestments?\b/i,
    /\bpartnership\b/i,
    /\btrust\b/i,
    /\bestate\b/i,
  ];
  
  return llcPatterns.some(pattern => pattern.test(name));
}

export function shouldAttemptLlcUnmasking(ownerName: string | null | undefined): boolean {
  if (!ownerName) return false;
  return isLlcName(ownerName);
}
