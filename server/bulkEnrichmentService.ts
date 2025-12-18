import { storage } from "./storage";
import { dataProviders } from "./dataProviders";
import { generateDataCenterFitSummary } from "./openai";
import { 
  BulkEnrichmentJob, 
  BulkEnrichmentTarget, 
  InsertBulkEnrichmentResult,
  FAMILY_OFFICE_INDICATORS,
  TargetingConfig,
  IntentSignal 
} from "@shared/schema";
import pLimit from "p-limit";

const enrichmentLimit = pLimit(3);

interface FamilyOfficeScore {
  confidence: number;
  signals: string[];
}

export function detectFamilyOffice(company: {
  name: string;
  naicsCode?: string;
  sicCode?: string;
  employeeCount?: number;
}): FamilyOfficeScore {
  const signals: string[] = [];
  let score = 0;
  const nameLower = company.name.toLowerCase();

  if (company.naicsCode && FAMILY_OFFICE_INDICATORS.naicsCodes.includes(company.naicsCode)) {
    score += 30;
    signals.push(`NAICS code ${company.naicsCode} matches family office category`);
  }

  if (company.sicCode && FAMILY_OFFICE_INDICATORS.sicCodes.includes(company.sicCode)) {
    score += 25;
    signals.push(`SIC code ${company.sicCode} matches investment management`);
  }

  for (const pattern of FAMILY_OFFICE_INDICATORS.namePatterns) {
    if (nameLower.includes(pattern)) {
      score += 20;
      signals.push(`Name contains "${pattern}"`);
      break;
    }
  }

  if (company.employeeCount && company.employeeCount < 50) {
    score += 10;
    signals.push(`Small team size (${company.employeeCount} employees) typical of family offices`);
  }

  if (nameLower.includes("llc") || nameLower.includes("lp") || nameLower.includes("holdings")) {
    score += 10;
    signals.push("Entity structure suggests private investment vehicle");
  }

  return {
    confidence: Math.min(100, score),
    signals,
  };
}

export function calculateIntentScore(params: {
  title?: string;
  companyName: string;
  uccFilings?: Array<{ filingType: string; securedParty?: string }>;
  webSignals?: string[];
}): { score: number; tier: string; signals: IntentSignal[] } {
  const signals: IntentSignal[] = [];
  let totalScore = 0;

  if (params.title) {
    const titleLower = params.title.toLowerCase();
    for (const pattern of FAMILY_OFFICE_INDICATORS.titlePatterns) {
      if (titleLower.includes(pattern)) {
        const weight = 0.25;
        const signalScore = 80;
        signals.push({
          signal: `Title "${params.title}" matches decision-maker pattern`,
          weight,
          score: signalScore,
          source: "title_match",
        });
        totalScore += weight * signalScore;
        break;
      }
    }
  }

  if (params.uccFilings) {
    for (const filing of params.uccFilings) {
      const filingLower = (filing.filingType + " " + (filing.securedParty || "")).toLowerCase();
      for (const keyword of FAMILY_OFFICE_INDICATORS.dataCenterKeywords) {
        if (filingLower.includes(keyword)) {
          const weight = 0.35;
          const signalScore = 90;
          signals.push({
            signal: `UCC filing mentions "${keyword}"`,
            weight,
            score: signalScore,
            source: "ucc_filing",
          });
          totalScore += weight * signalScore;
          break;
        }
      }
    }
  }

  const companyLower = params.companyName.toLowerCase();
  for (const keyword of FAMILY_OFFICE_INDICATORS.dataCenterKeywords) {
    if (companyLower.includes(keyword)) {
      const weight = 0.20;
      const signalScore = 70;
      signals.push({
        signal: `Company name contains "${keyword}"`,
        weight,
        score: signalScore,
        source: "company_name",
      });
      totalScore += weight * signalScore;
      break;
    }
  }

  if (params.webSignals) {
    for (const webSignal of params.webSignals) {
      const weight = 0.15;
      const signalScore = 60;
      signals.push({
        signal: webSignal,
        weight,
        score: signalScore,
        source: "web_intent",
      });
      totalScore += weight * signalScore;
    }
  }

  const finalScore = Math.min(100, Math.round(totalScore));
  let tier: string;
  if (finalScore >= 70) {
    tier = "active";
  } else if (finalScore >= 40) {
    tier = "warm";
  } else {
    tier = "monitor";
  }

  return { score: finalScore, tier, signals };
}

// FREE: Search for family offices using SEC EDGAR 13F filings
// These are institutional investors managing $100M+ - no API cost!
export async function searchFamilyOfficesSEC(config: TargetingConfig): Promise<Array<{
  companyName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  naicsCode?: string;
  sicCode?: string;
  employeeCount?: number;
  salesVolume?: number;
  familyOfficeConfidence: number;
  familyOfficeSignals: string[];
  dataAxleId?: string;
  cik?: string;
}>> {
  const limit = config.limit || 100;
  console.log(`[BULK ENRICHMENT] Using SEC EDGAR (FREE) for family office discovery (limit: ${limit})`);
  
  // Default search terms for family offices
  const searchTerms = config.companyNameKeywords?.length 
    ? config.companyNameKeywords 
    : [
        "family office", "capital", "investment", "wealth", "asset management",
        "holdings", "partners", "advisors", "management"
      ];
  
  const secFilers = await dataProviders.searchSECFamilyOffices(searchTerms, limit);
  
  console.log(`[SEC EDGAR] Found ${secFilers.length} filers matching criteria (limit: ${limit})`);
  
  const results: Array<any> = [];
  
  for (const filer of secFilers) {
    const familyOfficeScore = detectFamilyOffice({
      name: filer.name,
    });
    
    // All 13F filers are significant institutional investors
    // Boost confidence since they manage $100M+
    const boostedConfidence = Math.min(100, familyOfficeScore.confidence + 30);
    const signals = [
      ...familyOfficeScore.signals,
      "SEC 13F filer - manages $100M+ in public equities"
    ];
    
    results.push({
      companyName: filer.name,
      familyOfficeConfidence: boostedConfidence,
      familyOfficeSignals: signals,
      cik: filer.cik,
    });
  }
  
  // Sort by confidence
  results.sort((a, b) => b.familyOfficeConfidence - a.familyOfficeConfidence);
  
  console.log(`[BULK ENRICHMENT] SEC EDGAR returned ${results.length} family office targets (FREE)`);
  
  return results;
}

// OpenMart: Search for family offices and investment firms with decision-maker contacts
export async function searchFamilyOfficesOpenMart(config: TargetingConfig): Promise<Array<{
  companyName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  naicsCode?: string;
  sicCode?: string;
  employeeCount?: number;
  salesVolume?: number;
  familyOfficeConfidence: number;
  familyOfficeSignals: string[];
  dataAxleId?: string;
  openMartId?: string;
  decisionMakers?: Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
  }>;
}>> {
  console.log(`[BULK ENRICHMENT] Using OpenMart for family office discovery`);
  
  const location = config.states?.[0] || config.cities?.[0] || undefined;
  const limit = config.limit || 100;
  
  // Get family offices from OpenMart
  const familyOffices = await dataProviders.searchOpenMartFamilyOffices(location, Math.ceil(limit / 2));
  const investmentFirms = await dataProviders.searchOpenMartInvestmentFirms(location, Math.ceil(limit / 2));
  
  console.log(`[OpenMart] Found ${familyOffices.length} family offices, ${investmentFirms.length} investment firms`);
  
  const allBusinesses = [...familyOffices, ...investmentFirms];
  const results: Array<any> = [];
  const seenIds = new Set<string>();
  
  for (const biz of allBusinesses) {
    if (seenIds.has(biz.id)) continue;
    seenIds.add(biz.id);
    
    const familyOfficeScore = detectFamilyOffice({
      name: biz.name,
    });
    
    // Boost confidence for family offices found via OpenMart
    const boostedConfidence = Math.min(100, familyOfficeScore.confidence + 20);
    const signals = [...familyOfficeScore.signals];
    
    if (biz.category) {
      signals.push(`OpenMart category: ${biz.category}`);
    }
    
    // Extract decision-makers from staffs array
    const decisionMakers = dataProviders.extractOpenMartDecisionMakers(biz);
    if (decisionMakers.length > 0) {
      signals.push(`${decisionMakers.length} decision-maker(s) with contact info`);
    }
    
    results.push({
      companyName: biz.name,
      address: biz.address,
      city: biz.city,
      state: biz.state,
      zip: biz.zip,
      familyOfficeConfidence: boostedConfidence,
      familyOfficeSignals: signals,
      openMartId: biz.id,
      decisionMakers,
    });
  }
  
  // Sort by confidence
  results.sort((a, b) => b.familyOfficeConfidence - a.familyOfficeConfidence);
  
  console.log(`[BULK ENRICHMENT] OpenMart returned ${results.length} family office targets`);
  
  return results.slice(0, limit);
}

// DATA CENTER INVESTMENT SCORING SYSTEM
// Scores family offices based on their likelihood to invest in data centers
interface DataCenterScore {
  score: number;
  tier: "high" | "medium" | "low";
  signals: string[];
}

const DATA_CENTER_SCORING = {
  // HIGH SCORE keywords in company description/name (definite match)
  highKeywords: [
    "data center", "datacenter", "infrastructure", "digital infrastructure",
    "cloud", "colocation", "colo", "hyperscale", "edge computing",
    "server farm", "hosting", "idc", "data facility"
  ],
  // HIGH SCORE industries
  highIndustries: [
    "real estate", "technology infrastructure", "internet",
    "data processing", "computer facilities management",
    "telecommunications resellers", "data centers"
  ],
  // HIGH SCORE technologies (cloud platforms)
  highTechnologies: [
    "aws", "amazon web services", "azure", "microsoft azure",
    "gcp", "google cloud", "kubernetes", "docker", "vmware",
    "openstack", "terraform", "cloudflare"
  ],
  // MEDIUM SCORE industries
  mediumIndustries: [
    "technology", "software", "telecommunications", "it services",
    "computer systems design", "information technology",
    "software publishers", "wireless telecommunications"
  ],
  // MEDIUM SCORE investment keywords
  mediumKeywords: [
    "real estate investment", "infrastructure investment",
    "technology investment", "private equity", "venture capital",
    "growth equity", "alternative investments"
  ],
  // BONUS locations (tech hubs)
  techHubCities: [
    "san francisco", "sf", "new york", "nyc", "austin", "seattle",
    "boston", "los angeles", "la", "denver", "dallas", "atlanta",
    "chicago", "phoenix", "portland", "salt lake city", "raleigh",
    "northern virginia", "ashburn", "loudoun" // Major data center corridor
  ],
  techHubStates: ["ca", "ny", "tx", "wa", "ma", "co", "va", "az", "nc", "ga"]
};

export function scoreDataCenterInvestmentPotential(contact: {
  companyName?: string;
  industry?: string;
  location?: string;
  companySize?: string;
  title?: string;
  technologies?: string[];
}): DataCenterScore {
  const signals: string[] = [];
  let score = 0;
  
  const companyLower = (contact.companyName || "").toLowerCase();
  const industryLower = (contact.industry || "").toLowerCase();
  const locationLower = (contact.location || "").toLowerCase();
  const titleLower = (contact.title || "").toLowerCase();
  
  // HIGH SCORE: Data center keywords in company name (+30 each, max 60)
  let keywordHits = 0;
  for (const keyword of DATA_CENTER_SCORING.highKeywords) {
    if (companyLower.includes(keyword)) {
      score += 30;
      signals.push(`Company mentions "${keyword}"`);
      keywordHits++;
      if (keywordHits >= 2) break;
    }
  }
  
  // HIGH SCORE: Data center/infrastructure industries (+25)
  for (const industry of DATA_CENTER_SCORING.highIndustries) {
    if (industryLower.includes(industry)) {
      score += 25;
      signals.push(`High-value industry: ${contact.industry}`);
      break;
    }
  }
  
  // HIGH SCORE: Cloud technologies (+20 each, max 40)
  if (contact.technologies) {
    let techHits = 0;
    for (const tech of contact.technologies) {
      const techLower = tech.toLowerCase();
      for (const cloudTech of DATA_CENTER_SCORING.highTechnologies) {
        if (techLower.includes(cloudTech)) {
          score += 20;
          signals.push(`Uses cloud tech: ${tech}`);
          techHits++;
          break;
        }
      }
      if (techHits >= 2) break;
    }
  }
  
  // MEDIUM SCORE: Tech/telecom industries (+15)
  if (score < 25) { // Only if not already high-value industry
    for (const industry of DATA_CENTER_SCORING.mediumIndustries) {
      if (industryLower.includes(industry)) {
        score += 15;
        signals.push(`Tech-adjacent industry: ${contact.industry}`);
        break;
      }
    }
  }
  
  // MEDIUM SCORE: Investment-related keywords (+10)
  for (const keyword of DATA_CENTER_SCORING.mediumKeywords) {
    if (companyLower.includes(keyword)) {
      score += 10;
      signals.push(`Investment focus: "${keyword}"`);
      break;
    }
  }
  
  // BONUS: Tech hub location (+10)
  for (const city of DATA_CENTER_SCORING.techHubCities) {
    if (locationLower.includes(city)) {
      score += 10;
      signals.push(`Tech hub location: ${contact.location}`);
      break;
    }
  }
  
  // BONUS: Decision-maker title (+5-15)
  if (titleLower.includes("ceo") || titleLower.includes("founder") || 
      titleLower.includes("managing partner") || titleLower.includes("principal")) {
    score += 15;
    signals.push(`Senior decision-maker: ${contact.title}`);
  } else if (titleLower.includes("director") || titleLower.includes("president") ||
             titleLower.includes("managing director")) {
    score += 10;
    signals.push(`Executive role: ${contact.title}`);
  } else if (titleLower.includes("vp") || titleLower.includes("vice president") ||
             titleLower.includes("partner")) {
    score += 5;
    signals.push(`Leadership position: ${contact.title}`);
  }
  
  // BONUS: Large company size (indicates significant AUM) (+10)
  const sizeLower = (contact.companySize || "").toLowerCase();
  if (sizeLower.includes("1001") || sizeLower.includes("5001") || 
      sizeLower.includes("10001") || sizeLower.includes("enterprise") ||
      sizeLower.includes("large")) {
    score += 10;
    signals.push(`Large organization: ${contact.companySize}`);
  }
  
  // Determine tier
  let tier: "high" | "medium" | "low";
  if (score >= 40) {
    tier = "high";
  } else if (score >= 20) {
    tier = "medium";
  } else {
    tier = "low";
  }
  
  return { score, tier, signals };
}

// A-LEADS ADVANCED SEARCH: THE SIMPLE APPROACH
// One API call returns decision-makers with their contact info and company details
// No need for multi-step SEC EDGAR -> enrichment pipeline
export async function searchFamilyOfficesALeads(config: TargetingConfig): Promise<Array<{
  companyName: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  confidence: number;
  source: string;
  hasEmail: boolean;
  hasPhone: boolean;
  // Data center investment scoring
  dataCenterScore: number;
  dataCenterTier: "high" | "medium" | "low";
  dataCenterSignals: string[];
  // AI-generated summary explaining why this is a good prospect
  aiSummary?: string;
}>> {
  console.log(`[BULK ENRICHMENT] Using A-Leads Advanced Search (THE SIMPLE APPROACH)`);
  
  const limit = config.limit || 100;
  
  // Call A-Leads with correct lowercase industry values
  const results = await dataProviders.searchFamilyOfficeDecisionMakers({
    limit: limit * 2 // Fetch more to allow for scoring/filtering
  });
  
  console.log(`[BULK ENRICHMENT] A-Leads returned ${results.length} family office decision-makers`);
  
  // Transform to our standard format with data center scoring
  const transformed = results
    .filter(r => r.companyName) // Skip entries without company name
    .map(r => {
      // Calculate confidence based on available contact info
      let confidence = 50; // base
      if (r.hasEmail) confidence += 25;
      if (r.hasPhone) confidence += 15;
      if (r.linkedinUrl) confidence += 10;
      
      // Apply data center investment scoring
      const dcScore = scoreDataCenterInvestmentPotential({
        companyName: r.companyName,
        industry: r.industry,
        location: r.location,
        companySize: r.companySize,
        title: r.title,
      });
      
      return {
        companyName: r.companyName || "Unknown Company",
        name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.name,
        title: r.title,
        email: r.email || undefined, // Email from reveal or API
        phone: r.phone || undefined, // Phone from API
        linkedin: r.linkedinUrl,
        location: r.location,
        industry: r.industry,
        companySize: r.companySize,
        confidence: Math.min(100, confidence),
        source: "aleads_advanced_search",
        hasEmail: r.hasEmail || !!r.email,
        hasPhone: r.hasPhone || !!r.phone,
        // Data center investment scoring
        dataCenterScore: dcScore.score,
        dataCenterTier: dcScore.tier,
        dataCenterSignals: dcScore.signals,
      };
    });
  
  // Sort by data center score (primary) then confidence (secondary)
  transformed.sort((a, b) => {
    if (b.dataCenterScore !== a.dataCenterScore) {
      return b.dataCenterScore - a.dataCenterScore;
    }
    return b.confidence - a.confidence;
  });
  
  // Count by tier for logging
  const highCount = transformed.filter(t => t.dataCenterTier === "high").length;
  const mediumCount = transformed.filter(t => t.dataCenterTier === "medium").length;
  const lowCount = transformed.filter(t => t.dataCenterTier === "low").length;
  
  console.log(`[BULK ENRICHMENT] A-Leads scored ${transformed.length} results: ${highCount} HIGH, ${mediumCount} MEDIUM, ${lowCount} LOW tier`);
  
  // Return top results - AI summaries generated separately during enrichment phase
  // to avoid blocking job creation
  return transformed.slice(0, limit);
}

// Generate AI summary for a single contact (called during enrichment phase, not search)
export async function generateContactAISummary(contact: {
  name: string;
  title?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  dataCenterSignals?: string[];
}): Promise<string | undefined> {
  try {
    return await generateDataCenterFitSummary({
      name: contact.name,
      title: contact.title,
      company: contact.companyName,
      industry: contact.industry,
      location: contact.location,
      signals: contact.dataCenterSignals,
    });
  } catch (err) {
    console.error(`[AI Summary] Error for ${contact.name}:`, err);
    return undefined;
  }
}

// Apify Startup Investors: Search for investor decision-makers
export async function searchInvestorDecisionMakers(config: TargetingConfig): Promise<Array<{
  companyName: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  firmType?: string;
  investmentFocus?: string[];
  confidence: number;
  source: string;
}>> {
  console.log(`[BULK ENRICHMENT] Using Apify Startup Investors for decision-maker search`);
  
  const location = config.states?.[0] || config.cities?.[0] || undefined;
  const limit = config.limit || 100;
  
  // Search for family office investors
  const familyOfficeInvestors = await dataProviders.searchApifyFamilyOfficeInvestors(location, Math.ceil(limit / 2));
  
  // Search for real estate investors (relevant for data center interest)
  const realEstateInvestors = await dataProviders.searchApifyRealEstateInvestors(location, Math.ceil(limit / 2));
  
  console.log(`[Apify Investors] Found ${familyOfficeInvestors.length} family office investors, ${realEstateInvestors.length} real estate investors`);
  
  const allInvestors = [...familyOfficeInvestors, ...realEstateInvestors];
  const results: Array<any> = [];
  const seenIds = new Set<string>();
  
  for (const investor of allInvestors) {
    if (seenIds.has(investor.id)) continue;
    seenIds.add(investor.id);
    
    // Calculate confidence based on available contact info
    let confidence = 50; // base
    if (investor.email) confidence += 20;
    if (investor.phone) confidence += 15;
    if (investor.linkedin) confidence += 10;
    if (investor.firm) confidence += 5;
    
    results.push({
      companyName: investor.firm || "Independent Investor",
      name: investor.name,
      title: investor.title || "Investor",
      email: investor.email,
      phone: investor.phone,
      linkedin: investor.linkedin,
      location: investor.location,
      firmType: investor.firmType,
      investmentFocus: investor.investmentFocus,
      confidence: Math.min(100, confidence),
      source: "apify_startup_investors",
    });
  }
  
  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`[BULK ENRICHMENT] Apify Investors returned ${results.length} decision-makers`);
  
  return results.slice(0, limit);
}

export async function searchFamilyOffices(config: TargetingConfig): Promise<Array<{
  companyName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  naicsCode?: string;
  sicCode?: string;
  employeeCount?: number;
  salesVolume?: number;
  familyOfficeConfidence: number;
  familyOfficeSignals: string[];
  dataAxleId?: string;
}>> {
  // A-LEADS ADVANCED SEARCH - THE SIMPLE APPROACH (highest priority when selected)
  // One API call returns decision-makers with their contact info - no multi-step enrichment needed
  if (config.useALeads) {
    console.log(`[BULK ENRICHMENT] A-Leads Advanced Search selected (THE SIMPLE APPROACH)`);
    const aleadsResults = await searchFamilyOfficesALeads(config);
    // Transform A-Leads results to match expected format
    return aleadsResults.map(r => ({
      companyName: r.companyName,
      familyOfficeConfidence: r.confidence,
      familyOfficeSignals: [
        r.industry ? `Industry: ${r.industry}` : "",
        r.hasEmail ? "Has Email" : "",
        r.hasPhone ? "Has Phone" : "",
        r.linkedin ? "Has LinkedIn" : "",
      ].filter(Boolean),
      // A-Leads provides decision-maker directly - no separate enrichment needed
      // CRITICAL: Include ALL contact fields from A-Leads response
      decisionMakers: [{
        name: r.name,
        title: r.title,
        email: r.email,
        phone: r.phone,
        linkedin: r.linkedin,
        location: r.location,
        industry: r.industry,
        companySize: r.companySize,
        hasEmail: r.hasEmail,
        hasPhone: r.hasPhone,
        dataCenterScore: r.dataCenterScore,
        dataCenterTier: r.dataCenterTier,
        dataCenterSignals: r.dataCenterSignals,
      }],
      // Also pass through location for the company
      address: r.location,
      industry: r.industry,
    })) as any;
  }
  
  // Check if user wants to use SEC EDGAR (free) - second priority
  if (config.useSecEdgar) {
    console.log(`[BULK ENRICHMENT] SEC EDGAR source selected (FREE)`);
    return searchFamilyOfficesSEC(config);
  }
  
  // Check if user wants to use OpenMart - cost-effective with decision-maker contacts
  if (config.useOpenMart) {
    console.log(`[BULK ENRICHMENT] OpenMart source selected (with decision-maker contacts)`);
    return searchFamilyOfficesOpenMart(config);
  }
  
  const results: Array<any> = [];

  // Expanded default search keywords for better coverage
  const defaultKeywords = [
    // Core family office terms
    "family office", "single family office", "multi family office",
    "family capital", "family holdings", "family partners", "family investments",
    // Investment/wealth management
    "capital partners", "capital management", "capital advisors", "capital group",
    "wealth management", "private wealth", "wealth advisors",
    "asset management", "investment management", "investment advisors",
    "private capital", "private equity", "venture capital",
    // Trust and legacy
    "trust company", "family trust", "legacy capital", "legacy partners",
    // Infrastructure-focused
    "infrastructure capital", "real assets", "alternative investments",
    "digital infrastructure", "data center invest",
  ];

  const searchQueries: string[] = config.companyNameKeywords?.length 
    ? config.companyNameKeywords 
    : defaultKeywords;

  // Search across ALL specified states (not just the first)
  const statesToSearch = config.states?.length ? config.states : [undefined];
  const citiesToSearch = config.cities?.length ? config.cities : [undefined];

  // Minimum confidence threshold (raised from 20 to 30 for better quality)
  const minConfidence = config.minConfidence ?? 30;

  console.log(`[BULK ENRICHMENT] Searching ${searchQueries.length} keywords across ${statesToSearch.length} states`);

  for (const query of searchQueries) {
    for (const state of statesToSearch) {
      for (const city of citiesToSearch) {
        try {
          const places = await dataProviders.searchPlacesV3(query, {
            city: city,
            state: state,
            zip: config.zipCodes?.[0],
          });

          console.log(`[BULK ENRICHMENT] "${query}" in ${state || 'any state'}: ${places.length} results`);

          for (const place of places) {
            // Apply NAICS filter
            if (config.naicsCodes?.length && place.naicsCode && !config.naicsCodes.includes(place.naicsCode)) {
              continue;
            }
            // Apply SIC filter
            if (config.sicCodes?.length && place.sicCode && !config.sicCodes.includes(place.sicCode)) {
              continue;
            }
            // Apply employee count filters
            if (config.minEmployees && place.employees && place.employees < config.minEmployees) {
              continue;
            }
            if (config.maxEmployees && place.employees && place.employees > config.maxEmployees) {
              continue;
            }

            const familyOfficeScore = detectFamilyOffice({
              name: place.name,
              naicsCode: place.naicsCode,
              sicCode: place.sicCode,
              employeeCount: place.employees,
            });

            // Use configurable minimum confidence
            if (familyOfficeScore.confidence >= minConfidence) {
              results.push({
                companyName: place.name,
                address: place.address,
                city: place.city,
                state: place.state,
                zip: place.zip,
                naicsCode: place.naicsCode,
                sicCode: place.sicCode,
                employeeCount: place.employees,
                salesVolume: place.salesVolume,
                familyOfficeConfidence: familyOfficeScore.confidence,
                familyOfficeSignals: familyOfficeScore.signals,
                dataAxleId: place.infousa_id,
              });
            }
          }
        } catch (error) {
          console.error(`Error searching for "${query}" in ${state}:`, error);
        }
      }
    }
  }

  // Deduplicate by company name (case-insensitive) and Data Axle ID
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const nameKey = r.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idKey = r.dataAxleId || '';
    const compositeKey = `${nameKey}|${idKey}`;
    if (seen.has(compositeKey)) return false;
    seen.add(compositeKey);
    return true;
  });

  // Sort by confidence descending
  deduped.sort((a, b) => b.familyOfficeConfidence - a.familyOfficeConfidence);

  console.log(`[BULK ENRICHMENT] Found ${deduped.length} unique companies (from ${results.length} raw matches)`);

  return deduped;
}

// Decision maker titles to filter for
const DECISION_MAKER_TITLES = [
  "founder", "co-founder", "managing partner", "managing director", 
  "principal", "chief investment officer", "cio", "head of real assets",
  "head of infrastructure", "family office director", "president", "owner",
  "chief executive", "ceo", "partner", "director", "vp", "vice president",
  "head of", "executive director", "senior partner", "general partner"
];

// Corporate keywords that indicate a name is a company, not a person
const CORPORATE_KEYWORDS = [
  "holdings", "capital", "management", "partners", "fund", "investment",
  "advisors", "asset", "wealth", "trust", "group", "associates",
  "financial", "equity", "ventures", "enterprises", "solutions",
  "securities", "global", "international", "real estate", "properties"
];

// Helper to normalize company names for better API matching
function normalizeCompanyName(name: string): string {
  return name
    .replace(/\b(LLC|L\.L\.C\.|LP|L\.P\.|LLP|L\.L\.P\.|Inc\.?|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|NA|N\.A\.)\b/gi, "")
    .replace(/[,.\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Check if a title matches decision maker criteria
function isDecisionMakerTitle(title: string): boolean {
  if (!title) return false;
  const titleLower = title.toLowerCase();
  return DECISION_MAKER_TITLES.some(dm => titleLower.includes(dm));
}

// Validate that a name looks like a real person, not a company name
function isValidPersonName(fullName: string, companyName: string): boolean {
  if (!fullName || fullName.length < 4) return false;
  
  const nameLower = fullName.toLowerCase().trim();
  const companyLower = companyName.toLowerCase().trim();
  const companyNormalized = normalizeCompanyName(companyName).toLowerCase();
  
  // Reject if name equals or contains company name
  if (nameLower === companyLower || nameLower === companyNormalized) {
    console.log(`[VALIDATION] Rejected "${fullName}" - matches company name "${companyName}"`);
    return false;
  }
  
  // Reject if name is contained within company name (indicates parsing error)
  if (companyLower.includes(nameLower) || companyNormalized.includes(nameLower)) {
    console.log(`[VALIDATION] Rejected "${fullName}" - is part of company name "${companyName}"`);
    return false;
  }
  
  // Reject if name contains corporate keywords
  for (const keyword of CORPORATE_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      console.log(`[VALIDATION] Rejected "${fullName}" - contains corporate keyword "${keyword}"`);
      return false;
    }
  }
  
  // Reject if name has legal entity suffixes
  if (/\b(LLC|LP|LLP|Inc|Corp|Corporation|Company|Co|Ltd|Limited|Fund|Trust)\b/i.test(fullName)) {
    console.log(`[VALIDATION] Rejected "${fullName}" - contains legal entity suffix`);
    return false;
  }
  
  // Name should have at least 2 parts (first + last)
  const parts = fullName.split(/\s+/).filter(p => p.length > 1);
  if (parts.length < 2) {
    console.log(`[VALIDATION] Rejected "${fullName}" - only ${parts.length} name part(s)`);
    return false;
  }
  
  return true;
}

export async function enrichTargetContacts(
  target: BulkEnrichmentTarget,
  config: TargetingConfig
): Promise<InsertBulkEnrichmentResult[]> {
  const results: InsertBulkEnrichmentResult[] = [];
  const seenNames = new Set<string>(); // Dedupe by name
  // OPTIMIZATION: Reduced from 5 to 2 for faster processing
  // User can always drill down for more contacts on specific companies
  const MAX_CONTACTS_PER_FIRM = 2;

  try {
    const normalizedCompany = normalizeCompanyName(target.companyName);
    console.log(`[BULK ENRICHMENT] Stage 2: Enriching decision makers for "${target.companyName}" (normalized: "${normalizedCompany}")`);
    
    // ========================================
    // STRATEGY 1: Apify Startup Investors
    // Search for investors at this firm
    // ========================================
    if (config.useApifyInvestors) {
      try {
        console.log(`[BULK ENRICHMENT] 1/4 - Trying Apify Investors for "${normalizedCompany}"...`);
        const investorResults = await dataProviders.searchApifyInvestorsByFirm(normalizedCompany, 10);
        console.log(`[BULK ENRICHMENT] Apify Investors returned ${investorResults.length} investors`);
        
        for (const investor of investorResults) {
          if (!investor.name || seenNames.has(investor.name.toLowerCase())) continue;
          if (results.length >= MAX_CONTACTS_PER_FIRM) break;
          
          // Filter by decision maker title
          if (!isDecisionMakerTitle(investor.title || "")) {
            console.log(`[BULK ENRICHMENT] Skipping "${investor.name}" - title "${investor.title}" not a decision maker`);
            continue;
          }
          
          seenNames.add(investor.name.toLowerCase());
          const nameParts = investor.name.split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";
          
          const intentResult = calculateIntentScore({
            title: investor.title,
            companyName: target.companyName,
          });
          
          results.push({
            jobId: target.jobId,
            targetId: target.id,
            companyName: target.companyName,
            firstName,
            lastName,
            fullName: investor.name,
            title: investor.title,
            email: investor.email || null,
            phone: investor.phone || null,
            cellPhone: null,
            address: null,
            city: null,
            state: null,
            zip: null,
            confidenceScore: investor.email ? 85 : (investor.phone ? 75 : 60),
            intentScore: intentResult.score,
            intentSignals: intentResult.signals,
            intentTier: intentResult.tier,
            providerSource: "apify_startup_investors",
            dataAxleId: null,
          });
        }
        console.log(`[BULK ENRICHMENT] After Apify Investors: ${results.length} decision makers`);
      } catch (investorError) {
        console.error(`[BULK ENRICHMENT] Apify Investors error:`, investorError);
      }
    }

    // ========================================
    // STRATEGY 2: A-Leads (fallback if < 5 people)
    // Search for people at this company
    // ========================================
    if (results.length < MAX_CONTACTS_PER_FIRM) {
      try {
        console.log(`[BULK ENRICHMENT] 2/4 - Trying A-Leads for "${normalizedCompany}"...`);
        const aLeadsContacts = await dataProviders.searchPeopleByCompany(normalizedCompany, {
          city: target.city || undefined,
          state: target.state || undefined,
        });
        
        console.log(`[BULK ENRICHMENT] A-Leads returned ${aLeadsContacts.length} people`);

        for (const contact of aLeadsContacts) {
          if (results.length >= MAX_CONTACTS_PER_FIRM) break;
          
          const fullName = contact.name || "";
          if (!fullName || seenNames.has(fullName.toLowerCase())) continue;
          
          // Validate this is a real person name, not a company name
          if (!isValidPersonName(fullName, target.companyName)) {
            continue;
          }
          
          // Filter by decision maker title
          if (!isDecisionMakerTitle(contact.title || "")) {
            continue;
          }
          
          seenNames.add(fullName.toLowerCase());
          const nameParts = fullName.split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          const intentResult = calculateIntentScore({
            title: contact.title,
            companyName: target.companyName,
          });

          results.push({
            jobId: target.jobId,
            targetId: target.id,
            companyName: target.companyName,
            firstName,
            lastName,
            fullName,
            title: contact.title,
            email: contact.email || null,
            phone: contact.phone || null,
            cellPhone: null,
            address: contact.address || null,
            city: null,
            state: null,
            zip: null,
            confidenceScore: contact.confidence || 75,
            intentScore: intentResult.score,
            intentSignals: intentResult.signals,
            intentTier: intentResult.tier,
            providerSource: "a_leads",
            dataAxleId: null,
          });
        }
        console.log(`[BULK ENRICHMENT] After A-Leads: ${results.length} decision makers`);
      } catch (aLeadsError) {
        console.error(`[BULK ENRICHMENT] A-Leads error:`, aLeadsError);
      }
    }

    // ========================================
    // NOTE: Skip Trace REMOVED from company-to-person discovery
    // Skip Trace is designed for PERSON name searches, not company lookups.
    // Passing company names to Skip Trace causes it to parse the company
    // name as a person (e.g., "Capri Holdings" becomes firstName="Capri", lastName="Holdings")
    // This produces garbage data. Skip Trace should only be used for enriching
    // contacts that we already have real person names for.
    // ========================================
    if (results.length === 0) {
      console.log(`[BULK ENRICHMENT] 3/4 - No decision makers found for "${normalizedCompany}" via A-Leads`);
      console.log(`[BULK ENRICHMENT] Note: Skip Trace not used for company-to-person discovery (designed for person name search only)`);
    }

    // ========================================
    // STRATEGY 4: Skip trace DISABLED for speed
    // Skip trace adds 3-5 seconds per contact - too slow for bulk processing
    // Users can enrich individual contacts later via the dossier detail page
    // ========================================
    // OPTIMIZATION: Disabled to improve bulk processing speed
    // const contactsNeedingEnrichment = results.filter(r => !r.email && !r.phone);
    // if (contactsNeedingEnrichment.length > 0) { ... }

    console.log(`[BULK ENRICHMENT] FINAL: ${results.length} decision makers found for "${target.companyName}"`);
    
  } catch (error) {
    console.error(`Error enriching contacts for ${target.companyName}:`, error);
  }

  return results;
}

import * as GeminiResearch from "./providers/GeminiDeepResearchProvider";

// Post-processing: Reveal emails and phones for saved contacts
async function revealContactsForJob(jobId: string): Promise<void> {
  console.log(`[REVEAL] Starting email/phone reveal for job ${jobId}`);
  
  try {
    // Get all results for this job that need reveals
    const results = await storage.getBulkEnrichmentResults(jobId);
    const needsReveal = results.filter(r => 
      r.linkedinUrl && (!r.email || !r.phone || !r.cellPhone)
    );
    
    if (needsReveal.length === 0) {
      console.log(`[REVEAL] No contacts need email/phone reveal for job ${jobId}`);
      return;
    }
    
    console.log(`[REVEAL] Revealing email/phone for ${needsReveal.length} contacts`);
    
    // Process reveals in parallel with bounded concurrency
    const revealLimit = pLimit(5);
    let revealedEmails = 0;
    let revealedPhones = 0;
    
    const revealTasks = needsReveal.map(result => 
      revealLimit(async () => {
        try {
          // Check if the result has "hasEmail" or "hasPhone" flags from A-Leads
          const resultData = result as any;
          const hasEmailFlag = resultData.hasEmail ?? true; // Default to try
          const hasPhoneFlag = resultData.hasPhone ?? true; // Default to try
          
          const revealed = await dataProviders.revealALeadsContactInfo({
            name: result.fullName || "",
            linkedinUrl: result.linkedinUrl || undefined,
            email: result.email || undefined,
            phone: result.phone || result.cellPhone || undefined,
            hasEmail: hasEmailFlag && !result.email,
            hasPhone: hasPhoneFlag && !result.phone && !result.cellPhone,
          });
          
          // Update result with revealed data
          const updates: Record<string, any> = {};
          if (revealed.email && !result.email) {
            updates.email = revealed.email;
            revealedEmails++;
          }
          if (revealed.phone) {
            // Prefer cell phone field for mobile numbers
            if (!result.cellPhone) {
              updates.cellPhone = revealed.phone;
              revealedPhones++;
            } else if (!result.phone) {
              updates.phone = revealed.phone;
              revealedPhones++;
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateBulkEnrichmentResult(result.id, updates);
            console.log(`[REVEAL] Updated ${result.fullName}: email=${updates.email || 'same'}, phone=${updates.cellPhone || updates.phone || 'same'}`);
          }
        } catch (err: any) {
          console.error(`[REVEAL] Error for ${result.fullName}:`, err?.message);
        }
      })
    );
    
    await Promise.all(revealTasks);
    console.log(`[REVEAL] Job ${jobId} complete: ${revealedEmails} emails, ${revealedPhones} phones revealed`);
    
  } catch (error: any) {
    console.error(`[REVEAL] Error processing job ${jobId}:`, error?.message);
  }
}

// Post-processing: Deep research for outreach intelligence via Gemini
async function geminiResearchForJob(jobId: string): Promise<void> {
  if (!GeminiResearch.isConfigured()) {
    console.log(`[GEMINI] Skipping research for job ${jobId} - not configured`);
    return;
  }
  
  console.log(`[GEMINI] Starting deep research for job ${jobId}`);
  
  try {
    const results = await storage.getBulkEnrichmentResults(jobId);
    // Only research contacts that haven't been researched yet (limit to top 20 by intent score)
    const needsResearch = results
      .filter(r => !r.geminiResearchedAt)
      .slice(0, 20); // Limit to avoid high API costs
    
    if (needsResearch.length === 0) {
      console.log(`[GEMINI] No contacts need research for job ${jobId}`);
      return;
    }
    
    console.log(`[GEMINI] Researching ${needsResearch.length} contacts`);
    
    const researchLimit = pLimit(3); // Lower concurrency for Gemini
    let researchedCount = 0;
    
    const researchTasks = needsResearch.map(result =>
      researchLimit(async () => {
        try {
          const research = await GeminiResearch.researchContactForOutreach(
            result.fullName || "",
            result.title || undefined,
            result.companyName,
            result.city && result.state ? `${result.city}, ${result.state}` : undefined,
            result.linkedinUrl || undefined
          );
          
          if (research) {
            await storage.updateBulkEnrichmentResult(result.id, {
              whyReachOut: research.whyReachOut,
              howToReachOut: research.howToReachOut,
              whyTheyreInterested: research.whyTheyreInterested,
              keyTalkingPoints: research.keyTalkingPoints,
              investmentThesis: research.investmentThesis,
              recentActivity: research.recentActivity,
              geminiConfidenceScore: research.confidenceScore,
              geminiResearchedAt: new Date(),
            });
            researchedCount++;
            console.log(`[GEMINI] Researched ${result.fullName} (${researchedCount}/${needsResearch.length})`);
          }
        } catch (err: any) {
          console.error(`[GEMINI] Error researching ${result.fullName}:`, err?.message);
        }
      })
    );
    
    await Promise.all(researchTasks);
    console.log(`[GEMINI] Job ${jobId} research complete: ${researchedCount} contacts researched`);
    
  } catch (error: any) {
    console.error(`[GEMINI] Error processing job ${jobId}:`, error?.message);
  }
}

export async function processEnrichmentJob(jobId: string): Promise<void> {
  console.log(`[BULK ENRICHMENT] Starting job ${jobId}`);

  await storage.updateBulkEnrichmentJob(jobId, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    const job = await storage.getBulkEnrichmentJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const config = (job.targetingConfig as TargetingConfig) || {};

    const targets = await storage.getBulkEnrichmentTargets(jobId);
    let processedCount = 0;
    let enrichedCount = 0;
    let errorCount = 0;

    // OPTIMIZATION: Process 6 companies in parallel for ~6x speedup
    const parallelLimit = pLimit(6);
    
    // Track progress in real-time
    let lastProgressUpdate = Date.now();
    const UPDATE_INTERVAL_MS = 2000; // Update DB every 2 seconds
    
    const enrichmentTasks = targets.map(target => 
      parallelLimit(async () => {
        try {
          await storage.updateBulkEnrichmentTarget(target.id, { status: "processing" });

          const contacts = await enrichTargetContacts(target, config);

          // Batch insert contacts
          await Promise.all(contacts.map(contact => 
            storage.createBulkEnrichmentResult(contact)
          ));

          await storage.updateBulkEnrichmentTarget(target.id, {
            status: "enriched",
            processedAt: new Date(),
          });

          // Update progress counter immediately
          processedCount++;
          enrichedCount += contacts.length;
          
          // Update job progress in DB periodically (every 2s) to avoid hammering DB
          const now = Date.now();
          if (now - lastProgressUpdate > UPDATE_INTERVAL_MS) {
            lastProgressUpdate = now;
            await storage.updateBulkEnrichmentJob(jobId, {
              processedTargets: processedCount,
              enrichedContacts: enrichedCount,
              errorCount,
            });
          }

          return { success: true, contactCount: contacts.length };
        } catch (error: any) {
          await storage.updateBulkEnrichmentTarget(target.id, {
            status: "error",
            errorMessage: error?.message || "Unknown error",
          });
          errorCount++;
          return { success: false, contactCount: 0 };
        }
      })
    );

    // Wait for all tasks
    await Promise.all(enrichmentTasks);

    // Final update with completed status
    await storage.updateBulkEnrichmentJob(jobId, {
      status: "succeeded",
      processedTargets: processedCount,
      enrichedContacts: enrichedCount,
      errorCount,
      completedAt: new Date(),
    });

    console.log(`[BULK ENRICHMENT] Job ${jobId} completed: ${processedCount} targets, ${enrichedCount} contacts`);
    
    // POST-PROCESSING: Reveal emails and phones for contacts with LinkedIn URLs
    // This runs after job is marked complete so UI updates immediately
    setTimeout(() => revealContactsForJob(jobId), 100);
    
    // GEMINI RESEARCH: Deep analysis runs after reveal phase to provide outreach intelligence
    setTimeout(() => geminiResearchForJob(jobId), 5000);

  } catch (error: any) {
    console.error(`[BULK ENRICHMENT] Job ${jobId} failed:`, error);
    await storage.updateBulkEnrichmentJob(jobId, {
      status: "failed",
      completedAt: new Date(),
    });
  }
}

export async function createEnrichmentJob(
  userId: string,
  name: string,
  config: TargetingConfig
): Promise<BulkEnrichmentJob> {
  console.log(`[BULK ENRICHMENT] Creating job for user ${userId}: ${name}`);

  const companies = await searchFamilyOffices(config);
  console.log(`[BULK ENRICHMENT] Found ${companies.length} potential family offices`);

  const job = await storage.createBulkEnrichmentJob({
    userId,
    name,
    sourceType: "criteria",
    status: "queued",
    targetingConfig: config,
    totalTargets: companies.length,
    processedTargets: 0,
    enrichedContacts: 0,
    errorCount: 0,
    intentThreshold: 50,
  });

  let preEnrichedContactCount = 0;
  
  for (const company of companies) {
    const target = await storage.createBulkEnrichmentTarget({
      jobId: job.id,
      companyName: company.companyName,
      normalizedName: company.companyName.toLowerCase(),
      address: company.address,
      city: company.city,
      state: company.state,
      zip: company.zip,
      naicsCode: company.naicsCode,
      sicCode: company.sicCode,
      employeeCount: company.employeeCount,
      salesVolume: company.salesVolume,
      familyOfficeConfidence: company.familyOfficeConfidence,
      familyOfficeSignals: company.familyOfficeSignals,
      status: "pending",
      dataAxleId: company.dataAxleId,
    });
    
    // A-LEADS FIX: If decision-makers were already found during discovery, save them directly
    // This avoids re-searching by company name which doesn't work well with A-Leads
    const anyCompany = company as any;
    if (anyCompany.decisionMakers?.length > 0) {
      for (const dm of anyCompany.decisionMakers) {
        // Calculate intent score for the decision maker
        const intentScore = calculateIntentScore({
          title: dm.title,
          companyName: company.companyName,
        });
        
        // Parse location into city/state if available (format: "City, State, Country" or "City, State")
        let parsedCity: string | undefined;
        let parsedState: string | undefined;
        if (dm.location) {
          const locationParts = dm.location.split(",").map((p: string) => p.trim());
          if (locationParts.length >= 2) {
            parsedCity = locationParts[0];
            // State could be second part or have country after it
            parsedState = locationParts[1].replace(/\s*United States$/i, "").trim();
          }
        }
        
        // Log what we're saving for debugging
        console.log(`[A-LEADS] Saving decision-maker: ${dm.name} | email: ${dm.email || 'none'} | phone: ${dm.phone || 'none'} | location: ${dm.location || 'none'}`);
        
        // Generate AI summary asynchronously (don't await, save first for speed)
        const signals = dm.dataCenterSignals || intentScore.signals;
        const signalDescriptions = Array.isArray(signals) 
          ? signals.map((s: any) => typeof s === 'string' ? s : s.signal || s.description || String(s))
          : [];
        
        // Generate quick template-based summary (AI summary generated on-demand in UI)
        const titleDesc = dm.title || "Decision-maker";
        const companyDesc = company.companyName || "investment firm";
        const defaultSummary = `${titleDesc} at ${companyDesc} with authority over capital allocation and infrastructure investment decisions. ${signalDescriptions[0] || "Strong match for data center opportunities."}`;
        
        await storage.createBulkEnrichmentResult({
          jobId: job.id,
          targetId: target.id,
          companyName: company.companyName,
          fullName: dm.name,
          firstName: dm.name?.split(" ")[0],
          lastName: dm.name?.split(" ").slice(1).join(" "),
          title: dm.title,
          // CRITICAL: Include actual contact info from A-Leads
          email: dm.email,
          phone: dm.phone,
          linkedinUrl: dm.linkedin,
          address: dm.location,
          city: parsedCity,
          state: parsedState,
          confidenceScore: company.familyOfficeConfidence,
          intentScore: dm.dataCenterScore || intentScore.score,
          intentSignals: dm.dataCenterSignals || intentScore.signals,
          intentTier: dm.dataCenterTier || intentScore.tier,
          aiSummary: defaultSummary,
          providerSource: "aleads_advanced_search",
        });
        preEnrichedContactCount++;
      }
      
      // Mark target as already enriched since we have decision-makers from A-Leads
      await storage.updateBulkEnrichmentTarget(target.id, {
        status: "enriched",
        processedAt: new Date(),
      });
    }
  }
  
  // Log pre-enrichment stats
  if (preEnrichedContactCount > 0) {
    console.log(`[BULK ENRICHMENT] Pre-enriched ${preEnrichedContactCount} decision-makers from A-Leads discovery`);
    // Update job with pre-enriched counts
    await storage.updateBulkEnrichmentJob(job.id, {
      enrichedContacts: preEnrichedContactCount,
    });
  }

  setTimeout(() => processEnrichmentJob(job.id), 100);

  return job;
}

// Re-process a completed job (reveal contacts + Gemini research)
// Used when server restarts lose the post-processing callbacks
export async function reprocessJobContacts(jobId: string): Promise<void> {
  console.log(`[REPROCESS] Starting reprocessing for job ${jobId}`);
  
  try {
    const job = await storage.getBulkEnrichmentJob(jobId);
    if (!job || job.status !== "succeeded") {
      console.log(`[REPROCESS] Job ${jobId} not found or not completed`);
      return;
    }
    
    // Run reveal phase
    await revealContactsForJob(jobId);
    
    // Run Gemini research phase after a short delay
    setTimeout(() => geminiResearchForJob(jobId), 3000);
    
    console.log(`[REPROCESS] Completed reprocessing for job ${jobId}`);
  } catch (error) {
    console.error(`[REPROCESS] Error reprocessing job ${jobId}:`, error);
  }
}

export const bulkEnrichmentService = {
  createEnrichmentJob,
  processEnrichmentJob,
  searchFamilyOffices,
  enrichTargetContacts,
  detectFamilyOffice,
  calculateIntentScore,
  reprocessJobContacts,
};
