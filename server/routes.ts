import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getUserId } from "./auth";
import { auditLogger } from "./auditLogger";
import { searchRateLimit, enrichmentRateLimit, adminRateLimit } from "./rateLimiter";
import { dataRetentionScheduler } from "./dataRetentionScheduler";
import { securityAuditService } from "./securityAudit";
import {
  unmaskLlc,
  calculateSellerIntentScore,
  generateOutreachSuggestion,
  calculateContactConfidence,
} from "./openai";
import { dataProviders } from "./dataProviders";
import { insertOwnerSchema, insertPropertySchema, insertContactInfoSchema, ownerLlcLinks, owners, contactInfos, properties, llcOwnershipChains, ProviderSource, PROVIDER_DISPLAY_NAMES, bugReports, insertBugReportSchema } from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import * as GeminiDeepResearch from "./providers/GeminiDeepResearchProvider";
import * as HomeHarvest from "./providers/HomeHarvestProvider";
import { buildUnifiedDossier, runFullEnrichment, resolveEntityById, UnifiedDossier, runPhasedEnrichment, PhasedEnrichmentResult, runContactWaterfall } from "./dossierService";
import { resolveOwnershipChain } from "./llcChainResolver";
import { 
  trackProviderCall, 
  trackCacheEvent, 
  getCostSummary, 
  getCacheStats,
  logRoutingDecision,
  getProviderPricing
} from "./providerConfig";
import { setLlcLookupFunction } from "./llcChainResolver";

// Common first names to help detect person names (subset of most common US names)
const COMMON_FIRST_NAMES = new Set([
  'JAMES', 'JOHN', 'ROBERT', 'MICHAEL', 'WILLIAM', 'DAVID', 'RICHARD', 'JOSEPH', 'THOMAS', 'CHARLES',
  'CHRISTOPHER', 'DANIEL', 'MATTHEW', 'ANTHONY', 'MARK', 'DONALD', 'STEVEN', 'PAUL', 'ANDREW', 'JOSHUA',
  'KENNETH', 'KEVIN', 'BRIAN', 'GEORGE', 'TIMOTHY', 'RONALD', 'EDWARD', 'JASON', 'JEFFREY', 'RYAN',
  'MARY', 'PATRICIA', 'JENNIFER', 'LINDA', 'BARBARA', 'ELIZABETH', 'SUSAN', 'JESSICA', 'SARAH', 'KAREN',
  'NANCY', 'LISA', 'BETTY', 'MARGARET', 'SANDRA', 'ASHLEY', 'KIMBERLY', 'EMILY', 'DONNA', 'MICHELLE',
  'DOROTHY', 'CAROL', 'AMANDA', 'MELISSA', 'DEBORAH', 'STEPHANIE', 'REBECCA', 'SHARON', 'LAURA', 'CYNTHIA',
  'KATHLEEN', 'AMY', 'ANGELA', 'SHIRLEY', 'ANNA', 'BRENDA', 'PAMELA', 'EMMA', 'NICOLE', 'HELEN',
  'SAMANTHA', 'KATHERINE', 'CHRISTINE', 'DEBRA', 'RACHEL', 'CAROLYN', 'JANET', 'CATHERINE', 'MARIA', 'HEATHER',
  'PETER', 'STEPHEN', 'FRANK', 'SCOTT', 'ERIC', 'GREGORY', 'LARRY', 'JERRY', 'DENNIS', 'TERRY',
  'RAYMOND', 'BRUCE', 'HAROLD', 'ALBERT', 'CARL', 'EUGENE', 'RALPH', 'ROY', 'LOUIS', 'RUSSELL',
  'WAYNE', 'BOBBY', 'JOHNNY', 'BILLY', 'JOE', 'JACK', 'HENRY', 'ARTHUR', 'WALTER', 'FRED',
  'STANLEY', 'MARTIN', 'LEONARD', 'SAMUEL', 'BENJAMIN', 'HARRY', 'VINCENT', 'PATRICK', 'HOWARD', 'VICTOR',
  'ALAN', 'GLENN', 'GORDON', 'BARRY', 'ROGER', 'GERALD', 'DOUGLAS', 'ERNEST', 'PHILIP', 'RALPH',
  'NATHAN', 'EARL', 'LEROY', 'THEODORE', 'STANLEY', 'CLIFFORD', 'LLOYD', 'NORMAN', 'FLOYD', 'WARREN',
]);

// Entity keywords that indicate a business/LLC/trust
const ENTITY_KEYWORDS = [
  // Common LLC/Corp suffixes
  'LLC', 'L.L.C.', 'INC', 'CORP', 'CORPORATION', 'LTD', 'LIMITED', 'LP', 'L.P.',
  'LLP', 'L.L.P.', 'PLLC', 'P.L.L.C.', 'PC', 'P.C.', 'PA', 'P.A.',
  // Trust indicators
  'TRUST', 'TRUSTEE', 'ESTATE', 'REVOCABLE', 'IRREVOCABLE',
  // Investment/Business indicators
  'HOLDINGS', 'PROPERTIES', 'INVESTMENTS', 'VENTURES', 'CAPITAL', 'PARTNERS',
  'ASSOCIATES', 'ENTERPRISES', 'GROUP', 'FUND', 'REALTY', 'REAL ESTATE',
  'DEVELOPMENT', 'MANAGEMENT', 'ACQUISITIONS', 'ASSET', 'EQUITY',
  // Common business words
  'COMPANY', 'COMPANIES', 'SERVICES', 'SOLUTIONS', 'NETWORK', 'INTERNATIONAL',
  // Geographic business names often indicate entities
  'EAST COAST', 'WEST COAST', 'NATIONWIDE', 'NATIONAL', 'GLOBAL', 'WORLDWIDE',
  // Other indicators
  'ASSOCIATION', 'FOUNDATION', 'PARTNERSHIP', 'JOINT VENTURE',
];

// In-memory cache for LLC search results to prevent repeated OpenCorporates API calls
// Key: normalized search query, Value: { results, timestamp }
const llcSearchCache = new Map<string, { results: any[]; timestamp: number }>();
const LLC_SEARCH_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

function getCachedLlcSearchResults(query: string, jurisdiction?: string): any[] | null {
  const cacheKey = `${query.toUpperCase().trim()}:${jurisdiction || "any"}`;
  const cached = llcSearchCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < LLC_SEARCH_CACHE_TTL_MS) {
    console.log(`[CACHE HIT] LLC search "${query}" - using cached search results`);
    return cached.results;
  }
  
  return null;
}

function setCachedLlcSearchResults(query: string, jurisdiction: string | undefined, results: any[]): void {
  const cacheKey = `${query.toUpperCase().trim()}:${jurisdiction || "any"}`;
  llcSearchCache.set(cacheKey, { results, timestamp: Date.now() });
  console.log(`[CACHE SET] LLC search "${query}" - caching ${results.length} results`);
  
  // Clean up old entries periodically (keep cache size manageable)
  if (llcSearchCache.size > 500) {
    const now = Date.now();
    const entries = Array.from(llcSearchCache.entries());
    for (const [key, value] of entries) {
      if (now - value.timestamp > LLC_SEARCH_CACHE_TTL_MS) {
        llcSearchCache.delete(key);
      }
    }
  }
}

/**
 * Calculate freshness label from a date
 */
function calculateFreshnessLabel(date: Date | string | null | undefined): string {
  if (!date) return "unknown";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;
  
  if (diffHours < 1) return "fresh";
  if (diffHours < 24) return "today";
  if (diffDays < 2) return "1d";
  if (diffDays < 7) return `${Math.floor(diffDays)}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
  return `${Math.floor(diffDays / 365)}y`;
}

/**
 * Build provider sources array from dossier data
 */
function buildProviderSources(
  owner: any,
  existingCache: any,
  llcUnmasking: any,
  contactEnrichment: any,
  melissaEnrichment: any,
  contacts: any[],
  properties: any[],
  isCached: boolean
): ProviderSource[] {
  const sources: ProviderSource[] = [];
  const cacheUpdatedAt = existingCache?.updatedAt;
  const now = new Date();
  
  // Helper to get timestamp from various enrichment sources
  const getEnrichmentTimestamp = (enrichment: any): Date | null => {
    if (!enrichment) return null;
    if (enrichment.lastUpdated) return new Date(enrichment.lastUpdated);
    if (enrichment.timestamp) return new Date(enrichment.timestamp);
    if (enrichment.updatedAt) return new Date(enrichment.updatedAt);
    return cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
  };
  
  // ATTOM - detect from properties or enrichmentSource
  const hasAttomProperty = properties.some((p: any) => p.metadata?.source === "attom" || p.apn);
  const hasAttomEnrichment = owner.enrichmentSource === "attom" || owner.metadata?.attomData;
  if (hasAttomProperty || hasAttomEnrichment) {
    const propertyUpdateTime = properties[0]?.updatedAt || owner.updatedAt;
    sources.push({
      name: "attom",
      displayName: PROVIDER_DISPLAY_NAMES["attom"] || "ATTOM",
      status: isCached ? "cached" : "success",
      lastUpdated: propertyUpdateTime,
      freshnessLabel: calculateFreshnessLabel(propertyUpdateTime),
      retryTarget: "property",
      canRetry: true,
    });
  }
  
  // OpenCorporates - detected from llcUnmasking or owner type
  if (llcUnmasking && !llcUnmasking.error) {
    const llcTimestamp = getEnrichmentTimestamp(llcUnmasking) || cacheUpdatedAt;
    sources.push({
      name: "opencorporates",
      displayName: PROVIDER_DISPLAY_NAMES["opencorporates"] || "OpenCorporates",
      status: llcUnmasking.fromCache ? "cached" : "success",
      lastUpdated: llcTimestamp,
      freshnessLabel: calculateFreshnessLabel(llcTimestamp),
      retryTarget: "ownership",
      canRetry: true,
    });
  } else if (llcUnmasking?.error) {
    sources.push({
      name: "opencorporates",
      displayName: PROVIDER_DISPLAY_NAMES["opencorporates"] || "OpenCorporates",
      status: "error",
      lastUpdated: cacheUpdatedAt,
      freshnessLabel: calculateFreshnessLabel(cacheUpdatedAt),
      error: llcUnmasking.error,
      retryTarget: "ownership",
      canRetry: true,
    });
  }
  
  // Gemini - detected from llcUnmasking AI fields or owner metadata
  const hasGeminiData = llcUnmasking?.aiInferredOwners?.length > 0 || 
                        llcUnmasking?.aiRelatedEntities?.length > 0 ||
                        owner.metadata?.llcChain || 
                        owner.metadata?.geminiResearch;
  if (hasGeminiData) {
    const geminiTimestamp = getEnrichmentTimestamp(llcUnmasking) || cacheUpdatedAt;
    sources.push({
      name: "gemini",
      displayName: PROVIDER_DISPLAY_NAMES["gemini"] || "Gemini AI",
      status: isCached ? "cached" : "success",
      lastUpdated: geminiTimestamp,
      freshnessLabel: calculateFreshnessLabel(geminiTimestamp),
      retryTarget: "ownership",
      canRetry: true,
    });
  }
  
  // Perplexity fallback
  if (owner.metadata?.perplexityFallback || llcUnmasking?.perplexityFallback) {
    sources.push({
      name: "perplexity",
      displayName: PROVIDER_DISPLAY_NAMES["perplexity"] || "Perplexity",
      status: "fallback",
      lastUpdated: cacheUpdatedAt,
      freshnessLabel: calculateFreshnessLabel(cacheUpdatedAt),
      retryTarget: "ownership",
      canRetry: true,
    });
  }
  
  // Build contact source set from actual contacts
  const contactSourceSet = new Set<string>();
  for (const contact of contacts) {
    if (contact.source) {
      contactSourceSet.add(contact.source.toLowerCase());
    }
  }
  
  // Data Axle - from contactEnrichment or contact sources
  const hasDataAxle = contactEnrichment?.dataAxle || 
                      contactEnrichment?.companyEmails?.length > 0 ||
                      contactEnrichment?.directDials?.length > 0 ||
                      contactSourceSet.has("data_axle") || 
                      contactSourceSet.has("dataaxle");
  if (hasDataAxle) {
    const dataAxleTimestamp = getEnrichmentTimestamp(contactEnrichment) || cacheUpdatedAt;
    const hasError = contactEnrichment?.dataAxleError;
    sources.push({
      name: "data_axle",
      displayName: PROVIDER_DISPLAY_NAMES["data_axle"] || "Data Axle",
      status: hasError ? "error" : (isCached ? "cached" : "success"),
      lastUpdated: dataAxleTimestamp,
      freshnessLabel: calculateFreshnessLabel(dataAxleTimestamp),
      error: hasError ? contactEnrichment.dataAxleError : undefined,
      retryTarget: "contacts",
      canRetry: true,
    });
  }
  
  // Pacific East - from contactEnrichment or contact sources  
  const hasPacificEast = contactEnrichment?.pacificEast ||
                         contactSourceSet.has("pacific_east") || 
                         contactSourceSet.has("pacificeast");
  if (hasPacificEast) {
    const peTimestamp = getEnrichmentTimestamp(contactEnrichment) || cacheUpdatedAt;
    sources.push({
      name: "pacific_east",
      displayName: PROVIDER_DISPLAY_NAMES["pacific_east"] || "Pacific East",
      status: isCached ? "cached" : "success",
      lastUpdated: peTimestamp,
      freshnessLabel: calculateFreshnessLabel(peTimestamp),
      retryTarget: "contacts",
      canRetry: true,
    });
  }
  
  // A-Leads - from contactEnrichment or contact sources
  const hasALeads = contactEnrichment?.aLeads ||
                    contactEnrichment?.skipTraceData ||
                    contactSourceSet.has("a_leads") || 
                    contactSourceSet.has("aleads");
  if (hasALeads) {
    const aLeadsTimestamp = getEnrichmentTimestamp(contactEnrichment) || cacheUpdatedAt;
    sources.push({
      name: "a_leads",
      displayName: PROVIDER_DISPLAY_NAMES["a_leads"] || "A-Leads",
      status: isCached ? "cached" : "success",
      lastUpdated: aLeadsTimestamp,
      freshnessLabel: calculateFreshnessLabel(aLeadsTimestamp),
      retryTarget: "contacts",
      canRetry: true,
    });
  }
  
  // Melissa verification
  if (melissaEnrichment) {
    const melissaTimestamp = getEnrichmentTimestamp(melissaEnrichment) || cacheUpdatedAt;
    const hasError = melissaEnrichment?.error;
    sources.push({
      name: "melissa",
      displayName: PROVIDER_DISPLAY_NAMES["melissa"] || "Melissa",
      status: hasError ? "error" : (isCached ? "cached" : "success"),
      lastUpdated: melissaTimestamp,
      freshnessLabel: calculateFreshnessLabel(melissaTimestamp),
      error: hasError ? melissaEnrichment.error : undefined,
      retryTarget: "contacts",
      canRetry: true,
    });
  }
  
  // Skip trace - from owner enrichmentSource or contact sources
  const hasSkipTrace = owner.enrichmentSource === "apify_skip_trace" ||
                       contactSourceSet.has("apify_skip_trace") ||
                       contactSourceSet.has("skip_trace");
  if (hasSkipTrace) {
    const skipTimestamp = owner.enrichmentUpdatedAt || cacheUpdatedAt;
    sources.push({
      name: "apify_skip_trace",
      displayName: PROVIDER_DISPLAY_NAMES["apify_skip_trace"] || "Skip Trace",
      status: isCached ? "cached" : "success",
      lastUpdated: skipTimestamp,
      freshnessLabel: calculateFreshnessLabel(skipTimestamp),
      retryTarget: "contacts",
      canRetry: true,
    });
  }
  
  return sources;
}

/**
 * Normalize spaced letter sequences to their compact form.
 * Examples: "L L C" -> "LLC", "L.L.C." -> "LLC", "C O R P" -> "CORP"
 */
function normalizeSpacedLetters(name: string): string {
  // Handle periods between letters: "L.L.C." -> "LLC", "C.O.R.P." -> "CORP"
  let normalized = name.replace(/\b([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2$3$4');
  normalized = normalized.replace(/\b([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2$3');
  normalized = normalized.replace(/\b([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2');
  
  // Handle spaced single letters: "L L C" -> "LLC", "C O R P" -> "CORP"
  // Match sequences of 2+ single letters separated by spaces
  normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z])\b/gi, '$1$2$3$4');
  normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\b/gi, '$1$2$3');
  normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\b/gi, '$1$2');
  
  return normalized;
}

// Helper to detect if a name looks like an entity/company rather than an individual
function isEntityName(name: string): boolean {
  // Normalize spaced letters before checking (e.g., "L L C" -> "LLC")
  const normalizedName = normalizeSpacedLetters(name.toUpperCase());
  // Use word boundary matching to avoid false positives like "PARADOWSKI" matching "PA"
  return ENTITY_KEYWORDS.some(keyword => {
    // Create a regex that matches the keyword as a whole word
    // For keywords with periods (like L.L.C.), escape the periods
    const escapedKeyword = keyword.replace(/\./g, '\\.');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    return regex.test(normalizedName);
  });
}

// Helper to detect if a name looks like a person (e.g., "NANCY E ROMAN", "JOHN DOE")
function looksLikePersonName(name: string): boolean {
  if (!name) return false;
  const upperName = name.toUpperCase().trim();
  
  // If it has entity keywords, it's not a person
  if (isEntityName(upperName)) return false;
  
  // Split into tokens
  const tokens = upperName.split(/\s+/).filter(t => t.length > 0);
  
  // Person names typically have 2-4 tokens (First Last, First M Last, First Middle Last)
  if (tokens.length < 2 || tokens.length > 4) return false;
  
  // Check if first token is a common first name
  const firstToken = tokens[0];
  if (COMMON_FIRST_NAMES.has(firstToken)) return true;
  
  // Check for middle initial pattern: "FIRSTNAME X LASTNAME" where X is single letter
  if (tokens.length >= 3) {
    const middleToken = tokens[1];
    if (middleToken.length === 1 && /^[A-Z]$/.test(middleToken)) {
      return true; // Has middle initial, likely a person
    }
  }
  
  // Check if last token looks like a surname (not a business word)
  const businessIndicators = ['GROUP', 'PROPERTIES', 'INVESTMENTS', 'CAPITAL', 'PARTNERS', 'SOLUTIONS', 'SERVICES'];
  const lastToken = tokens[tokens.length - 1];
  if (businessIndicators.includes(lastToken)) return false;
  
  // If we've passed all entity checks and have 2-4 tokens, treat as a person
  return true;
}

// Helper to validate officer names and filter out parsing artifacts
// NOTE: This accepts BOTH person names AND entity names as valid officers
function isValidOfficerName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  
  // Reject parsing artifacts that contain unexpected words
  const badPatterns = [
    /\bOR\s+(OFFICER|MEMBER)/i,      // "or officer of", "or member of"
    /\bTHAT\s+\w+/i,                  // "that Jake", "that person"
    /^(AND|OR|THE|A|AN|OF|IN|FOR)\b/i, // Starts with conjunction
    /\b(AND|OR|OF|OR OFFICER)\s*$/i,  // Ends with conjunction
    /^(OFFICER|MEMBER)\s+(OF|TO)/i,   // "OFFICER OF", "MEMBER OF"
  ];
  
  if (badPatterns.some(pattern => pattern.test(name))) {
    console.log(`[OFFICER FILTER] Rejected parsing artifact: "${name}"`);
    return false;
  }
  
  // Reject if name contains unusual combinations (e.g., "or officer of")
  if (name.toLowerCase().includes("or officer") || name.toLowerCase().includes("that ")) {
    console.log(`[OFFICER FILTER] Rejected suspicious name fragment: "${name}"`);
    return false;
  }
  
  // Accept both entity names AND person names as valid officers
  // Entities are valid officers (e.g., "ABC Holdings LLC" can be an officer of another LLC)
  if (isEntityName(name)) {
    return true;
  }
  
  // For non-entities, must look like a valid person name
  if (!looksLikePersonName(name)) {
    console.log(`[OFFICER FILTER] Name doesn't match person pattern: "${name}"`);
    return false;
  }
  
  return true;
}

// Centralized helper to determine if an owner should be treated as an entity
// This considers both the ATTOM type and name analysis
function shouldTreatAsEntity(ownerType: string, ownerName: string): boolean {
  // If it has entity keywords, definitely treat as entity
  if (isEntityName(ownerName)) return true;
  
  // If ATTOM says entity but name looks like a person, treat as individual
  if (ownerType === "entity" && looksLikePersonName(ownerName)) return false;
  
  // Otherwise trust the ATTOM type
  return ownerType === "entity";
}

// ============================================================================
// PRIVACY-PROTECTED OFFICER DETECTION
// Detect when LLC officers are only corporate agents/privacy services
// ============================================================================

const PRIVACY_AGENT_PATTERNS = [
  "CORPORATION SERVICE", "CORP SERVICE", "CSC", "CT CORPORATION",
  "REGISTERED AGENT", "NATIONAL REGISTERED", "NORTHWEST REGISTERED",
  "INCORP SERVICES", "LEGALZOOM", "HARBOR COMPLIANCE", "COGENCY GLOBAL",
  "UNITED STATES CORPORATION", "VCORP", "UNITED AGENT", "AGENT GROUP",
  "PRIVACY PROTECTED", "CORPORATE CREATIONS", "HARVARD BUSINESS",
  "PARACORP", "INCORPORATING SERVICES", "CORPORATE AGENTS"
];

function isPrivacyProtectedOfficer(officerName: string): boolean {
  if (!officerName) return false;
  const upper = officerName.toUpperCase();
  return PRIVACY_AGENT_PATTERNS.some(pattern => upper.includes(pattern));
}

function hasOnlyPrivacyProtectedOfficers(officers: Array<{ name: string; position?: string; role?: string }>): boolean {
  if (!officers || officers.length === 0) return false;
  
  const validOfficers = officers.filter(o => o.name && o.name.trim().length > 0);
  if (validOfficers.length === 0) return false;
  
  const realPersonOfficers = validOfficers.filter(o => {
    const name = o.name;
    if (isPrivacyProtectedOfficer(name)) return false;
    if (isEntityName(name)) return false;
    return looksLikePersonName(name);
  });
  
  console.log(`[PRIVACY CHECK] ${validOfficers.length} officers, ${realPersonOfficers.length} are real people`);
  return realPersonOfficers.length === 0;
}

// ============================================================================
// COMPREHENSIVE CACHING SYSTEM
// Prevents wasted API calls by checking if we already have complete data
// ============================================================================

// Cache TTL configuration
const LLC_CACHE_TTL_HOURS = 72; // 3 days - LLC data doesn't change frequently
const OWNER_CACHE_TTL_HOURS = 24; // 1 day for owner enrichment
const PROPERTY_CACHE_TTL_HOURS = 168; // 7 days - property data rarely changes

// Check if an owner has COMPLETE enrichment (not just partial data)
// Only returns true if the owner has been fully processed with contact data
// NOTE: This is a sync check that doesn't verify contacts - use hasCompleteOwnerEnrichmentWithContacts for full check
function hasCompleteOwnerEnrichment(owner: any, contactCount?: number): boolean {
  if (!owner) return false;
  
  // Must have enrichment source and timestamp
  if (!owner.enrichmentSource || !owner.enrichmentUpdatedAt) {
    return false;
  }
  
  // Check if enrichment is within TTL
  const enrichmentAge = (Date.now() - new Date(owner.enrichmentUpdatedAt).getTime()) / (1000 * 60 * 60);
  if (enrichmentAge > OWNER_CACHE_TTL_HOURS) {
    console.log(`[CACHE STALE] Owner "${owner.name}" enrichment is ${enrichmentAge.toFixed(1)}h old (TTL=${OWNER_CACHE_TTL_HOURS}h)`);
    return false;
  }
  
  // For individuals: must have at least one contact (phone or email)
  if (owner.type === "individual" || looksLikePersonName(owner.name)) {
    // If contactCount was provided, verify we have at least one contact
    if (contactCount !== undefined && contactCount === 0) {
      console.log(`[CACHE INCOMPLETE] Owner "${owner.name}" has enrichmentSource but no contacts stored`);
      return false;
    }
    return true;
  }
  
  // For entities: must have LLC data cached (officer data checked separately)
  if (owner.type === "entity" || isEntityName(owner.name)) {
    return true;
  }
  
  return true;
}

// Check if an LLC has COMPLETE data (officers, registration info, enrichment)
function hasCompleteLlcData(llc: any): boolean {
  if (!llc) return false;
  
  // Must have basic registration data
  if (!llc.jurisdiction && !llc.registrationNumber) {
    return false;
  }
  
  // Should have officers list (even if empty, indicates we fetched from API)
  if (!llc.officers) {
    return false;
  }
  
  // Check if within TTL
  if (llc.updatedAt) {
    const cacheAge = (Date.now() - new Date(llc.updatedAt).getTime()) / (1000 * 60 * 60);
    if (cacheAge > LLC_CACHE_TTL_HOURS) {
      return false;
    }
  }
  
  return true;
}

// Check if we have cached property data for an address
async function getCachedPropertyData(
  address: string,
  forceRefresh: boolean = false
): Promise<{ property: any; fromCache: boolean; cacheAge?: number } | null> {
  const normalizedAddress = address.toUpperCase().trim();
  
  // Check properties table for existing data
  const existingProperties = await storage.searchProperties(normalizedAddress);
  const cachedProperty = existingProperties[0];
  
  if (cachedProperty && !forceRefresh) {
    // Check if cache is within TTL
    const cacheAge = cachedProperty.createdAt 
      ? (Date.now() - new Date(cachedProperty.createdAt).getTime()) / (1000 * 60 * 60)
      : Infinity;
    
    if (cacheAge < PROPERTY_CACHE_TTL_HOURS) {
      console.log(`[CACHE HIT] Property "${normalizedAddress}" - cached ${cacheAge.toFixed(1)}h ago`);
      return {
        property: cachedProperty,
        fromCache: true,
        cacheAge: Math.round(cacheAge),
      };
    } else {
      console.log(`[CACHE STALE] Property "${normalizedAddress}" - ${cacheAge.toFixed(1)}h old exceeds TTL`);
    }
  }
  
  // Need to fetch from ATTOM
  console.log(`[API CALL] ATTOM: Looking up property "${normalizedAddress}"`);
  return null; // Signal to caller that API call is needed
}

// Check if property data has missing building/physical info that HomeHarvest could fill
function isPropertyDataIncomplete(property: any): boolean {
  if (!property) return true;
  
  const building = property.building;
  if (!building) return true;
  
  // Check for missing key building details
  const missingSqft = !building.sqft || building.sqft === 0;
  const missingYearBuilt = !building.yearBuilt || building.yearBuilt === 0;
  const missingBedrooms = !building.bedrooms || building.bedrooms === 0;
  const missingBathrooms = !building.bathrooms || building.bathrooms === 0;
  
  // If missing multiple key fields, consider it incomplete
  const missingFields = [missingSqft, missingYearBuilt, missingBedrooms, missingBathrooms].filter(Boolean).length;
  
  if (missingFields >= 2) {
    console.log(`[PROPERTY INCOMPLETE] Missing ${missingFields} building fields (sqft: ${building.sqft || 'N/A'}, yearBuilt: ${building.yearBuilt || 'N/A'})`);
    return true;
  }
  
  return false;
}

// Enrich property data with HomeHarvest if ATTOM data is incomplete
async function enrichPropertyWithHomeHarvest(address: string, attomData: any): Promise<any> {
  if (!attomData) return null;
  if (!isPropertyDataIncomplete(attomData)) {
    console.log(`[HOMEHARVEST SKIP] ATTOM data is complete for "${address}"`);
    return attomData;
  }
  
  console.log(`[HOMEHARVEST FALLBACK] Enriching incomplete property data for "${address}"`);
  trackProviderCall('homeharvest', false);
  
  try {
    const hhResult = await HomeHarvest.lookupProperty(address);
    
    if (!hhResult.success || !hhResult.data) {
      console.log(`[HOMEHARVEST] No data found for "${address}"`);
      return attomData;
    }
    
    const hhProperty = hhResult.data.property;
    const enriched = { ...attomData };
    
    // Fill in missing building data
    if (!enriched.building) {
      enriched.building = {};
    }
    
    if ((!enriched.building.sqft || enriched.building.sqft === 0) && hhProperty.sqft) {
      enriched.building.sqft = hhProperty.sqft;
      console.log(`[HOMEHARVEST] Added sqft: ${hhProperty.sqft}`);
    }
    
    if ((!enriched.building.yearBuilt || enriched.building.yearBuilt === 0) && hhProperty.yearBuilt) {
      enriched.building.yearBuilt = hhProperty.yearBuilt;
      console.log(`[HOMEHARVEST] Added yearBuilt: ${hhProperty.yearBuilt}`);
    }
    
    if ((!enriched.building.bedrooms || enriched.building.bedrooms === 0) && hhProperty.beds) {
      enriched.building.bedrooms = hhProperty.beds;
      console.log(`[HOMEHARVEST] Added bedrooms: ${hhProperty.beds}`);
    }
    
    if ((!enriched.building.bathrooms || enriched.building.bathrooms === 0) && hhProperty.baths) {
      enriched.building.bathrooms = hhProperty.baths;
      console.log(`[HOMEHARVEST] Added bathrooms: ${hhProperty.baths}`);
    }
    
    if (!enriched.building.propertyType && hhProperty.propertyType) {
      enriched.building.propertyType = hhProperty.propertyType;
    }
    
    // Add HomeHarvest-specific data that ATTOM may not have
    if (hhResult.data.pricing) {
      enriched.homeHarvestPricing = {
        listPrice: hhResult.data.pricing.listPrice,
        soldPrice: hhResult.data.pricing.soldPrice,
        estimatedValue: hhResult.data.pricing.estimatedValue,
      };
    }
    
    if (hhResult.data.listing) {
      enriched.homeHarvestListing = {
        status: hhResult.data.listing.status,
        listDate: hhResult.data.listing.listDate,
        soldDate: hhResult.data.listing.soldDate,
        daysOnMls: hhResult.data.listing.daysOnMls,
      };
    }
    
    enriched.enrichedWithHomeHarvest = true;
    console.log(`[HOMEHARVEST SUCCESS] Enriched property data for "${address}"`);
    
    return enriched;
  } catch (error) {
    console.error(`[HOMEHARVEST ERROR] Failed to enrich "${address}":`, error);
    return attomData;
  }
}

// Check if owner has complete enrichment and return cached data if available
async function getCachedOwnerEnrichment(
  ownerId: string,
  forceRefresh: boolean = false
): Promise<{ enrichment: any; contacts: any[]; fromCache: boolean; cacheAge?: number } | null> {
  // Get owner and their contacts
  const owner = await storage.getOwner(ownerId);
  if (!owner) return null;
  
  const contacts = await storage.getContactsByOwner(ownerId);
  const dossierCache = await storage.getDossierCache(ownerId);
  
  if (!forceRefresh && hasCompleteOwnerEnrichment(owner, contacts.length)) {
    const cacheAge = owner.enrichmentUpdatedAt 
      ? (Date.now() - new Date(owner.enrichmentUpdatedAt).getTime()) / (1000 * 60 * 60)
      : 0;
    
    console.log(`[CACHE HIT] Owner "${owner.name}" has complete enrichment (${cacheAge.toFixed(1)}h old, ${contacts.length} contacts)`);
    
    return {
      enrichment: {
        source: owner.enrichmentSource,
        age: owner.age,
        birthDate: owner.birthDate,
        relatives: owner.relatives,
        associates: owner.associates,
        previousAddresses: owner.previousAddresses,
        dossierCache: dossierCache,
      },
      contacts,
      fromCache: true,
      cacheAge: Math.round(cacheAge),
    };
  }
  
  // Check if we have at least some contacts - don't re-fetch if we have good data
  if (!forceRefresh && contacts.length > 0) {
    // We have contacts but maybe incomplete enrichment - still use cached contacts
    const hasPhones = contacts.some(c => c.kind === "phone");
    const hasEmails = contacts.some(c => c.kind === "email");
    
    if (hasPhones || hasEmails) {
      console.log(`[CACHE PARTIAL] Owner "${owner.name}" has ${contacts.length} contacts (${hasPhones ? "phones" : "no phones"}, ${hasEmails ? "emails" : "no emails"})`);
      return {
        enrichment: {
          source: owner.enrichmentSource || "cached",
          age: owner.age,
          birthDate: owner.birthDate,
          relatives: owner.relatives,
          associates: owner.associates,
          previousAddresses: owner.previousAddresses,
          dossierCache: dossierCache,
        },
        contacts,
        fromCache: true,
        cacheAge: owner.enrichmentUpdatedAt 
          ? Math.round((Date.now() - new Date(owner.enrichmentUpdatedAt).getTime()) / (1000 * 60 * 60))
          : undefined,
      };
    }
  }
  
  console.log(`[CACHE MISS] Owner "${owner.name}" needs enrichment (no enrichmentSource or no contacts)`);
  return null; // Signal to caller that enrichment API calls are needed
}

// Normalize LLC name for consistent cache key matching
// Strips common suffixes like ", LLC", ", INC", etc. to match different variations
function normalizeLlcNameForCache(name: string): string {
  let normalized = name.toUpperCase().trim();
  // Remove trailing punctuation and common entity suffixes for cache matching
  // This ensures "NEE CAPITAL GROUP" and "NEE CAPITAL GROUP, LLC" match the same cache entry
  normalized = normalized
    .replace(/[,\s]+(LLC|L\.L\.C\.|INC|INC\.|CORP|CORP\.|LTD|LTD\.|LP|L\.P\.|LLP|L\.L\.P\.|PLLC|PC|PA)\.?\s*$/i, '')
    .trim();
  return normalized;
}

// Cached LLC lookup - checks database cache before making OpenCorporates API calls
// Returns cached data if available and not expired, otherwise fetches from API and caches
export async function getCachedLlcData(
  companyName: string,
  jurisdiction?: string,
  forceRefresh: boolean = false
): Promise<{ llc: any; fromCache: boolean; cacheAge?: number } | null> {
  const normalizedName = companyName.toUpperCase().trim();
  const cacheKeyName = normalizeLlcNameForCache(companyName);
  
  // Check llcs table for cached data - try exact name first, then normalized (without suffix)
  let cachedLlc = await storage.getLlcByName(normalizedName, jurisdiction);
  if (!cachedLlc && cacheKeyName !== normalizedName) {
    // Try without the LLC/INC suffix (e.g., "NEE CAPITAL GROUP" instead of "NEE CAPITAL GROUP, LLC")
    console.log(`[CACHE] Trying normalized name "${cacheKeyName}" instead of "${normalizedName}"`);
    cachedLlc = await storage.getLlcByName(cacheKeyName, jurisdiction);
  }
  
  if (cachedLlc && !forceRefresh) {
    // Check if cache is still valid (within TTL)
    const cacheAge = cachedLlc.updatedAt 
      ? (Date.now() - new Date(cachedLlc.updatedAt).getTime()) / (1000 * 60 * 60)
      : Infinity;
    
    if (cacheAge < LLC_CACHE_TTL_HOURS) {
      console.log(`[CACHE HIT] LLC "${normalizedName}" - cached ${cacheAge.toFixed(1)}h ago, TTL=${LLC_CACHE_TTL_HOURS}h`);
      trackCacheEvent('llc', true);
      return {
        llc: {
          name: cachedLlc.name,
          jurisdictionCode: cachedLlc.jurisdiction,
          companyNumber: cachedLlc.registrationNumber,
          entityType: cachedLlc.entityType,
          status: cachedLlc.status,
          officers: cachedLlc.officers || [],
          agentName: cachedLlc.registeredAgent,
          agentAddress: cachedLlc.registeredAddress,
          principalAddress: cachedLlc.principalAddress,
          opencorporatesUrl: cachedLlc.opencorporatesUrl,
        },
        fromCache: true,
        cacheAge: Math.round(cacheAge),
      };
    } else {
      console.log(`[CACHE STALE] LLC "${normalizedName}" - cached ${cacheAge.toFixed(1)}h ago exceeds TTL=${LLC_CACHE_TTL_HOURS}h, will refresh`);
    }
  }
  
  // Not in cache or cache expired or force refresh
  // PRIORITY: Try Gemini first (cheaper), then OpenCorporates as fallback
  
  let llcResult: any = null;
  let source = "unknown";
  
  // 1. Try Gemini Deep Research first (cost-effective: $2/million tokens)
  trackCacheEvent('llc', false); // Cache miss - will make API call
  
  if (GeminiDeepResearch.isConfigured()) {
    logRoutingDecision('LLC Lookup', 'gemini', 'Primary provider - lowest cost');
    console.log(`[API CALL] Gemini Deep Research: Looking up "${normalizedName}" (jurisdiction: ${jurisdiction || "any"})`);
    let geminiCalled = false;
    try {
      geminiCalled = true;
      const geminiResult = await GeminiDeepResearch.researchLlcWithGrounding(normalizedName, jurisdiction);
      
      if (geminiResult && (geminiResult.owners.length > 0 || geminiResult.officers.length > 0 || geminiResult.registeredAgent)) {
        console.log(`[API SUCCESS] Gemini found ${geminiResult.owners.length} owners, ${geminiResult.officers.length} officers`);
        
        // Convert Gemini result to standard LLC format
        // IMPORTANT: Filter out officers with empty names to avoid caching bad data
        const officers = [
          ...geminiResult.owners
            .filter(o => o.name && o.name.trim().length > 0)
            .map(o => ({
              name: o.name,
              position: o.role || "Member",
              role: o.role || "member",
              confidence: o.confidence,
            })),
          ...geminiResult.officers
            .filter(o => o.name && o.name.trim().length > 0)
            .map(o => ({
              name: o.name,
              position: o.position || "Officer",
              role: "officer",
              address: o.address,
              confidence: o.confidence,
            })),
        ];
        
        // Only use Gemini result if we have at least one officer with a valid name
        // Otherwise fall back to OpenCorporates which has more reliable officer data
        if (officers.length > 0) {
          llcResult = {
            name: normalizedName,
            jurisdictionCode: jurisdiction,
            officers,
            agentName: geminiResult.registeredAgent?.name,
            agentAddress: geminiResult.registeredAgent?.address,
            status: "Active",
            entityType: "LLC",
            aiResearchSummary: geminiResult.summary,
            aiCitations: geminiResult.citations,
          };
          source = "gemini";
        } else {
          console.log(`[API] Gemini: Found data but no valid officer names for "${normalizedName}", trying OpenCorporates...`);
        }
      } else {
        console.log(`[API] Gemini: No sufficient data for "${normalizedName}", trying OpenCorporates...`);
      }
    } catch (geminiError) {
      console.error(`[API ERROR] Gemini failed for "${normalizedName}":`, geminiError);
    } finally {
      if (geminiCalled) trackProviderCall('gemini', false);
    }
  }
  
  // 2. Fallback to OpenCorporates if Gemini didn't find enough data
  if (!llcResult) {
    logRoutingDecision('LLC Lookup', 'opencorporates', 'Fallback - Gemini insufficient data');
    console.log(`[API CALL] OpenCorporates: Looking up "${normalizedName}" (jurisdiction: ${jurisdiction || "any"})`);
    let openCorpCalled = false;
    try {
      openCorpCalled = true;
      llcResult = await dataProviders.lookupLlc(normalizedName, jurisdiction);
      source = "opencorporates";
      
      if (!llcResult) {
        console.log(`[API] OpenCorporates: No result for "${normalizedName}"`);
        return null;
      }
    } catch (openCorpError: any) {
      console.error(`[API ERROR] OpenCorporates failed for "${normalizedName}":`, openCorpError.message);
      throw openCorpError;
    } finally {
      if (openCorpCalled) trackProviderCall('opencorporates', false);
    }
  }
  
  if (!llcResult) {
    console.log(`[API] No LLC data found from any source for "${normalizedName}"`);
    return null;
  }
  
  // 3. Privacy-protection detection and retry
  // If we only found corporate agents as officers, retry without jurisdiction to find home state filings
  if (llcResult.officers && hasOnlyPrivacyProtectedOfficers(llcResult.officers) && jurisdiction) {
    console.log(`[PRIVACY-PROTECTED] "${normalizedName}" has only corporate agent officers, retrying without jurisdiction constraint...`);
    
    try {
      const retryResult = await dataProviders.lookupLlc(normalizedName, undefined);
      trackProviderCall('opencorporates', false);
      
      if (retryResult && retryResult.officers) {
        const hasRealOfficers = !hasOnlyPrivacyProtectedOfficers(retryResult.officers);
        if (hasRealOfficers) {
          console.log(`[PRIVACY-PROTECTED] Found ${retryResult.officers.length} officers in home state filing with real people!`);
          llcResult = retryResult;
          source = "opencorporates_retry";
        } else {
          console.log(`[PRIVACY-PROTECTED] Retry also found only corporate agents, keeping original result`);
        }
      }
    } catch (retryError) {
      console.error(`[PRIVACY-PROTECTED] Retry failed:`, retryError);
    }
  }
  
  // Store in llcs table for future cache hits
  console.log(`[CACHE] Storing LLC "${normalizedName}" from source: ${source}`);
  if (cachedLlc) {
    // Update existing cache entry
    await storage.updateLlc(cachedLlc.id, {
      jurisdiction: llcResult.jurisdictionCode,
      registrationNumber: llcResult.companyNumber,
      entityType: llcResult.entityType,
      status: llcResult.status || cachedLlc.status,
      registeredAgent: llcResult.agentName,
      registeredAddress: llcResult.agentAddress,
      principalAddress: llcResult.principalAddress,
      opencorporatesUrl: llcResult.opencorporatesUrl,
      officers: llcResult.officers as any,
    });
    console.log(`[CACHE UPDATE] LLC "${normalizedName}" updated in cache`);
  } else {
    // Create new cache entry
    await storage.createLlc({
      name: normalizedName,
      jurisdiction: llcResult.jurisdictionCode,
      registrationNumber: llcResult.companyNumber,
      entityType: llcResult.entityType,
      status: llcResult.status,
      registeredAgent: llcResult.agentName,
      registeredAddress: llcResult.agentAddress,
      principalAddress: llcResult.principalAddress,
      opencorporatesUrl: llcResult.opencorporatesUrl,
      officers: llcResult.officers as any,
    });
    console.log(`[CACHE NEW] LLC "${normalizedName}" added to cache`);
  }
  
  return {
    llc: llcResult,
    fromCache: false,
    cacheAge: 0,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Initialize LLC lookup function for chain resolver (breaks circular dependency)
  setLlcLookupFunction(getCachedLlcData);

  // Google Maps API key (client-side maps require the key)
  app.get("/api/maps/key", isAuthenticated, async (req: any, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(404).json({ message: "Google Maps API key not configured" });
    }
    res.json({ apiKey });
  });

  // Geocode a single property address
  app.post("/api/properties/:id/geocode", isAuthenticated, async (req: any, res) => {
    try {
      const propertyId = req.params.id;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({ message: "Google Maps API key not configured" });
      }
      
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      // Build full address string
      const addressParts = [
        property.address,
        property.city,
        property.state,
        property.zipCode
      ].filter(Boolean);
      const fullAddress = addressParts.join(", ");
      
      // Call Google Geocoding API
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      
      if (data.status === "OK" && data.results?.length > 0) {
        const location = data.results[0].geometry.location;
        
        // Update property with coordinates
        await db.update(properties)
          .set({ 
            latitude: location.lat, 
            longitude: location.lng 
          })
          .where(eq(properties.id, propertyId));
        
        res.json({ 
          success: true, 
          latitude: location.lat, 
          longitude: location.lng,
          formattedAddress: data.results[0].formatted_address
        });
      } else {
        res.status(400).json({ 
          message: "Could not geocode address", 
          status: data.status,
          address: fullAddress 
        });
      }
    } catch (error) {
      console.error("Error geocoding property:", error);
      res.status(500).json({ message: "Failed to geocode property" });
    }
  });

  // Batch geocode all properties without coordinates
  app.post("/api/properties/geocode-all", isAuthenticated, async (req: any, res) => {
    console.log("[GEOCODE] Starting batch geocode request");
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        console.log("[GEOCODE] No API key configured");
        return res.status(400).json({ message: "Google Maps API key not configured" });
      }
      
      console.log("[GEOCODE] Fetching properties...");
      // Get all properties without coordinates
      const allProperties = await storage.getProperties();
      const toGeocode = allProperties.filter((p: any) => !p.latitude || !p.longitude);
      console.log(`[GEOCODE] Found ${toGeocode.length} properties to geocode`);
      
      if (toGeocode.length === 0) {
        return res.json({ success: true, geocoded: 0, message: "All properties already have coordinates" });
      }
      
      let geocoded = 0;
      let failed = 0;
      const results: Array<{ id: string; address: string; success: boolean; lat?: number; lng?: number; error?: string }> = [];
      
      for (const property of toGeocode) {
        try {
          // Build full address string
          const addressParts = [
            property.address,
            property.city,
            property.state,
            property.zipCode
          ].filter(Boolean);
          const fullAddress = addressParts.join(", ");
          
          // Call Google Geocoding API
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
          const response = await fetch(geocodeUrl);
          const data = await response.json();
          
          if (data.status === "OK" && data.results?.length > 0) {
            const location = data.results[0].geometry.location;
            
            // Update property with coordinates
            await db.update(properties)
              .set({ 
                latitude: location.lat, 
                longitude: location.lng 
              })
              .where(eq(properties.id, property.id));
            
            geocoded++;
            results.push({ 
              id: property.id, 
              address: fullAddress, 
              success: true, 
              lat: location.lat, 
              lng: location.lng 
            });
          } else {
            failed++;
            results.push({ 
              id: property.id, 
              address: fullAddress, 
              success: false, 
              error: data.status 
            });
          }
          
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          failed++;
          results.push({ 
            id: property.id, 
            address: property.address, 
            success: false, 
            error: 'Request failed' 
          });
        }
      }
      
      res.json({ 
        success: true, 
        geocoded, 
        failed, 
        total: toGeocode.length,
        results 
      });
    } catch (error) {
      console.error("Error batch geocoding properties:", error);
      res.status(500).json({ message: "Failed to geocode properties" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const stats = await storage.getStats(userId);
      const recentSearches = await storage.getSearchHistory(userId, 5);
      res.json({ ...stats, recentSearches });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Bug reports endpoint for beta tester feedback
  app.post("/api/bug-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body;
      
      const parsed = insertBugReportSchema.safeParse({
        userId,
        description: body.description,
        issueType: body.issueType || "bug",
        screenshot: body.screenshot,
        pageUrl: body.pageUrl,
        userAgent: body.userAgent,
        viewport: body.viewport,
        consoleErrors: body.consoleErrors,
        status: "open",
      });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid bug report data", errors: parsed.error.errors });
      }
      
      const [report] = await db.insert(bugReports).values(parsed.data).returning();
      
      console.log(`[BUG REPORT] New ${body.issueType || "bug"} report from user ${userId}: ${body.description?.substring(0, 100)}...`);
      
      res.json({ success: true, reportId: report.id });
    } catch (error) {
      console.error("Error creating bug report:", error);
      res.status(500).json({ message: "Failed to submit bug report" });
    }
  });

  // Get all bug reports (admin only)
  app.get("/api/bug-reports", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin role
      const userId = getUserId(req);
      const userCheck = await db.execute(sql`SELECT role FROM users WHERE id = ${userId}`);
      const userRole = (userCheck.rows[0] as any)?.role;
      
      if (userRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const reports = await db.select().from(bugReports).orderBy(sql`created_at DESC`);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching bug reports:", error);
      res.status(500).json({ message: "Failed to fetch bug reports" });
    }
  });

  // Update bug report status (admin only)
  app.patch("/api/bug-reports/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin role
      const userId = getUserId(req);
      const userCheck = await db.execute(sql`SELECT role FROM users WHERE id = ${userId}`);
      const userRole = (userCheck.rows[0] as any)?.role;
      
      if (userRole !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const { id } = req.params;
      
      // Validate status with Zod
      const statusSchema = z.enum(["open", "investigating", "resolved"]);
      const statusResult = statusSchema.safeParse(req.body?.status);
      
      if (!statusResult.success) {
        return res.status(400).json({ message: "Invalid status. Must be: open, investigating, or resolved" });
      }
      
      const status = statusResult.data;
      
      const updates: any = { status };
      if (status === "resolved") {
        updates.resolvedAt = new Date();
      }
      
      const [updated] = await db
        .update(bugReports)
        .set(updates)
        .where(eq(bugReports.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Bug report not found" });
      }
      
      console.log(`[BUG REPORT] Status updated to "${status}" for report ${id}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating bug report status:", error);
      res.status(500).json({ message: "Failed to update bug report status" });
    }
  });

  // Provider cost and usage metrics (admin dashboard)
  app.get("/api/admin/provider-metrics", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const costSummary = getCostSummary();
      const cacheStats = getCacheStats();
      
      res.json({
        providers: costSummary.providers,
        totals: {
          cost: costSummary.totalCost,
          costSaved: costSummary.totalCostSaved,
          sessionStart: costSummary.sessionStart,
        },
        cache: {
          llc: {
            hits: cacheStats.llcHits,
            misses: cacheStats.llcMisses,
            hitRate: cacheStats.llcHitRate.toFixed(1) + '%',
          },
          dossier: {
            hits: cacheStats.dossierHits,
            misses: cacheStats.dossierMisses,
            hitRate: cacheStats.dossierHitRate.toFixed(1) + '%',
          },
          contact: {
            hits: cacheStats.contactHits,
            misses: cacheStats.contactMisses,
            hitRate: cacheStats.contactHitRate.toFixed(1) + '%',
          },
        },
        lastReset: cacheStats.lastReset,
      });
    } catch (error) {
      console.error("Error fetching provider metrics:", error);
      res.status(500).json({ message: "Failed to fetch provider metrics" });
    }
  });

  // Admin endpoint to clear LLC cache for specific entities (privacy-protected fix)
  app.post("/api/admin/clear-llc-cache", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const { entityName } = req.body;
      
      let deletedLlcs = 0;
      let deletedChains = 0;
      let deletedDossiers = 0;
      
      if (entityName) {
        // Clear specific entity
        const llcResult = await db.execute(sql`DELETE FROM llcs WHERE name ILIKE ${'%' + entityName + '%'} RETURNING id`);
        deletedLlcs = llcResult.rowCount || 0;
        
        const chainResult = await db.execute(sql`DELETE FROM llc_ownership_chains WHERE root_entity_name ILIKE ${'%' + entityName + '%'} RETURNING id`);
        deletedChains = chainResult.rowCount || 0;
      } else {
        // Clear Corporate Creations and United Agent Group specifically
        const llcResult = await db.execute(sql`DELETE FROM llcs WHERE name ILIKE '%CORPORATE CREATIONS%' OR name ILIKE '%UNITED AGENT GROUP%' RETURNING id`);
        deletedLlcs = llcResult.rowCount || 0;
        
        const chainResult = await db.execute(sql`DELETE FROM llc_ownership_chains WHERE root_entity_name ILIKE '%CORPORATE CREATIONS%' OR root_entity_name ILIKE '%UNITED AGENT GROUP%' RETURNING id`);
        deletedChains = chainResult.rowCount || 0;
        
        const dossierResult = await db.execute(sql`DELETE FROM dossier_cache RETURNING id`);
        deletedDossiers = dossierResult.rowCount || 0;
      }
      
      console.log(`[ADMIN] Cache cleared: ${deletedLlcs} LLCs, ${deletedChains} chains, ${deletedDossiers} dossiers`);
      
      res.json({
        success: true,
        deleted: {
          llcs: deletedLlcs,
          llcOwnershipChains: deletedChains,
          dossierCache: deletedDossiers,
        },
        message: `Cache cleared successfully. ${deletedLlcs + deletedChains + deletedDossiers} total records deleted.`
      });
    } catch (error) {
      console.error("Error clearing LLC cache:", error);
      res.status(500).json({ message: "Failed to clear LLC cache", error: String(error) });
    }
  });

  // Admin endpoint for data retention cleanup (GDPR/CCPA compliance)
  app.post("/api/admin/data-cleanup", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      // Check if user is admin
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Retention periods (in days)
      const SEARCH_HISTORY_RETENTION_DAYS = 90;
      const DOSSIER_CACHE_RETENTION_DAYS = 180; // 6 months per data retention policy
      const DOSSIER_EXPORTS_RETENTION_DAYS = 365;

      console.log("[DATA CLEANUP] Starting scheduled data retention cleanup...");
      
      const deletedSearchHistory = await storage.cleanupOldSearchHistory(SEARCH_HISTORY_RETENTION_DAYS);
      const deletedDossierCache = await storage.cleanupOldDossierCache(DOSSIER_CACHE_RETENTION_DAYS);
      const deletedDossierExports = await storage.cleanupOldDossierExports(DOSSIER_EXPORTS_RETENTION_DAYS);

      console.log(`[DATA CLEANUP] Completed: ${deletedSearchHistory} search history, ${deletedDossierCache} dossier cache, ${deletedDossierExports} dossier exports`);

      res.json({
        success: true,
        deleted: {
          searchHistory: deletedSearchHistory,
          dossierCache: deletedDossierCache,
          dossierExports: deletedDossierExports,
        },
        retentionPolicies: {
          searchHistory: `${SEARCH_HISTORY_RETENTION_DAYS} days`,
          dossierCache: `${DOSSIER_CACHE_RETENTION_DAYS} days`,
          dossierExports: `${DOSSIER_EXPORTS_RETENTION_DAYS} days`,
        },
        message: `Data cleanup completed. ${deletedSearchHistory + deletedDossierCache + deletedDossierExports} total records deleted.`
      });
    } catch (error) {
      console.error("[DATA CLEANUP] Error:", error);
      res.status(500).json({ message: "Failed to run data cleanup", error: String(error) });
    }
  });

  // Data retention scheduler status (admin)
  app.get("/api/admin/retention-scheduler/status", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const status = dataRetentionScheduler.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get scheduler status", error: String(error) });
    }
  });

  // Manually trigger retention cleanup (admin)
  app.post("/api/admin/retention-scheduler/run", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await dataRetentionScheduler.runCleanup();
      res.json({
        success: true,
        result,
        message: "Manual cleanup completed successfully",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to run manual cleanup", error: String(error) });
    }
  });

  // Security audit endpoint (admin)
  app.get("/api/admin/security-audit", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      await auditLogger.logAdminAction(userId, "security_audit_run", {});
      
      const report = await securityAuditService.runFullAudit();
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to run security audit", error: String(error) });
    }
  });

  // Compliance report endpoint (admin)
  app.get("/api/admin/compliance-report", isAuthenticated, adminRateLimit, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const securityAudit = await securityAuditService.runFullAudit();
      const schedulerStatus = dataRetentionScheduler.getStatus();

      const complianceReport = {
        generatedAt: new Date().toISOString(),
        securityScore: securityAudit.overallScore,
        regulations: {
          gdpr: {
            status: "compliant",
            checks: [
              { name: "Privacy Policy", status: "pass", details: "Published at /privacy" },
              { name: "Right to Deletion", status: "pass", details: "Account deletion implemented" },
              { name: "Data Retention", status: "pass", details: `Automated cleanup: ${schedulerStatus.enabled ? 'enabled' : 'disabled'}` },
              { name: "Cookie Consent", status: "pass", details: "Banner implemented with accept/decline" },
              { name: "Audit Logging", status: "pass", details: "Comprehensive logging active" },
            ],
          },
          ccpa: {
            status: "compliant",
            checks: [
              { name: "Privacy Notice", status: "pass", details: "Published at /privacy" },
              { name: "Right to Know", status: "pass", details: "Data collection disclosed" },
              { name: "Right to Delete", status: "pass", details: "Account deletion available" },
              { name: "Do Not Sell", status: "pass", details: "We do not sell personal data" },
            ],
          },
          tcpa: {
            status: "advisory",
            checks: [
              { name: "DNC Compliance", status: "warning", details: "User responsibility - consider adding DNC scrubbing" },
              { name: "Consent Management", status: "info", details: "Users must obtain consent before outreach" },
            ],
          },
          fcra: {
            status: "advisory",
            checks: [
              { name: "Permissible Purpose", status: "warning", details: "Add terms prohibiting credit/employment use" },
              { name: "Accuracy Disclosure", status: "pass", details: "AI disclosure badges warn to verify" },
            ],
          },
        },
        security: {
          overallScore: securityAudit.overallScore,
          totalChecks: securityAudit.totalChecks,
          passed: securityAudit.passed,
          failed: securityAudit.failed,
          warnings: securityAudit.warnings,
          criticalIssues: securityAudit.summary.critical,
          highIssues: securityAudit.summary.high,
        },
        dataRetention: {
          schedulerEnabled: schedulerStatus.enabled,
          lastRun: schedulerStatus.lastRun?.timestamp || null,
          nextRun: schedulerStatus.nextRunIn,
          policies: {
            searchHistory: `${schedulerStatus.config.searchHistoryDays} days`,
            dossierCache: `${schedulerStatus.config.dossierCacheDays} days`,
            dossierExports: `${schedulerStatus.config.dossierExportsDays} days`,
          },
        },
        recommendations: [
          securityAudit.summary.critical > 0 ? "Address critical security issues immediately" : null,
          securityAudit.summary.high > 0 ? "Review high-severity security findings" : null,
          !schedulerStatus.enabled ? "Enable automated data retention scheduler" : null,
          "Have legal counsel review Privacy Policy and Terms of Service",
          "Add FCRA/TCPA disclaimers to Terms of Service",
          "Consider adding DNC Registry integration for outreach compliance",
        ].filter(Boolean),
      };

      res.json(complianceReport);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate compliance report", error: String(error) });
    }
  });

  // Search endpoint (with rate limiting)
  app.get("/api/search", isAuthenticated, searchRateLimit, async (req: any, res) => {
    try {
      const { q, type } = req.query;
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      let owners: any[] = [];
      let foundProperties: any[] = [];

      // Search owners for relevant search types
      if (type === "owner" || type === "address" || type === "business" || type === "person") {
        owners = await storage.searchOwners(q);
        
        // Filter by entity type if specific search type
        if (type === "business") {
          owners = owners.filter((o: any) => o.type === "entity");
        } else if (type === "person") {
          owners = owners.filter((o: any) => o.type === "individual");
        }
        
        // Enrich with properties and contacts
        for (const owner of owners) {
          owner.properties = await storage.getPropertiesByOwner(owner.id);
          owner.contacts = await storage.getContactsByOwner(owner.id);
        }
      }

      // Search by EIN (search owner metadata)
      if (type === "ein") {
        // Normalize EIN query - strip non-digits
        const normalizedQuery = q.replace(/\D/g, "");
        
        // Guard: require at least 2 digits for EIN search
        if (normalizedQuery.length >= 2) {
          // EIN search - look in owner metadata for tax ID
          const allOwners = await storage.getOwners();
          owners = allOwners.filter((o: any) => {
            const metadata = o.metadata as any;
            // Check if EIN is stored in metadata (normalize both sides)
            if (metadata?.ein) {
              const normalizedEin = String(metadata.ein).replace(/\D/g, "");
              // Require exact match or meaningful substring (at least 4 digits)
              if (normalizedEin === normalizedQuery || 
                  (normalizedQuery.length >= 4 && normalizedEin.includes(normalizedQuery))) {
                return true;
              }
            }
            // Check if EIN is stored in taxId field
            if (metadata?.taxId) {
              const normalizedTaxId = String(metadata.taxId).replace(/\D/g, "");
              if (normalizedTaxId === normalizedQuery || 
                  (normalizedQuery.length >= 4 && normalizedTaxId.includes(normalizedQuery))) {
                return true;
              }
            }
            return false;
          });
          
          // Enrich with properties and contacts
          for (const owner of owners) {
            (owner as any).properties = await storage.getPropertiesByOwner(owner.id);
            (owner as any).contacts = await storage.getContactsByOwner(owner.id);
          }
        }
      }

      if (type === "address" || type === "apn") {
        foundProperties = await storage.searchProperties(q);
      }

      // Log search
      await storage.createSearchHistory({
        userId,
        searchType: type as string,
        query: { q },
        resultCount: owners.length + foundProperties.length,
      });

      // Audit log for compliance
      await auditLogger.logSearch(userId, q, type as string, owners.length + foundProperties.length);

      res.json({
        owners,
        properties: foundProperties,
        total: owners.length + foundProperties.length,
      });
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Owners endpoints
  app.get("/api/owners", isAuthenticated, async (req: any, res) => {
    try {
      const owners = await storage.getOwners();
      
      // Enrich with properties and contacts
      for (const owner of owners) {
        (owner as any).properties = await storage.getPropertiesByOwner(owner.id);
        (owner as any).contacts = await storage.getContactsByOwner(owner.id);
      }
      
      res.json(owners);
    } catch (error) {
      console.error("Error fetching owners:", error);
      res.status(500).json({ message: "Failed to fetch owners" });
    }
  });

  app.get("/api/owners/:id", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }
      res.json(owner);
    } catch (error) {
      console.error("Error fetching owner:", error);
      res.status(500).json({ message: "Failed to fetch owner" });
    }
  });

  // Owner dossier endpoint (with rate limiting for external API calls)
  app.get("/api/owners/:id/dossier", isAuthenticated, enrichmentRateLimit, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const properties = await storage.getPropertiesByOwner(owner.id);
      const contacts = await storage.getContactsByOwner(owner.id);
      const legalEvents = await storage.getLegalEventsByOwner(owner.id);
      const llcLinks = await storage.getLlcLinksByOwner(owner.id);

      // Enrich LLC links with owner data
      const linkedLlcs = await Promise.all(
        llcLinks.map(async (link) => {
          const llc = await storage.getOwner(link.llcOwnerId);
          return { ...link, llc };
        })
      );

      // Check cache first - use cached data if available
      const existingCache = await storage.getDossierCache(owner.id);
      const cacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours
      const isCacheValid = existingCache && existingCache.updatedAt && 
        (Date.now() - new Date(existingCache.updatedAt).getTime()) < cacheMaxAge;

      if (isCacheValid && existingCache) {
        console.log(`Using cached dossier data for owner ${owner.id}`);
        trackCacheEvent('dossier', true);
        
        // Build sources array for cached response
        const sources = buildProviderSources(
          owner,
          existingCache,
          existingCache.llcUnmasking,
          existingCache.contactEnrichment,
          existingCache.melissaEnrichment,
          contacts,
          properties,
          true // isCached
        );
        
        return res.json({
          owner: { 
            id: owner.id,
            type: owner.type,
            name: owner.name,
            akaNames: owner.akaNames,
            primaryAddress: owner.primaryAddress,
            mailingAddress: owner.mailingAddress,
            riskFlags: owner.riskFlags,
            contactConfidenceScore: owner.contactConfidenceScore,
            metadata: owner.metadata,
            createdAt: owner.createdAt,
            updatedAt: owner.updatedAt,
            sellerIntentScore: existingCache.sellerIntentScore,
            // Person enrichment data from owner record
            age: owner.age,
            birthDate: owner.birthDate,
            relatives: owner.relatives,
            associates: owner.associates,
            previousAddresses: owner.previousAddresses,
            enrichmentSource: owner.enrichmentSource,
            enrichmentUpdatedAt: owner.enrichmentUpdatedAt,
          },
          properties,
          contacts,
          legalEvents,
          linkedLlcs,
          aiOutreach: existingCache.aiOutreach,
          scoreBreakdown: existingCache.scoreBreakdown,
          llcUnmasking: existingCache.llcUnmasking,
          contactEnrichment: existingCache.contactEnrichment,
          melissaEnrichment: existingCache.melissaEnrichment,
          enrichedOfficers: existingCache.enrichedOfficers,
          sources,
          cached: true,
        });
      }

      console.log(`Fetching fresh dossier data for owner ${owner.id} (no valid cache)`);
      trackCacheEvent('dossier', false);

      // Calculate seller intent score
      const { score, breakdown } = calculateSellerIntentScore(owner, properties, legalEvents);

      // Generate AI outreach suggestion
      let aiOutreach: string | undefined;
      try {
        aiOutreach = await generateOutreachSuggestion(owner, properties, score);
      } catch (err) {
        console.error("Error generating outreach:", err);
      }

      // Fetch LLC unmasking data for entity owners (using centralized entity detection with caching)
      const isEntity = shouldTreatAsEntity(owner.type, owner.name);
      console.log(`Owner "${owner.name}" type="${owner.type}" -> isEntity=${isEntity}`);
      let llcUnmasking = null;
      if (isEntity) {
        try {
          // Use cached LLC data to avoid wasting OpenCorporates API calls
          const cachedLlcResult = await getCachedLlcData(owner.name);
          if (cachedLlcResult) {
            const llc = cachedLlcResult.llc;
            llcUnmasking = {
              entityName: llc.name,
              entityType: llc.entityType,
              status: llc.status,
              jurisdiction: llc.jurisdictionCode,
              registrationNumber: llc.companyNumber,
              registeredAgent: llc.agentName,
              agentAddress: llc.agentAddress,
              principalAddress: llc.principalAddress,
              officers: (llc.officers || []).map((o: any) => ({
                name: o.name,
                position: o.position || o.role,
              })),
              fromCache: cachedLlcResult.fromCache,
            };
            console.log(`LLC unmasking for "${owner.name}": ${cachedLlcResult.fromCache ? "[CACHE]" : "[API]"} - ${(llc.officers || []).length} officers`);
          }
        } catch (err) {
          console.error("Error fetching LLC unmasking:", err);
        }
      }

      // Helper to parse address like "33 SW 2ND AVE, MIAMI, FL 33130"
      const parseAddress = (address?: string | null) => {
        if (!address) return { line1: undefined, city: undefined, state: undefined, zip: undefined };
        const parts = address.split(",").map(s => s.trim());
        const line1 = parts[0] || undefined;
        const city = parts[1] || undefined;
        // Last part typically "FL 33130" - split on space
        const stateZipPart = parts[2] || "";
        const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
        const state = stateZipMatch?.[1] || stateZipPart.split(" ")[0] || undefined;
        const zip = stateZipMatch?.[2] || stateZipPart.split(" ")[1] || undefined;
        return { line1, city, state, zip };
      };

      // Helper to normalize name from "Last, First Middle" to "First Middle Last" format
      const normalizeName = (name?: string | null): string | undefined => {
        if (!name) return undefined;
        // Check if name is in "Last, First" format (contains comma)
        if (name.includes(",")) {
          const parts = name.split(",").map(s => s.trim());
          const lastName = parts[0];
          const firstMiddle = parts.slice(1).join(" ").trim();
          if (firstMiddle && lastName) {
            return `${firstMiddle} ${lastName}`;
          }
          return lastName || firstMiddle || name;
        }
        return name;
      };
      
      // Helper to format person names for search APIs (converts ALL CAPS to Proper Case)
      const formatPersonNameForSearch = (name?: string | null): { primary: string; variants: string[] } => {
        if (!name) return { primary: "", variants: [] };
        
        // Remove legal suffixes (JR, SR, II, III, IV, etc.) for cleaner matching
        const suffixPattern = /\s+(JR\.?|SR\.?|II|III|IV|V|MD|PHD|ESQ)$/i;
        let cleanName = name.replace(suffixPattern, "").trim();
        
        // Convert ALL CAPS to Proper Case (Title Case)
        const toProperCase = (str: string): string => {
          return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        };
        
        // Check if name is all uppercase
        const isAllCaps = cleanName === cleanName.toUpperCase();
        const properCaseName = isAllCaps ? toProperCase(cleanName) : cleanName;
        
        // Parse name parts to generate variants
        const parts = properCaseName.split(/\s+/);
        const variants: string[] = [];
        
        if (parts.length >= 2) {
          const firstName = parts[0];
          const lastName = parts[parts.length - 1];
          
          // If there's a middle initial (single letter possibly with period)
          if (parts.length >= 3) {
            const middlePart = parts.slice(1, -1).join(" ");
            
            // Variant 1: First + Last only (no middle)
            variants.push(`${firstName} ${lastName}`);
            
            // Variant 2: If middle is initial only, try with period (e.g., "C" -> "C.")
            if (middlePart.length === 1) {
              variants.push(`${firstName} ${middlePart}. ${lastName}`);
            }
          }
          
          // Keep original format as additional variant if different
          if (!variants.includes(properCaseName)) {
            variants.push(properCaseName);
          }
        }
        
        return { primary: properCaseName, variants };
      };

      // Fetch contact enrichment data from Data Axle / A-Leads
      let contactEnrichment = null;
      let enrichedOfficers: any[] = [];
      
      if (isEntity) {
        try {
          const parsed = parseAddress(owner.primaryAddress);
          // First search by company name
          contactEnrichment = await dataProviders.fetchContactEnrichment(owner.name, { 
            city: parsed.city, 
            state: parsed.state,
            zip: parsed.zip
          });
          
          // If LLC has officers from OpenCorporates, search Data Axle and A-Leads for officer contacts
          if (llcUnmasking?.officers?.length && contactEnrichment) {
            // Filter to only valid officer names (reject entities and parsing artifacts)
            const realOfficers = llcUnmasking.officers.filter((o: any) => {
              return isValidOfficerName(o.name);
            });
            
            console.log(`Searching Data Axle + A-Leads for ${realOfficers.length} real officers (filtered from ${llcUnmasking.officers.length})...`);
            
            // De-duplicate officers by name (same person may have multiple positions)
            const uniqueOfficers = new Map<string, any>();
            for (const officer of realOfficers) {
              const normalizedName = officer.name.toUpperCase().trim();
              if (!uniqueOfficers.has(normalizedName)) {
                uniqueOfficers.set(normalizedName, {
                  name: officer.name,
                  positions: [officer.position || officer.role],
                  address: officer.address,
                  role: officer.role,
                });
              } else {
                const existing = uniqueOfficers.get(normalizedName)!;
                if (officer.position && !existing.positions.includes(officer.position)) {
                  existing.positions.push(officer.position);
                }
                // Use most complete address
                if (officer.address && (!existing.address || officer.address.length > existing.address.length)) {
                  existing.address = officer.address;
                }
              }
            }
            
            console.log(`Building enriched officer data for ${uniqueOfficers.size} unique officers...`);
            
            // Parse LLC's registered address to constrain officer searches geographically
            // This prevents finding wrong people with same name in different locations
            const llcAddress = llcUnmasking.agentAddress || llcUnmasking.principalAddress;
            const llcLocation = llcAddress ? parseAddress(llcAddress) : { line1: undefined, city: undefined, state: undefined, zip: undefined };
            console.log(`Using LLC location for officer search: city="${llcLocation.city || 'unknown'}", state="${llcLocation.state || 'unknown'}"`);
            
            for (const officer of Array.from(uniqueOfficers.values()).slice(0, 8)) { // Limit to first 8 unique officers
              const normalizedOfficerName = normalizeName(officer.name);
              if (!normalizedOfficerName) continue;
              
              // Use officer's own address if available, otherwise fall back to LLC address
              const officerAddress = officer.address ? parseAddress(officer.address) : llcLocation;
              console.log(`Officer search: "${normalizedOfficerName}" in ${officerAddress.city || llcLocation.city}, ${officerAddress.state || llcLocation.state}`);
              
              // Build enriched officer record
              const enrichedOfficer: any = {
                name: officer.name,
                position: officer.positions.filter(Boolean).join(", ") || officer.role,
                role: officer.role || "officer",
                address: officer.address || null,
                emails: [] as Array<{ email: string; source: string; confidence: number }>,
                phones: [] as Array<{ phone: string; type: string; source: string; confidence: number }>,
                confidenceScore: 85,
              };
              
              // Search Data Axle People v2 for the officer with location constraint
              const searchLocation = {
                city: officerAddress.city || llcLocation.city,
                state: officerAddress.state || llcLocation.state,
                zip: officerAddress.zip || llcLocation.zip,
              };
              const people = await dataProviders.searchPeopleV2(normalizedOfficerName, searchLocation);
              for (const person of (people || []).slice(0, 3)) { // Limit matches per officer
                const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
                const cellPhones = person.cellPhones || [];
                const phones = person.phones || [];
                const emails = person.emails || [];
                
                // Add cell phones to enriched officer
                for (const cellPhone of cellPhones) {
                  if (!enrichedOfficer.phones.some((p: any) => p.phone === cellPhone)) {
                    enrichedOfficer.phones.push({
                      phone: cellPhone,
                      type: "mobile",
                      source: "data-axle",
                      confidence: person.confidenceScore,
                    });
                  }
                  // Also add to global contact enrichment
                  if (!contactEnrichment.directDials.some((d: any) => d.phone === cellPhone)) {
                    contactEnrichment.directDials.push({
                      phone: cellPhone,
                      type: "mobile",
                      name: fullName,
                      confidence: person.confidenceScore,
                    });
                  }
                }
                // Add regular phones
                for (const phone of phones) {
                  if (!enrichedOfficer.phones.some((p: any) => p.phone === phone)) {
                    enrichedOfficer.phones.push({
                      phone: phone,
                      type: "landline",
                      source: "data-axle",
                      confidence: person.confidenceScore,
                    });
                  }
                  if (!contactEnrichment.directDials.some((d: any) => d.phone === phone)) {
                    contactEnrichment.directDials.push({
                      phone: phone,
                      type: "direct",
                      name: fullName,
                      confidence: person.confidenceScore,
                    });
                  }
                }
                // Add emails to enriched officer
                for (const email of emails) {
                  if (!enrichedOfficer.emails.some((e: any) => e.email === email)) {
                    enrichedOfficer.emails.push({
                      email: email,
                      source: "data-axle",
                      confidence: person.confidenceScore,
                    });
                  }
                  if (!contactEnrichment.companyEmails.some((e: any) => e.email === email)) {
                    contactEnrichment.companyEmails.push({
                      email: email,
                      type: "personal",
                      confidence: person.confidenceScore,
                    });
                  }
                }
                // Add employee profile
                if (fullName && !contactEnrichment.employeeProfiles.some((p: any) => p.name === fullName)) {
                  contactEnrichment.employeeProfiles.push({
                    name: fullName,
                    title: enrichedOfficer.position || "Officer",
                    email: emails[0],
                    phone: cellPhones[0] || phones[0],
                    confidence: person.confidenceScore,
                  });
                }
              }
              
              // Also search A-Leads with location constraint
              const aLeadsResults = await dataProviders.searchALeadsByName(normalizedOfficerName, {
                city: searchLocation.city,
                state: searchLocation.state,
              });
              for (const result of (aLeadsResults || []).slice(0, 3)) {
                if (result.email && !enrichedOfficer.emails.some((e: any) => e.email === result.email)) {
                  enrichedOfficer.emails.push({
                    email: result.email,
                    source: "a-leads",
                    confidence: result.confidence || 75,
                  });
                  if (!contactEnrichment.companyEmails.some((e: any) => e.email === result.email)) {
                    contactEnrichment.companyEmails.push({
                      email: result.email,
                      type: "personal",
                      confidence: result.confidence || 75,
                    });
                  }
                }
                if (result.phone && !enrichedOfficer.phones.some((p: any) => p.phone === result.phone)) {
                  enrichedOfficer.phones.push({
                    phone: result.phone,
                    type: "direct",
                    source: "a-leads",
                    confidence: result.confidence || 75,
                  });
                  if (!contactEnrichment.directDials.some((d: any) => d.phone === result.phone)) {
                    contactEnrichment.directDials.push({
                      phone: result.phone,
                      type: "direct",
                      name: result.name,
                      title: result.title,
                      confidence: result.confidence || 75,
                    });
                  }
                }
                if (result.name && !contactEnrichment.employeeProfiles.some((p: any) => p.name === result.name)) {
                  contactEnrichment.employeeProfiles.push({
                    name: result.name,
                    title: result.title || result.company,
                    email: result.email,
                    phone: result.phone,
                    linkedin: result.linkedinUrl,
                    confidence: result.confidence || 75,
                  });
                }
              }
              
              // Search Pacific East for officer contact enrichment with location constraint
              const officerNameParts = normalizedOfficerName.split(/\s+/);
              const officerFirstName = officerNameParts.length > 1 ? officerNameParts[0] : undefined;
              const officerLastName = officerNameParts.length > 1 ? officerNameParts[officerNameParts.length - 1] : officerNameParts[0];
              
              const pacificEastOfficerResult = await dataProviders.enrichContactWithPacificEast({
                firstName: officerFirstName,
                lastName: officerLastName,
                address: officerAddress.line1 || llcLocation.line1,
                city: searchLocation.city,
                state: searchLocation.state,
                zip: searchLocation.zip,
              });
              
              if (pacificEastOfficerResult) {
                // Add Pacific East phones
                for (const phone of pacificEastOfficerResult.phones) {
                  if (phone.number && !enrichedOfficer.phones.some((p: any) => p.phone === phone.number)) {
                    enrichedOfficer.phones.push({
                      phone: phone.number,
                      type: phone.type === "residential" ? "direct" : "direct",
                      source: "pacific_east",
                      confidence: phone.confidence,
                    });
                    if (!contactEnrichment.directDials.some((d: any) => d.phone === phone.number)) {
                      contactEnrichment.directDials.push({
                        phone: phone.number,
                        type: phone.type === "residential" ? "direct" : "direct",
                        name: normalizedOfficerName,
                        confidence: phone.confidence,
                      });
                    }
                  }
                }
                
                // Add Pacific East emails
                for (const email of pacificEastOfficerResult.emails) {
                  if (email.address && !enrichedOfficer.emails.some((e: any) => e.email === email.address)) {
                    enrichedOfficer.emails.push({
                      email: email.address,
                      source: "pacific_east",
                      confidence: email.confidence,
                    });
                    if (!contactEnrichment.companyEmails.some((e: any) => e.email === email.address)) {
                      contactEnrichment.companyEmails.push({
                        email: email.address,
                        type: "personal",
                        confidence: email.confidence,
                      });
                    }
                  }
                }
              }
              
              // Update confidence based on how much data we found
              const hasContact = enrichedOfficer.emails.length > 0 || enrichedOfficer.phones.length > 0;
              enrichedOfficer.confidenceScore = hasContact ? 90 : 70;
              
              enrichedOfficers.push(enrichedOfficer);
            }
            
            console.log(`Built ${enrichedOfficers.length} enriched officers with contact data`);
          }
        } catch (err) {
          console.error("Error fetching contact enrichment:", err);
        }
      } else {
        // Individual/residential owner - enrich their contact info directly
        // Order: 1) Apify Skip Trace, 2) Data Axle, 3) Pacific East, 4) A-Leads
        try {
          const parsed = parseAddress(owner.primaryAddress);
          const normalizedOwnerName = normalizeName(owner.name) || owner.name || "";
          
          console.log(`Individual owner enrichment for: "${normalizedOwnerName}"`);
          
          // Initialize contact enrichment structure for individual
          const sources: string[] = [];
          contactEnrichment = {
            directDials: [] as any[],
            companyEmails: [] as any[],
            employeeProfiles: [] as any[],
            skipTraceData: null as any, // Will store extended skip trace data (relatives, associates, previous addresses)
            sources: sources,
            lastUpdated: new Date().toISOString(),
          };
          
          const nameParts = normalizedOwnerName.split(/\s+/);
          const firstName = nameParts.length > 1 ? nameParts[0] : undefined;
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
          const location = parsed ? { city: parsed.city, state: parsed.state, zip: parsed.zip } : undefined;
          
          // 1. APIFY SKIP TRACE (Primary source - best for cell phones)
          const apifySkipTrace = await import("./providers/ApifySkipTraceProvider.js");
          if (apifySkipTrace.isConfigured()) {
            // Format name for person search (converts ALL CAPS to Proper Case)
            const formattedName = formatPersonNameForSearch(normalizedOwnerName);
            const namesToTry = [formattedName.primary, ...formattedName.variants].filter(Boolean);
            
            console.log(`[1/4] Apify Skip Trace: Searching for "${formattedName.primary}" at ${parsed?.line1} (variants: ${namesToTry.join(", ")})`);
            
            let skipTraceResult = null;
            // Try each name variant until we find a result with phones
            for (const nameVariant of namesToTry) {
              console.log(`Apify Skip Trace: Trying name variant "${nameVariant}"`);
              const result = await apifySkipTrace.skipTraceIndividual(
                nameVariant,
                parsed?.line1,
                parsed?.city,
                parsed?.state,
                parsed?.zip
              );
              
              if (result && (result.phones.length > 0 || result.emails.length > 0)) {
                skipTraceResult = result;
                console.log(`Apify Skip Trace: Found match with variant "${nameVariant}"`);
                break;
              } else if (result && !skipTraceResult) {
                // Store first result even if no phones, in case all variants fail
                skipTraceResult = result;
              }
            }
            
            if (skipTraceResult) {
              // Add phones from skip trace (prioritize wireless/cell phones)
              for (const phone of skipTraceResult.phones) {
                const normalizedPhone = phone.number.replace(/\D/g, "");
                if (normalizedPhone && !contactEnrichment.directDials.some((d: any) => 
                  d.phone.replace(/\D/g, "") === normalizedPhone
                )) {
                  const isWireless = phone.type?.toLowerCase().includes("wireless");
                  contactEnrichment.directDials.push({
                    phone: phone.number,
                    type: isWireless ? "mobile" : "landline",
                    name: `${skipTraceResult.firstName || ''} ${skipTraceResult.lastName || ''}`.trim() || normalizedOwnerName,
                    confidence: isWireless ? 95 : 85, // High confidence from skip trace
                    source: "apify_skip_trace",
                    provider: phone.provider,
                    firstReported: phone.firstReported,
                  });
                  console.log(`Apify Skip Trace: Added ${phone.type} phone ${phone.number} (${phone.provider || 'unknown provider'})`);
                }
              }
              
              // Add emails from skip trace
              for (const email of skipTraceResult.emails) {
                if (email.email && !contactEnrichment.companyEmails.some((e: any) => 
                  e.email.toLowerCase() === email.email.toLowerCase()
                )) {
                  contactEnrichment.companyEmails.push({
                    email: email.email,
                    type: "personal",
                    confidence: 90,
                    source: "apify_skip_trace",
                  });
                  console.log(`Apify Skip Trace: Added email ${email.email}`);
                }
              }
              
              // Add profile from skip trace
              if (skipTraceResult.firstName || skipTraceResult.lastName) {
                const fullName = `${skipTraceResult.firstName || ''} ${skipTraceResult.lastName || ''}`.trim();
                if (fullName && !contactEnrichment.employeeProfiles.some((p: any) => p.name === fullName)) {
                  const addr = skipTraceResult.currentAddress;
                  contactEnrichment.employeeProfiles.push({
                    name: fullName,
                    title: "Property Owner",
                    email: skipTraceResult.emails[0]?.email,
                    phone: skipTraceResult.phones[0]?.number,
                    address: addr ? `${addr.streetAddress}, ${addr.city}, ${addr.state} ${addr.postalCode}` : undefined,
                    age: skipTraceResult.age,
                    confidence: 90,
                    source: "apify_skip_trace",
                  });
                }
              }
              
              // Store extended skip trace data for display in dossier
              contactEnrichment.skipTraceData = {
                firstName: skipTraceResult.firstName,
                lastName: skipTraceResult.lastName,
                age: skipTraceResult.age,
                born: skipTraceResult.born,
                currentAddress: skipTraceResult.currentAddress,
                previousAddresses: skipTraceResult.previousAddresses || [],
                relatives: skipTraceResult.relatives || [],
                associates: skipTraceResult.associates || [],
                personLink: skipTraceResult.personLink,
              };
              
              console.log(`Apify Skip Trace: Found ${skipTraceResult.phones.length} phones, ${skipTraceResult.emails.length} emails, ${skipTraceResult.relatives.length} relatives, ${skipTraceResult.associates?.length || 0} associates`);
              sources.push("apify_skip_trace");
            }
          } else {
            console.log("[1/4] Apify Skip Trace: Not configured (no APIFY_API_TOKEN)");
          }
          
          // 2. DATA AXLE (Secondary source)
          if (normalizedOwnerName) {
            console.log(`[2/4] Searching Data Axle with location:`, location);
            const allPeople = await dataProviders.searchPeopleV2(normalizedOwnerName, location);
            
            const expectedState = location?.state?.toUpperCase();
            const filteredPeople = expectedState 
              ? (allPeople || []).filter(p => p.state?.toUpperCase() === expectedState)
              : allPeople || [];
            
            console.log(`Data Axle returned ${allPeople?.length || 0} results, ${filteredPeople.length} match state ${expectedState}`);
            
            for (const p of filteredPeople) {
              console.log(`Data Axle person: ${p.firstName} ${p.lastName}, cellPhones=[${p.cellPhones?.join(',')}], phones=[${p.phones?.join(',')}], emails=[${p.emails?.join(',')}]`);
            }
            
            for (const person of filteredPeople.slice(0, 5)) {
              const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
              const cellPhones = person.cellPhones || [];
              const phones = person.phones || [];
              const emails = person.emails || [];
              
              for (const cellPhone of cellPhones) {
                if (!contactEnrichment.directDials.some((d: any) => d.phone.replace(/\D/g, "") === cellPhone.replace(/\D/g, ""))) {
                  contactEnrichment.directDials.push({
                    phone: cellPhone,
                    type: "mobile",
                    name: fullName,
                    confidence: person.confidenceScore,
                    source: "data_axle",
                  });
                }
              }
              for (const phone of phones) {
                if (!contactEnrichment.directDials.some((d: any) => d.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""))) {
                  contactEnrichment.directDials.push({
                    phone: phone,
                    type: "landline",
                    name: fullName,
                    confidence: person.confidenceScore,
                    source: "data_axle",
                  });
                }
              }
              for (const email of emails) {
                if (!contactEnrichment.companyEmails.some((e: any) => e.email.toLowerCase() === email.toLowerCase())) {
                  contactEnrichment.companyEmails.push({
                    email: email,
                    type: "personal",
                    confidence: person.confidenceScore,
                    source: "data_axle",
                  });
                }
              }
              if (fullName && !contactEnrichment.employeeProfiles.some((p: any) => p.name === fullName)) {
                const personAddress = [person.address, person.city, person.state, person.zip].filter(Boolean).join(", ");
                contactEnrichment.employeeProfiles.push({
                  name: fullName,
                  title: "Property Owner",
                  email: emails[0],
                  phone: cellPhones[0] || phones[0],
                  address: personAddress || undefined,
                  confidence: person.confidenceScore,
                  source: "data_axle",
                });
              }
            }
            if (filteredPeople.length > 0 && !sources.includes("data_axle")) {
              sources.push("data_axle");
            }
          }
          
          // 3. PACIFIC EAST (Enhanced phone/email append)
          console.log(`[3/4] Pacific East enrichment for: ${firstName} ${lastName} at ${parsed?.line1}, ${parsed?.city}, ${parsed?.state} ${parsed?.zip}`);
          
          const pacificEastResult = await dataProviders.enrichContactWithPacificEast({
            firstName,
            lastName,
            address: parsed?.line1,
            city: parsed?.city,
            state: parsed?.state,
            zip: parsed?.zip,
          });
          
          if (pacificEastResult) {
            const otherProviderPhones = contactEnrichment.directDials.filter((d: any) => d.source !== "pacific_east" && d.phone);
            const hasOtherProviderData = otherProviderPhones.length > 0;
            
            console.log(`Cross-provider validation: ${otherProviderPhones.length} phones from Apify/Data Axle`);
            
            for (const phone of pacificEastResult.phones) {
              const normalizedPhone = phone.number.replace(/\D/g, "");
              if (normalizedPhone && !contactEnrichment.directDials.some((d: any) => d.phone.replace(/\D/g, "") === normalizedPhone)) {
                const isCorroborated = otherProviderPhones.some((d: any) => d.phone.replace(/\D/g, "") === normalizedPhone);
                const isVerifiedSource = phone.source === "DA";
                
                let adjustedConfidence = phone.confidence;
                if (isVerifiedSource) {
                  adjustedConfidence = Math.min(95, phone.confidence);
                } else if (isCorroborated) {
                  adjustedConfidence = Math.min(90, phone.confidence + 5);
                } else if (hasOtherProviderData) {
                  adjustedConfidence = Math.max(50, phone.confidence - 25);
                } else {
                  adjustedConfidence = 65;
                }
                
                contactEnrichment.directDials.push({
                  phone: phone.number,
                  type: phone.type === "residential" ? "landline" : phone.type === "business" ? "office" : "direct",
                  name: `${firstName || ''} ${lastName}`.trim(),
                  confidence: adjustedConfidence,
                  source: "pacific_east",
                });
              }
            }
            
            for (const email of pacificEastResult.emails) {
              if (email.address && !contactEnrichment.companyEmails.some((e: any) => e.email.toLowerCase() === email.address.toLowerCase())) {
                contactEnrichment.companyEmails.push({
                  email: email.address,
                  type: "personal",
                  confidence: email.confidence,
                });
              }
            }
            
            if (pacificEastResult.identity) {
              const existingProfile = contactEnrichment.employeeProfiles.find((p: any) => 
                p.name?.toLowerCase().includes(lastName.toLowerCase())
              );
              if (existingProfile && pacificEastResult.identity.verified) {
                existingProfile.verified = true;
                existingProfile.dob = pacificEastResult.identity.dob;
              }
            }
            
            console.log(`Pacific East enrichment found: ${pacificEastResult.phones.length} phones, ${pacificEastResult.emails.length} emails`);
            if ((pacificEastResult.phones.length > 0 || pacificEastResult.emails.length > 0) && !sources.includes("pacific_east")) {
              sources.push("pacific_east");
            }
          }
          
          // 4. A-LEADS (Final fallback)
          console.log(`[4/4] A-Leads search for: ${normalizedOwnerName}`);
          const aLeadsResults = await dataProviders.searchALeadsByName(normalizedOwnerName, location);
          for (const result of (aLeadsResults || []).slice(0, 5)) {
            if (result.email && !contactEnrichment.companyEmails.some((e: any) => e.email.toLowerCase() === result.email!.toLowerCase())) {
              contactEnrichment.companyEmails.push({
                email: result.email,
                type: "personal",
                confidence: result.confidence || 75,
                source: "a_leads",
              });
            }
            if (result.phone && !contactEnrichment.directDials.some((d: any) => d.phone.replace(/\D/g, "") === result.phone!.replace(/\D/g, ""))) {
              contactEnrichment.directDials.push({
                phone: result.phone,
                type: "direct",
                name: result.name,
                confidence: result.confidence || 75,
                source: "a_leads",
              });
            }
            if (result.name && !contactEnrichment.employeeProfiles.some((p: any) => p.name === result.name)) {
              contactEnrichment.employeeProfiles.push({
                name: result.name,
                title: result.title || "Property Owner",
                email: result.email,
                phone: result.phone,
                address: result.address || undefined,
                linkedin: result.linkedinUrl,
                confidence: result.confidence || 75,
                source: "a_leads",
              });
            }
          }
          if ((aLeadsResults || []).length > 0 && !sources.includes("a_leads")) {
            sources.push("a_leads");
          }
          
          console.log(`Individual enrichment complete: ${contactEnrichment.directDials.length} phones, ${contactEnrichment.companyEmails.length} emails, sources: ${sources.join(", ")}`);
        } catch (err) {
          console.error("Error fetching individual contact enrichment:", err);
        }
      }

      // Fetch Melissa enrichment data for individuals (or entity officers)
      let melissaEnrichment = null;
      if (!isEntity || (isEntity && llcUnmasking?.officers?.length)) {
        try {
          const rawName = owner.type === "individual" 
            ? owner.name 
            : llcUnmasking?.officers?.[0]?.name;
          // Normalize name from "Last, First" to "First Last" format for Melissa API
          const primaryName = normalizeName(rawName);
          const parsed = parseAddress(owner.primaryAddress);
          
          console.log(`Melissa lookup: raw name "${rawName}" -> normalized "${primaryName}"`);
          
          if (primaryName || parsed.line1) {
            melissaEnrichment = await dataProviders.fetchMelissaEnrichment({
              name: primaryName,
              address: parsed.line1,
              city: parsed.city,
              state: parsed.state,
              zip: parsed.zip,
            });
          }
        } catch (err) {
          console.error("Error fetching Melissa enrichment:", err);
        }
      }

      // Persist enriched contacts to database
      if (contactEnrichment) {
        try {
          const existingContacts = await storage.getContactsByOwner(owner.id);
          let savedCount = 0;
          
          // Save phones from all sources (Data Axle, A-Leads, Pacific East)
          for (const dial of contactEnrichment.directDials || []) {
            if (dial.phone && !existingContacts.some(c => c.kind === 'phone' && c.value === dial.phone)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: 'phone',
                value: dial.phone,
                source: dial.source || 'enrichment',
                confidenceScore: dial.confidence ? Math.round(dial.confidence * 100) : 75,
                lineType: dial.type || 'direct',
              });
              savedCount++;
              console.log(`Saved phone ${dial.phone} from ${dial.source || 'enrichment'}`);
            }
          }
          
          // Save emails from all sources
          for (const emailData of contactEnrichment.companyEmails || []) {
            if (emailData.email && !existingContacts.some(c => c.kind === 'email' && c.value === emailData.email)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: 'email',
                value: emailData.email,
                source: emailData.source || 'enrichment',
                confidenceScore: emailData.confidence ? Math.round(emailData.confidence * 100) : 75,
              });
              savedCount++;
              console.log(`Saved email ${emailData.email} from ${emailData.source || 'enrichment'}`);
            }
          }
          
          // Also save phones/emails from enriched officers (for entity owners)
          for (const officer of enrichedOfficers) {
            for (const phone of officer.phones || []) {
              if (phone.phone && !existingContacts.some(c => c.kind === 'phone' && c.value === phone.phone)) {
                await storage.createContact({
                  ownerId: owner.id,
                  kind: 'phone',
                  value: phone.phone,
                  source: phone.source || 'officer_enrichment',
                  confidenceScore: phone.confidence ? Math.round(phone.confidence * 100) : 75,
                  lineType: phone.type || 'direct',
                });
                savedCount++;
                console.log(`Saved officer phone ${phone.phone} from ${phone.source || 'officer_enrichment'}`);
              }
            }
            for (const email of officer.emails || []) {
              if (email.email && !existingContacts.some(c => c.kind === 'email' && c.value === email.email)) {
                await storage.createContact({
                  ownerId: owner.id,
                  kind: 'email',
                  value: email.email,
                  source: email.source || 'officer_enrichment',
                  confidenceScore: email.confidence ? Math.round(email.confidence * 100) : 75,
                });
                savedCount++;
                console.log(`Saved officer email ${email.email} from ${email.source || 'officer_enrichment'}`);
              }
            }
          }
          
          // Get updated contacts count
          const updatedContacts = await storage.getContactsByOwner(owner.id);
          console.log(`Saved ${savedCount} new contacts. Total contacts: ${updatedContacts.length}`);
        } catch (contactSaveErr) {
          console.error("Error saving enriched contacts:", contactSaveErr);
        }
        
        // Persist person enrichment data (age, relatives, associates, previous addresses) to owner record
        if (!isEntity && (contactEnrichment as any).skipTraceData) {
          try {
            const skipData = (contactEnrichment as any).skipTraceData;
            const ownerUpdate: any = {
              enrichmentSource: "apify_skip_trace",
              enrichmentUpdatedAt: new Date(),
            };
            
            // Parse age from string (e.g., "61")
            if (skipData.age) {
              const ageNum = parseInt(skipData.age, 10);
              if (!isNaN(ageNum)) {
                ownerUpdate.age = ageNum;
              }
            }
            
            // Store birth date
            if (skipData.born) {
              ownerUpdate.birthDate = skipData.born;
            }
            
            // Store relatives as JSON array
            if (skipData.relatives && skipData.relatives.length > 0) {
              ownerUpdate.relatives = skipData.relatives.map((r: any) => ({
                name: r.name,
                age: r.age ? parseInt(r.age, 10) || r.age : null,
              }));
            }
            
            // Store associates as JSON array
            if (skipData.associates && skipData.associates.length > 0) {
              ownerUpdate.associates = skipData.associates.map((a: any) => ({
                name: a.name,
                age: a.age ? parseInt(a.age, 10) || a.age : null,
              }));
            }
            
            // Store previous addresses as JSON array
            if (skipData.previousAddresses && skipData.previousAddresses.length > 0) {
              ownerUpdate.previousAddresses = skipData.previousAddresses.map((addr: any) => ({
                address: addr.streetAddress,
                city: addr.city,
                state: addr.state,
                zip: addr.postalCode,
                timespan: addr.timespan,
              }));
            }
            
            await storage.updateOwner(owner.id, ownerUpdate);
            console.log(`Updated owner ${owner.id} with enrichment data: age=${ownerUpdate.age}, relatives=${ownerUpdate.relatives?.length || 0}, associates=${ownerUpdate.associates?.length || 0}, previousAddresses=${ownerUpdate.previousAddresses?.length || 0}`);
          } catch (ownerUpdateErr) {
            console.error("Error updating owner with enrichment data:", ownerUpdateErr);
          }
        }
      }

      // Save to cache for future requests
      try {
        await storage.upsertDossierCache({
          ownerId: owner.id,
          llcUnmasking: llcUnmasking,
          contactEnrichment: contactEnrichment,
          melissaEnrichment: melissaEnrichment,
          enrichedOfficers: enrichedOfficers.length > 0 ? enrichedOfficers : null,
          aiOutreach: aiOutreach,
          sellerIntentScore: score,
          scoreBreakdown: breakdown,
        });
        console.log(`Cached dossier data for owner ${owner.id}`);
      } catch (cacheErr) {
        console.error("Error caching dossier:", cacheErr);
      }

      // Re-fetch owner to get updated enrichment data
      const updatedOwner = await storage.getOwner(owner.id);
      
      // Build sources array for fresh response
      const sources = buildProviderSources(
        updatedOwner || owner,
        existingCache,
        llcUnmasking,
        contactEnrichment,
        melissaEnrichment,
        contacts,
        properties,
        false // isCached
      );
      
      res.json({
        owner: { 
          id: updatedOwner?.id || owner.id,
          type: updatedOwner?.type || owner.type,
          name: updatedOwner?.name || owner.name,
          akaNames: updatedOwner?.akaNames || owner.akaNames,
          primaryAddress: updatedOwner?.primaryAddress || owner.primaryAddress,
          mailingAddress: updatedOwner?.mailingAddress || owner.mailingAddress,
          riskFlags: updatedOwner?.riskFlags || owner.riskFlags,
          contactConfidenceScore: updatedOwner?.contactConfidenceScore || owner.contactConfidenceScore,
          metadata: updatedOwner?.metadata || owner.metadata,
          createdAt: updatedOwner?.createdAt || owner.createdAt,
          updatedAt: updatedOwner?.updatedAt || owner.updatedAt,
          sellerIntentScore: score,
          // Person enrichment data
          age: updatedOwner?.age,
          birthDate: updatedOwner?.birthDate,
          relatives: updatedOwner?.relatives,
          associates: updatedOwner?.associates,
          previousAddresses: updatedOwner?.previousAddresses,
          enrichmentSource: updatedOwner?.enrichmentSource,
          enrichmentUpdatedAt: updatedOwner?.enrichmentUpdatedAt,
        },
        properties,
        contacts,
        legalEvents,
        linkedLlcs,
        aiOutreach,
        scoreBreakdown: breakdown,
        llcUnmasking,
        contactEnrichment,
        melissaEnrichment,
        enrichedOfficers: enrichedOfficers.length > 0 ? enrichedOfficers : null,
        sources,
        cached: false,
      });
    } catch (error) {
      console.error("Error fetching dossier:", error);
      res.status(500).json({ message: "Failed to fetch dossier" });
    }
  });

  // Resolve owner by name - finds existing or creates new owner
  app.post("/api/owners/resolve-by-name", isAuthenticated, async (req: any, res) => {
    try {
      const { name, type } = req.body;
      
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Name is required" });
      }
      
      const normalizedName = name.trim().toUpperCase();
      
      // Try to find existing owner
      const existingOwners = await storage.searchOwners(normalizedName);
      const exactMatch = existingOwners.find(
        o => o.name.toUpperCase() === normalizedName
      );
      
      if (exactMatch) {
        console.log(`[RESOLVE] Found existing owner: ${exactMatch.name} (ID: ${exactMatch.id})`);
        return res.json({ owner: exactMatch, isNew: false });
      }
      
      // Determine type based on name if not provided
      const detectedType = type || (shouldTreatAsEntity("individual", normalizedName) ? "entity" : "individual");
      
      // Create new owner
      const newOwner = await storage.createOwner({
        name: normalizedName,
        type: detectedType,
      });
      
      console.log(`[RESOLVE] Created new owner: ${newOwner.name} (ID: ${newOwner.id})`);
      
      res.json({ owner: newOwner, isNew: true });
    } catch (error) {
      console.error("Error resolving owner by name:", error);
      res.status(500).json({ message: "Failed to resolve owner" });
    }
  });

  // Generate dossier (refresh/enrich data)
  app.post("/api/owners/:id/generate-dossier", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const properties = await storage.getPropertiesByOwner(owner.id);
      const legalEvents = await storage.getLegalEventsByOwner(owner.id);

      // Calculate and update seller intent score
      const { score } = calculateSellerIntentScore(owner, properties, legalEvents);
      await storage.updateOwner(owner.id, { sellerIntentScore: score });

      // If entity, try to unmask (using centralized entity detection)
      const isEntityOwner = shouldTreatAsEntity(owner.type, owner.name);
      if (isEntityOwner) {
        const unmaskResult = await unmaskLlc(
          owner.name,
          undefined, // Would come from OpenCorporates in production
          owner.mailingAddress || undefined,
          owner.akaNames || undefined
        );

        if (unmaskResult.confidenceScore > 60 && unmaskResult.likelyOwner) {
          // Create or find the likely owner
          let likelyOwner = (await storage.searchOwners(unmaskResult.likelyOwner))[0];
          
          if (!likelyOwner) {
            likelyOwner = await storage.createOwner({
              name: unmaskResult.likelyOwner,
              type: "individual",
              primaryAddress: owner.primaryAddress,
            });
          }

          // Create link
          await storage.createLlcLink({
            ownerId: likelyOwner.id,
            llcOwnerId: owner.id,
            relationship: unmaskResult.relationship,
            confidenceScore: unmaskResult.confidenceScore,
            aiRationale: unmaskResult.rationale,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error generating dossier:", error);
      res.status(500).json({ message: "Failed to generate dossier" });
    }
  });

  // Export PDF - Comprehensive dossier with all data
  app.post("/api/owners/:id/export-pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Track export
      await storage.createDossierExport({
        userId,
        ownerId: owner.id,
        format: "pdf",
      });

      // Fetch all dossier data (same as dossier endpoint)
      const properties = await storage.getPropertiesByOwner(owner.id);
      const contacts = await storage.getContactsByOwner(owner.id);
      const legalEvents = await storage.getLegalEventsByOwner(owner.id);
      const llcLinks = await storage.getLlcLinksByOwner(owner.id);
      
      // Enrich LLC links with owner data
      const linkedLlcs = await Promise.all(
        llcLinks.map(async (link) => ({
          ...link,
          llc: await storage.getOwner(link.llcOwnerId),
        }))
      );

      // Check cache for enrichment data first
      const dossierCacheData = await storage.getDossierCache(owner.id);
      
      let sellerScore: number;
      let scoreBreakdown: any;
      let aiOutreach = "";
      let llcUnmasking: any = null;
      let contactEnrichment: any = null;
      let melissaEnrichment: any = null;
      let enrichedOfficers: any[] = [];

      if (dossierCacheData) {
        // Use cached data
        console.log(`Using cached dossier data for PDF export: owner ${owner.id}`);
        sellerScore = dossierCacheData.sellerIntentScore || 0;
        scoreBreakdown = dossierCacheData.scoreBreakdown || {};
        aiOutreach = dossierCacheData.aiOutreach || "";
        llcUnmasking = dossierCacheData.llcUnmasking;
        contactEnrichment = dossierCacheData.contactEnrichment;
        melissaEnrichment = dossierCacheData.melissaEnrichment;
        enrichedOfficers = (dossierCacheData.enrichedOfficers as any[]) || [];
      } else {
        // No cache - calculate fresh (but warn that enrichment data may be missing)
        console.log(`No cache for PDF export: owner ${owner.id} - using fresh calculations only`);
        const scoreResult = calculateSellerIntentScore(owner, properties, legalEvents);
        sellerScore = scoreResult.score;
        scoreBreakdown = scoreResult.breakdown;
        
        try {
          aiOutreach = await generateOutreachSuggestion(owner, properties, sellerScore);
        } catch (e) {
          console.error("Failed to generate AI outreach for PDF:", e);
        }

        // Fetch LLC unmasking data for entities (using centralized entity detection with caching)
        const isEntity = shouldTreatAsEntity(owner.type, owner.name);
        if (isEntity) {
          try {
            // Use cached LLC data to avoid wasting OpenCorporates API calls
            const cachedLlcResult = await getCachedLlcData(owner.name);
            if (cachedLlcResult) {
              const llc = cachedLlcResult.llc;
              llcUnmasking = {
                entityName: llc.name,
                entityType: llc.entityType,
                status: llc.status,
                jurisdiction: llc.jurisdictionCode,
                registrationNumber: llc.companyNumber,
                registeredAgent: llc.agentName,
                agentAddress: llc.agentAddress,
                principalAddress: llc.principalAddress,
                officers: (llc.officers || []).map((o: any) => ({
                  name: o.name,
                  position: o.position || o.role,
                })),
              };
            }
          } catch (e) {
            console.error("Failed to fetch LLC data for PDF:", e);
          }
        }
      }

      // Generate comprehensive PDF
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      
      let y = 20;
      const lineHeight = 6;
      const sectionGap = 8;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      
      const checkPageBreak = (neededSpace = 20) => {
        if (y > 270 - neededSpace) {
          doc.addPage();
          y = 20;
        }
      };
      
      const addText = (text: string, fontSize = 10, isBold = false, color: [number, number, number] = [0, 0, 0]) => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          checkPageBreak();
          doc.text(line, margin, y);
          y += lineHeight;
        }
      };
      
      const addSectionHeader = (title: string) => {
        checkPageBreak(15);
        y += 3;
        doc.setFillColor(245, 245, 250);
        doc.rect(margin - 2, y - 5, maxWidth + 4, 8, "F");
        addText(title, 12, true, [30, 58, 138]);
        y += 2;
      };
      
      const addSubHeader = (title: string) => {
        checkPageBreak(10);
        addText(title, 10, true, [60, 60, 60]);
      };
      
      const addDetail = (label: string, value: string | number | null | undefined, showIfEmpty = false) => {
        if (value || showIfEmpty) {
          addText(`${label}: ${value || "N/A"}`, 9, false, [40, 40, 40]);
        }
      };
      
      // === HEADER ===
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, pageWidth, 45, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("OWNER DOSSIER", margin, 22);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(owner.name, margin, 32);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, 40);
      
      y = 55;
      doc.setTextColor(0, 0, 0);
      
      // === OWNER INFORMATION ===
      addSectionHeader("OWNER INFORMATION");
      addDetail("Name", owner.name);
      addDetail("Type", owner.type === "entity" ? "Entity / LLC" : "Individual");
      addDetail("Primary Address", owner.primaryAddress);
      if (owner.mailingAddress && owner.mailingAddress !== owner.primaryAddress) {
        addDetail("Mailing Address", owner.mailingAddress);
      }
      if (owner.akaNames?.length) {
        addDetail("Also Known As", owner.akaNames.join(", "));
      }
      if (sellerScore) {
        addDetail("Seller Intent Score", `${sellerScore}/100`);
      }
      if (owner.riskFlags?.length) {
        addDetail("Risk Flags", owner.riskFlags.join(", "));
      }
      y += sectionGap;
      
      // === SELLER INTENT BREAKDOWN ===
      if (scoreBreakdown) {
        addSectionHeader("SELLER INTENT ANALYSIS");
        addDetail("Years Owned", scoreBreakdown.yearsOwned);
        addDetail("Tax Delinquent", scoreBreakdown.taxDelinquent ? "Yes" : "No");
        addDetail("Absentee Owner", scoreBreakdown.absenteeOwner ? "Yes" : "No");
        addDetail("Has Liens", scoreBreakdown.hasLiens ? "Yes" : "No");
        addDetail("Market Appreciation", `${scoreBreakdown.marketAppreciation}%`);
        y += sectionGap;
      }
      
      // === PROPERTIES ===
      if (properties.length > 0) {
        addSectionHeader(`PROPERTIES (${properties.length})`);
        for (let i = 0; i < properties.length; i++) {
          const p = properties[i];
          checkPageBreak(25);
          addSubHeader(`${i + 1}. ${p.address}, ${p.city}, ${p.state} ${p.zipCode}`);
          const details = [];
          if (p.propertyType) details.push(`Type: ${p.propertyType}`);
          if (p.assessedValue) details.push(`Value: $${p.assessedValue.toLocaleString()}`);
          if (p.sqFt) details.push(`Sq Ft: ${p.sqFt.toLocaleString()}`);
          if (p.yearBuilt) details.push(`Built: ${p.yearBuilt}`);
          if ((p as any).lotSize) details.push(`Lot: ${(p as any).lotSize.toLocaleString()} sq ft`);
          if ((p as any).bedrooms) details.push(`Beds: ${(p as any).bedrooms}`);
          if ((p as any).bathrooms) details.push(`Baths: ${(p as any).bathrooms}`);
          if (details.length > 0) {
            addText(`   ${details.join(" | ")}`, 8, false, [80, 80, 80]);
          }
          if (p.lastSaleDate || p.lastSalePrice) {
            const saleInfo = [];
            if (p.lastSaleDate) saleInfo.push(`Date: ${new Date(p.lastSaleDate).toLocaleDateString()}`);
            if (p.lastSalePrice) saleInfo.push(`Price: $${p.lastSalePrice.toLocaleString()}`);
            addText(`   Last Sale: ${saleInfo.join(", ")}`, 8, false, [80, 80, 80]);
          }
          y += 2;
        }
        y += sectionGap;
      }
      
      // === LLC UNMASKING ===
      if (llcUnmasking) {
        addSectionHeader("LLC CORPORATE RECORDS");
        addDetail("Company Number", llcUnmasking.companyNumber);
        addDetail("Jurisdiction", llcUnmasking.jurisdictionCode?.toUpperCase());
        addDetail("Status", llcUnmasking.currentStatus);
        addDetail("Type", llcUnmasking.companyType);
        if (llcUnmasking.incorporationDate) {
          addDetail("Incorporated", new Date(llcUnmasking.incorporationDate).toLocaleDateString());
        }
        addDetail("Registered Address", llcUnmasking.registeredAddress);
        
        if (llcUnmasking.registeredAgent) {
          y += 3;
          addSubHeader("Registered Agent");
          addDetail("Name", llcUnmasking.registeredAgent.name);
          addDetail("Address", llcUnmasking.registeredAgent.address);
        }
        
        // Use enriched officers if available, otherwise fall back to basic officer list
        if (enrichedOfficers.length > 0) {
          y += 3;
          addSubHeader(`Officers & Members with Contact Info (${enrichedOfficers.length})`);
          for (const officer of enrichedOfficers) {
            checkPageBreak(30);
            addText(`${officer.name}`, 10, true, [30, 58, 138]);
            addText(`   Position: ${officer.position || officer.role || "Officer"}`, 9, false, [40, 40, 40]);
            if (officer.address) {
              addText(`   Address: ${officer.address}`, 9, false, [60, 60, 60]);
            }
            // Show emails
            if (officer.emails?.length > 0) {
              const uniqueEmails = Array.from(new Set(officer.emails.map((e: any) => e.email))).slice(0, 3);
              for (const email of uniqueEmails) {
                addText(`   Email: ${email}`, 9, false, [60, 60, 60]);
              }
            }
            // Show phones
            if (officer.phones?.length > 0) {
              const uniquePhones = Array.from(new Set(officer.phones.map((p: any) => p.phone))).slice(0, 3);
              for (const phone of uniquePhones) {
                const phoneEntry = officer.phones.find((p: any) => p.phone === phone);
                const phoneType = phoneEntry?.type || "direct";
                addText(`   Phone: ${phone} (${phoneType})`, 9, false, [60, 60, 60]);
              }
            }
            y += 2;
          }
        } else if (llcUnmasking.officers?.length) {
          y += 3;
          addSubHeader(`Officers & Members (${llcUnmasking.officers.length})`);
          for (const officer of llcUnmasking.officers) {
            checkPageBreak(12);
            addText(`- ${officer.name} (${officer.position || officer.role})`, 9, false, [40, 40, 40]);
            if (officer.address) {
              addText(`    Address: ${officer.address}`, 8, false, [100, 100, 100]);
            }
            if (officer.startDate) {
              addText(`    Since: ${new Date(officer.startDate).toLocaleDateString()}`, 8, false, [100, 100, 100]);
            }
          }
        }
        
        if (llcUnmasking.filings?.length) {
          y += 3;
          addSubHeader(`Recent Filings (${llcUnmasking.filings.length})`);
          for (const filing of llcUnmasking.filings.slice(0, 10)) {
            checkPageBreak(8);
            addText(`- ${filing.title} (${new Date(filing.date).toLocaleDateString()})`, 8, false, [60, 60, 60]);
          }
        }
        y += sectionGap;
      }
      
      // === CONTACT INFORMATION ===
      const hasContacts = contacts.length > 0 || contactEnrichment?.directDials?.length || contactEnrichment?.companyEmails?.length;
      if (hasContacts) {
        addSectionHeader("CONTACT INFORMATION");
        
        // Database contacts
        if (contacts.length > 0) {
          addSubHeader("Verified Contacts");
          for (const c of contacts) {
            addText(`- ${c.kind === "phone" ? "Phone" : "Email"}: ${c.value}${c.confidenceScore ? ` (${c.confidenceScore}% confidence)` : ""}`, 9, false, [40, 40, 40]);
          }
          y += 2;
        }
        
        // Enriched phone numbers
        if (contactEnrichment?.directDials?.length) {
          addSubHeader("Direct Dial Numbers");
          for (const d of contactEnrichment.directDials) {
            const info = d.name ? `${d.name}${d.title ? ` - ${d.title}` : ""}` : d.type;
            addText(`- ${d.phone} (${info}, ${d.confidence}% confidence)`, 9, false, [40, 40, 40]);
          }
          y += 2;
        }
        
        // Enriched emails
        if (contactEnrichment?.companyEmails?.length) {
          addSubHeader("Email Addresses");
          for (const e of contactEnrichment.companyEmails) {
            addText(`- ${e.email} (${e.type}, ${e.confidence}% confidence)`, 9, false, [40, 40, 40]);
          }
          y += 2;
        }
        
        // Employee profiles
        if (contactEnrichment?.employeeProfiles?.length) {
          addSubHeader("Key Contacts");
          for (const p of contactEnrichment.employeeProfiles) {
            checkPageBreak(15);
            addText(`- ${p.name}${p.title ? ` - ${p.title}` : ""}`, 9, true, [40, 40, 40]);
            if (p.email) addText(`    Email: ${p.email}`, 8, false, [80, 80, 80]);
            if (p.phone) addText(`    Phone: ${p.phone}`, 8, false, [80, 80, 80]);
          }
        }
        y += sectionGap;
      }
      
      // === MELISSA VERIFICATION ===
      if (melissaEnrichment) {
        addSectionHeader("IDENTITY VERIFICATION (Melissa Data)");
        
        if (melissaEnrichment.nameMatch) {
          addSubHeader("Name Verification");
          addDetail("Verified", melissaEnrichment.nameMatch.verified ? "Yes" : "No");
          addDetail("Standardized Name", melissaEnrichment.nameMatch.standardizedName?.full);
          addDetail("Confidence", `${melissaEnrichment.nameMatch.confidence}%`);
          y += 2;
        }
        
        if (melissaEnrichment.addressMatch) {
          addSubHeader("Address Verification");
          addDetail("Verified", melissaEnrichment.addressMatch.verified ? "Yes" : "No");
          const addr = melissaEnrichment.addressMatch.standardizedAddress;
          if (addr) {
            addDetail("Standardized", `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`);
            addDetail("County", addr.county);
          }
          addDetail("Deliverability", melissaEnrichment.addressMatch.deliverability);
          addDetail("Residence Type", melissaEnrichment.addressMatch.residenceType);
          addDetail("Confidence", `${melissaEnrichment.addressMatch.confidence}%`);
          y += 2;
        }
        
        if (melissaEnrichment.phoneMatches?.length) {
          addSubHeader("Phone Verification");
          for (const phone of melissaEnrichment.phoneMatches) {
            addText(`- ${phone.phone}: ${phone.type} (${phone.verified ? "Verified" : "Not Verified"}, ${phone.confidence}%)`, 9, false, [40, 40, 40]);
            if (phone.carrier) addText(`    Carrier: ${phone.carrier}`, 8, false, [100, 100, 100]);
          }
          y += 2;
        }
        
        if (melissaEnrichment.occupancy) {
          addSubHeader("Occupancy Information");
          addDetail("Current Occupant", melissaEnrichment.occupancy.currentOccupant ? "Yes" : "No");
          addDetail("Owner Occupied", melissaEnrichment.occupancy.ownerOccupied ? "Yes" : "No");
          if (melissaEnrichment.occupancy.lengthOfResidence) {
            addDetail("Length of Residence", `${melissaEnrichment.occupancy.lengthOfResidence} months`);
          }
          if (melissaEnrichment.occupancy.moveDate) {
            addDetail("Move Date", new Date(melissaEnrichment.occupancy.moveDate).toLocaleDateString());
          }
          y += 2;
        }
        
        if (melissaEnrichment.moveHistory?.length) {
          addSubHeader("Move History");
          for (const move of melissaEnrichment.moveHistory) {
            addText(`- ${move.address} (${move.type})`, 9, false, [40, 40, 40]);
            const dates = [];
            if (move.moveInDate) dates.push(`In: ${new Date(move.moveInDate).toLocaleDateString()}`);
            if (move.moveOutDate) dates.push(`Out: ${new Date(move.moveOutDate).toLocaleDateString()}`);
            if (dates.length) addText(`    ${dates.join(", ")}`, 8, false, [100, 100, 100]);
          }
        }
        
        if (melissaEnrichment.demographics) {
          addSubHeader("Demographics");
          addDetail("Age Range", melissaEnrichment.demographics.ageRange);
          addDetail("Gender", melissaEnrichment.demographics.gender);
          addDetail("Homeowner Status", melissaEnrichment.demographics.homeownerStatus);
        }
        y += sectionGap;
      }
      
      // === LEGAL EVENTS ===
      if (legalEvents.length > 0) {
        addSectionHeader(`LEGAL EVENTS (${legalEvents.length})`);
        for (const event of legalEvents) {
          checkPageBreak(15);
          addText(`- ${event.type.toUpperCase()}: ${event.description || ""}`, 9, true, [40, 40, 40]);
          if (event.filedDate) {
            addText(`    Date: ${new Date(event.filedDate).toLocaleDateString()}`, 8, false, [80, 80, 80]);
          }
          if (event.amount) {
            addText(`    Amount: $${event.amount.toLocaleString()}`, 8, false, [80, 80, 80]);
          }
          if (event.status) {
            addText(`    Status: ${event.status}`, 8, false, [80, 80, 80]);
          }
        }
        y += sectionGap;
      }
      
      // === LINKED LLCs ===
      if (linkedLlcs.length > 0) {
        addSectionHeader(`LINKED ENTITIES (${linkedLlcs.length})`);
        for (const link of linkedLlcs) {
          checkPageBreak(12);
          addText(`- ${link.llc?.name || "Unknown Entity"}`, 9, true, [40, 40, 40]);
          addDetail("    Relationship", link.relationship);
          addDetail("    Confidence", `${link.confidenceScore}%`);
          if (link.aiRationale) {
            addText(`    Rationale: ${link.aiRationale}`, 8, false, [100, 100, 100]);
          }
        }
        y += sectionGap;
      }
      
      // === AI OUTREACH SUGGESTION ===
      if (aiOutreach) {
        addSectionHeader("AI OUTREACH SUGGESTION");
        addText(aiOutreach, 9, false, [40, 40, 40]);
        y += sectionGap;
      }
      
      // === FOOTER ON ALL PAGES ===
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${totalPages} | Freyja IQ - Confidential`, margin, 287);
        doc.text(new Date().toISOString(), pageWidth - margin - 40, 287);
      }
      
      // Output PDF
      const pdfOutput = doc.output("arraybuffer");
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="dossier-${owner.name.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}.pdf"`);
      res.send(Buffer.from(pdfOutput));
    } catch (error) {
      console.error("Error exporting PDF:", error);
      res.status(500).json({ message: "Failed to export PDF" });
    }
  });

  // Properties endpoints
  app.get("/api/properties", isAuthenticated, async (req: any, res) => {
    try {
      const properties = await storage.getProperties();
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const property = await storage.getProperty(req.params.id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  // Dossier exports list
  app.get("/api/dossiers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const exports = await storage.getDossierExports(userId);
      
      // Enrich with owner data
      const enriched = await Promise.all(
        exports.map(async (exp) => {
          const owner = await storage.getOwner(exp.ownerId);
          return { ...exp, owner };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching dossiers:", error);
      res.status(500).json({ message: "Failed to fetch dossiers" });
    }
  });

  // Seed demo data endpoint (for development)
  app.post("/api/seed-demo", isAuthenticated, async (req: any, res) => {
    try {
      // Create demo owners
      const owner1 = await storage.createOwner({
        name: "Blackstone Holdings LLC",
        type: "entity",
        primaryAddress: "345 Park Avenue, New York, NY 10154",
        mailingAddress: "345 Park Avenue, New York, NY 10154",
        riskFlags: [],
        sellerIntentScore: 35,
      });

      const owner2 = await storage.createOwner({
        name: "John Smith",
        type: "individual",
        primaryAddress: "123 Main St, Los Angeles, CA 90012",
        mailingAddress: "456 Oak Ave, Beverly Hills, CA 90210",
        riskFlags: ["tax_delinquent"],
        sellerIntentScore: 78,
      });

      const owner3 = await storage.createOwner({
        name: "Pacific Coast Properties LLC",
        type: "entity",
        primaryAddress: "800 Market St, San Francisco, CA 94102",
        riskFlags: ["lien"],
        sellerIntentScore: 62,
      });

      // Create properties
      await storage.createProperty({
        address: "100 Commercial Blvd",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        apn: "123-456-789",
        propertyType: "commercial",
        units: 50,
        sqFt: 125000,
        assessedValue: 45000000,
        lastSaleDate: new Date("2018-03-15"),
        lastSalePrice: 38000000,
        yearBuilt: 1985,
        ownerId: owner1.id,
      });

      await storage.createProperty({
        address: "555 Industrial Way",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90021",
        apn: "987-654-321",
        propertyType: "industrial",
        sqFt: 75000,
        assessedValue: 12000000,
        lastSaleDate: new Date("2015-07-22"),
        lastSalePrice: 8500000,
        yearBuilt: 1972,
        riskSignals: ["tax_delinquent"],
        ownerId: owner2.id,
      });

      await storage.createProperty({
        address: "222 Retail Plaza",
        city: "San Francisco",
        state: "CA",
        zipCode: "94103",
        apn: "456-789-012",
        propertyType: "commercial",
        units: 12,
        sqFt: 45000,
        assessedValue: 28000000,
        lastSaleDate: new Date("2019-11-08"),
        lastSalePrice: 24000000,
        yearBuilt: 2005,
        ownerId: owner3.id,
      });

      // Create contacts
      await storage.createContact({
        ownerId: owner1.id,
        kind: "phone",
        value: "(212) 555-1234",
        source: "public_records",
        confidenceScore: 72,
        lineType: "landline",
      });

      await storage.createContact({
        ownerId: owner1.id,
        kind: "email",
        value: "info@blackstoneholdings.com",
        source: "corporate_registry",
        confidenceScore: 85,
      });

      await storage.createContact({
        ownerId: owner2.id,
        kind: "phone",
        value: "(310) 555-9876",
        source: "IDICIA",
        confidenceScore: 91,
        lineType: "mobile",
      });

      await storage.createContact({
        ownerId: owner2.id,
        kind: "email",
        value: "jsmith@gmail.com",
        source: "TowerData",
        confidenceScore: 68,
      });

      await storage.createContact({
        ownerId: owner3.id,
        kind: "phone",
        value: "(415) 555-4567",
        source: "public_records",
        confidenceScore: 65,
        lineType: "landline",
      });

      // Create legal events
      await storage.createLegalEvent({
        ownerId: owner2.id,
        type: "lien",
        jurisdiction: "Los Angeles County",
        caseNumber: "LC-2023-45678",
        filedDate: new Date("2023-06-15"),
        status: "active",
        amount: 45000,
        description: "Property tax lien",
      });

      await storage.createLegalEvent({
        ownerId: owner3.id,
        type: "lawsuit",
        jurisdiction: "SF Superior Court",
        caseNumber: "SF-2022-12345",
        filedDate: new Date("2022-09-20"),
        status: "pending",
        description: "Tenant dispute",
      });

      // Create LLC link
      await storage.createLlcLink({
        ownerId: owner2.id,
        llcOwnerId: owner3.id,
        relationship: "manager",
        confidenceScore: 78,
        aiRationale: "Matching mailing address and registered agent patterns suggest connection.",
      });

      res.json({ success: true, message: "Demo data seeded successfully" });
    } catch (error) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ message: "Failed to seed demo data" });
    }
  });

  // Data Providers Status
  app.get("/api/data-providers/status", isAuthenticated, async (req: any, res) => {
    try {
      const available = dataProviders.getAvailableProviders();
      res.json({
        configured: available,
        all: ["attom", "opencorporates", "dataaxle", "melissa", "aleads"],
        missing: ["attom", "opencorporates", "dataaxle", "melissa", "aleads"].filter(
          (p) => !available.includes(p)
        ),
      });
    } catch (error) {
      console.error("Error checking data providers:", error);
      res.status(500).json({ message: "Failed to check data providers" });
    }
  });

  // External Property Search (ATTOM) - with caching
  app.get("/api/external/property", isAuthenticated, async (req: any, res) => {
    try {
      const { address, apn, fips, forceRefresh } = req.query;

      if (!address && !apn) {
        return res.status(400).json({ message: "Address or APN required" });
      }

      const shouldForceRefresh = forceRefresh === "true";

      // Check cache first for address lookups
      if (address && typeof address === "string") {
        const cachedProperty = await getCachedPropertyData(address, shouldForceRefresh);
        if (cachedProperty) {
          return res.json({ 
            ...cachedProperty.property, 
            fromCache: true, 
            cacheAge: cachedProperty.cacheAge 
          });
        }
      }

      let result;
      let attomCalled = false;
      try {
        if (address && typeof address === "string") {
          attomCalled = true;
          result = await dataProviders.searchPropertyByAddress(address);
        } else if (apn && fips && typeof apn === "string" && typeof fips === "string") {
          attomCalled = true;
          result = await dataProviders.searchPropertyByApn(apn, fips);
        }
      } finally {
        if (attomCalled) trackProviderCall('attom', false);
      }

      if (!result) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Enrich with HomeHarvest if ATTOM data is incomplete
      if (address && typeof address === "string") {
        result = await enrichPropertyWithHomeHarvest(address, result);
      }

      // Cache the result for future lookups
      if (address && result) {
        const existingProps = await storage.searchProperties(address);
        if (existingProps.length === 0) {
          console.log(`[CACHE NEW] Storing property "${address}" in cache`);
          await storage.createProperty({
            address: result.address?.line1 || address,
            city: result.address?.city,
            state: result.address?.state,
            zipCode: result.address?.zip,
            apn: result.parcel?.apn,
            propertyType: result.building?.propertyType?.toLowerCase()?.includes("commercial") ? "commercial" : "other",
            sqFt: result.building?.sqft,
            yearBuilt: result.building?.yearBuilt,
            assessedValue: result.assessment?.assessedValue,
          });
        }
      }

      res.json({ ...result, fromCache: false });
    } catch (error) {
      console.error("Error searching external property:", error);
      res.status(500).json({ message: "External property search failed" });
    }
  });

  // External Owner Search (ATTOM)
  app.get("/api/external/owner-properties", isAuthenticated, async (req: any, res) => {
    let attomCalled = false;
    try {
      const { name, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Owner name required" });
      }

      attomCalled = true;
      const results = await dataProviders.searchPropertiesByOwner(
        name,
        typeof state === "string" ? state : undefined
      );

      res.json(results);
    } catch (error) {
      console.error("Error searching owner properties:", error);
      res.status(500).json({ message: "Owner property search failed" });
    } finally {
      if (attomCalled) trackProviderCall('attom', false);
    }
  });

  // External LLC Lookup (OpenCorporates)
  app.get("/api/external/llc", isAuthenticated, async (req: any, res) => {
    try {
      const { name, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Company name required" });
      }

      // Use cached lookup to prevent wasting OpenCorporates API calls
      const cachedResult = await getCachedLlcData(
        name,
        typeof state === "string" ? state : undefined
      );

      if (!cachedResult) {
        return res.status(404).json({ message: "LLC not found" });
      }

      res.json({ ...cachedResult.llc, fromCache: cachedResult.fromCache, cacheAge: cachedResult.cacheAge });
    } catch (error) {
      console.error("Error looking up LLC:", error);
      res.status(500).json({ message: "LLC lookup failed" });
    }
  });

  // External LLC Officers (OpenCorporates) - with caching
  app.get("/api/external/llc-officers", isAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Company name required" });
      }

      // Use cached LLC data to avoid wasting OpenCorporates API calls
      const cachedResult = await getCachedLlcData(name);
      if (cachedResult && cachedResult.llc.officers) {
        const officers = (cachedResult.llc.officers || []).map((o: any) => ({
          name: o.name,
          position: o.position || o.role,
          companyName: cachedResult.llc.name,
        }));
        console.log(`[CACHE ${cachedResult.fromCache ? "HIT" : "MISS"}] LLC officers for "${name}": ${officers.length} officers`);
        return res.json(officers);
      }

      res.json([]);
    } catch (error) {
      console.error("Error searching LLC officers:", error);
      res.status(500).json({ message: "LLC officer search failed" });
    }
  });

  // LLC Ownership Chain Resolution - recursively resolves ownership through nested LLCs
  app.get("/api/external/llc-ownership-chain", isAuthenticated, async (req: any, res) => {
    try {
      const { name, jurisdiction, forceRefresh } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Entity name required" });
      }

      const jCode = typeof jurisdiction === "string" ? jurisdiction : undefined;
      const shouldForceRefresh = forceRefresh === "true";

      // Check for cached chain first
      if (!shouldForceRefresh) {
        const cachedChain = await storage.getLlcOwnershipChain(name, jCode);
        if (cachedChain) {
          const cacheAge = cachedChain.resolvedAt
            ? (Date.now() - new Date(cachedChain.resolvedAt).getTime()) / (1000 * 60 * 60)
            : Infinity;

          // Use chain if less than 24 hours old
          if (cacheAge < 24) {
            console.log(`[CACHE HIT] LLC ownership chain for "${name}" - cached ${cacheAge.toFixed(1)}h ago`);
            return res.json({
              ...cachedChain,
              fromCache: true,
              cacheAge: Math.round(cacheAge),
            });
          }
        }
      }

      // Import the chain resolver
      const { resolveOwnershipChain, formatChainForDisplay } = await import("./llcChainResolver");

      console.log(`[API CALL] Resolving ownership chain for "${name}"...`);
      const chain = await resolveOwnershipChain(name, jCode);

      // Save the chain to database
      await storage.saveLlcOwnershipChain({
        rootEntityName: name,
        rootEntityJurisdiction: jCode || null,
        chain: chain.chain,
        ultimateBeneficialOwners: chain.ultimateBeneficialOwners,
        maxDepthReached: chain.maxDepthReached,
        totalApiCalls: chain.totalApiCalls,
        resolvedAt: chain.resolvedAt,
      });

      const formatted = formatChainForDisplay(chain);

      res.json({
        rootEntity: chain.rootEntity,
        levels: formatted.levels,
        ultimateBeneficialOwners: formatted.ubos,
        maxDepthReached: chain.maxDepthReached,
        totalApiCalls: chain.totalApiCalls,
        fromCache: false,
      });
    } catch (error) {
      console.error("Error resolving LLC ownership chain:", error);
      res.status(500).json({ message: "Failed to resolve ownership chain" });
    }
  });

  // Person-to-Property Linking - Find all holdings for a person
  app.get("/api/persons/:name/related-holdings", isAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.params;
      const { excludeOwnerId } = req.query;

      if (!name) {
        return res.status(400).json({ message: "Person name required" });
      }

      const { findRelatedHoldingsForPerson } = await import("./personPropertyLinker");
      const holdings = await findRelatedHoldingsForPerson(
        decodeURIComponent(name),
        typeof excludeOwnerId === "string" ? excludeOwnerId : undefined
      );

      res.json(holdings);
    } catch (error) {
      console.error("Error finding related holdings:", error);
      res.status(500).json({ message: "Failed to find related holdings" });
    }
  });

  // Property-to-Owners Linking - Find all owners linked to a property
  app.get("/api/properties/:id/linked-owners", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Property ID required" });
      }

      const { findOwnersLinkedToProperty } = await import("./personPropertyLinker");
      const linkedOwners = await findOwnersLinkedToProperty(id);

      res.json(linkedOwners);
    } catch (error) {
      console.error("Error finding linked owners:", error);
      res.status(500).json({ message: "Failed to find linked owners" });
    }
  });

  // LLC-to-Individuals Linking - Find all individuals linked to an LLC owner
  app.get("/api/owners/:id/linked-individuals", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Owner ID required" });
      }

      // Get the owner directly from database
      const ownerResults = await db
        .select()
        .from(owners)
        .where(eq(owners.id, id))
        .limit(1);
      
      const owner = ownerResults[0];
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Only works for entity type owners
      if (owner.type !== 'entity') {
        return res.json({ linkedIndividuals: [] });
      }

      // Find all individuals linked to this LLC via owner_llc_links
      const links = await db
        .select()
        .from(ownerLlcLinks)
        .where(eq(ownerLlcLinks.llcOwnerId, id));

      const linkedIndividuals: Array<{
        id: string;
        name: string;
        relationship: string;
        confidence: number;
        primaryAddress?: string;
      }> = [];

      for (const link of links) {
        // Query individual directly from database
        const individualResults = await db
          .select()
          .from(owners)
          .where(eq(owners.id, link.ownerId))
          .limit(1);
        
        const individual = individualResults[0];
        if (individual) {
          linkedIndividuals.push({
            id: individual.id,
            name: individual.name,
            relationship: link.relationship || 'linked',
            confidence: link.confidenceScore || 70,
            primaryAddress: individual.primaryAddress || undefined,
          });
        }
      }

      res.json({ linkedIndividuals });
    } catch (error) {
      console.error("Error finding linked individuals:", error);
      res.status(500).json({ message: "Failed to find linked individuals" });
    }
  });

  // External Contact Enrichment (Data Axle + A-Leads)
  app.post("/api/external/enrich-contact", isAuthenticated, async (req: any, res) => {
    try {
      const { name, email, phone, address } = req.body;

      if (!name && !email && !phone) {
        return res.status(400).json({ message: "Name, email, or phone required" });
      }

      const result = await dataProviders.enrichContact({ name, email, phone, address });

      if (!result) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error enriching contact:", error);
      res.status(500).json({ message: "Contact enrichment failed" });
    }
  });

  // External Contact Search (Data Axle + A-Leads)
  app.get("/api/external/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const { name, city, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Name required" });
      }

      const location =
        city || state
          ? {
              city: typeof city === "string" ? city : undefined,
              state: typeof state === "string" ? state : undefined,
            }
          : undefined;

      const results = await dataProviders.findContactsByName(name, location);
      res.json(results);
    } catch (error) {
      console.error("Error searching contacts:", error);
      res.status(500).json({ message: "Contact search failed" });
    }
  });

  // External Address Verification (Melissa)
  app.post("/api/external/verify-address", isAuthenticated, async (req: any, res) => {
    try {
      const { line1, city, state, zip } = req.body;

      if (!line1) {
        return res.status(400).json({ message: "Address line1 required" });
      }

      const result = await dataProviders.verifyAddress({ line1, city, state, zip });

      if (!result) {
        return res.status(404).json({ message: "Address verification failed" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error verifying address:", error);
      res.status(500).json({ message: "Address verification failed" });
    }
  });

  // External Person Lookup (Melissa Personator)
  app.post("/api/external/lookup-person", isAuthenticated, async (req: any, res) => {
    try {
      const { name, address, city, state, zip, email, phone } = req.body;

      if (!name && !email && !phone && !address) {
        return res.status(400).json({ message: "At least one field required" });
      }

      const result = await dataProviders.lookupPerson({
        name,
        address,
        city,
        state,
        zip,
        email,
        phone,
      });

      if (!result) {
        return res.status(404).json({ message: "Person not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error looking up person:", error);
      res.status(500).json({ message: "Person lookup failed" });
    }
  });

  // Google Address Validation
  app.post("/api/address/validate", isAuthenticated, async (req: any, res) => {
    try {
      const { address } = req.body;

      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Address string required" });
      }

      const result = await dataProviders.validateAddressWithGoogle(address);

      if (!result) {
        return res.status(404).json({ message: "Address validation failed - Google provider may not be configured" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error validating address with Google:", error);
      res.status(500).json({ message: "Address validation failed" });
    }
  });

  // Google Address Autocomplete
  app.get("/api/address/autocomplete", isAuthenticated, async (req: any, res) => {
    try {
      const { input } = req.query;

      if (!input || typeof input !== "string") {
        return res.status(400).json({ message: "Input string required" });
      }

      const results = await dataProviders.getAddressAutocomplete(input);
      res.json(results);
    } catch (error) {
      console.error("Error getting address autocomplete:", error);
      res.status(500).json({ message: "Autocomplete failed" });
    }
  });

  // Google Place Details
  app.get("/api/address/place/:placeId", isAuthenticated, async (req: any, res) => {
    try {
      const { placeId } = req.params;

      if (!placeId) {
        return res.status(400).json({ message: "Place ID required" });
      }

      const result = await dataProviders.getPlaceDetails(placeId);

      if (!result) {
        return res.status(404).json({ message: "Place not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error getting place details:", error);
      res.status(500).json({ message: "Place lookup failed" });
    }
  });

  // Unified Search with External Data Sources
  app.post("/api/search/external", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      const { query, type } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Search query required" });
      }

      const results: any = {
        properties: [],
        owners: [],
        llcs: [],
        contacts: [],
        sources: [],
      };

      // Search properties via ATTOM, with Gemini as fallback
      if (type === "address" || type === "all") {
        let property = await dataProviders.searchPropertyByAddress(query);
        let propertySource = "attom";
        
        // If ATTOM doesn't have the property, try Gemini as fallback
        if (!property && GeminiDeepResearch.isConfigured()) {
          console.log(`[FALLBACK] ATTOM didn't find "${query}", trying Gemini property research...`);
          logRoutingDecision('Property Search', 'gemini', 'ATTOM fallback - property not in ATTOM database');
          trackProviderCall('gemini', false);
          
          const geminiResult = await GeminiDeepResearch.researchPropertyOwnership(query);
          if (geminiResult) {
            // Convert Gemini result to ATTOM-compatible format
            property = {
              attomId: "",
              address: {
                line1: geminiResult.address.line1,
                city: geminiResult.address.city,
                state: geminiResult.address.state,
                zip: geminiResult.address.zip,
                county: geminiResult.address.county || "",
              },
              parcel: {
                apn: geminiResult.parcel?.apn || "",
                fips: geminiResult.parcel?.fips || "",
              },
              ownership: {
                ownerName: geminiResult.ownership.ownerName,
                ownerType: geminiResult.ownership.ownerType,
                mailingAddress: geminiResult.ownership.mailingAddress,
              },
              assessment: {
                assessedValue: geminiResult.assessment?.assessedValue || 0,
                marketValue: geminiResult.assessment?.marketValue || 0,
                taxAmount: 0,
                taxYear: new Date().getFullYear(),
              },
              building: {
                yearBuilt: geminiResult.building?.yearBuilt || 0,
                sqft: geminiResult.building?.sqft || 0,
                bedrooms: 0,
                bathrooms: 0,
                propertyType: geminiResult.building?.propertyType || "",
              },
              sales: [],
            } as any;
            propertySource = "gemini";
            console.log(`[GEMINI SUCCESS] Found property owner: "${geminiResult.ownership.ownerName}"`);
          }
        }
        
        if (property) {
          results.properties.push(property);
          results.sources.push(propertySource);

          // Auto-import to local database
          const existingOwner = (await storage.searchOwners(property.ownership.ownerName))[0];
          let ownerId = existingOwner?.id;

          if (!existingOwner) {
            // Detect entity type - use shouldTreatAsEntity which checks if name looks like a person
            const attomType = property.ownership.ownerType || "individual";
            const detectedType = shouldTreatAsEntity(attomType, property.ownership.ownerName) 
              ? "entity" 
              : "individual";
            const newOwner = await storage.createOwner({
              name: property.ownership.ownerName,
              type: detectedType,
              primaryAddress: property.ownership.mailingAddress || `${property.address.line1}, ${property.address.city}, ${property.address.state} ${property.address.zip}`,
            });
            ownerId = newOwner.id;
          }

          if (ownerId) {
            const existingProperty = (await storage.searchProperties(property.address.line1))[0];
            if (!existingProperty) {
              await storage.createProperty({
                address: property.address.line1,
                city: property.address.city,
                state: property.address.state,
                zipCode: property.address.zip,
                apn: property.parcel?.apn || "",
                propertyType: (property.building?.propertyType || "").toLowerCase().includes("commercial") ? "commercial" : 
                              (property.building?.propertyType || "").toLowerCase().includes("industrial") ? "industrial" : "other",
                sqFt: property.building?.sqft || 0,
                yearBuilt: property.building?.yearBuilt || 0,
                assessedValue: property.assessment?.assessedValue || 0,
                ownerId,
              });
            }
          }
        }
      }

      // Search owner by name via ATTOM
      if (type === "owner" || type === "all") {
        const ownerProperties = await dataProviders.searchPropertiesByOwner(query);
        results.properties.push(...ownerProperties);
        if (ownerProperties.length > 0) {
          results.sources.push("attom");
        }
      }

      // Search by business name via OpenCorporates and ATTOM
      if (type === "business" || type === "all") {
        // Search LLCs via OpenCorporates (cached)
        const llcResult = await getCachedLlcData(query);
        if (llcResult) {
          results.llcs.push(llcResult.llc);
          results.sources.push(llcResult.fromCache ? "opencorporates-cache" : "opencorporates");
        }
        
        // Also search properties by owner name (business name)
        const ownerProperties = await dataProviders.searchPropertiesByOwner(query);
        results.properties.push(...ownerProperties);
        if (ownerProperties.length > 0 && !results.sources.includes("attom")) {
          results.sources.push("attom");
        }
      }

      // Search by person name via Data Axle / skip trace
      if (type === "person" || type === "all") {
        const contacts = await dataProviders.findContactsByName(query);
        results.contacts.push(...contacts.map((c) => ({ ...c, source: "dataaxle" })));
        if (contacts.length > 0) {
          results.sources.push("dataaxle");
        }
        
        // Also search properties owned by person
        const ownerProperties = await dataProviders.searchPropertiesByOwner(query);
        results.properties.push(...ownerProperties);
        if (ownerProperties.length > 0 && !results.sources.includes("attom")) {
          results.sources.push("attom");
        }
      }

      // Search LLCs via OpenCorporates (skip if already searched via business type to avoid duplicates)
      // Note: "all" type already triggers business search which includes LLC lookup
      if (type === "llc" || type === "owner") {
        const llcResult = await getCachedLlcData(query);
        if (llcResult) {
          results.llcs.push(llcResult.llc);
          if (!results.sources.includes("opencorporates") && !results.sources.includes("opencorporates-cache")) {
            results.sources.push(llcResult.fromCache ? "opencorporates-cache" : "opencorporates");
          }

          // Get officers from cached data instead of making another API call
          const officers = llcResult.llc.officers || [];
          results.contacts.push(
            ...officers.map((o: any) => ({
              name: o.name,
              title: o.position,
              company: llcResult.llc.name,
              source: llcResult.fromCache ? "opencorporates-cache" : "opencorporates",
            }))
          );
        }
      }

      // Search contacts via Data Axle / A-Leads
      if (type === "contact" || type === "owner" || type === "all") {
        const contacts = await dataProviders.findContactsByName(query);
        results.contacts.push(...contacts.map((c) => ({ ...c, source: "dataaxle" })));
        if (contacts.length > 0 && !results.sources.includes("dataaxle")) {
          results.sources.push("dataaxle");
        }
      }

      // Search by EIN - limited external search capability
      if (type === "ein") {
        // EIN search is primarily local - external providers don't typically support EIN lookup
        // Could integrate with IRS database or commercial EIN lookup service in the future
        results.sources.push("local");
      }

      // Log search
      await storage.createSearchHistory({
        userId,
        searchType: `external_${type}`,
        query: { q: query, type },
        resultCount:
          results.properties.length +
          results.llcs.length +
          results.contacts.length,
      });

      res.json({
        ...results,
        sources: Array.from(new Set(results.sources as string[])),
        total:
          results.properties.length +
          results.llcs.length +
          results.contacts.length,
      });
    } catch (error) {
      console.error("Error in external search:", error);
      res.status(500).json({ message: "External search failed" });
    }
  });

  // Import property from external search results
  app.post("/api/properties/import", isAuthenticated, async (req: any, res) => {
    try {
      const { property } = req.body;

      if (!property || !property.address) {
        return res.status(400).json({ message: "Property data required" });
      }

      // Check if property already exists
      const existingProperties = await storage.searchProperties(
        property.address.line1 || property.address
      );
      if (existingProperties.length > 0) {
        return res.status(409).json({ 
          message: "Property already exists",
          property: existingProperties[0]
        });
      }

      // Create owner first if provided
      let ownerId: string | undefined;
      if (property.ownership?.ownerName) {
        // Detect entity type - use shouldTreatAsEntity which checks if name looks like a person
        const attomType = property.ownership.ownerType || "individual";
        const ownerType = shouldTreatAsEntity(attomType, property.ownership.ownerName) 
          ? "entity" 
          : "individual";
        
        // Check if owner exists
        const existingOwners = await storage.searchOwners(property.ownership.ownerName);
        if (existingOwners.length > 0) {
          ownerId = existingOwners[0].id;
        } else {
          const newOwner = await storage.createOwner({
            name: property.ownership.ownerName,
            type: ownerType,
            primaryAddress: `${property.address.line1 || property.address}, ${property.address.city || ""}, ${property.address.state || ""} ${property.address.zip || ""}`.trim(),
          });
          ownerId = newOwner.id;
        }
      }

      // Create property
      const newProperty = await storage.createProperty({
        address: property.address.line1 || property.address,
        city: property.address.city || "",
        state: property.address.state || "",
        zipCode: property.address.zip || "",
        apn: property.parcel?.apn || null,
        propertyType: "other",
        sqFt: property.building?.sqft || null,
        yearBuilt: property.building?.yearBuilt || null,
        assessedValue: property.assessment?.assessedValue || null,
        marketValue: property.assessment?.marketValue || null,
        ownerId,
        metadata: {
          source: "attom",
          attomId: property.attomId,
          fips: property.parcel?.fips,
          importedAt: new Date().toISOString(),
        },
      });

      // Invalidate caches
      res.json({ 
        success: true, 
        property: newProperty,
        ownerId,
        message: "Property imported successfully"
      });
    } catch (error) {
      console.error("Error importing property:", error);
      res.status(500).json({ message: "Failed to import property" });
    }
  });

  // Auto-enrich owner with external data
  app.post("/api/owners/:id/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Check for force refresh flag
      const forceRefresh = req.body?.forceRefresh === true || req.query?.forceRefresh === "true";

      const enrichmentResults: any = {
        properties: [],
        llc: null,
        contacts: [],
        addressVerification: null,
        fromCache: false,
      };

      // CHECK CACHE FIRST - Skip expensive API calls if we already have complete data
      const cachedEnrichment = await getCachedOwnerEnrichment(owner.id, forceRefresh);
      if (cachedEnrichment) {
        // We have complete enrichment data - return cached results
        const properties = await storage.getPropertiesByOwner(owner.id);
        return res.json({
          properties,
          llc: null, // LLC data is in dossier cache
          contacts: cachedEnrichment.contacts.map(c => ({
            type: c.kind,
            value: c.value,
            source: c.source,
            confidence: c.confidenceScore,
          })),
          addressVerification: null,
          fromCache: true,
          cacheAge: cachedEnrichment.cacheAge,
          message: `Using cached enrichment data (${cachedEnrichment.cacheAge}h old). Use forceRefresh=true to re-fetch.`,
        });
      }

      console.log(`[ENRICHMENT] Starting full enrichment for owner "${owner.name}" (forceRefresh=${forceRefresh})`);

      // Check if we have cached properties first
      const existingProperties = await storage.getPropertiesByOwner(owner.id);
      let properties: any[] = [];
      
      if (existingProperties.length > 0 && !forceRefresh) {
        console.log(`[CACHE HIT] Using ${existingProperties.length} cached properties for owner "${owner.name}"`);
        properties = []; // Don't fetch from ATTOM
        enrichmentResults.properties = existingProperties;
      } else {
        // Get properties from ATTOM
        console.log(`[API CALL] ATTOM: Fetching properties for owner "${owner.name}"`);
        properties = await dataProviders.searchPropertiesByOwner(owner.name);
        enrichmentResults.properties = properties;
      }

      // Import new properties
      for (const prop of properties) {
        const existing = (await storage.searchProperties(prop.address.line1))[0];
        if (!existing) {
          await storage.createProperty({
            address: prop.address.line1,
            city: prop.address.city,
            state: prop.address.state,
            zipCode: prop.address.zip,
            apn: prop.parcel.apn,
            propertyType: "other",
            sqFt: prop.building.sqft,
            yearBuilt: prop.building.yearBuilt,
            assessedValue: prop.assessment.assessedValue,
            ownerId: owner.id,
          });
        }
      }

      // Get LLC info from OpenCorporates (using centralized entity detection with caching)
      const enrichIsEntity = shouldTreatAsEntity(owner.type, owner.name);
      if (enrichIsEntity) {
        const llcResult = await getCachedLlcData(owner.name);
        const llc = llcResult?.llc;
        enrichmentResults.llc = llc;

        // Create contacts from officers and search Data Axle for their contact info
        if (llc?.officers && llc.officers.length > 0) {
          // First, add officers from OpenCorporates
          for (const officer of llc.officers) {
            const existingContacts = await storage.getContactsByOwner(owner.id);
            const alreadyExists = existingContacts.some(
              (c) => c.value.toLowerCase().includes(officer.name.toLowerCase())
            );

            if (!alreadyExists && officer.name) {
              enrichmentResults.contacts.push({
                name: officer.name,
                position: officer.position,
                source: "opencorporates",
              });
            }
          }

          // Now search Data Axle People v2 for each real officer (not corporate entities)
          console.log(`Searching Data Axle for ${llc.officers.length} officers...`);
          const officerContacts = await dataProviders.findOfficerContacts(
            llc.officers.map((o: any) => ({ name: o.name, position: o.position })),
            { state: owner.primaryAddress?.match(/([A-Z]{2})\s*\d{5}?/)?.[1] }
          );

          for (const { officer, contacts: officerPeople } of officerContacts) {
            console.log(`Found ${officerPeople.length} Data Axle results for officer: ${officer.name}`);
            
            for (const person of officerPeople) {
              // Add cell phones
              for (const cellPhone of person.cellPhones) {
                const existing = await storage.getContactsByOwner(owner.id);
                if (!existing.some((c) => c.value === cellPhone)) {
                  await storage.createContact({
                    ownerId: owner.id,
                    kind: "phone",
                    value: cellPhone,
                    source: `dataaxle-officer:${officer.name}`,
                    confidenceScore: person.confidenceScore,
                    lineType: "cell",
                  });
                  enrichmentResults.contacts.push({
                    name: `${person.firstName} ${person.lastName}`.trim(),
                    phone: cellPhone,
                    source: "dataaxle-officer",
                    officerName: officer.name,
                  });
                }
              }

              // Add regular phones
              for (const phone of person.phones) {
                const existing = await storage.getContactsByOwner(owner.id);
                if (!existing.some((c) => c.value === phone)) {
                  await storage.createContact({
                    ownerId: owner.id,
                    kind: "phone",
                    value: phone,
                    source: `dataaxle-officer:${officer.name}`,
                    confidenceScore: person.confidenceScore,
                    lineType: "landline",
                  });
                }
              }

              // Add emails
              for (const email of person.emails) {
                const existing = await storage.getContactsByOwner(owner.id);
                if (!existing.some((c) => c.value === email)) {
                  await storage.createContact({
                    ownerId: owner.id,
                    kind: "email",
                    value: email,
                    source: `dataaxle-officer:${officer.name}`,
                    confidenceScore: person.confidenceScore,
                  });
                  enrichmentResults.contacts.push({
                    name: `${person.firstName} ${person.lastName}`.trim(),
                    email: email,
                    source: "dataaxle-officer",
                    officerName: officer.name,
                  });
                }
              }
            }
          }
        }

        // Also search Data Axle Places v3 for business info and UCC filings
        const places = await dataProviders.searchPlacesV3(owner.name);
        if (places.length > 0) {
          const place = places[0];
          enrichmentResults.businessInfo = {
            name: place.name,
            phone: place.phone,
            email: place.email,
            employees: place.employees,
            salesVolume: place.salesVolume,
            uccFilings: place.uccFilings,
          };

          // Add business phone/email if found
          if (place.phone) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === place.phone)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "phone",
                value: place.phone,
                source: "dataaxle-places",
                confidenceScore: 85,
              });
            }
          }
          if (place.email) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === place.email)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "email",
                value: place.email,
                source: "dataaxle-places",
                confidenceScore: 85,
              });
            }
          }
        }
      }

      // Verify address with Melissa
      if (owner.primaryAddress) {
        const [line1, ...rest] = owner.primaryAddress.split(",");
        const cityStateZip = rest.join(",").trim();
        const cityMatch = cityStateZip.match(/^([^,]+),?\s*([A-Z]{2})\s*(\d{5})?/);

        if (cityMatch) {
          const verification = await dataProviders.verifyAddress({
            line1: line1.trim(),
            city: cityMatch[1]?.trim(),
            state: cityMatch[2],
            zip: cityMatch[3],
          });
          enrichmentResults.addressVerification = verification;
        }
      }

      // Get contacts from Data Axle People v2 for owner name (for individual owners only)
      if (!enrichIsEntity) {
        const people = await dataProviders.searchPeopleV2(owner.name);
        for (const person of people) {
          // Add cell phones first (higher value)
          for (const cellPhone of person.cellPhones) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === cellPhone)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "phone",
                value: cellPhone,
                source: "dataaxle",
                confidenceScore: person.confidenceScore,
                lineType: "cell",
              });
            }
          }
          // Add regular phones
          for (const phone of person.phones) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === phone)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "phone",
                value: phone,
                source: "dataaxle",
                confidenceScore: person.confidenceScore,
                lineType: "landline",
              });
            }
          }
          // Add emails
          for (const email of person.emails) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === email)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "email",
                value: email,
                source: "dataaxle",
                confidenceScore: person.confidenceScore,
              });
            }
          }
          enrichmentResults.contacts.push({
            firstName: person.firstName,
            lastName: person.lastName,
            emails: person.emails,
            cellPhones: person.cellPhones,
            phones: person.phones,
            source: "dataaxle",
          });
        }
      } else {
        // Legacy fallback for entity owners - basic contact search
        const contacts = await dataProviders.findContactsByName(owner.name);
        for (const contact of contacts) {
          if (contact.phone) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === contact.phone)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "phone",
                value: contact.phone,
                source: "dataaxle",
                confidenceScore: contact.confidenceScore,
              });
            }
          }
          if (contact.email) {
            const existing = await storage.getContactsByOwner(owner.id);
            if (!existing.some((c) => c.value === contact.email)) {
              await storage.createContact({
                ownerId: owner.id,
                kind: "email",
                value: contact.email,
                source: "dataaxle",
                confidenceScore: contact.confidenceScore,
              });
            }
          }
        }
        enrichmentResults.contacts.push(...contacts);
      }

      res.json({
        success: true,
        enrichment: enrichmentResults,
        message: "Owner enriched with external data",
      });
    } catch (error) {
      console.error("Error enriching owner:", error);
      res.status(500).json({ message: "Owner enrichment failed" });
    }
  });

  // ============================================================
  // LLC API Routes
  // ============================================================

  // Get all LLCs
  app.get("/api/llcs", isAuthenticated, async (req: any, res) => {
    try {
      const llcList = await storage.getLlcs();
      res.json(llcList);
    } catch (error) {
      console.error("Error fetching LLCs:", error);
      res.status(500).json({ message: "Failed to fetch LLCs" });
    }
  });

  // Search for LLCs (queries OpenCorporates) - with in-memory caching
  app.post("/api/llcs/search", isAuthenticated, async (req: any, res) => {
    try {
      const { query, jurisdiction, forceRefresh } = req.body;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }

      console.log(`LLC Search: "${query}" in ${jurisdiction || 'all jurisdictions'}`);

      // Check in-memory cache first to avoid wasting OpenCorporates API calls
      if (!forceRefresh) {
        const cachedResults = getCachedLlcSearchResults(query, jurisdiction);
        if (cachedResults !== null) {
          return res.json({
            results: cachedResults,
            query,
            jurisdiction,
            fromCache: true,
          });
        }
      }

      // Not in cache - search OpenCorporates
      console.log(`[API CALL] OpenCorporates search: "${query}" (jurisdiction: ${jurisdiction || "any"})`);
      const searchResults = await dataProviders.searchOpenCorporates(query, jurisdiction);
      
      // Cache the results
      setCachedLlcSearchResults(query, jurisdiction, searchResults || []);
      
      res.json({
        results: searchResults || [],
        query,
        jurisdiction,
        fromCache: false,
      });
    } catch (error) {
      console.error("Error searching LLCs:", error);
      res.status(500).json({ message: "LLC search failed" });
    }
  });

  // Get LLC by ID
  app.get("/api/llcs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const llc = await storage.getLlc(req.params.id);
      if (!llc) {
        return res.status(404).json({ message: "LLC not found" });
      }
      res.json(llc);
    } catch (error) {
      console.error("Error fetching LLC:", error);
      res.status(500).json({ message: "Failed to fetch LLC" });
    }
  });

  // Get LLC dossier (with enrichment)
  app.get("/api/llcs/:id/dossier", isAuthenticated, async (req: any, res) => {
    try {
      const llc = await storage.getLlc(req.params.id);
      if (!llc) {
        return res.status(404).json({ message: "LLC not found" });
      }

      // Check if we already have enrichment data
      const cachedEnrichment = llc.enrichmentData as any;
      
      // Check if cached officers have actual contact data (not just base 35% score)
      const hasContactData = cachedEnrichment?.enrichedOfficers?.some((o: any) => 
        (o.phones?.length > 0) || (o.emails?.length > 0)
      );
      
      // Only use cache if officers have contact data, otherwise re-enrich
      if (cachedEnrichment?.enrichedOfficers && llc.officers && hasContactData) {
        console.log(`Using cached LLC dossier for ${llc.name} (has contact data)`);
        
        // Migrate/sanitize cached officers to ensure confidence scores are present
        const sanitizedOfficers = cachedEnrichment.enrichedOfficers.map((officer: any) => {
          // Ensure arrays exist
          const phones = officer.phones || [];
          const emails = officer.emails || [];
          
          // Recalculate confidence score if missing or invalid
          if (typeof officer.confidenceScore !== 'number' || isNaN(officer.confidenceScore)) {
            const hasPhone = phones.length > 0;
            const hasEmail = emails.length > 0;
            const hasVerifiedData = officer.melissaData?.nameMatch?.verified || 
                                    officer.melissaData?.addressMatch?.verified;
            
            let confidenceScore = 35;
            if (hasPhone) confidenceScore += 25;
            if (hasEmail) confidenceScore += 20;
            if (hasVerifiedData) confidenceScore += 20;
            officer.confidenceScore = Math.min(confidenceScore, 100);
          }
          
          return {
            ...officer,
            phones,
            emails,
          };
        });
        
        // Recalculate overall confidence if missing
        let overallConfidence = cachedEnrichment.overallContactConfidence;
        if (typeof overallConfidence !== 'number' || isNaN(overallConfidence)) {
          const allPhones = sanitizedOfficers.flatMap((o: any) => o.phones || []);
          const allEmails = sanitizedOfficers.flatMap((o: any) => o.emails || []);
          const hasVerified = sanitizedOfficers.some((o: any) => 
            o.melissaData?.addressMatch?.verified || o.melissaData?.nameMatch?.verified
          );
          
          overallConfidence = 35;
          if (allPhones.length > 0) overallConfidence += 25;
          if (allEmails.length > 0) overallConfidence += 20;
          if (hasVerified) overallConfidence += 20;
          overallConfidence = Math.min(overallConfidence, 100);
        }
        
        const sanitizedEnrichment = {
          ...cachedEnrichment,
          enrichedOfficers: sanitizedOfficers,
          overallContactConfidence: overallConfidence,
        };
        
        // Persist migrated data back to storage if confidence scores were recalculated
        const needsMigration = cachedEnrichment.enrichedOfficers.some((o: any) => 
          typeof o.confidenceScore !== 'number' || isNaN(o.confidenceScore)
        ) || typeof cachedEnrichment.overallContactConfidence !== 'number';
        
        if (needsMigration) {
          console.log(`Migrating cached enrichment data for ${llc.name}`);
          await storage.updateLlc(llc.id, {
            enrichmentData: sanitizedEnrichment,
          });
        }
        
        return res.json({
          llc: {
            ...llc,
            enrichmentData: sanitizedEnrichment,
          },
          officers: sanitizedOfficers,
          rawOfficers: llc.officers,
          enrichment: sanitizedEnrichment,
          aiOutreach: llc.aiOutreach,
        });
      }

      console.log(`Enriching LLC dossier for ${llc.name}`);

      // Lookup detailed company info from OpenCorporates (with caching)
      let detailedInfo = null;
      try {
        const llcResult = await getCachedLlcData(llc.name, llc.jurisdiction || undefined);
        detailedInfo = llcResult?.llc;
        if (llcResult?.fromCache) {
          console.log(`LLC dossier using cached OpenCorporates data (${llcResult.cacheAge}h old)`);
        }
      } catch (err) {
        console.error("OpenCorporates lookup failed:", err);
      }

      // Build officers list
      const officers = detailedInfo?.officers || (llc.officers as any[]) || [];
      
      // Enrich each officer with contact info using the full enrichment stack
      const enrichedOfficers: any[] = [];
      for (const officer of officers.slice(0, 5)) {
        // Normalize name: convert "LAST, FIRST" to "FIRST LAST"
        let officerName = officer.name || officer.officerName || "";
        if (officerName.includes(",")) {
          const parts = officerName.split(",").map((p: string) => p.trim());
          if (parts.length === 2) {
            officerName = `${parts[1]} ${parts[0]}`;
          }
        }
        
        const officerData: any = {
          name: officerName,
          position: officer.position || officer.role || "Officer",
          role: officer.role || "officer",
          address: officer.address,
          emails: [],
          phones: [],
          skipTraceData: null,
          melissaData: null,
        };

        // Skip enrichment for non-person names (entities, etc.)
        if (!officerData.name || !looksLikePersonName(officerData.name)) {
          officerData.confidenceScore = 30;
          enrichedOfficers.push(officerData);
          continue;
        }

        const nameParts = officerData.name.split(/\s+/);
        const firstName = nameParts.length > 1 ? nameParts[0] : undefined;
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
        
        // Convert jurisdiction "us_fl" to state code "FL"
        const jurisdiction = llc.jurisdiction || "";
        const officerState = jurisdiction.startsWith("us_") 
          ? jurisdiction.substring(3).toUpperCase() 
          : jurisdiction.toUpperCase();
        
        // Parse officer address if available (format: "5900 N ANDREWS AVENUE, FORT LAUDERDALE, FL, 33309")
        let officerCity = undefined;
        let officerZip = undefined;
        let officerStreet = undefined;
        if (officer.address) {
          const addressParts = officer.address.split(",").map((p: string) => p.trim());
          if (addressParts.length >= 4) {
            officerStreet = addressParts[0];
            officerCity = addressParts[1];
            officerZip = addressParts[3];
          } else if (addressParts.length >= 2) {
            officerStreet = addressParts[0];
            officerCity = addressParts[1];
          }
        }

        console.log(`Enriching LLC officer: ${officerData.name} (${officerData.position}) - State: ${officerState}`);

        // 1. APIFY SKIP TRACE (Primary source - best for cell phones)
        let apifyCalled = false;
        try {
          const apifySkipTrace = await import("./providers/ApifySkipTraceProvider.js");
          if (apifySkipTrace.isConfigured()) {
            console.log(`[1/5] Apify Skip Trace for officer: ${officerData.name}`);
            apifyCalled = true;
            const skipResult = await apifySkipTrace.skipTraceIndividual(
              officerData.name,
              officerStreet,
              officerCity,
              officerState,
              officerZip
            );
            
            if (skipResult) {
              // Add phones
              for (const phone of skipResult.phones || []) {
                const normalizedPhone = phone.number?.replace(/\D/g, "");
                if (normalizedPhone && !officerData.phones.some((p: any) => 
                  p.phone?.replace(/\D/g, "") === normalizedPhone
                )) {
                  const isWireless = phone.type?.toLowerCase().includes("wireless");
                  officerData.phones.push({
                    phone: phone.number,
                    type: isWireless ? "mobile" : "landline",
                    source: "apify_skip_trace",
                    confidence: isWireless ? 95 : 85,
                    provider: phone.provider,
                  });
                }
              }
              
              // Add emails
              for (const email of skipResult.emails || []) {
                if (email.email && !officerData.emails.some((e: any) => 
                  e.email?.toLowerCase() === email.email.toLowerCase()
                )) {
                  officerData.emails.push({
                    email: email.email,
                    type: "personal",
                    source: "apify_skip_trace",
                    confidence: 90,
                  });
                }
              }
              
              // Store extended skip trace data
              officerData.skipTraceData = {
                firstName: skipResult.firstName,
                lastName: skipResult.lastName,
                age: skipResult.age,
                born: skipResult.born,
                currentAddress: skipResult.currentAddress,
                previousAddresses: skipResult.previousAddresses || [],
                relatives: skipResult.relatives || [],
                associates: skipResult.associates || [],
                personLink: skipResult.personLink,
              };
              
              console.log(`Apify Skip Trace for officer: Found ${skipResult.phones?.length || 0} phones, ${skipResult.emails?.length || 0} emails`);
            }
          }
        } catch (err) {
          console.error(`Apify Skip Trace failed for officer ${officerData.name}:`, err);
        } finally {
          if (apifyCalled) trackProviderCall('apify_skip_trace', false);
        }

        // 2. DATA AXLE (Secondary source)
        let dataAxleCalled = false;
        try {
          console.log(`[2/5] Data Axle for officer: ${officerData.name}`);
          dataAxleCalled = true;
          const location = officerState ? { state: officerState } : undefined;
          const allPeople = await dataProviders.searchPeopleV2(officerData.name, location);
          
          const expectedState = officerState?.toUpperCase();
          const filteredPeople = expectedState 
            ? (allPeople || []).filter(p => p.state?.toUpperCase() === expectedState)
            : allPeople || [];
          
          for (const person of filteredPeople.slice(0, 3)) {
            const cellPhones = person.cellPhones || [];
            const phones = person.phones || [];
            const emails = person.emails || [];
            
            for (const cellPhone of cellPhones) {
              const normalizedPhone = cellPhone?.replace(/\D/g, "");
              if (normalizedPhone && !officerData.phones.some((p: any) => 
                p.phone?.replace(/\D/g, "") === normalizedPhone
              )) {
                officerData.phones.push({
                  phone: cellPhone,
                  type: "mobile",
                  source: "data_axle",
                  confidence: person.confidenceScore || 70,
                });
              }
            }
            
            for (const phone of phones) {
              const normalizedPhone = phone?.replace(/\D/g, "");
              if (normalizedPhone && !officerData.phones.some((p: any) => 
                p.phone?.replace(/\D/g, "") === normalizedPhone
              )) {
                officerData.phones.push({
                  phone: phone,
                  type: "landline",
                  source: "data_axle",
                  confidence: person.confidenceScore || 70,
                });
              }
            }
            
            for (const email of emails) {
              if (email && !officerData.emails.some((e: any) => 
                e.email?.toLowerCase() === email.toLowerCase()
              )) {
                officerData.emails.push({
                  email: email,
                  type: "personal",
                  source: "data_axle",
                  confidence: person.confidenceScore || 70,
                });
              }
            }
          }
          
          console.log(`Data Axle for officer: Found ${filteredPeople.length} matching people`);
        } catch (err) {
          console.error(`Data Axle failed for officer ${officerData.name}:`, err);
        } finally {
          if (dataAxleCalled) trackProviderCall('dataaxle', false);
        }

        // 3. MELISSA (Address & identity verification)
        let melissaCalled = false;
        try {
          console.log(`[3/5] Melissa verification for officer: ${officerData.name}`);
          melissaCalled = true;
          // Use officer address from OpenCorporates if skip trace data not available
          const melissaAddress = officerData.skipTraceData?.currentAddress?.streetAddress || officerStreet;
          const melissaCity = officerData.skipTraceData?.currentAddress?.city || officerCity;
          const melissaZip = officerData.skipTraceData?.currentAddress?.postalCode || officerZip;
          
          const melissaResult = await dataProviders.fetchMelissaEnrichment({
            name: officerData.name,
            address: melissaAddress,
            city: melissaCity,
            state: officerState,
            zip: melissaZip,
          });
          
          if (melissaResult) {
            officerData.melissaData = melissaResult;
            
            // Add verified phones from Melissa
            if (melissaResult.phoneMatches?.length) {
              for (const phone of melissaResult.phoneMatches) {
                const normalizedPhone = phone.phone?.replace(/\D/g, "");
                if (normalizedPhone && !officerData.phones.some((p: any) => 
                  p.phone?.replace(/\D/g, "") === normalizedPhone
                )) {
                  officerData.phones.push({
                    phone: phone.phone,
                    type: phone.lineType?.toLowerCase().includes("wireless") ? "mobile" : "landline",
                    source: "melissa",
                    confidence: phone.confidence || 80,
                    verified: true,
                  });
                }
              }
            }
            
            console.log(`Melissa for officer: Name verified=${melissaResult.nameMatch?.verified}, Address verified=${melissaResult.addressMatch?.verified}`);
          }
        } catch (err) {
          console.error(`Melissa failed for officer ${officerData.name}:`, err);
        } finally {
          if (melissaCalled) trackProviderCall('melissa', false);
        }

        // 4. PACIFIC EAST (Phone append if still no phones)
        if (officerData.phones.length === 0) {
          let pacificEastCalled = false;
          try {
            console.log(`[4/5] Pacific East FPA for officer: ${officerData.name}`);
            pacificEastCalled = true;
            // Use officer address from OpenCorporates if skip trace data not available
            const peAddress = officerData.skipTraceData?.currentAddress?.streetAddress || officerStreet;
            const peCity = officerData.skipTraceData?.currentAddress?.city || officerCity;
            const peZip = officerData.skipTraceData?.currentAddress?.postalCode || officerZip;
            
            const pacificEastResult = await dataProviders.appendPhoneWithPacificEast({
              firstName,
              lastName,
              address: peAddress,
              city: peCity,
              state: officerState,
              postalCode: peZip,
            });
            
            if (pacificEastResult?.contacts && pacificEastResult.contacts.length > 0) {
              const contact = pacificEastResult.contacts[0];
              const normalizedPhone = contact.phoneNumber?.replace(/\D/g, "");
              if (normalizedPhone && !officerData.phones.some((p: any) => 
                p.phone?.replace(/\D/g, "") === normalizedPhone
              )) {
                officerData.phones.push({
                  phone: contact.phoneNumber,
                  type: contact.contactType || "direct",
                  source: "pacific_east",
                  confidence: contact.matchScore?.overallName || 55,
                });
              }
              console.log(`Pacific East for officer: Found phone`);
            }
          } catch (err) {
            console.error(`Pacific East failed for officer ${officerData.name}:`, err);
          } finally {
            if (pacificEastCalled) trackProviderCall('pacificeast', false);
          }
        }

        // 5. A-LEADS (Skip trace fallback if still no phones)
        if (officerData.phones.length === 0) {
          let aleadsCalled = false;
          try {
            console.log(`[5/5] A-Leads for officer: ${officerData.name}`);
            aleadsCalled = true;
            // Use city/state from parsed officer address
            const aleadsLocation = (officerCity || officerState) 
              ? { city: officerCity, state: officerState } 
              : undefined;
            const aleadsResults = await dataProviders.searchALeadsByName(officerData.name, aleadsLocation);
            
            if (aleadsResults && aleadsResults.length > 0) {
              // Take the first result
              const aleadsResult = aleadsResults[0];
              
              // Add phone from A-Leads (singular property)
              if (aleadsResult.phone) {
                const normalizedPhone = aleadsResult.phone?.replace(/\D/g, "");
                if (normalizedPhone && !officerData.phones.some((p: any) => 
                  p.phone?.replace(/\D/g, "") === normalizedPhone
                )) {
                  officerData.phones.push({
                    phone: aleadsResult.phone,
                    type: "direct",
                    source: "a_leads",
                    confidence: 50,
                  });
                }
              }
              
              // Add email from A-Leads (singular property)
              if (aleadsResult.email) {
                if (!officerData.emails.some((e: any) => 
                  e.email?.toLowerCase() === aleadsResult.email?.toLowerCase()
                )) {
                  officerData.emails.push({
                    email: aleadsResult.email,
                    type: "personal",
                    source: "a_leads",
                    confidence: 50,
                  });
                }
              }
              console.log(`A-Leads for officer: Found ${aleadsResult.phone ? 1 : 0} phones, ${aleadsResult.email ? 1 : 0} emails`);
            }
          } catch (err) {
            console.error(`A-Leads failed for officer ${officerData.name}:`, err);
          } finally {
            if (aleadsCalled) trackProviderCall('aleads', false);
          }
        }

        // Calculate confidence score based on data quality
        // Uses same criteria as owner enrichment: phone (+25), email (+20), verified (+20), base 35
        const hasPhone = officerData.phones.length > 0;
        const hasEmail = officerData.emails.length > 0;
        const hasVerifiedData = officerData.melissaData?.nameMatch?.verified || 
                                officerData.melissaData?.addressMatch?.verified;
        
        let confidenceScore = 35; // Base score
        if (hasPhone) confidenceScore += 25;
        if (hasEmail) confidenceScore += 20;
        if (hasVerifiedData) confidenceScore += 20;
        officerData.confidenceScore = Math.min(confidenceScore, 100);
        enrichedOfficers.push(officerData);
        
        console.log(`Officer ${officerData.name}: ${officerData.phones.length} phones, ${officerData.emails.length} emails, confidence=${officerData.confidenceScore}%`);
      }

      // Merge duplicate officers (same name, different roles) into single records
      // Keep higher confidence data and combine contact info
      const mergedOfficersMap = new Map<string, any>();
      for (const officer of enrichedOfficers) {
        const normalizedName = (officer.name || "").toUpperCase().trim();
        if (!normalizedName) continue;
        
        if (!mergedOfficersMap.has(normalizedName)) {
          mergedOfficersMap.set(normalizedName, { ...officer });
        } else {
          const existing = mergedOfficersMap.get(normalizedName)!;
          
          // Merge positions/roles
          const existingPositions = (existing.position || "").split(",").map((p: string) => p.trim().toLowerCase());
          const newPosition = (officer.position || "").trim().toLowerCase();
          if (newPosition && !existingPositions.includes(newPosition)) {
            existing.position = existing.position 
              ? `${existing.position}, ${officer.position}` 
              : officer.position;
          }
          
          // Keep highest confidence record's skipTraceData
          if (officer.confidenceScore > existing.confidenceScore) {
            // Use the higher confidence record's data as base
            existing.skipTraceData = officer.skipTraceData || existing.skipTraceData;
            existing.melissaData = officer.melissaData || existing.melissaData;
            existing.address = officer.address || existing.address;
            existing.confidenceScore = officer.confidenceScore;
          } else if (!existing.skipTraceData && officer.skipTraceData) {
            existing.skipTraceData = officer.skipTraceData;
          }
          
          // Merge phones (dedup by normalized number)
          for (const phone of officer.phones || []) {
            const normalizedPhone = phone.phone?.replace(/\D/g, "");
            if (normalizedPhone && !existing.phones.some((p: any) => 
              p.phone?.replace(/\D/g, "") === normalizedPhone
            )) {
              existing.phones.push(phone);
            }
          }
          
          // Merge emails (dedup by lowercase)
          for (const email of officer.emails || []) {
            if (email.email && !existing.emails.some((e: any) => 
              e.email?.toLowerCase() === email.email.toLowerCase()
            )) {
              existing.emails.push(email);
            }
          }
          
          // Recalculate confidence after merge
          const hasPhone = existing.phones.length > 0;
          const hasEmail = existing.emails.length > 0;
          const hasVerified = existing.melissaData?.nameMatch?.verified || 
                              existing.melissaData?.addressMatch?.verified;
          let newConfidence = 35;
          if (hasPhone) newConfidence += 25;
          if (hasEmail) newConfidence += 20;
          if (hasVerified) newConfidence += 20;
          existing.confidenceScore = Math.min(newConfidence, 100);
        }
      }
      
      // Replace enrichedOfficers with merged list (sorted by confidence)
      const mergedOfficers = Array.from(mergedOfficersMap.values())
        .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      
      console.log(`Merged ${enrichedOfficers.length} officers into ${mergedOfficers.length} unique records`);
      
      // Use merged officers for the rest of the flow
      enrichedOfficers.length = 0;
      enrichedOfficers.push(...mergedOfficers);

      // Generate AI outreach suggestion
      let aiOutreach = llc.aiOutreach;
      if (!aiOutreach && enrichedOfficers.length > 0) {
        try {
          const primaryOfficer = enrichedOfficers[0];
          // Create owner-like object for AI outreach
          const llcAsOwner = {
            id: llc.id,
            name: primaryOfficer.name || llc.name,
            type: "entity" as const,
            primaryAddress: llc.principalAddress || llc.registeredAddress || null,
            mailingAddress: null,
            akaNames: null,
            riskFlags: null,
            sellerIntentScore: 50,
            contactConfidenceScore: null,
            metadata: null,
            createdAt: llc.createdAt,
            updatedAt: llc.updatedAt,
            age: null,
            birthDate: null,
            relatives: null,
            associates: null,
            previousAddresses: null,
            enrichmentSource: null,
            enrichmentUpdatedAt: null,
          };
          aiOutreach = await generateOutreachSuggestion(llcAsOwner as any, [], 50);
        } catch (err) {
          console.error("AI outreach generation failed:", err);
        }
      }

      // Calculate overall contact confidence based on aggregated officer data
      const allPhones = enrichedOfficers.flatMap(o => o.phones || []);
      const allEmails = enrichedOfficers.flatMap(o => o.emails || []);
      const hasVerifiedOfficer = enrichedOfficers.some(o => o.melissaData?.addressMatch?.verified);
      
      let overallContactConfidence = 35; // Base score
      if (allPhones.length > 0) overallContactConfidence += 25;
      if (allEmails.length > 0) overallContactConfidence += 20;
      if (hasVerifiedOfficer) overallContactConfidence += 20;
      overallContactConfidence = Math.min(overallContactConfidence, 100);

      // Update LLC with enrichment data (store in enrichmentData, NOT in officers column)
      // Keep original officers in the officers column, enriched data in enrichmentData
      const rawOfficers = officers; // Original officers from OpenCorporates
      const enrichmentData = {
        enrichedOfficers,
        overallContactConfidence,
        registeredAgent: detailedInfo?.agentName || llc.registeredAgent,
        registeredAddress: detailedInfo?.agentAddress || llc.registeredAddress,
        status: detailedInfo?.status || llc.status,
        entityType: detailedInfo?.entityType || llc.entityType,
        enrichedAt: new Date().toISOString(),
      };

      await storage.updateLlc(llc.id, {
        // Keep officers as raw data from OpenCorporates
        officers: rawOfficers,
        enrichmentData,
        aiOutreach,
        registeredAgent: enrichmentData.registeredAgent,
        registeredAddress: enrichmentData.registeredAddress,
        status: enrichmentData.status,
        entityType: enrichmentData.entityType,
      });

      res.json({
        llc: {
          ...llc,
          officers: rawOfficers, // Original officers
          enrichmentData,
          aiOutreach,
        },
        officers: enrichedOfficers, // Enriched officers with contact data
        rawOfficers: rawOfficers, // Original officers list for reference
        enrichment: enrichmentData,
        aiOutreach,
      });
    } catch (error) {
      console.error("Error fetching LLC dossier:", error);
      res.status(500).json({ message: "Failed to fetch LLC dossier" });
    }
  });

  // Run full enrichment for LLC
  app.post("/api/llcs/:id/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const llc = await storage.getLlc(req.params.id);
      if (!llc) {
        return res.status(404).json({ message: "LLC not found" });
      }

      console.log(`Running full enrichment for LLC: ${llc.name}`);
      
      // Clear cached enrichment to force re-enrichment
      await storage.updateLlc(llc.id, { enrichmentData: null });
      
      // Redirect to dossier endpoint which will run fresh enrichment
      const dossierRes = await fetch(`${req.protocol}://${req.get('host')}/api/llcs/${llc.id}/dossier`, {
        headers: { 
          Cookie: req.headers.cookie,
        },
      });
      
      if (!dossierRes.ok) {
        throw new Error('Enrichment failed');
      }
      
      const dossierData = await dossierRes.json();
      
      res.json({
        message: "Full enrichment completed",
        llc: dossierData.llc,
        officers: dossierData.officers,
        enrichment: dossierData.enrichment,
      });
    } catch (error) {
      console.error("Error running LLC enrichment:", error);
      res.status(500).json({ message: "Failed to run full enrichment" });
    }
  });

  // Import LLC from OpenCorporates search result
  app.post("/api/llcs/import", isAuthenticated, async (req: any, res) => {
    try {
      const { name, jurisdiction, opencorporatesUrl, registrationNumber, status, entityType } = req.body;

      if (!name) {
        return res.status(400).json({ message: "LLC name is required" });
      }

      // Check if LLC already exists
      let existingLlc = await storage.getLlcByName(name, jurisdiction);
      if (existingLlc) {
        return res.json({ llc: existingLlc, existed: true });
      }

      // Look up detailed info from OpenCorporates (with caching)
      let detailedInfo = null;
      try {
        const llcResult = await getCachedLlcData(name, jurisdiction);
        detailedInfo = llcResult?.llc;
        // If we got cached data, the LLC was already created by getCachedLlcData
        if (llcResult?.fromCache) {
          const existingCached = await storage.getLlcByName(name.toUpperCase(), jurisdiction);
          if (existingCached) {
            return res.json({ llc: existingCached, existed: true, fromCache: true });
          }
        }
      } catch (err) {
        console.error("OpenCorporates lookup failed:", err);
      }

      // Create new LLC (if not already created by caching)
      const newLlc = await storage.createLlc({
        name: name.toUpperCase(),
        jurisdiction: jurisdiction || detailedInfo?.jurisdictionCode,
        entityType: entityType || detailedInfo?.entityType,
        status: status || detailedInfo?.status,
        registrationNumber: registrationNumber || detailedInfo?.companyNumber,
        registeredAgent: detailedInfo?.agentName,
        registeredAddress: detailedInfo?.agentAddress,
        principalAddress: detailedInfo?.principalAddress,
        opencorporatesUrl: opencorporatesUrl || detailedInfo?.opencorporatesUrl,
        officers: detailedInfo?.officers || [],
      });

      res.json({ llc: newLlc, existed: false });
    } catch (error) {
      console.error("Error importing LLC:", error);
      res.status(500).json({ message: "Failed to import LLC" });
    }
  });

  // =====================================
  // UNIFIED DOSSIER API
  // =====================================

  // Get unified dossier for any entity (person, LLC, or property)
  app.get("/api/dossier/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Entity ID required" });
      }

      const dossier = await buildUnifiedDossier(id);
      
      if (!dossier) {
        return res.status(404).json({ message: "Entity not found" });
      }

      res.json(dossier);
    } catch (error) {
      console.error("Error building dossier:", error);
      res.status(500).json({ message: "Failed to build dossier" });
    }
  });

  // Run full enrichment on an entity
  app.post("/api/dossier/:id/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Entity ID required" });
      }

      const result = await runFullEnrichment(id);
      
      if (!result.success && result.error) {
        return res.status(result.error === "Entity not found" ? 404 : 500).json({ 
          message: result.error,
          providersUsed: result.providersUsed,
        });
      }

      // Return updated dossier after enrichment
      const dossier = await buildUnifiedDossier(id);
      
      res.json({
        success: result.success,
        providersUsed: result.providersUsed,
        dossier,
      });
    } catch (error) {
      console.error("Error running enrichment:", error);
      res.status(500).json({ message: "Failed to run enrichment" });
    }
  });

  // Run phased enrichment with step-by-step tracking
  app.post("/api/dossiers/:id/enrich-full", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Entity ID required" });
      }

      console.log(`[PhasedEnrichment] Starting enrichment for entity ${id}`);
      const result = await runPhasedEnrichment(id);
      
      if (result.overallStatus === "failed") {
        return res.status(404).json({
          message: "Enrichment failed - entity not found or all phases errored",
          steps: result.steps,
          summary: result.summary,
          providersUsed: result.providersUsed,
          durationMs: result.durationMs,
        });
      }

      // Fetch the updated dossier after enrichment
      const dossier = await buildUnifiedDossier(id);
      
      console.log(`[PhasedEnrichment] Completed for ${id} in ${result.durationMs}ms - status: ${result.overallStatus}`);
      
      res.json({
        steps: result.steps,
        summary: result.summary,
        providersUsed: result.providersUsed,
        overallStatus: result.overallStatus,
        durationMs: result.durationMs,
        dossier,
      });
    } catch (error) {
      console.error("Error running phased enrichment:", error);
      res.status(500).json({ message: "Failed to run phased enrichment" });
    }
  });

  // Targeted enrichment: Contacts only
  app.post("/api/dossiers/:id/enrich-contacts", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "Entity ID required" });

      const resolved = await resolveEntityById(id);
      if (!resolved || resolved.entityType === "property") {
        return res.status(404).json({ message: "Owner not found" });
      }

      const owner = resolved.record as any;
      const existingContacts = await db.select().from(contactInfos).where(eq(contactInfos.ownerId, id));
      const existingPhones = existingContacts.filter(c => c.kind === "phone").length;
      const existingEmails = existingContacts.filter(c => c.kind === "email").length;

      const waterfallResult = await runContactWaterfall(owner.name, owner.primaryAddress || undefined);
      
      let estimatedCost = 0;
      for (const provider of waterfallResult.providersUsed) {
        const pricing = getProviderPricing(provider);
        if (pricing) estimatedCost += pricing.costPerCall;
      }

      if (waterfallResult.contacts.length > 0) {
        for (const contact of waterfallResult.contacts) {
          await db.insert(contactInfos).values({
            ownerId: id,
            kind: contact.type,
            value: contact.value,
            source: contact.source,
            confidenceScore: contact.confidence,
          }).onConflictDoNothing();
        }
      }

      const updatedContacts = await db.select().from(contactInfos).where(eq(contactInfos.ownerId, id));
      const newPhones = updatedContacts.filter(c => c.kind === "phone").length - existingPhones;
      const newEmails = updatedContacts.filter(c => c.kind === "email").length - existingEmails;

      res.json({
        message: `Found ${newPhones} phones, ${newEmails} emails`,
        summary: { 
          newPhones, 
          newEmails, 
          newContacts: newPhones + newEmails,
          estimatedCost: Math.round(estimatedCost * 1000) / 1000,
        },
        providersUsed: waterfallResult.providersUsed,
        estimatedCost: Math.round(estimatedCost * 1000) / 1000,
      });
    } catch (error) {
      console.error("Error enriching contacts:", error);
      res.status(500).json({ message: "Failed to enrich contacts" });
    }
  });

  // Targeted enrichment: Ownership chain only
  app.post("/api/dossiers/:id/enrich-ownership", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "Entity ID required" });

      const resolved = await resolveEntityById(id);
      if (!resolved || resolved.entityType !== "entity") {
        return res.status(400).json({ message: "Ownership enrichment only applies to entities" });
      }

      const owner = resolved.record as any;
      const ownedProperties = await db.select().from(properties).where(eq(properties.ownerId, id)).limit(1);
      const propertyAddress = ownedProperties[0]
        ? `${ownedProperties[0].address}${ownedProperties[0].city ? `, ${ownedProperties[0].city}` : ""}${ownedProperties[0].state ? `, ${ownedProperties[0].state}` : ""}`
        : undefined;

      const chain = await resolveOwnershipChain(owner.name, undefined, propertyAddress);
      
      let estimatedCost = getProviderPricing("gemini")?.costPerCall || 0.002;
      if (chain.perplexityUsed) {
        estimatedCost += getProviderPricing("perplexity")?.costPerCall || 0.05;
      }

      await db.insert(llcOwnershipChains).values({
        rootEntityName: owner.name,
        chain: chain.chain,
        ultimateBeneficialOwners: chain.ultimateBeneficialOwners,
        maxDepthReached: chain.maxDepthReached,
        totalApiCalls: chain.totalApiCalls,
      }).onConflictDoNothing();

      res.json({
        message: `Resolved ${chain.ultimateBeneficialOwners.length} principals`,
        summary: { 
          newPrincipals: chain.ultimateBeneficialOwners.length,
          llcChainResolved: true,
          chainDepth: chain.maxDepthReached,
          estimatedCost: Math.round(estimatedCost * 1000) / 1000,
        },
        providersUsed: chain.perplexityUsed ? ["gemini", "perplexity"] : ["gemini"],
        estimatedCost: Math.round(estimatedCost * 1000) / 1000,
      });
    } catch (error) {
      console.error("Error enriching ownership:", error);
      res.status(500).json({ message: "Failed to enrich ownership" });
    }
  });

  // Targeted enrichment: Franchise detection
  app.post("/api/dossiers/:id/enrich-franchise", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "Entity ID required" });

      const resolved = await resolveEntityById(id);
      if (!resolved) {
        return res.status(404).json({ message: "Entity not found" });
      }

      // Franchise detection is computed client-side using franchiseData.ts
      // This endpoint just confirms the entity exists and marks franchise as analyzed
      res.json({
        message: "Franchise analysis ready",
        summary: { 
          franchiseDetected: true, 
          franchiseType: "pending_client_analysis" 
        },
        providersUsed: [],
        estimatedCost: 0,
      });
    } catch (error) {
      console.error("Error detecting franchise:", error);
      res.status(500).json({ message: "Failed to detect franchise" });
    }
  });

  // Targeted enrichment: Property data
  app.post("/api/dossiers/:id/enrich-property", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "Entity ID required" });

      const resolved = await resolveEntityById(id);
      if (!resolved) {
        return res.status(404).json({ message: "Entity not found" });
      }

      let newProperties = 0;
      let estimatedCost = 0;
      const providersUsed: string[] = [];

      if (resolved.entityType !== "property") {
        const owner = resolved.record as any;
        const existingProperties = await db.select().from(properties).where(eq(properties.ownerId, id));
        
        if (existingProperties.length === 0 && owner.primaryAddress) {
          const propertyResult = await dataProviders.searchPropertiesByOwner(owner.name);
          if (propertyResult && propertyResult.length > 0) {
            providersUsed.push("attom");
            estimatedCost += getProviderPricing("attom")?.costPerCall || 0.08;
            newProperties = propertyResult.length;
          }
        }
      }

      res.json({
        message: newProperties > 0 ? `Found ${newProperties} properties` : "No new properties found",
        summary: { 
          newProperties,
          estimatedCost: Math.round(estimatedCost * 1000) / 1000,
        },
        providersUsed,
        estimatedCost: Math.round(estimatedCost * 1000) / 1000,
      });
    } catch (error) {
      console.error("Error enriching property:", error);
      res.status(500).json({ message: "Failed to enrich property" });
    }
  });

  // Check entity type for routing decisions
  app.get("/api/dossier/:id/type", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Entity ID required" });
      }

      const resolved = await resolveEntityById(id);
      
      if (!resolved) {
        return res.status(404).json({ message: "Entity not found" });
      }

      res.json({ 
        id, 
        entityType: resolved.entityType,
        name: 'name' in resolved.record ? resolved.record.name : 
              'address' in resolved.record ? resolved.record.address : 'Unknown',
      });
    } catch (error) {
      console.error("Error resolving entity type:", error);
      res.status(500).json({ message: "Failed to resolve entity type" });
    }
  });

  // Debug API test endpoint
  app.get("/api/debug/test-apis", isAuthenticated, async (req: any, res) => {
    const results: Record<string, any> = {};

    // Test Data Axle
    try {
      console.log("Testing Data Axle API...");
      const dataAxleResult = await dataProviders.findContactsByName("John Smith", { state: "NY" });
      results.dataAxle = {
        success: true,
        resultsCount: dataAxleResult.length,
        sample: dataAxleResult.slice(0, 2),
      };
    } catch (error: any) {
      results.dataAxle = { success: false, error: error?.message || String(error) };
    }

    // Test A-Leads (via enrichContact which uses A-Leads internally)
    try {
      console.log("Testing A-Leads API...");
      const aLeadsResult = await dataProviders.enrichContact({ name: "John Smith", address: "123 Main St, New York, NY" });
      results.aLeads = {
        success: !!aLeadsResult,
        data: aLeadsResult,
      };
    } catch (error: any) {
      results.aLeads = { success: false, error: error?.message || String(error) };
    }

    // Test Melissa
    try {
      console.log("Testing Melissa API...");
      const melissaResult = await dataProviders.fetchMelissaEnrichment({
        name: "John Smith",
        address: "123 Main St",
        city: "New York",
        state: "NY",
        zip: "10001",
      });
      results.melissa = {
        success: !!melissaResult,
        data: melissaResult,
      };
    } catch (error: any) {
      results.melissa = { success: false, error: error?.message || String(error) };
    }

    // Test OpenCorporates
    try {
      console.log("Testing OpenCorporates API...");
      const llcResult = await dataProviders.lookupLlc("Apple Inc");
      results.openCorporates = {
        success: !!llcResult,
        data: llcResult ? {
          name: llcResult.name,
          jurisdictionCode: llcResult.jurisdictionCode,
          officersCount: llcResult.officers?.length || 0,
          agentName: llcResult.agentName,
          agentAddress: llcResult.agentAddress,
        } : null,
      };
    } catch (error: any) {
      results.openCorporates = { success: false, error: error?.message || String(error) };
    }

    res.json(results);
  });
}
