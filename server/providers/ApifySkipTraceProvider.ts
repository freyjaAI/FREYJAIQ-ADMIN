/**
 * Apify One-API Skip Trace Provider
 * https://apify.com/one-api/skip-trace
 * 
 * Searches for contact information including phones (wireless/landline), emails,
 * addresses, relatives, and associates.
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = "vmf6h5lxPAkB1W2gT"; // one-api/skip-trace actor ID

export interface SkipTracePhone {
  number: string;
  type: "Wireless" | "Landline" | "VoIP" | string;
  provider?: string;
  firstReported?: string;
  lastReported?: string;
}

export interface SkipTraceEmail {
  email: string;
}

export interface SkipTraceAddress {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  county?: string;
  timespan?: string;
}

export interface SkipTraceRelative {
  name: string;
  age?: string;
}

export interface SkipTraceResult {
  searchOption: string;
  inputGiven: string;
  firstName?: string;
  lastName?: string;
  age?: string;
  born?: string;
  currentAddress?: SkipTraceAddress;
  phones: SkipTracePhone[];
  emails: SkipTraceEmail[];
  previousAddresses: SkipTraceAddress[];
  relatives: SkipTraceRelative[];
  associates: SkipTraceRelative[];
  personLink?: string;
}

function parseApifyResult(raw: any): SkipTraceResult {
  const phones: SkipTracePhone[] = [];
  const emails: SkipTraceEmail[] = [];
  
  // Parse up to 5 phones
  for (let i = 1; i <= 5; i++) {
    const phoneNum = raw[`Phone-${i}`];
    if (phoneNum && phoneNum.trim()) {
      phones.push({
        number: phoneNum,
        type: raw[`Phone-${i} Type`] || "Unknown",
        provider: raw[`Phone-${i} Provider`] || undefined,
        firstReported: raw[`Phone-${i} First Reported`] || undefined,
        lastReported: raw[`Phone-${i} Last Reported`] || undefined,
      });
    }
  }
  
  // Parse up to 5 emails
  for (let i = 1; i <= 5; i++) {
    const email = raw[`Email-${i}`];
    if (email && email.trim()) {
      emails.push({ email });
    }
  }
  
  // Parse current address
  let currentAddress: SkipTraceAddress | undefined;
  if (raw["Street Address"]) {
    currentAddress = {
      streetAddress: raw["Street Address"],
      city: raw["Address Locality"] || "",
      state: raw["Address Region"] || "",
      postalCode: raw["Postal Code"] || "",
      county: raw["County Name"],
    };
  }
  
  // Parse previous addresses
  const previousAddresses: SkipTraceAddress[] = (raw["Previous Addresses"] || []).map((addr: any) => ({
    streetAddress: addr.streetAddress,
    city: addr.addressLocality,
    state: addr.addressRegion,
    postalCode: addr.postalCode,
    county: addr.county,
    timespan: addr.timespan,
  }));
  
  // Parse relatives
  const relatives: SkipTraceRelative[] = (raw["Relatives"] || []).map((rel: any) => ({
    name: rel.Name,
    age: rel.Age,
  }));
  
  // Parse associates
  const associates: SkipTraceRelative[] = (raw["Associates"] || []).map((assoc: any) => ({
    name: assoc.Name,
    age: assoc.Age,
  }));
  
  return {
    searchOption: raw["Search Option"] || "",
    inputGiven: raw["Input Given"] || "",
    firstName: raw["First Name"],
    lastName: raw["Last Name"],
    age: raw["Age"],
    born: raw["Born"],
    currentAddress,
    phones,
    emails,
    previousAddresses,
    relatives,
    associates,
    personLink: raw["Person Link"],
  };
}

async function runSkipTraceActor(input: {
  name?: string[];
  street_citystatezip?: string[];
  phone_number?: string[];
  max_results?: number;
}): Promise<SkipTraceResult[]> {
  if (!APIFY_API_TOKEN) {
    console.log("Apify Skip Trace: No API token configured");
    return [];
  }
  
  try {
    console.log("Apify Skip Trace: Starting actor run with input:", JSON.stringify(input));
    
    // Start actor run synchronously (waits for completion)
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    
    const response = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        max_results: input.max_results || 1,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Apify Skip Trace: Actor run failed with status ${response.status}:`, errorText);
      return [];
    }
    
    const results = await response.json();
    console.log(`Apify Skip Trace: Received ${results.length} results`);
    
    if (results.length > 0) {
      console.log("Apify Skip Trace: First result sample:", JSON.stringify(results[0]).substring(0, 500));
    }
    
    return results.map(parseApifyResult);
  } catch (error) {
    console.error("Apify Skip Trace: Error running actor:", error);
    return [];
  }
}

/**
 * Search by person name (optionally with city/state)
 */
export async function searchByName(
  fullName: string,
  city?: string,
  state?: string
): Promise<SkipTraceResult[]> {
  let searchQuery = fullName;
  if (city && state) {
    searchQuery = `${fullName}; ${city}, ${state}`;
  } else if (state) {
    searchQuery = `${fullName}; ${state}`;
  }
  
  console.log(`Apify Skip Trace: Searching by name "${searchQuery}"`);
  return runSkipTraceActor({ name: [searchQuery], max_results: 1 });
}

/**
 * Search by street address with city/state/zip
 */
export async function searchByAddress(
  streetAddress: string,
  city: string,
  state: string,
  zip?: string
): Promise<SkipTraceResult[]> {
  const cityStateZip = zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`;
  const searchQuery = `${streetAddress}; ${cityStateZip}`;
  
  console.log(`Apify Skip Trace: Searching by address "${searchQuery}"`);
  return runSkipTraceActor({ street_citystatezip: [searchQuery], max_results: 1 });
}

/**
 * Search by phone number to find the person
 */
export async function searchByPhone(phoneNumber: string): Promise<SkipTraceResult[]> {
  console.log(`Apify Skip Trace: Searching by phone "${phoneNumber}"`);
  return runSkipTraceActor({ phone_number: [phoneNumber], max_results: 1 });
}

/**
 * Extract the last name from a full name string
 * Handles formats like "NANCY E ROMAN", "Nancy Roman", "John Smith Jr"
 */
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "";
  
  // Common suffixes to skip
  const suffixes = ["JR", "SR", "II", "III", "IV", "ESQ", "MD", "PHD"];
  
  // Work backwards to find the last non-suffix word
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].toUpperCase().replace(/[.,]/g, "");
    if (!suffixes.includes(part)) {
      return part;
    }
  }
  
  return parts[parts.length - 1].toUpperCase();
}

/**
 * Normalize a name for comparison (uppercase, remove punctuation)
 */
function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Split a name into parts by common delimiters (hyphen, space)
 * Used for handling compound/hyphenated names like "Smith-Jones"
 */
function splitNameParts(name: string): string[] {
  return name.split(/[-\s]+/).filter(part => part.length > 0);
}

/**
 * Check if two last names are similar enough to be a match
 * Uses strict matching with Levenshtein distance for typo tolerance
 */
function lastNamesMatch(expected: string, actual: string): boolean {
  // First check with original names (preserving delimiters for compound name handling)
  const expectedParts = splitNameParts(expected.toUpperCase());
  const actualParts = splitNameParts(actual.toUpperCase());
  
  // Handle compound/hyphenated names: if either has multiple parts,
  // check if any part of one matches any part of the other
  if (expectedParts.length > 1 || actualParts.length > 1) {
    for (const expPart of expectedParts) {
      for (const actPart of actualParts) {
        if (expPart.length >= 3 && actPart.length >= 3) {
          // Use strict comparison for compound name parts
          if (expPart === actPart) {
            return true;
          }
          // Allow 1 typo for longer compound parts (5+ chars)
          if (expPart.length >= 5 && actPart.length >= 5) {
            const distance = levenshteinDistance(expPart, actPart);
            if (distance <= 1) {
              return true;
            }
          }
        }
      }
    }
  }
  
  // For simple names, use normalized comparison
  const normalizedExpected = normalizeName(expected);
  const normalizedActual = normalizeName(actual);
  
  // Reject if either name is too short (< 3 chars) - these are likely abbreviations
  if (normalizedExpected.length < 3 || normalizedActual.length < 3) {
    // For very short names, require exact match
    return normalizedExpected === normalizedActual;
  }
  
  // Exact match
  if (normalizedExpected === normalizedActual) return true;
  
  // Names must be similar in length (within 2 chars) to be considered the same person
  const lengthDiff = Math.abs(normalizedExpected.length - normalizedActual.length);
  if (lengthDiff > 2) {
    return false;
  }
  
  // Use Levenshtein distance for typo tolerance
  const distance = levenshteinDistance(normalizedExpected, normalizedActual);
  const maxLen = Math.max(normalizedExpected.length, normalizedActual.length);
  
  // Allow edit distance of 1 for names 4-6 chars, 2 for 7+ chars
  // But never more than 20% of the name length (stricter than before)
  const maxAllowedDistance = Math.min(
    maxLen >= 7 ? 2 : 1,
    Math.floor(maxLen * 0.2)
  );
  
  return distance <= maxAllowedDistance;
}

/**
 * Validate that a skip trace result matches the expected person
 */
function validateResult(
  result: SkipTraceResult,
  expectedLastName: string,
  expectedState?: string
): { valid: boolean; reason?: string } {
  // Check last name match
  if (result.lastName) {
    if (!lastNamesMatch(expectedLastName, result.lastName)) {
      return {
        valid: false,
        reason: `Last name mismatch: expected "${expectedLastName}", got "${result.lastName}"`
      };
    }
  }
  
  // Check state match if we have both expected state and result address
  if (expectedState && result.currentAddress?.state) {
    const normalizedExpected = expectedState.toUpperCase().trim();
    const normalizedActual = result.currentAddress.state.toUpperCase().trim();
    
    if (normalizedExpected !== normalizedActual) {
      // Check if any previous address matches the expected state
      const hasAddressInState = result.previousAddresses.some(
        addr => addr.state?.toUpperCase().trim() === normalizedExpected
      );
      
      if (!hasAddressInState) {
        return {
          valid: false,
          reason: `State mismatch: expected "${expectedState}", got "${result.currentAddress.state}" (no address history in expected state)`
        };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Combined search: tries address first, then name if no results
 */
export async function skipTraceIndividual(
  fullName: string,
  streetAddress?: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<SkipTraceResult | null> {
  let results: SkipTraceResult[] = [];
  const expectedLastName = extractLastName(fullName);
  
  console.log(`Apify Skip Trace: Searching for "${fullName}" (expected last name: "${expectedLastName}")`);
  
  // Try address search first if we have full address
  if (streetAddress && city && state) {
    results = await searchByAddress(streetAddress, city, state, zip);
    if (results.length > 0 && results[0].phones.length > 0) {
      // Address search results are trusted since they're based on property records
      console.log(`Apify Skip Trace: Found ${results[0].phones.length} phones via address search`);
      return results[0];
    }
  }
  
  // Fall back to name search - but validate results carefully
  if (fullName) {
    results = await searchByName(fullName, city, state);
    if (results.length > 0) {
      const result = results[0];
      
      // Validate the result matches our expected person
      const validation = validateResult(result, expectedLastName, state);
      
      if (!validation.valid) {
        console.log(`Apify Skip Trace: Rejecting name search result - ${validation.reason}`);
        console.log(`Apify Skip Trace: Result was for "${result.firstName} ${result.lastName}" in ${result.currentAddress?.state || "unknown state"}`);
        return null;
      }
      
      console.log(`Apify Skip Trace: Found ${result.phones.length} phones via name search (validated)`);
      return result;
    }
  }
  
  console.log("Apify Skip Trace: No results found");
  return null;
}

export function isConfigured(): boolean {
  return !!APIFY_API_TOKEN;
}
