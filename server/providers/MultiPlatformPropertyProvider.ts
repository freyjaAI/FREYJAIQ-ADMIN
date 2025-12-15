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
