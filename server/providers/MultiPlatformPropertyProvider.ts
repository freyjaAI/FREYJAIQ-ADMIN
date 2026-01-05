/**
 * Multi-Platform Property Scraper Provider
 * 
 * Consolidates property data from multiple sources:
 * - HomeHarvest (Realtor.com) - Primary source, already integrated
 * - Zillow (via API or scraping) - Secondary source
 * - Walk Score - Location-based scores
 * 
 * Follows patterns from mominurr/Real-Estate-Web-Scraping for:
 * - Property data extraction (address, price, beds, baths, sqft)
 * - Agent data extraction (name, agency, contact)
 * - Location scores (walk score, transit score)
 */

import { lookupProperty as homeHarvestLookup, searchProperties as homeHarvestSearch } from "./HomeHarvestProvider";
import type { HomeHarvestPropertyData, HomeHarvestSearchResult } from "./HomeHarvestProvider";
import { Tier } from "@shared/schema";
import { 
  getProviderSequence, 
  checkOwnershipSufficiency,
  ProviderConfig,
  shouldAttemptLlcUnmasking
} from "../tierProviderConfig";
import { trackProviderCall } from "../providerConfig";

export interface PropertyData {
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    fullAddress: string;
  };
  property: {
    propertyType: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    lotSqft: number | null;
    yearBuilt: number | null;
    stories: number | null;
  };
  pricing: {
    listPrice: number | null;
    soldPrice: number | null;
    estimatedValue: number | null;
    pricePerSqft: number | null;
  };
  listing: {
    status: string;
    listDate: string | null;
    soldDate: string | null;
    daysOnMarket: number | null;
    mlsId: string | null;
  };
  agent?: {
    name: string | null;
    phone: string | null;
    email: string | null;
    agency: string | null;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    walkScore?: number | null;
    transitScore?: number | null;
    bikeScore?: number | null;
  };
  source: string;
  sourceUrl: string | null;
}

export interface MultiPlatformResult {
  success: boolean;
  property: PropertyData | null;
  sources: string[];
  errors?: string[];
}

export interface MultiPlatformSearchResult {
  success: boolean;
  properties: PropertyData[];
  totalCount: number;
  sources: string[];
  errors?: string[];
}

/**
 * Convert HomeHarvest data to our standard format
 */
function fromHomeHarvest(data: HomeHarvestPropertyData): PropertyData {
  return {
    address: {
      street: data.address.street,
      city: data.address.city,
      state: data.address.state,
      zipCode: data.address.zipCode,
      fullAddress: data.address.fullAddress,
    },
    property: {
      propertyType: data.property.propertyType,
      beds: data.property.beds,
      baths: data.property.baths,
      sqft: data.property.sqft,
      lotSqft: data.property.lotSqft,
      yearBuilt: data.property.yearBuilt,
      stories: data.property.stories,
    },
    pricing: {
      listPrice: data.pricing.listPrice,
      soldPrice: data.pricing.soldPrice,
      estimatedValue: data.pricing.estimatedValue,
      pricePerSqft: data.pricing.pricePerSqft,
    },
    listing: {
      status: data.listing.status,
      listDate: data.listing.listDate,
      soldDate: data.listing.soldDate || data.listing.lastSoldDate,
      daysOnMarket: data.listing.daysOnMls,
      mlsId: data.listing.mlsNumber,
    },
    agent: data.agent.name ? {
      name: data.agent.name,
      phone: data.agent.phone,
      email: data.agent.email,
      agency: data.broker.name,
    } : undefined,
    location: {
      latitude: data.location.latitude,
      longitude: data.location.longitude,
    },
    source: "HomeHarvest/Realtor.com",
    sourceUrl: data.propertyUrl,
  };
}

/**
 * Lookup property from multiple platforms with fallback
 */
export async function lookupProperty(address: string): Promise<MultiPlatformResult> {
  console.log(`[MultiPlatform] Looking up property: ${address}`);
  
  const sources: string[] = [];
  const errors: string[] = [];
  
  // Try HomeHarvest (Realtor.com) first
  try {
    const hhResult = await homeHarvestLookup(address);
    if (hhResult.success && hhResult.data) {
      sources.push("HomeHarvest/Realtor.com");
      console.log(`[MultiPlatform] Found via HomeHarvest`);
      return {
        success: true,
        property: fromHomeHarvest(hhResult.data),
        sources,
      };
    }
    if (hhResult.error) {
      errors.push(`HomeHarvest: ${hhResult.error}`);
    }
  } catch (error) {
    errors.push(`HomeHarvest: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Future: Add Zillow, Redfin, etc. as additional sources here
  // Each would follow the same pattern:
  // 1. Try the source
  // 2. If successful, return standardized PropertyData
  // 3. If failed, add to errors and try next source
  
  console.log(`[MultiPlatform] No property found from any source`);
  return {
    success: false,
    property: null,
    sources,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export interface TierAwarePropertyResult extends MultiPlatformResult {
  ownerName?: string | null;
  ownerType?: 'person' | 'llc' | 'unknown';
  needsLlcUnmasking?: boolean;
  providersUsed: string[];
}

/**
 * Tier-aware property lookup with waterfall logic
 * Uses the provider sequence defined for the user's tier
 * Stops calling more expensive providers once sufficient data is found
 */
export async function lookupPropertyWithTier(
  address: string,
  tier: Tier | null | undefined
): Promise<TierAwarePropertyResult> {
  console.log(`[MultiPlatform] Tier-aware lookup for: ${address}`);
  
  const providerSequence = getProviderSequence(tier, 'propertyOwnership');
  const sources: string[] = [];
  const errors: string[] = [];
  const providersUsed: string[] = [];
  
  let bestResult: PropertyData | null = null;
  let ownerName: string | null = null;
  let ownerType: 'person' | 'llc' | 'unknown' = 'unknown';
  
  for (const provider of providerSequence) {
    console.log(`[MultiPlatform] Trying provider: ${provider.name} (cost: $${provider.costPerCall})`);
    providersUsed.push(provider.key);
    
    try {
      let result: { property: PropertyData | null; owner?: string } | null = null;
      
      switch (provider.key) {
        case 'home_harvest':
        case 'homeharvest':
          // HomeHarvest - FREE property data
          const hhResult = await homeHarvestLookup(address);
          if (hhResult.success && hhResult.data) {
            result = { property: fromHomeHarvest(hhResult.data) };
            trackProviderCall('home_harvest', false);
          }
          break;
          
        case 'real_estate_api':
        case 'realestateapi':
          // RealEstateAPI - FREE property ownership data
          result = await tryRealEstateApiProvider(address);
          if (result) trackProviderCall('real_estate_api', false);
          break;
          
        case 'sec_edgar':
          // SEC EDGAR - FREE (more useful for LLC enrichment, skip for property search)
          continue;
          
        case 'attom':
          // ATTOM - $0.05/call - USE AS FALLBACK ONLY
          result = await tryAttomProvider(address);
          if (result) trackProviderCall('attom', false);
          break;
          
        case 'open_corporates':
        case 'opencorporates':
          // OpenCorporates - $0.10/call - MOST EXPENSIVE, use for LLC unmasking only
          if (ownerName && shouldAttemptLlcUnmasking(ownerName)) {
            console.log(`[MultiPlatform] LLC detected: ${ownerName}, would call OpenCorporates`);
          }
          continue;
          
        default:
          console.log(`[MultiPlatform] Unknown provider: ${provider.key}`);
          continue;
      }
      
      if (result?.property) {
        sources.push(provider.name);
        bestResult = result.property;
        
        if (result.owner) {
          ownerName = result.owner;
          ownerType = shouldAttemptLlcUnmasking(result.owner) ? 'llc' : 'person';
        }
        
        const sufficiencyCheck = { ownerName: result.owner };
        if (checkOwnershipSufficiency(sufficiencyCheck) && provider.stopOnSuccess) {
          console.log(`[MultiPlatform] Sufficient data from ${provider.name}, stopping waterfall`);
          break;
        }
      }
    } catch (error) {
      const errorMsg = `${provider.name}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[MultiPlatform] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  
  return {
    success: bestResult !== null,
    property: bestResult,
    sources,
    errors: errors.length > 0 ? errors : undefined,
    ownerName,
    ownerType,
    needsLlcUnmasking: ownerType === 'llc',
    providersUsed,
  };
}

async function tryAttomProvider(address: string): Promise<{ property: PropertyData | null; owner?: string } | null> {
  try {
    const { dataProviders } = await import("../dataProviders");
    
    const result = await dataProviders.searchPropertyByAddress(address);
    if (!result) return null;
    
    const lastSale = result.sales && result.sales.length > 0 ? result.sales[0] : null;
    
    return {
      property: {
        address: {
          street: result.address.line1 || '',
          city: result.address.city || '',
          state: result.address.state || '',
          zipCode: result.address.zip || '',
          fullAddress: address,
        },
        property: {
          propertyType: result.building?.propertyType || '',
          beds: result.building?.bedrooms || null,
          baths: result.building?.bathrooms || null,
          sqft: result.building?.sqft || null,
          lotSqft: null,
          yearBuilt: result.building?.yearBuilt || null,
          stories: null,
        },
        pricing: {
          listPrice: null,
          soldPrice: lastSale?.saleAmount || null,
          estimatedValue: result.avm?.value || result.assessment?.marketValue || null,
          pricePerSqft: null,
        },
        listing: {
          status: '',
          listDate: null,
          soldDate: lastSale?.saleDate || null,
          daysOnMarket: null,
          mlsId: null,
        },
        location: {
          latitude: null,
          longitude: null,
        },
        source: "ATTOM",
        sourceUrl: null,
      },
      owner: result.ownership?.ownerName || undefined,
    };
  } catch (error) {
    console.error("[MultiPlatform] ATTOM error:", error);
    return null;
  }
}

async function tryRealEstateApiProvider(address: string): Promise<{ property: PropertyData | null; owner?: string } | null> {
  try {
    const { isConfigured } = await import("./RealEstateApiProvider");
    if (!isConfigured()) return null;
    
    return null;
  } catch (error) {
    console.error("[MultiPlatform] RealEstateAPI error:", error);
    return null;
  }
}

/**
 * Search properties in a location from multiple platforms
 */
export async function searchProperties(
  location: string,
  listingType: "for_sale" | "for_rent" | "sold" | "pending" = "for_sale",
  limit: number = 10
): Promise<MultiPlatformSearchResult> {
  console.log(`[MultiPlatform] Searching properties in: ${location}`);
  
  const sources: string[] = [];
  const errors: string[] = [];
  const allProperties: PropertyData[] = [];
  
  // Try HomeHarvest first
  try {
    const hhResult = await homeHarvestSearch(location, listingType, limit);
    if (hhResult.success && hhResult.data.length > 0) {
      sources.push("HomeHarvest/Realtor.com");
      
      // Convert to standard format (search results are simplified)
      for (const item of hhResult.data) {
        allProperties.push({
          address: {
            street: item.street,
            city: item.city,
            state: item.state,
            zipCode: item.zipCode,
            fullAddress: item.address,
          },
          property: {
            propertyType: item.propertyType,
            beds: item.beds,
            baths: item.baths,
            sqft: item.sqft,
            lotSqft: null,
            yearBuilt: item.yearBuilt,
            stories: null,
          },
          pricing: {
            listPrice: item.listPrice,
            soldPrice: null,
            estimatedValue: null,
            pricePerSqft: item.sqft && item.listPrice ? Math.round(item.listPrice / item.sqft) : null,
          },
          listing: {
            status: item.status,
            listDate: null,
            soldDate: null,
            daysOnMarket: null,
            mlsId: null,
          },
          location: {
            latitude: item.latitude,
            longitude: item.longitude,
          },
          source: "HomeHarvest/Realtor.com",
          sourceUrl: null,
        });
      }
    }
    if (hhResult.error) {
      errors.push(`HomeHarvest: ${hhResult.error}`);
    }
  } catch (error) {
    errors.push(`HomeHarvest: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log(`[MultiPlatform] Found ${allProperties.length} properties from ${sources.length} sources`);
  
  return {
    success: allProperties.length > 0,
    properties: allProperties.slice(0, limit),
    totalCount: allProperties.length,
    sources,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get Walk Score for a property location
 * Note: Requires Walk Score API key (WALKSCORE_API_KEY env var)
 */
export async function getLocationScores(
  address: string,
  lat?: number,
  lon?: number
): Promise<{
  walkScore: number | null;
  transitScore: number | null;
  bikeScore: number | null;
} | null> {
  const apiKey = process.env.WALKSCORE_API_KEY;
  if (!apiKey) {
    console.log("[MultiPlatform] Walk Score API key not configured");
    return null;
  }
  
  try {
    const params = new URLSearchParams({
      format: "json",
      address: address,
      wsapikey: apiKey,
      transit: "1",
      bike: "1",
    });
    
    if (lat && lon) {
      params.set("lat", String(lat));
      params.set("lon", String(lon));
    }
    
    const response = await fetch(`https://api.walkscore.com/score?${params}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    return {
      walkScore: data.walkscore ?? null,
      transitScore: data.transit?.score ?? null,
      bikeScore: data.bike?.score ?? null,
    };
  } catch (error) {
    console.error("[MultiPlatform] Walk Score API error:", error);
    return null;
  }
}

/**
 * Enhanced property lookup with location scores
 */
export async function lookupPropertyWithScores(address: string): Promise<MultiPlatformResult> {
  const result = await lookupProperty(address);
  
  if (result.success && result.property) {
    // Try to enrich with location scores
    const scores = await getLocationScores(
      result.property.address.fullAddress,
      result.property.location.latitude ?? undefined,
      result.property.location.longitude ?? undefined
    );
    
    if (scores) {
      result.property.location.walkScore = scores.walkScore;
      result.property.location.transitScore = scores.transitScore;
      result.property.location.bikeScore = scores.bikeScore;
      result.sources.push("WalkScore");
    }
  }
  
  return result;
}

/**
 * Check which platforms are available
 */
export function getAvailablePlatforms(): string[] {
  const platforms: string[] = ["HomeHarvest/Realtor.com"];
  
  if (process.env.WALKSCORE_API_KEY) {
    platforms.push("WalkScore");
  }
  
  // Future platforms would be added here based on their API keys
  // if (process.env.ZILLOW_API_KEY) platforms.push("Zillow");
  
  return platforms;
}
