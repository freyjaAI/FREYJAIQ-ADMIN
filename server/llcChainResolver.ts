import { trackProviderCall } from "./providerConfig";
import * as PerplexityProvider from "./providers/PerplexityProvider";

/**
 * Function to verify a person exists at a given address
 * Returns true if the person is found at or near the address
 */
export type PersonVerifyFn = (
  personName: string,
  address: string
) => Promise<{ verified: boolean; confidence: number; source?: string }>;

let _personVerifyFn: PersonVerifyFn | null = null;

export function setPersonVerifyFunction(fn: PersonVerifyFn): void {
  _personVerifyFn = fn;
}

/**
 * Extract potential person names from LLC/entity names.
 * Examples:
 * - "DAVID J CHIESA & ASSOCIATION INC" -> "David J Chiesa"
 * - "SMITH FAMILY TRUST" -> "Smith"
 * - "JOHN DOE PROPERTIES LLC" -> "John Doe"
 * - "THE HELGREN ELIZABETH A TRUST" -> "Elizabeth A Helgren"
 */
export function extractPersonNameFromEntityName(entityName: string): string | null {
  if (!entityName) return null;
  
  const name = entityName.toUpperCase().trim();
  
  // Entity suffixes to remove
  const suffixes = [
    "& ASSOCIATION INC", "& ASSOCIATES INC", "& ASSOC INC",
    "ASSOCIATION INC", "ASSOCIATES INC", "ASSOC INC",
    "& COMPANY", "& CO", "COMPANY", "CO",
    "PROPERTIES LLC", "HOLDINGS LLC", "INVESTMENTS LLC", "CAPITAL LLC",
    "PROPERTIES", "HOLDINGS", "INVESTMENTS", "CAPITAL",
    "ENTERPRISES", "VENTURES", "PARTNERS", "GROUP",
    "FAMILY TRUST", "LIVING TRUST", "REVOCABLE TRUST", "IRREVOCABLE TRUST",
    "TRUST", "LLC", "INC", "CORP", "LP", "LLP", "LTD",
    "REALTY", "DEVELOPMENT", "MANAGEMENT", "SERVICES",
  ];
  
  // Prefixes to remove
  const prefixes = ["THE", "A"];
  
  let cleanName = name;
  
  // Remove suffixes (longest first to handle "& ASSOCIATION INC" before "INC")
  const sortedSuffixes = [...suffixes].sort((a, b) => b.length - a.length);
  for (const suffix of sortedSuffixes) {
    if (cleanName.endsWith(suffix)) {
      cleanName = cleanName.slice(0, -suffix.length).trim();
    }
  }
  
  // Remove trailing punctuation
  cleanName = cleanName.replace(/[&,.\-]+$/, "").trim();
  
  // Remove prefixes
  for (const prefix of prefixes) {
    if (cleanName.startsWith(prefix + " ")) {
      cleanName = cleanName.slice(prefix.length + 1).trim();
    }
  }
  
  // Now check if what's left looks like a person name
  // Valid patterns:
  // - "DAVID J CHIESA" (first middle last)
  // - "JOHN DOE" (first last)
  // - "HELGREN ELIZABETH A" (last first middle - trust naming)
  // - "SMITH" (single last name - often in family trusts)
  
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) return null;
  
  // Check if it looks like a person name (not corporate keywords)
  const corporateWords = [
    "AMERICAN", "NATIONAL", "INTERNATIONAL", "GLOBAL", "UNITED",
    "FIRST", "SECOND", "THIRD", "CENTRAL", "NORTH", "SOUTH", "EAST", "WEST",
    "PACIFIC", "ATLANTIC", "MIDWEST", "COASTAL", "MOUNTAIN",
    "INDUSTRIAL", "COMMERCIAL", "RESIDENTIAL", "RETAIL", "MEDICAL",
    "EQUITY", "ASSET", "FUND", "REAL", "ESTATE",
  ];
  
  // If any word is a corporate keyword, likely not a person name
  if (words.some(w => corporateWords.includes(w))) {
    return null;
  }
  
  // Single word names (like "HELGREN" from "HELGREN FAMILY TRUST")
  if (words.length === 1) {
    // Only accept if it looks like a last name (not too short)
    if (words[0].length >= 4) {
      return toTitleCase(words[0]);
    }
    return null;
  }
  
  // Check for trust naming pattern "HELGREN ELIZABETH A" (last first middle)
  // Indicator: last word is a single letter (middle initial)
  if (words.length >= 2 && words[words.length - 1].length === 1) {
    // Likely "LAST FIRST M" format - rearrange to "FIRST M LAST"
    const lastName = words[0];
    const firstAndMiddle = words.slice(1);
    const rearranged = [...firstAndMiddle, lastName];
    return rearranged.map(toTitleCase).join(" ");
  }
  
  // Standard format "DAVID J CHIESA" or "JOHN DOE"
  if (words.length >= 2 && words.length <= 4) {
    // All words should be reasonable name lengths
    const allReasonableLength = words.every(w => w.length >= 1 && w.length <= 15);
    if (allReasonableLength) {
      return words.map(toTitleCase).join(" ");
    }
  }
  
  return null;
}

function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export interface ChainNode {
  name: string;
  type: "entity" | "individual";
  role?: string;
  confidence?: number;
  jurisdiction?: string;
  registeredAgent?: string;
  depth: number;
}

export interface OwnershipChain {
  rootEntity: string;
  chain: ChainNode[];
  ultimateBeneficialOwners: ChainNode[];
  maxDepthReached: boolean;
  resolvedAt: Date;
  /** Total API calls made (includes LLC lookups and Perplexity searches) */
  totalApiCalls: number;
  /** Whether Perplexity AI search was triggered for privacy-protected entities */
  perplexityUsed: boolean;
}

export type LlcLookupFn = (
  companyName: string,
  jurisdiction?: string
) => Promise<{ llc: any; fromCache: boolean; cacheAge?: number } | null>;

let _llcLookupFn: LlcLookupFn | null = null;

export function setLlcLookupFunction(fn: LlcLookupFn): void {
  _llcLookupFn = fn;
}

const MAX_CHAIN_DEPTH = 5;
const ENTITY_KEYWORDS = ["LLC", "INC", "CORP", "LP", "LLP", "TRUST", "COMPANY", "HOLDINGS", "PROPERTIES", "INVESTMENTS", "CAPITAL", "PARTNERS", "GROUP", "VENTURES", "MANAGEMENT", "ENTERPRISES", "SERVICES", "REALTY", "DEVELOPMENT", "ASSOCIATES"];

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

function isEntityName(name: string): boolean {
  // Normalize spaced letters before checking (e.g., "L L C" -> "LLC")
  const normalizedName = normalizeSpacedLetters(name.toUpperCase());
  return ENTITY_KEYWORDS.some(keyword => normalizedName.includes(keyword));
}

function normalizeEntityName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
}

export async function resolveOwnershipChain(
  entityName: string,
  jurisdiction?: string,
  propertyAddress?: string
): Promise<OwnershipChain> {
  if (!_llcLookupFn) {
    throw new Error("LLC lookup function not initialized. Call setLlcLookupFunction first.");
  }

  const visited = new Set<string>();
  const chain: ChainNode[] = [];
  const ultimateBeneficialOwners: ChainNode[] = [];
  let apiCalls = 0;
  let maxDepthReached = false;
  let perplexityUsed = false;
  const perplexitySearchedEntities = new Set<string>(); // Track per-entity Perplexity usage

  async function traverse(
    name: string,
    depth: number,
    role?: string
  ): Promise<void> {
    const normalizedName = normalizeEntityName(name);
    
    if (visited.has(normalizedName)) {
      console.log(`[LLC Chain] Loop detected: "${name}" already visited`);
      return;
    }
    
    if (depth > MAX_CHAIN_DEPTH) {
      console.log(`[LLC Chain] Max depth ${MAX_CHAIN_DEPTH} reached at "${name}"`);
      maxDepthReached = true;
      return;
    }

    visited.add(normalizedName);

    const node: ChainNode = {
      name,
      type: isEntityName(name) ? "entity" : "individual",
      role,
      depth,
    };

    chain.push(node);

    if (!isEntityName(name)) {
      console.log(`[LLC Chain] Found individual: "${name}" at depth ${depth}`);
      ultimateBeneficialOwners.push(node);
      return;
    }

    console.log(`[LLC Chain] Researching entity: "${name}" at depth ${depth}`);
    
    try {
      const llcData = await _llcLookupFn!(name, jurisdiction);
      apiCalls++;

      if (!llcData) {
        console.log(`[LLC Chain] No data found for "${name}"`);
        
        // Try to extract a person name from the entity name as fallback
        const extractedName = extractPersonNameFromEntityName(name);
        if (extractedName && propertyAddress) {
          console.log(`[LLC Chain] Extracted potential owner name "${extractedName}" from entity name "${name}" (no LLC data)`);
          console.log(`[LLC Chain] Verifying with property address: ${propertyAddress}`);
          
          const normalizedExtractedName = normalizeEntityName(extractedName);
          if (!visited.has(normalizedExtractedName)) {
            // VERIFY the person exists at the property address before adding
            let verified = false;
            let verifyConfidence = 0;
            let verifySource = "name_extraction";
            
            if (_personVerifyFn) {
              try {
                const verifyResult = await _personVerifyFn(extractedName, propertyAddress);
                verified = verifyResult.verified;
                verifyConfidence = verifyResult.confidence;
                verifySource = verifyResult.source || "address_lookup";
                console.log(`[LLC Chain] Person verification for "${extractedName}" at "${propertyAddress}": ${verified ? "CONFIRMED" : "NOT FOUND"} (confidence: ${verifyConfidence})`);
              } catch (err) {
                console.log(`[LLC Chain] Person verification failed for "${extractedName}":`, err);
                // Verification failed - do not add unverified person
                verified = false;
                verifyConfidence = 0;
              }
            } else {
              // No verification function available - do NOT add unverified persons
              console.log(`[LLC Chain] No person verification function available, skipping extracted name`);
              verified = false;
              verifyConfidence = 0;
            }
            
            if (verified && verifyConfidence >= 40) {
              visited.add(normalizedExtractedName);
              
              const extractedNode: ChainNode = {
                name: extractedName.toUpperCase(),
                type: "individual",
                role: "likely_principal",
                confidence: verifyConfidence,
                depth: depth + 1,
              };
              
              chain.push(extractedNode);
              ultimateBeneficialOwners.push(extractedNode);
              
              console.log(`[LLC Chain] Added verified owner "${extractedName}" as likely principal (source: ${verifySource}, confidence: ${verifyConfidence})`);
            } else {
              console.log(`[LLC Chain] Skipping unverified extracted name "${extractedName}" - no address match found`);
            }
          }
        }
        return;
      }

      const llc = llcData.llc;
      node.jurisdiction = llc.jurisdictionCode;
      node.registeredAgent = llc.agentName;

      const officers = llc.officers || [];
      console.log(`[LLC Chain] Found ${officers.length} officers for "${name}"`);

      // Check if this entity is privacy-protected (only corporate agents as officers)
      const entityKey = normalizeEntityName(name);
      if (hasOnlyPrivacyProtectedOfficers(officers) && !perplexitySearchedEntities.has(entityKey)) {
        console.log(`[LLC Chain] Privacy-protected entity detected: "${name}" - triggering Perplexity AI search`);
        perplexitySearchedEntities.add(entityKey); // Track per-entity to allow nested privacy-protected entities
        perplexityUsed = true;
        
        const discoveredOwners = await discoverOwnershipWithPerplexity(
          name,
          llc.agentName,
          llc.agentAddress || llc.principalAddress,
          llc.jurisdictionCode,
          propertyAddress
        );
        
        apiCalls++;
        
        if (discoveredOwners.length > 0) {
          console.log(`[LLC Chain] Perplexity found ${discoveredOwners.length} owners for privacy-protected "${name}"`);
          
          for (const discoveredOwner of discoveredOwners) {
            const normalizedDiscoveredName = normalizeEntityName(discoveredOwner.name);
            
            // Skip if already visited (prevents duplicates when same person appears as officer)
            if (visited.has(normalizedDiscoveredName)) {
              console.log(`[LLC Chain] Skipping Perplexity result "${discoveredOwner.name}" - already visited`);
              continue;
            }
            
            if (discoveredOwner.type === "individual") {
              // Verify Perplexity-discovered individuals against property address
              // STRICT: Only add if address verification confirms the person
              let verified = false;
              let verifyConfidence = 0;
              
              if (_personVerifyFn && propertyAddress) {
                try {
                  const verifyResult = await _personVerifyFn(discoveredOwner.name, propertyAddress);
                  if (verifyResult.verified && verifyResult.confidence >= 40) {
                    verified = true;
                    verifyConfidence = verifyResult.confidence;
                    console.log(`[LLC Chain] Perplexity individual "${discoveredOwner.name}" VERIFIED at property address (confidence: ${verifyConfidence})`);
                  } else {
                    console.log(`[LLC Chain] Perplexity individual "${discoveredOwner.name}" not verified at property address - skipping`);
                    verified = false;
                    verifyConfidence = 0;
                  }
                } catch (err) {
                  console.log(`[LLC Chain] Address verification failed for Perplexity result "${discoveredOwner.name}":`, err);
                  verified = false;
                  verifyConfidence = 0;
                }
              } else {
                // No verification function or no property address - cannot verify, skip
                console.log(`[LLC Chain] Cannot verify Perplexity result "${discoveredOwner.name}" - no verification function or address`);
                verified = false;
                verifyConfidence = 0;
              }
              
              if (verified && verifyConfidence >= 40) {
                visited.add(normalizedDiscoveredName);
                const ownerNode: ChainNode = {
                  ...discoveredOwner,
                  confidence: verifyConfidence,
                  depth: depth + 1,
                };
                chain.push(ownerNode);
                ultimateBeneficialOwners.push(ownerNode);
              } else {
                console.log(`[LLC Chain] Skipping unverified Perplexity result "${discoveredOwner.name}"`);
              }
            } else {
              // For entities, let traverse handle chain insertion to avoid duplicates
              await traverse(discoveredOwner.name, depth + 1, discoveredOwner.role);
            }
          }
          // Continue to process officers as well for additional data
        } else {
          console.log(`[LLC Chain] Perplexity found no owners, falling back to normal officer processing`);
          
          // Try to extract a person name from the entity name itself
          // e.g., "DAVID J CHIESA & ASSOCIATION INC" -> "David J Chiesa"
          const extractedName = extractPersonNameFromEntityName(name);
          if (extractedName && propertyAddress) {
            console.log(`[LLC Chain] Extracted potential owner name "${extractedName}" from entity name "${name}"`);
            console.log(`[LLC Chain] Verifying with property address: ${propertyAddress}`);
            
            const normalizedExtractedName = normalizeEntityName(extractedName);
            if (!visited.has(normalizedExtractedName)) {
              // VERIFY the person exists at the property address before adding
              let verified = false;
              let verifyConfidence = 0;
              let verifySource = "name_extraction";
              
              if (_personVerifyFn) {
                try {
                  const verifyResult = await _personVerifyFn(extractedName, propertyAddress);
                  verified = verifyResult.verified;
                  verifyConfidence = verifyResult.confidence;
                  verifySource = verifyResult.source || "address_lookup";
                  console.log(`[LLC Chain] Person verification for "${extractedName}" at "${propertyAddress}": ${verified ? "CONFIRMED" : "NOT FOUND"} (confidence: ${verifyConfidence})`);
                } catch (err) {
                  console.log(`[LLC Chain] Person verification failed for "${extractedName}":`, err);
                  // Verification failed - do not add unverified person
                  verified = false;
                  verifyConfidence = 0;
                }
              } else {
                // No verification function available - do NOT add unverified persons
                console.log(`[LLC Chain] No person verification function available, skipping extracted name`);
                verified = false;
                verifyConfidence = 0;
              }
              
              if (verified && verifyConfidence >= 40) {
                visited.add(normalizedExtractedName);
                
                const extractedNode: ChainNode = {
                  name: extractedName.toUpperCase(),
                  type: "individual",
                  role: "likely_principal",
                  confidence: verifyConfidence,
                  depth: depth + 1,
                };
                
                chain.push(extractedNode);
                ultimateBeneficialOwners.push(extractedNode);
                
                console.log(`[LLC Chain] Added verified owner "${extractedName}" as likely principal (source: ${verifySource}, confidence: ${verifyConfidence})`);
              } else {
                console.log(`[LLC Chain] Skipping unverified extracted name "${extractedName}" - no address match found`);
              }
            }
          }
        }
      }

      for (const officer of officers) {
        if (!officer.name) continue;
        
        const officerName = officer.name.trim();
        const officerRole = officer.position || officer.role || "officer";
        const confidence = officer.confidence;

        await traverse(officerName, depth + 1, officerRole);
        
        const lastNode = chain[chain.length - 1];
        if (lastNode && lastNode.name === officerName) {
          lastNode.confidence = confidence;
        }
      }

      // Check for parent company via branch relationship (foreign registrations)
      // The "home state" parent often has the real officers while foreign filings only have agents
      if (llc.branch && llc.branch.parentName) {
        const parentName = llc.branch.parentName;
        const parentVisited = visited.has(normalizeEntityName(parentName));
        if (!parentVisited) {
          console.log(`[LLC Chain] Found parent company via branch: "${parentName}" (${llc.branch.parentJurisdictionCode})`);
          await traverse(parentName, depth + 1, "parent_company");
        }
      }

      // For entity officers, recursively check if THEY have parent companies
      // This discovers holding company structures (e.g., LLC owned by another LLC owned by a person)
      for (const officer of officers) {
        if (!officer.name) continue;
        
        const officerName = officer.name.trim();
        
        if (isEntityName(officerName)) {
          const officerNormalized = normalizeEntityName(officerName);
          if (!visited.has(officerNormalized)) {
            console.log(`[LLC Chain] Officer "${officerName}" is an entity, checking for parent company...`);
            
            try {
              const officerLlcData = await _llcLookupFn!(officerName, jurisdiction);
              apiCalls++;
              
              if (officerLlcData?.llc?.branch?.parentName) {
                const officerParent = officerLlcData.llc.branch.parentName;
                const parentNormalized = normalizeEntityName(officerParent);
                
                if (!visited.has(parentNormalized)) {
                  console.log(`[LLC Chain] Entity officer "${officerName}" has parent: "${officerParent}" - traversing...`);
                  await traverse(officerParent, depth + 2, "parent_of_officer");
                }
              }
            } catch (err) {
              console.log(`[LLC Chain] Could not lookup entity officer "${officerName}"`);
            }
          }
        }
      }

      if (llc.agentName && !isPrivacyAgent(llc.agentName)) {
        const agentVisited = visited.has(normalizeEntityName(llc.agentName));
        if (!agentVisited) {
          console.log(`[LLC Chain] Checking registered agent: "${llc.agentName}"`);
          await traverse(llc.agentName, depth + 1, "registered_agent");
        }
      }

    } catch (error) {
      console.error(`[LLC Chain] Error researching "${name}":`, error);
    }
  }

  await traverse(entityName, 0);

  return {
    rootEntity: entityName,
    chain,
    ultimateBeneficialOwners,
    maxDepthReached,
    resolvedAt: new Date(),
    totalApiCalls: apiCalls,
    perplexityUsed,
  };
}

const PRIVACY_AGENTS = [
  "CORPORATION SERVICE COMPANY",
  "CSC",
  "CT CORPORATION",
  "REGISTERED AGENTS INC",
  "NATIONAL REGISTERED AGENTS",
  "NORTHWEST REGISTERED AGENT",
  "INCORP SERVICES",
  "LEGALZOOM",
  "HARBOR COMPLIANCE",
  "COGENCY GLOBAL",
  "UNITED STATES CORPORATION AGENTS",
  "VCORP SERVICES",
];

function isPrivacyAgent(agentName: string): boolean {
  const upper = agentName.toUpperCase();
  return PRIVACY_AGENTS.some(agent => upper.includes(agent));
}

// Check if all officers are privacy agents/corporate service companies
function hasOnlyPrivacyProtectedOfficers(officers: Array<{ name: string; position?: string; role?: string }>): boolean {
  if (!officers || officers.length === 0) return true;
  
  const validOfficers = officers.filter(o => o.name && o.name.trim().length > 0);
  if (validOfficers.length === 0) return true;
  
  // Check if all officers are privacy agents or entities (no real people)
  const realPersonOfficers = validOfficers.filter(o => {
    const name = o.name.toUpperCase();
    if (isPrivacyAgent(name)) return false;
    if (isEntityName(name)) return false;
    return true;
  });
  
  return realPersonOfficers.length === 0;
}

// Use Perplexity AI search to discover ownership for privacy-protected entities
async function discoverOwnershipWithPerplexity(
  entityName: string,
  registeredAgent?: string,
  registeredAddress?: string,
  jurisdiction?: string,
  propertyAddress?: string
): Promise<ChainNode[]> {
  if (!PerplexityProvider.isProviderAvailable()) {
    console.log(`[LLC Chain] Perplexity not available for privacy-protected entity "${entityName}"`);
    return [];
  }

  console.log(`[LLC Chain] Using Perplexity AI search for privacy-protected entity "${entityName}"`);
  trackProviderCall("perplexity");

  try {
    const result = await PerplexityProvider.discoverLlcOwnership({
      entityName,
      registeredAgent,
      registeredAddress,
      jurisdiction,
      propertyAddress,
    });

    if (!result || result.discoveredOwners.length === 0) {
      console.log(`[LLC Chain] Perplexity found no owners for "${entityName}"`);
      return [];
    }

    console.log(`[LLC Chain] Perplexity discovered ${result.discoveredOwners.length} potential owners for "${entityName}"`);

    const nodes: ChainNode[] = result.discoveredOwners.map(owner => ({
      name: owner.name,
      type: isEntityName(owner.name) ? "entity" : "individual",
      role: owner.role,
      confidence: owner.confidence === "high" ? 90 : owner.confidence === "medium" ? 70 : 50,
      depth: 1, // Direct ownership from root
    }));

    return nodes;
  } catch (error) {
    console.error(`[LLC Chain] Perplexity search failed for "${entityName}":`, error);
    return [];
  }
}

export function formatChainForDisplay(chain: OwnershipChain): {
  levels: Array<{
    depth: number;
    entities: ChainNode[];
  }>;
  ubos: ChainNode[];
} {
  const levelMap = new Map<number, ChainNode[]>();
  
  for (const node of chain.chain) {
    const existing = levelMap.get(node.depth) || [];
    existing.push(node);
    levelMap.set(node.depth, existing);
  }

  const levels = Array.from(levelMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([depth, entities]) => ({ depth, entities }));

  return {
    levels,
    ubos: chain.ultimateBeneficialOwners,
  };
}
