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
  
  // Try address search first if we have full address
  if (streetAddress && city && state) {
    results = await searchByAddress(streetAddress, city, state, zip);
    if (results.length > 0 && results[0].phones.length > 0) {
      console.log(`Apify Skip Trace: Found ${results[0].phones.length} phones via address search`);
      return results[0];
    }
  }
  
  // Fall back to name search
  if (fullName) {
    results = await searchByName(fullName, city, state);
    if (results.length > 0) {
      console.log(`Apify Skip Trace: Found ${results[0].phones.length} phones via name search`);
      return results[0];
    }
  }
  
  console.log("Apify Skip Trace: No results found");
  return null;
}

export function isConfigured(): boolean {
  return !!APIFY_API_TOKEN;
}
