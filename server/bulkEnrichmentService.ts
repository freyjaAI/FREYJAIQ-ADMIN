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

export async function enrichTargetContacts(
  target: BulkEnrichmentTarget,
  config: TargetingConfig
): Promise<InsertBulkEnrichmentResult[]> {
  const results: InsertBulkEnrichmentResult[] = [];

  try {
    console.log(`[BULK ENRICHMENT] Searching for people at "${target.companyName}" in ${target.state || 'any state'}`);
    
    const targetTitlesLower = (config.targetTitles || FAMILY_OFFICE_INDICATORS.titlePatterns)
      .map(t => t.toLowerCase());

    // Strategy 1: Try A-Leads for people by company name
    const aLeadsContacts = await dataProviders.searchPeopleByCompany(target.companyName, {
      city: target.city || undefined,
      state: target.state || undefined,
    });
    
    console.log(`[BULK ENRICHMENT] A-Leads returned ${aLeadsContacts.length} people at "${target.companyName}"`);

    for (const contact of aLeadsContacts) {
      const personTitleLower = (contact.title || "").toLowerCase();
      const isDecisionMaker = targetTitlesLower.some(t => personTitleLower.includes(t)) ||
        personTitleLower.includes("principal") ||
        personTitleLower.includes("partner") ||
        personTitleLower.includes("director") ||
        personTitleLower.includes("cio") ||
        personTitleLower.includes("cto") ||
        personTitleLower.includes("cfo") ||
        personTitleLower.includes("president") ||
        personTitleLower.includes("founder") ||
        personTitleLower.includes("owner") ||
        personTitleLower.includes("managing");

      if (!isDecisionMaker && config.targetTitles?.length) {
        continue;
      }

      const intentResult = calculateIntentScore({
        title: contact.title,
        companyName: target.companyName,
      });

      const nameParts = (contact.name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      results.push({
        jobId: target.jobId,
        targetId: target.id,
        companyName: target.companyName,
        firstName,
        lastName,
        fullName: contact.name || "",
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        cellPhone: null,
        address: contact.address,
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

    // Strategy 2: If A-Leads returned nothing, try OpenCorporates for officers
    if (results.length === 0) {
      console.log(`[BULK ENRICHMENT] A-Leads returned 0 results, trying OpenCorporates for "${target.companyName}"`);
      
      try {
        // Use searchLlcOfficers which handles the full lookup flow
        const officers = await dataProviders.searchLlcOfficers(target.companyName);
        
        if (officers && officers.length > 0) {
          console.log(`[BULK ENRICHMENT] OpenCorporates found ${officers.length} officers`);
          
          // Process each officer - limit to 5 to avoid too many API calls
          const officersToProcess = officers.slice(0, 5);
          
          for (const officer of officersToProcess) {
            const officerName = officer.name || '';
            if (!officerName || officerName.length < 3) continue;
            
            // Skip if it looks like a company name (contains LLC, Corp, etc.)
            if (/\b(LLC|LP|LLP|Inc|Corp|Corporation|Company|Co|Ltd)\b/i.test(officerName)) {
              continue;
            }
            
            // Normalize position - remove annotations like (Resigned), (Inactive)
            const rawPosition = officer.position || 'Officer';
            const position = rawPosition.replace(/\s*\([^)]*\)\s*/g, '').trim() || 'Officer';
            const positionLower = position.toLowerCase();
            
            // Check if this is a decision-maker title
            const isDecisionMaker = targetTitlesLower.some(t => positionLower.includes(t)) ||
              positionLower.includes("director") ||
              positionLower.includes("president") ||
              positionLower.includes("ceo") ||
              positionLower.includes("cfo") ||
              positionLower.includes("manager") ||
              positionLower.includes("member") ||
              positionLower.includes("partner") ||
              positionLower.includes("principal") ||
              positionLower.includes("owner") ||
              positionLower.includes("agent");
            
            if (!isDecisionMaker && config.targetTitles?.length) {
              continue;
            }
            
            // Try to skip trace this person for contact info
            let phone: string | undefined;
            let email: string | undefined;
            let address: string | undefined;
            
            try {
              // Use Apify skip trace (cheaper) to find contact info
              const skipResults = await dataProviders.searchPersonSmart(
                officerName,
                { state: target.state || undefined }
              );
              
              if (skipResults && skipResults.length > 0) {
                const firstResult = skipResults[0];
                phone = firstResult.phones?.[0];
                email = firstResult.emails?.[0];
                address = firstResult.address;
              }
            } catch (e) {
              console.log(`[BULK ENRICHMENT] Skip trace failed for ${officerName}`);
            }
            
            const intentResult = calculateIntentScore({
              title: position,
              companyName: target.companyName,
            });
            
            const nameParts = officerName.split(" ");
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";
            
            results.push({
              jobId: target.jobId,
              targetId: target.id,
              companyName: target.companyName,
              firstName,
              lastName,
              fullName: officerName,
              title: position,
              email: email || null,
              phone: phone || null,
              cellPhone: null,
              address: address || null,
              city: null,
              state: target.state || null,
              zip: null,
              confidenceScore: phone || email ? 70 : 50,
              intentScore: intentResult.score,
              intentSignals: intentResult.signals,
              intentTier: intentResult.tier,
              providerSource: "opencorporates",
              dataAxleId: null,
            });
          }
        }
      } catch (ocError) {
        console.error(`[BULK ENRICHMENT] OpenCorporates fallback failed:`, ocError);
      }
    }

    console.log(`[BULK ENRICHMENT] Total contacts found for "${target.companyName}": ${results.length}`);
    
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
