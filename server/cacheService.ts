/**
 * Cache Service
 * 
 * Provides intelligent caching for data provider responses with tiered TTL strategies.
 * Tracks cache hits/misses for cost savings analysis.
 */

import { cacheGet, cacheSet, cacheDel, getCacheStats } from './redisClient';
import { trackProviderCall } from './providerConfig';
import crypto from 'crypto';

// Cache key prefixes for different data types
export const CachePrefix = {
  LLC: 'llc:',
  PROPERTY: 'prop:',
  CONTACT: 'contact:',
  ADDRESS: 'addr:',
  PERSON: 'person:',
  SEC_EDGAR: 'sec:',
  DOSSIER: 'dossier:',
} as const;

// TTL strategies in seconds
export const CacheTTL = {
  // LLC/Entity data - relatively stable
  LLC_DEFAULT: 24 * 60 * 60,        // 24 hours
  LLC_PUBLIC_COMPANY: 72 * 60 * 60, // 72 hours for public filings (very stable)
  
  // Property data - can change more frequently
  PROPERTY_DEFAULT: 12 * 60 * 60,   // 12 hours
  PROPERTY_VALUATION: 4 * 60 * 60,  // 4 hours for volatile AVM data
  
  // Contact enrichment - moderate stability
  CONTACT_DEFAULT: 7 * 24 * 60 * 60, // 7 days for contact cards
  CONTACT_VALIDATION: 24 * 60 * 60,  // 24 hours for phone/email validation
  
  // Address validation - very stable
  ADDRESS_DEFAULT: 30 * 24 * 60 * 60, // 30 days (addresses rarely change)
  ADDRESS_NEGATIVE: 24 * 60 * 60,     // 24 hours for failed lookups
  
  // Person search - moderate
  PERSON_DEFAULT: 7 * 24 * 60 * 60,   // 7 days
  
  // SEC EDGAR - very stable public data
  SEC_COMPANY: 24 * 60 * 60,          // 24 hours
  SEC_TICKERS: 24 * 60 * 60,          // 24 hours for ticker list
  
  // Dossier data - aggregate cache
  DOSSIER_DEFAULT: 6 * 60 * 60,       // 6 hours for full dossiers
} as const;

// Cache metrics tracking
interface CacheMetrics {
  hits: number;
  misses: number;
  costSaved: number;
  lastReset: Date;
}

const metrics: Record<string, CacheMetrics> = {};

function initMetrics(provider: string): CacheMetrics {
  if (!metrics[provider]) {
    metrics[provider] = {
      hits: 0,
      misses: 0,
      costSaved: 0,
      lastReset: new Date(),
    };
  }
  return metrics[provider];
}

/**
 * Generate a consistent cache key from parameters
 */
export function generateCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  const normalizedParts = parts
    .filter(p => p !== undefined && p !== null && p !== '')
    .map(p => String(p).toLowerCase().trim().replace(/\s+/g, '_'));
  
  const keyBase = normalizedParts.join(':');
  
  // Use hash for very long keys
  if (keyBase.length > 100) {
    const hash = crypto.createHash('md5').update(keyBase).digest('hex');
    return `${prefix}${hash}`;
  }
  
  return `${prefix}${keyBase}`;
}

/**
 * Get cached result for a provider call
 * Returns null if not cached
 */
export async function getCachedResult<T>(
  provider: string,
  cacheKey: string,
  costPerCall: number = 0
): Promise<T | null> {
  try {
    const cached = await cacheGet(cacheKey);
    
    if (cached) {
      const metrics = initMetrics(provider);
      metrics.hits++;
      metrics.costSaved += costPerCall;
      
      // Track as cache hit in provider metrics
      trackProviderCall(provider, true);
      
      console.log(`[CACHE HIT] ${provider}: ${cacheKey.substring(0, 50)}... (saved $${costPerCall.toFixed(4)})`);
      
      return JSON.parse(cached) as T;
    }
    
    // Cache miss
    const m = initMetrics(provider);
    m.misses++;
    
    return null;
  } catch (error) {
    console.error(`[CACHE ERROR] Get failed for ${cacheKey}:`, (error as Error).message);
    return null;
  }
}

/**
 * Store result in cache
 */
export async function setCachedResult<T>(
  cacheKey: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const serialized = JSON.stringify(data);
    await cacheSet(cacheKey, serialized, ttlSeconds);
    console.log(`[CACHE SET] ${cacheKey.substring(0, 50)}... TTL: ${Math.round(ttlSeconds / 3600)}h`);
  } catch (error) {
    console.error(`[CACHE ERROR] Set failed for ${cacheKey}:`, (error as Error).message);
  }
}

/**
 * Invalidate a cache entry
 */
export async function invalidateCache(cacheKey: string): Promise<void> {
  try {
    await cacheDel(cacheKey);
    console.log(`[CACHE INVALIDATE] ${cacheKey}`);
  } catch (error) {
    console.error(`[CACHE ERROR] Invalidate failed for ${cacheKey}:`, (error as Error).message);
  }
}

/**
 * Wrapper for caching provider calls
 */
export async function withCache<T>(
  provider: string,
  cacheKey: string,
  ttlSeconds: number,
  costPerCall: number,
  fetchFn: () => Promise<T | null>
): Promise<T | null> {
  // Try cache first
  const cached = await getCachedResult<T>(provider, cacheKey, costPerCall);
  if (cached !== null) {
    return cached;
  }
  
  // Execute the fetch function
  const result = await fetchFn();
  
  // Cache successful results
  if (result !== null && result !== undefined) {
    await setCachedResult(cacheKey, result, ttlSeconds);
  }
  
  return result;
}

/**
 * Get cache metrics for all providers
 */
export function getCacheMetrics(): Record<string, CacheMetrics & { hitRate: number }> {
  const result: Record<string, CacheMetrics & { hitRate: number }> = {};
  
  for (const [provider, m] of Object.entries(metrics)) {
    const total = m.hits + m.misses;
    result[provider] = {
      ...m,
      hitRate: total > 0 ? (m.hits / total) * 100 : 0,
    };
  }
  
  return result;
}

/**
 * Get total cost savings across all providers
 */
export function getTotalCostSavings(): { 
  totalSaved: number; 
  totalHits: number; 
  totalMisses: number;
  overallHitRate: number;
} {
  let totalSaved = 0;
  let totalHits = 0;
  let totalMisses = 0;
  
  for (const m of Object.values(metrics)) {
    totalSaved += m.costSaved;
    totalHits += m.hits;
    totalMisses += m.misses;
  }
  
  const total = totalHits + totalMisses;
  
  return {
    totalSaved,
    totalHits,
    totalMisses,
    overallHitRate: total > 0 ? (totalHits / total) * 100 : 0,
  };
}

/**
 * Reset cache metrics
 */
export function resetCacheMetrics(): void {
  for (const provider of Object.keys(metrics)) {
    metrics[provider] = {
      hits: 0,
      misses: 0,
      costSaved: 0,
      lastReset: new Date(),
    };
  }
}

/**
 * Get combined cache statistics
 */
export async function getFullCacheStats() {
  const redisStats = await getCacheStats();
  const cacheMetrics = getCacheMetrics();
  const savings = getTotalCostSavings();
  
  return {
    storage: redisStats,
    metrics: cacheMetrics,
    savings,
  };
}
