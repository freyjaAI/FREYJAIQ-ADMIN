/**
 * RealEstateAPI Skip Engine Provider
 * https://docs.realestateapi.com/
 * 
 * Provides property skip tracing for contact information (phones, emails, demographics).
 * Uses the Skip Engine API which offers:
 * - Property-based skip tracing (address lookup)
 * - Bulk property processing (up to 1,000 at once)
 * - Owner contact information with validation
 * 
 * API Key required: Set REALESTATE_API_KEY environment variable
 */

const REALESTATE_API_KEY = process.env.REALESTATE_API_KEY;
const SKIP_ENGINE_BASE_URL = "https://api.skipengine.com/v1";

export interface SkipEnginePhone {
  phone_number: string;
  phone_type: "mobile" | "landline" | "voip" | string;
  carrier?: string;
  line_type?: string;
  is_primary?: boolean;
}

export interface SkipEngineEmail {
  email_address: string;
  email_type?: "personal" | "business" | string;
  is_verified?: boolean;
}

export interface SkipEngineOwner {
  first_name: string;
  last_name: string;
  full_name: string;
  age?: number;
  date_of_birth?: string;
}

export interface SkipEngineAddress {
  address1: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
}

export interface SkipEngineResult {
  key?: string;
  success: boolean;
  owner?: SkipEngineOwner;
  current_address?: SkipEngineAddress;
  mailing_address?: SkipEngineAddress;
  phones: SkipEnginePhone[];
  emails: SkipEngineEmail[];
  previous_addresses?: SkipEngineAddress[];
  property_type?: string;
  equity_percent?: number;
  estimated_value?: number;
  error_message?: string;
}

export interface SkipEngineRequest {
  Key?: string;
  Address1: string;
  City: string;
  State: string;
  Zip?: string;
  FirstName?: string;
  LastName?: string;
}

export interface BulkSkipTraceResult {
  success: boolean;
  results: SkipEngineResult[];
  total_processed: number;
  total_found: number;
  errors?: string[];
}

async function makeRequest<T>(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: object
): Promise<T | null> {
  if (!REALESTATE_API_KEY) {
    console.log("[RealEstateAPI] No API key configured");
    return null;
  }

  try {
    const url = `${SKIP_ENGINE_BASE_URL}${endpoint}`;
    console.log(`[RealEstateAPI] ${method} ${endpoint}`);

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": REALESTATE_API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RealEstateAPI] Error ${response.status}: ${errorText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[RealEstateAPI] Request failed:", error);
    return null;
  }
}

/**
 * Skip trace a single property by address
 */
export async function skipTraceByAddress(
  address: string,
  city: string,
  state: string,
  zip?: string,
  trackingKey?: string
): Promise<SkipEngineResult | null> {
  console.log(`[RealEstateAPI] Skip tracing: ${address}, ${city}, ${state}`);

  const request: SkipEngineRequest = {
    Key: trackingKey,
    Address1: address,
    City: city,
    State: state,
    Zip: zip,
  };

  const result = await makeRequest<SkipEngineResult>("/property", "POST", request);

  if (result) {
    console.log(`[RealEstateAPI] Found ${result.phones?.length || 0} phones, ${result.emails?.length || 0} emails`);
  }

  return result;
}

/**
 * Bulk skip trace multiple properties (up to 1,000 at once)
 * More cost-effective for large batches
 */
export async function bulkSkipTrace(
  properties: Array<{
    address: string;
    city: string;
    state: string;
    zip?: string;
    key?: string;
  }>
): Promise<BulkSkipTraceResult> {
  console.log(`[RealEstateAPI] Bulk skip tracing ${properties.length} properties`);

  if (properties.length > 1000) {
    console.warn("[RealEstateAPI] Limiting to 1000 properties per batch");
    properties = properties.slice(0, 1000);
  }

  const requests: SkipEngineRequest[] = properties.map((p, index) => ({
    Key: p.key || `prop-${index}`,
    Address1: p.address,
    City: p.city,
    State: p.state,
    Zip: p.zip,
  }));

  const results = await makeRequest<SkipEngineResult[]>("/property/bulk", "POST", { properties: requests });

  if (!results || !Array.isArray(results)) {
    return {
      success: false,
      results: [],
      total_processed: 0,
      total_found: 0,
      errors: ["Bulk request failed"],
    };
  }

  const found = results.filter(r => r.success && (r.phones?.length > 0 || r.emails?.length > 0)).length;

  console.log(`[RealEstateAPI] Bulk complete: ${found}/${results.length} found`);

  return {
    success: true,
    results,
    total_processed: results.length,
    total_found: found,
  };
}

/**
 * Convert RealEstateAPI result to our standard SkipTraceResult format
 * for compatibility with existing code
 */
export function toStandardSkipTraceResult(result: SkipEngineResult): {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phones: Array<{ number: string; type: string }>;
  emails: Array<{ email: string }>;
  currentAddress?: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  };
} | null {
  if (!result.success) return null;

  return {
    firstName: result.owner?.first_name,
    lastName: result.owner?.last_name,
    fullName: result.owner?.full_name,
    phones: (result.phones || []).map(p => ({
      number: p.phone_number,
      type: p.phone_type || "Unknown",
    })),
    emails: (result.emails || []).map(e => ({
      email: e.email_address,
    })),
    currentAddress: result.current_address ? {
      streetAddress: result.current_address.address1,
      city: result.current_address.city,
      state: result.current_address.state,
      postalCode: result.current_address.zip,
    } : undefined,
  };
}

/**
 * Check if the provider is configured and available
 */
export function isConfigured(): boolean {
  return !!REALESTATE_API_KEY;
}

/**
 * Get provider status for health checks
 */
export function getStatus(): {
  configured: boolean;
  provider: string;
  capabilities: string[];
} {
  return {
    configured: isConfigured(),
    provider: "RealEstateAPI Skip Engine",
    capabilities: [
      "single_property_skip_trace",
      "bulk_skip_trace",
      "phone_verification",
      "email_validation",
    ],
  };
}
