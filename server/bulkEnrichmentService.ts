import { storage } from "./storage";
import { dataProviders } from "./dataProviders";
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
  // Check if user wants to use SEC EDGAR (free) - highest priority
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
  const MAX_CONTACTS_PER_FIRM = 5;

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
    // STRATEGY 4: Skip trace for contacts missing email/phone
    // Enrich contacts that are missing contact info
    // ========================================
    const contactsNeedingEnrichment = results.filter(r => !r.email && !r.phone);
    if (contactsNeedingEnrichment.length > 0) {
      console.log(`[BULK ENRICHMENT] 4/4 - Running skip trace for ${contactsNeedingEnrichment.length} contacts missing email/phone...`);
      
      for (const contact of contactsNeedingEnrichment.slice(0, 3)) {
        try {
          const skipResults = await dataProviders.searchPersonSmart(
            contact.fullName || `${contact.firstName} ${contact.lastName}`,
            { state: contact.state || target.state || undefined }
          );
          
          if (skipResults && skipResults.length > 0) {
            const person = skipResults[0];
            // Update the contact with enriched data
            if (!contact.email && person.emails?.length) {
              contact.email = person.emails[0];
              contact.confidenceScore = Math.min(100, (contact.confidenceScore || 50) + 15);
            }
            if (!contact.phone && person.phones?.length) {
              contact.phone = person.phones[0];
              contact.confidenceScore = Math.min(100, (contact.confidenceScore || 50) + 15);
            }
            if (!contact.cellPhone && person.cellPhones?.length) {
              contact.cellPhone = person.cellPhones[0];
            }
            if (!contact.address && person.address) {
              contact.address = person.address;
            }
            console.log(`[BULK ENRICHMENT] Enriched "${contact.fullName}" with skip trace data`);
          }
        } catch (skipError) {
          console.error(`[BULK ENRICHMENT] Skip trace for "${contact.fullName}" failed:`, skipError);
        }
      }
    }

    console.log(`[BULK ENRICHMENT] FINAL: ${results.length} decision makers found for "${target.companyName}"`);
    
  } catch (error) {
    console.error(`Error enriching contacts for ${target.companyName}:`, error);
  }

  return results;
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

    for (const target of targets) {
      try {
        await storage.updateBulkEnrichmentTarget(target.id, { status: "processing" });

        const contacts = await enrichmentLimit(() => enrichTargetContacts(target, config));

        for (const contact of contacts) {
          await storage.createBulkEnrichmentResult(contact);
        }

        await storage.updateBulkEnrichmentTarget(target.id, {
          status: "enriched",
          processedAt: new Date(),
        });

        enrichedCount += contacts.length;
        processedCount++;

        await storage.updateBulkEnrichmentJob(jobId, {
          processedTargets: processedCount,
          enrichedContacts: enrichedCount,
        });

      } catch (error: any) {
        errorCount++;
        await storage.updateBulkEnrichmentTarget(target.id, {
          status: "error",
          errorMessage: error?.message || "Unknown error",
        });
      }
    }

    await storage.updateBulkEnrichmentJob(jobId, {
      status: "succeeded",
      processedTargets: processedCount,
      enrichedContacts: enrichedCount,
      errorCount,
      completedAt: new Date(),
    });

    console.log(`[BULK ENRICHMENT] Job ${jobId} completed: ${processedCount} targets, ${enrichedCount} contacts`);

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

  for (const company of companies) {
    await storage.createBulkEnrichmentTarget({
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
  }

  setTimeout(() => processEnrichmentJob(job.id), 100);

  return job;
}

export const bulkEnrichmentService = {
  createEnrichmentJob,
  processEnrichmentJob,
  searchFamilyOffices,
  enrichTargetContacts,
  detectFamilyOffice,
  calculateIntentScore,
};
