import { db } from "./db";
import { providerHealth, type ProviderHealth } from "@shared/schema";
import { eq } from "drizzle-orm";
import { auditLogger } from "./auditLogger";

export type ProviderStatus = "healthy" | "degraded" | "down";

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  home_harvest: "Home Harvest",
  real_estate_api: "Real Estate API",
  sec_edgar: "SEC EDGAR",
  apify: "Apify Skip Trace",
  apify_investors: "Apify Investors",
  data_axle: "Data Axle",
  dataaxle: "Data Axle",
  a_leads: "A-Leads",
  aleads: "A-Leads",
  pacific_east: "Pacific East",
  pacificeast: "Pacific East",
  usps: "USPS",
  google_address: "Google Address Validation",
  google: "Google",
  gemini: "Gemini AI",
  perplexity: "Perplexity AI",
  open_corporates: "OpenCorporates",
  opencorporates: "OpenCorporates",
  attom: "ATTOM",
  melissa: "Melissa",
  openmart: "OpenMart",
};

const DEGRADED_ERROR_RATE_THRESHOLD = 0.2;
const DOWN_ERROR_RATE_THRESHOLD = 0.8;
const DOWN_CONSECUTIVE_FAILURES = 5;
const MIN_CALLS_FOR_RATE_CALCULATION = 5;

function normalizeProviderKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function calculateStatus(
  errorRate: number,
  consecutiveFailures: number,
  totalCalls: number
): ProviderStatus {
  if (consecutiveFailures >= DOWN_CONSECUTIVE_FAILURES) {
    return "down";
  }
  
  if (totalCalls >= MIN_CALLS_FOR_RATE_CALCULATION) {
    if (errorRate >= DOWN_ERROR_RATE_THRESHOLD) {
      return "down";
    }
    if (errorRate >= DEGRADED_ERROR_RATE_THRESHOLD) {
      return "degraded";
    }
  }
  
  return "healthy";
}

async function getOrCreateProviderHealth(providerKey: string): Promise<ProviderHealth> {
  const normalizedKey = normalizeProviderKey(providerKey);
  
  const [existing] = await db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerKey, normalizedKey));
  
  if (existing) {
    return existing;
  }
  
  const displayName = PROVIDER_DISPLAY_NAMES[normalizedKey] || 
                      PROVIDER_DISPLAY_NAMES[providerKey] || 
                      providerKey;
  
  const [created] = await db
    .insert(providerHealth)
    .values({
      providerKey: normalizedKey,
      displayName,
      status: "healthy",
      errorCountLastHour: 0,
      successCountLastHour: 0,
      errorRateLastHour: 0,
      consecutiveFailures: 0,
    })
    .returning();
  
  return created;
}

export async function recordProviderSuccess(providerKey: string): Promise<void> {
  try {
    const health = await getOrCreateProviderHealth(providerKey);
    
    const newSuccessCount = health.successCountLastHour + 1;
    const totalCalls = newSuccessCount + health.errorCountLastHour;
    const newErrorRate = totalCalls > 0 ? health.errorCountLastHour / totalCalls : 0;
    const newStatus = calculateStatus(newErrorRate, 0, totalCalls);
    
    await db
      .update(providerHealth)
      .set({
        successCountLastHour: newSuccessCount,
        errorRateLastHour: newErrorRate,
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(providerHealth.providerKey, normalizeProviderKey(providerKey)));
  } catch (error) {
    console.error(`[ProviderHealth] Failed to record success for ${providerKey}:`, error);
  }
}

export async function recordProviderError(
  providerKey: string,
  error: Error | string
): Promise<void> {
  try {
    const health = await getOrCreateProviderHealth(providerKey);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const previousStatus = health.status;
    
    const newErrorCount = health.errorCountLastHour + 1;
    const newConsecutiveFailures = health.consecutiveFailures + 1;
    const totalCalls = health.successCountLastHour + newErrorCount;
    const newErrorRate = totalCalls > 0 ? newErrorCount / totalCalls : 1;
    const newStatus = calculateStatus(newErrorRate, newConsecutiveFailures, totalCalls);
    
    await db
      .update(providerHealth)
      .set({
        errorCountLastHour: newErrorCount,
        errorRateLastHour: newErrorRate,
        consecutiveFailures: newConsecutiveFailures,
        lastErrorMessage: errorMessage.substring(0, 1000),
        lastErrorAt: new Date(),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(providerHealth.providerKey, normalizeProviderKey(providerKey)));
    
    if (previousStatus !== "down" && newStatus === "down") {
      auditLogger.log({
        eventType: "admin_action",
        resourceType: "provider_health",
        resourceId: providerKey,
        metadata: {
          action: "PROVIDER_DOWN",
          displayName: health.displayName,
          errorMessage,
          consecutiveFailures: newConsecutiveFailures,
          errorRate: newErrorRate,
        },
      });
      
      console.error(`[PROVIDER DOWN] ${health.displayName} is now DOWN after ${newConsecutiveFailures} consecutive failures`);
      
      const alertEmail = process.env.ALERT_EMAIL_TO;
      if (alertEmail) {
        console.log(`[PROVIDER DOWN] Would send alert email to ${alertEmail} for ${health.displayName}`);
      }
    }
  } catch (err) {
    console.error(`[ProviderHealth] Failed to record error for ${providerKey}:`, err);
  }
}

export async function getAllProviderHealth(): Promise<ProviderHealth[]> {
  return await db.select().from(providerHealth);
}

export async function getProviderHealthByKey(key: string): Promise<ProviderHealth | undefined> {
  const [health] = await db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerKey, normalizeProviderKey(key)));
  return health;
}

export async function resetProviderHealth(providerKey: string): Promise<ProviderHealth | undefined> {
  const normalizedKey = normalizeProviderKey(providerKey);
  
  const [updated] = await db
    .update(providerHealth)
    .set({
      status: "healthy",
      errorCountLastHour: 0,
      successCountLastHour: 0,
      errorRateLastHour: 0,
      consecutiveFailures: 0,
      lastErrorMessage: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(providerHealth.providerKey, normalizedKey))
    .returning();
  
  if (updated) {
    auditLogger.log({
      eventType: "admin_action",
      resourceType: "provider_health",
      resourceId: normalizedKey,
      metadata: {
        action: "PROVIDER_HEALTH_RESET",
        displayName: updated.displayName,
      },
    });
  }
  
  return updated;
}

export async function decayProviderErrorCounts(): Promise<void> {
  try {
    const providers = await getAllProviderHealth();
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    for (const provider of providers) {
      if (
        provider.status !== "healthy" &&
        (!provider.lastErrorAt || provider.lastErrorAt < thirtyMinutesAgo)
      ) {
        await db
          .update(providerHealth)
          .set({
            status: "healthy",
            errorCountLastHour: 0,
            successCountLastHour: 0,
            errorRateLastHour: 0,
            consecutiveFailures: 0,
            lastErrorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(providerHealth.providerKey, provider.providerKey));
        
        console.log(`[ProviderHealth] Auto-recovered ${provider.displayName} to healthy status`);
      } else if (provider.errorCountLastHour > 0 || provider.successCountLastHour > 0) {
        const decayFactor = 0.8;
        const newErrorCount = Math.floor(provider.errorCountLastHour * decayFactor);
        const newSuccessCount = Math.floor(provider.successCountLastHour * decayFactor);
        const totalCalls = newErrorCount + newSuccessCount;
        const newErrorRate = totalCalls > 0 ? newErrorCount / totalCalls : 0;
        const newStatus = calculateStatus(newErrorRate, provider.consecutiveFailures, totalCalls);
        
        await db
          .update(providerHealth)
          .set({
            errorCountLastHour: newErrorCount,
            successCountLastHour: newSuccessCount,
            errorRateLastHour: newErrorRate,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(providerHealth.providerKey, provider.providerKey));
      }
    }
  } catch (error) {
    console.error("[ProviderHealth] Error during decay operation:", error);
  }
}

export async function getDownProviders(): Promise<ProviderHealth[]> {
  const providers = await getAllProviderHealth();
  return providers.filter(p => p.status === "down");
}

export async function getDegradedProviders(): Promise<ProviderHealth[]> {
  const providers = await getAllProviderHealth();
  return providers.filter(p => p.status === "degraded");
}

export async function initializeProviders(): Promise<void> {
  const defaultProviders = Object.entries(PROVIDER_DISPLAY_NAMES);
  
  for (const [key] of defaultProviders) {
    await getOrCreateProviderHealth(key);
  }
  
  console.log(`[ProviderHealth] Initialized ${defaultProviders.length} providers`);
}
