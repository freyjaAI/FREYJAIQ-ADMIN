/**
 * Centralized Data Provider Configuration
 * 
 * This module manages:
 * - Provider pricing (cost per call/token)
 * - Provider priority ordering for cost-aware routing
 * - Usage metrics and cost tracking (persisted to database)
 * - Cache hit/miss statistics
 * 
 * All pricing can be overridden via environment variables for easy tuning.
 */

import { db } from "./db";
import { providerUsageMetrics } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { recordProviderSuccess, recordProviderError as healthRecordError } from "./providerHealthService";

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export interface ProviderPricing {
  name: string;
  costPerCall: number;        // USD per API call
  costPerToken?: number;      // USD per token (for AI providers)
  monthlyQuota?: number;      // Optional monthly call limit
  priority: number;           // Lower = higher priority (cheaper first)
  category: 'llc' | 'property' | 'contact' | 'person' | 'ai' | 'address';
  description: string;
}

export interface UsageMetrics {
  provider: string;
  calls: number;
  cacheHits: number;
  cacheMisses: number;
  totalCost: number;
  lastReset: Date;
}

// Default provider pricing (can be overridden via env vars)
// Prices are accurate per-call costs - updated January 2026
const DEFAULT_PRICING: Record<string, Omit<ProviderPricing, 'name'>> = {
  // Property Lookup Providers (free providers first, expensive as fallback)
  home_harvest: {
    costPerCall: 0,
    priority: 1,
    category: 'property',
    description: 'Free property data from HomeHarvest',
  },
  homeharvest: {
    costPerCall: 0,             // Alias
    priority: 1,
    category: 'property',
    description: 'Free property data from HomeHarvest',
  },
  real_estate_api: {
    costPerCall: 0,
    priority: 2,
    category: 'property',
    description: 'Free property ownership data',
  },
  realestateapi: {
    costPerCall: 0,             // Alias
    priority: 2,
    category: 'property',
    description: 'Free property ownership data',
  },
  attom: {
    costPerCall: 0.05,
    priority: 8,
    category: 'property',
    description: 'Premium property data - USE AS FALLBACK ONLY',
  },

  // LLC Lookup Providers (cost hierarchy: SEC EDGAR FREE -> Gemini -> OpenCorporates)
  sec_edgar: {
    costPerCall: 0,
    priority: 3,
    category: 'llc',
    description: 'Free SEC corporate filings',
  },
  open_corporates: {
    costPerCall: 0.10,
    priority: 10,
    category: 'llc',
    description: 'MOST EXPENSIVE - LAST RESORT for LLC unmasking',
  },
  opencorporates: {
    costPerCall: 0.10,          // Alias
    priority: 10,
    category: 'llc',
    description: 'MOST EXPENSIVE - LAST RESORT for LLC unmasking',
  },

  // Contact Enrichment Providers (cost hierarchy: cheapest first)
  apify: {
    costPerCall: 0.007,
    priority: 1,
    category: 'contact',
    description: 'Skip trace, relatives, associates',
  },
  apify_skip_trace: {
    costPerCall: 0.007,         // Alias
    priority: 1,
    category: 'contact',
    description: 'Skip trace, relatives, associates',
  },
  data_axle: {
    costPerCall: 0.01,
    priority: 2,
    category: 'contact',
    description: 'Contact data enrichment',
  },
  dataaxle: {
    costPerCall: 0.01,          // Alias
    priority: 2,
    category: 'contact',
    description: 'Contact data enrichment',
  },
  a_leads: {
    costPerCall: 0.01,
    priority: 3,
    category: 'contact',
    description: 'Alternative contact data',
  },
  aleads: {
    costPerCall: 0.01,          // Alias
    priority: 3,
    category: 'contact',
    description: 'Alternative contact data',
  },
  pacific_east: {
    costPerCall: 0,
    priority: 4,
    category: 'contact',
    description: 'Free contact enrichment',
  },
  pacificeast: {
    costPerCall: 0,             // Alias
    priority: 4,
    category: 'contact',
    description: 'Free contact enrichment',
  },
  melissa: {
    costPerCall: 0.02,
    priority: 5,
    category: 'contact',
    description: 'Melissa - Address verification and contact append',
  },
  email_sleuth: {
    costPerCall: 0,
    priority: 0,
    category: 'contact',
    description: 'Email Sleuth - Email discovery via pattern generation and SMTP verification',
  },

  // Address Validation (both free)
  usps: {
    costPerCall: 0,
    priority: 1,
    category: 'address',
    description: 'USPS address validation',
  },
  google_address: {
    costPerCall: 0,
    priority: 2,
    category: 'address',
    description: 'Google address validation',
  },

  // AI Providers for insights
  gemini: {
    costPerCall: 0.002,
    costPerToken: 0.000002,
    priority: 1,
    category: 'ai',
    description: 'Gemini AI research',
  },
  perplexity: {
    costPerCall: 0,
    priority: 2,
    category: 'ai',
    description: 'Free Perplexity AI research',
  },
  openai: {
    costPerCall: 0.01,
    costPerToken: 0.00001,
    priority: 3,
    category: 'ai',
    description: 'OpenAI - AI-powered insights and suggestions',
  },
};

// In-memory usage tracking
const usageMetrics: Map<string, UsageMetrics> = new Map();

// Cache statistics
interface CacheStats {
  llcHits: number;
  llcMisses: number;
  dossierHits: number;
  dossierMisses: number;
  contactHits: number;
  contactMisses: number;
  lastReset: Date;
}

let cacheStats: CacheStats = {
  llcHits: 0,
  llcMisses: 0,
  dossierHits: 0,
  dossierMisses: 0,
  contactHits: 0,
  contactMisses: 0,
  lastReset: new Date(),
};

/**
 * Get provider pricing, with environment variable overrides
 */
export function getProviderPricing(providerName: string): ProviderPricing | null {
  const defaults = DEFAULT_PRICING[providerName];
  if (!defaults) return null;

  // Check for env var overrides (e.g., PROVIDER_COST_GEMINI=0.003)
  const envCost = process.env[`PROVIDER_COST_${providerName.toUpperCase()}`];
  const envPriority = process.env[`PROVIDER_PRIORITY_${providerName.toUpperCase()}`];
  const envQuota = process.env[`PROVIDER_QUOTA_${providerName.toUpperCase()}`];

  return {
    name: providerName,
    costPerCall: envCost ? parseFloat(envCost) : defaults.costPerCall,
    costPerToken: defaults.costPerToken,
    priority: envPriority ? parseInt(envPriority) : defaults.priority,
    monthlyQuota: envQuota ? parseInt(envQuota) : defaults.monthlyQuota,
    category: defaults.category,
    description: defaults.description,
  };
}

/**
 * Get all providers for a category, sorted by priority (cheapest first)
 */
export function getProvidersByCategory(category: ProviderPricing['category']): ProviderPricing[] {
  const providers: ProviderPricing[] = [];
  
  for (const [name, config] of Object.entries(DEFAULT_PRICING)) {
    if (config.category === category) {
      const pricing = getProviderPricing(name);
      if (pricing) providers.push(pricing);
    }
  }

  // Sort by priority (lower = higher priority = cheaper)
  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * Track a provider API call - updates both in-memory and persists to database
 */
export function trackProviderCall(
  providerName: string, 
  wasCacheHit: boolean = false,
  tokensUsed?: number
): void {
  // Update in-memory metrics
  let metrics = usageMetrics.get(providerName);
  
  if (!metrics) {
    metrics = {
      provider: providerName,
      calls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalCost: 0,
      lastReset: new Date(),
    };
    usageMetrics.set(providerName, metrics);
  }

  let costIncrement = 0;
  if (wasCacheHit) {
    metrics.cacheHits++;
  } else {
    metrics.calls++;
    metrics.cacheMisses++;
    
    // Calculate cost
    const pricing = getProviderPricing(providerName);
    if (pricing) {
      if (tokensUsed && pricing.costPerToken) {
        costIncrement = tokensUsed * pricing.costPerToken;
      } else {
        costIncrement = pricing.costPerCall;
      }
      metrics.totalCost += costIncrement;
    }
  }
  
  // Persist to database asynchronously (fire and forget)
  persistMetricToDb(providerName, wasCacheHit, costIncrement).catch(err => {
    console.error('[PROVIDER METRICS] Failed to persist metric:', err);
  });
  
  // Record successful health (non-blocking)
  if (!wasCacheHit) {
    recordProviderSuccess(providerName).catch(err => {
      console.error('[PROVIDER HEALTH] Failed to record success:', err);
    });
  }
}

/**
 * Track a provider API error - updates health tracking
 */
export function trackProviderError(
  providerName: string,
  error: Error | string
): void {
  healthRecordError(providerName, error).catch(err => {
    console.error('[PROVIDER HEALTH] Failed to record error:', err);
  });
}

/**
 * Persist a single metric update to the database
 */
async function persistMetricToDb(
  providerName: string,
  wasCacheHit: boolean,
  costIncrement: number
): Promise<void> {
  const today = getTodayDate();
  
  try {
    // Try to update existing record for today
    const existing = await db.select()
      .from(providerUsageMetrics)
      .where(and(
        eq(providerUsageMetrics.providerName, providerName),
        eq(providerUsageMetrics.date, today)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing record
      const updates: any = {
        updatedAt: new Date(),
      };
      
      if (wasCacheHit) {
        updates.cacheHits = sql`${providerUsageMetrics.cacheHits} + 1`;
      } else {
        updates.calls = sql`${providerUsageMetrics.calls} + 1`;
        updates.cacheMisses = sql`${providerUsageMetrics.cacheMisses} + 1`;
        updates.totalCost = sql`${providerUsageMetrics.totalCost} + ${costIncrement}`;
      }
      
      await db.update(providerUsageMetrics)
        .set(updates)
        .where(eq(providerUsageMetrics.id, existing[0].id));
    } else {
      // Insert new record for today
      await db.insert(providerUsageMetrics).values({
        providerName,
        calls: wasCacheHit ? 0 : 1,
        cacheHits: wasCacheHit ? 1 : 0,
        cacheMisses: wasCacheHit ? 0 : 1,
        totalCost: costIncrement,
        date: today,
      });
    }
  } catch (error) {
    // Log but don't throw - we don't want to break the main flow
    console.error('[PROVIDER METRICS] Database error:', error);
  }
}

/**
 * Track cache hit/miss for different cache types
 */
export function trackCacheEvent(
  cacheType: 'llc' | 'dossier' | 'contact',
  isHit: boolean
): void {
  if (cacheType === 'llc') {
    isHit ? cacheStats.llcHits++ : cacheStats.llcMisses++;
  } else if (cacheType === 'dossier') {
    isHit ? cacheStats.dossierHits++ : cacheStats.dossierMisses++;
  } else if (cacheType === 'contact') {
    isHit ? cacheStats.contactHits++ : cacheStats.contactMisses++;
  }
}

/**
 * Get usage metrics for all providers (combines in-memory and database data)
 */
export function getAllUsageMetrics(): UsageMetrics[] {
  return Array.from(usageMetrics.values());
}

/**
 * Load today's metrics from database into in-memory cache
 * Call this on server startup to restore persisted metrics
 */
export async function loadMetricsFromDb(): Promise<void> {
  const today = getTodayDate();
  
  try {
    const dbMetrics = await db.select()
      .from(providerUsageMetrics)
      .where(eq(providerUsageMetrics.date, today));
    
    for (const dbm of dbMetrics) {
      usageMetrics.set(dbm.providerName, {
        provider: dbm.providerName,
        calls: dbm.calls,
        cacheHits: dbm.cacheHits,
        cacheMisses: dbm.cacheMisses,
        totalCost: dbm.totalCost,
        lastReset: new Date(dbm.updatedAt),
      });
    }
    
    console.log(`[PROVIDER METRICS] Loaded ${dbMetrics.length} provider metrics from database`);
  } catch (error) {
    console.error('[PROVIDER METRICS] Failed to load metrics from database:', error);
  }
}

/**
 * Get historical usage metrics for a date range
 */
export async function getHistoricalMetrics(startDate: string, endDate: string): Promise<{
  provider: string;
  date: string;
  calls: number;
  cacheHits: number;
  totalCost: number;
}[]> {
  try {
    const metrics = await db.select()
      .from(providerUsageMetrics)
      .where(sql`${providerUsageMetrics.date} >= ${startDate} AND ${providerUsageMetrics.date} <= ${endDate}`);
    
    return metrics.map(m => ({
      provider: m.providerName,
      date: m.date,
      calls: m.calls,
      cacheHits: m.cacheHits,
      totalCost: m.totalCost,
    }));
  } catch (error) {
    console.error('[PROVIDER METRICS] Failed to get historical metrics:', error);
    return [];
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats & { 
  llcHitRate: number; 
  dossierHitRate: number;
  contactHitRate: number;
  totalCostSaved: number;
} {
  const llcTotal = cacheStats.llcHits + cacheStats.llcMisses;
  const dossierTotal = cacheStats.dossierHits + cacheStats.dossierMisses;
  const contactTotal = cacheStats.contactHits + cacheStats.contactMisses;

  // Estimate cost saved by cache hits
  const llcCostPerCall = getProviderPricing('opencorporates')?.costPerCall || 0.15;
  const contactCostPerCall = getProviderPricing('apify_skip_trace')?.costPerCall || 0.03;
  
  const totalCostSaved = 
    (cacheStats.llcHits * llcCostPerCall) +
    (cacheStats.dossierHits * 0.20) + // Estimated dossier enrichment cost
    (cacheStats.contactHits * contactCostPerCall);

  return {
    ...cacheStats,
    llcHitRate: llcTotal > 0 ? (cacheStats.llcHits / llcTotal) * 100 : 0,
    dossierHitRate: dossierTotal > 0 ? (cacheStats.dossierHits / dossierTotal) * 100 : 0,
    contactHitRate: contactTotal > 0 ? (cacheStats.contactHits / contactTotal) * 100 : 0,
    totalCostSaved,
  };
}

/**
 * Get total estimated cost across all providers
 */
export function getTotalCost(): number {
  let total = 0;
  Array.from(usageMetrics.values()).forEach(metrics => {
    total += metrics.totalCost;
  });
  return total;
}

/**
 * Reset all metrics (e.g., monthly reset)
 */
export function resetMetrics(): void {
  usageMetrics.clear();
  cacheStats = {
    llcHits: 0,
    llcMisses: 0,
    dossierHits: 0,
    dossierMisses: 0,
    contactHits: 0,
    contactMisses: 0,
    lastReset: new Date(),
  };
}

/**
 * Get a summary of provider costs and usage
 */
export function getCostSummary(): {
  providers: Array<{
    name: string;
    calls: number;
    cost: number;
    cacheHitRate: number;
  }>;
  totalCost: number;
  totalCostSaved: number;
  sessionStart: Date;
} {
  const providers = getAllUsageMetrics().map(m => ({
    name: m.provider,
    calls: m.calls,
    cost: m.totalCost,
    cacheHitRate: m.calls + m.cacheHits > 0 
      ? (m.cacheHits / (m.calls + m.cacheHits)) * 100 
      : 0,
  }));

  const stats = getCacheStats();

  return {
    providers,
    totalCost: getTotalCost(),
    totalCostSaved: stats.totalCostSaved,
    sessionStart: cacheStats.lastReset,
  };
}

/**
 * Log a cost-aware routing decision
 */
export function logRoutingDecision(
  category: string,
  selectedProvider: string,
  reason: string
): void {
  console.log(`[ROUTING] ${category}: Selected "${selectedProvider}" - ${reason}`);
}

// Export pricing constants for reference
export const PROVIDER_NAMES = Object.keys(DEFAULT_PRICING);
export const LLC_PROVIDERS = getProvidersByCategory('llc').map(p => p.name);
export const CONTACT_PROVIDERS = getProvidersByCategory('contact').map(p => p.name);
export const PROPERTY_PROVIDERS = getProvidersByCategory('property').map(p => p.name);

/**
 * Per-search cost tracker - tracks API calls made during a single search operation
 */
export interface SearchProviderCall {
  provider: string;
  calls: number;
  cost: number;
  wasCached: boolean;
}

export class SearchCostTracker {
  private calls: Map<string, { count: number; cost: number; cached: number }> = new Map();
  
  /**
   * Record an API call during this search
   */
  trackCall(providerName: string, wasCacheHit: boolean = false, tokensUsed?: number): void {
    let data = this.calls.get(providerName);
    if (!data) {
      data = { count: 0, cost: 0, cached: 0 };
      this.calls.set(providerName, data);
    }
    
    if (wasCacheHit) {
      data.cached++;
    } else {
      data.count++;
      const pricing = getProviderPricing(providerName);
      if (pricing) {
        if (tokensUsed && pricing.costPerToken) {
          data.cost += tokensUsed * pricing.costPerToken;
        } else {
          data.cost += pricing.costPerCall;
        }
      }
    }
    
    // Also track globally
    trackProviderCall(providerName, wasCacheHit, tokensUsed);
  }
  
  /**
   * Get total cost for this search
   */
  getTotalCost(): number {
    let total = 0;
    Array.from(this.calls.values()).forEach(data => {
      total += data.cost;
    });
    return total;
  }
  
  /**
   * Get breakdown of calls by provider
   */
  getProviderCalls(): SearchProviderCall[] {
    const result: SearchProviderCall[] = [];
    Array.from(this.calls.entries()).forEach(([provider, data]) => {
      result.push({
        provider,
        calls: data.count,
        cost: data.cost,
        wasCached: data.cached > 0,
      });
    });
    return result;
  }
  
  /**
   * Get summary for storage
   */
  getSummary(): { estimatedCost: number; providerCalls: SearchProviderCall[] } {
    return {
      estimatedCost: Math.round(this.getTotalCost() * 1000) / 1000, // Round to 3 decimal places
      providerCalls: this.getProviderCalls(),
    };
  }
}

/**
 * Create a new search cost tracker
 */
export function createSearchCostTracker(): SearchCostTracker {
  return new SearchCostTracker();
}
