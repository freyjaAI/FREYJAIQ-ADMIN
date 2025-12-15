export interface AddressComponents {
  line1: string;
  line2?: string;
  city: string;
  county?: string;
  stateCode: string;
  postalCode?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  raw?: string;
}

export interface GooglePlaceDetails {
  description: string;
  placeId: string;
  addressComponents?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
  "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
  "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
  "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
  "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
  "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
  "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC"
};

const STATE_CODES = new Set(Object.values(STATE_ABBREVIATIONS));

const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  "street": "ST", "avenue": "AVE", "boulevard": "BLVD", "drive": "DR", "road": "RD",
  "lane": "LN", "court": "CT", "place": "PL", "circle": "CIR", "way": "WAY",
  "highway": "HWY", "parkway": "PKWY", "terrace": "TER", "trail": "TRL", "square": "SQ"
};

const DIRECTION_ABBREVIATIONS: Record<string, string> = {
  "north": "N", "south": "S", "east": "E", "west": "W",
  "northeast": "NE", "northwest": "NW", "southeast": "SE", "southwest": "SW"
};

function normalizeStateCode(state: string): string {
  const trimmed = state.trim();
  const upper = trimmed.toUpperCase();
  if (STATE_CODES.has(upper) && upper.length === 2) {
    return upper;
  }
  const abbr = STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return abbr || upper;
}

function normalizeStreetLine(line: string): string {
  let normalized = line.trim();
  
  for (const [full, abbr] of Object.entries(DIRECTION_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    normalized = normalized.replace(regex, abbr);
  }
  
  for (const [full, abbr] of Object.entries(STREET_TYPE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    normalized = normalized.replace(regex, abbr);
  }
  
  return normalized.toUpperCase();
}

export function parseFromGooglePlacesComponents(details: GooglePlaceDetails): AddressComponents | null {
  if (!details.addressComponents || details.addressComponents.length === 0) {
    return parseFromDescription(details.description);
  }

  const components = details.addressComponents;
  
  let streetNumber = '';
  let route = '';
  let subpremise = '';
  let city = '';
  let county = '';
  let state = '';
  let postalCode = '';
  let country = '';

  for (const comp of components) {
    const types = comp.types;
    
    if (types.includes('street_number')) {
      streetNumber = comp.long_name;
    } else if (types.includes('route')) {
      route = comp.long_name;
    } else if (types.includes('subpremise')) {
      subpremise = comp.long_name;
    } else if (types.includes('locality') || types.includes('sublocality')) {
      city = comp.long_name;
    } else if (types.includes('administrative_area_level_2')) {
      county = comp.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      state = comp.short_name;
    } else if (types.includes('postal_code')) {
      postalCode = comp.long_name;
    } else if (types.includes('country')) {
      country = comp.short_name;
    }
  }

  if (!city && !route) {
    return parseFromDescription(details.description);
  }

  let line1 = '';
  if (streetNumber && route) {
    line1 = `${streetNumber} ${route}`;
  } else if (route) {
    line1 = route;
  }

  return {
    line1: normalizeStreetLine(line1),
    line2: subpremise ? `#${subpremise}` : undefined,
    city: city.toUpperCase(),
    county: county || undefined,
    stateCode: normalizeStateCode(state),
    postalCode: postalCode || undefined,
    countryCode: country || 'US',
    latitude: details.geometry?.location?.lat,
    longitude: details.geometry?.location?.lng,
    raw: details.description,
  };
}

export function parseFromDescription(description: string): AddressComponents | null {
  if (!description) return null;

  let cleaned = description
    .replace(/,?\s*USA$/i, '')
    .replace(/,?\s*United States$/i, '')
    .trim();

  const parts = cleaned.split(',').map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length < 2) {
    return null;
  }

  let line1 = '';
  let city = '';
  let stateCode = '';
  let postalCode = '';

  if (parts.length === 2) {
    line1 = parts[0];
    const stateZip = parseStateAndZip(parts[1]);
    stateCode = stateZip.state;
    postalCode = stateZip.zip;
    city = '';
  } else if (parts.length === 3) {
    line1 = parts[0];
    city = parts[1];
    const stateZip = parseStateAndZip(parts[2]);
    stateCode = stateZip.state;
    postalCode = stateZip.zip;
  } else if (parts.length >= 4) {
    line1 = parts[0];
    city = parts[parts.length - 3] || parts[1];
    const stateZip = parseStateAndZip(parts[parts.length - 2] + ' ' + parts[parts.length - 1]);
    if (!stateZip.state) {
      const lastPartStateZip = parseStateAndZip(parts[parts.length - 1]);
      stateCode = lastPartStateZip.state;
      postalCode = lastPartStateZip.zip;
      if (!stateCode && parts.length >= 3) {
        const secondLastStateZip = parseStateAndZip(parts[parts.length - 2]);
        stateCode = secondLastStateZip.state;
      }
    } else {
      stateCode = stateZip.state;
      postalCode = stateZip.zip;
    }
  }

  if (!stateCode) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const potential = normalizeStateCode(parts[i].split(/\s+/)[0]);
      if (STATE_CODES.has(potential)) {
        stateCode = potential;
        if (i > 1) city = parts[i - 1];
        break;
      }
    }
  }

  return {
    line1: normalizeStreetLine(line1),
    city: city.toUpperCase(),
    stateCode: normalizeStateCode(stateCode),
    postalCode: postalCode || undefined,
    countryCode: 'US',
    raw: description,
  };
}

function parseStateAndZip(text: string): { state: string; zip: string } {
  const cleaned = text.trim();
  
  const stateZipMatch = cleaned.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)$/);
  if (stateZipMatch) {
    return { state: stateZipMatch[1].toUpperCase(), zip: stateZipMatch[2] };
  }
  
  const stateOnlyMatch = cleaned.match(/^([A-Za-z]{2})$/);
  if (stateOnlyMatch && STATE_CODES.has(stateOnlyMatch[1].toUpperCase())) {
    return { state: stateOnlyMatch[1].toUpperCase(), zip: '' };
  }
  
  const fullStateMatch = STATE_ABBREVIATIONS[cleaned.toLowerCase()];
  if (fullStateMatch) {
    return { state: fullStateMatch, zip: '' };
  }
  
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/^(\d{5}(?:-\d{4})?)$/);
    if (zipMatch) {
      const remainingParts = parts.slice(0, -1).join(' ');
      const stateAbbr = normalizeStateCode(remainingParts);
      if (STATE_CODES.has(stateAbbr)) {
        return { state: stateAbbr, zip: zipMatch[1] };
      }
    }
  }
  
  return { state: '', zip: '' };
}

export function toAttomQuery(addr: AddressComponents): string {
  const parts: string[] = [];
  
  if (addr.line1) {
    parts.push(addr.line1);
  }
  
  if (addr.city) {
    parts.push(addr.city);
  }
  
  if (addr.stateCode) {
    if (addr.postalCode) {
      parts.push(`${addr.stateCode} ${addr.postalCode}`);
    } else {
      parts.push(addr.stateCode);
    }
  }
  
  return parts.join(', ');
}

export function toAttomSplitQuery(addr: AddressComponents): { address1: string; address2: string } {
  const address1 = addr.line1 || '';
  
  const address2Parts: string[] = [];
  if (addr.city) {
    address2Parts.push(addr.city);
  }
  if (addr.stateCode) {
    address2Parts.push(addr.stateCode);
  }
  if (addr.postalCode) {
    address2Parts.push(addr.postalCode);
  }
  
  return {
    address1,
    address2: address2Parts.join(', '),
  };
}

export function toOpenCorporatesQuery(addr: AddressComponents): { city?: string; state?: string } {
  return {
    city: addr.city || undefined,
    state: addr.stateCode ? `us_${addr.stateCode.toLowerCase()}` : undefined,
  };
}

export function toDisplayString(addr: AddressComponents): string {
  const parts: string[] = [];
  
  if (addr.line1) parts.push(addr.line1);
  if (addr.line2) parts.push(addr.line2);
  if (addr.city) parts.push(addr.city);
  if (addr.stateCode) {
    if (addr.postalCode) {
      parts.push(`${addr.stateCode} ${addr.postalCode}`);
    } else {
      parts.push(addr.stateCode);
    }
  }
  
  return parts.join(', ');
}

export function normalizeAddressString(input: string): AddressComponents | null {
  return parseFromDescription(input);
}

import { parseAddress as usAddressParse, normalizeEntityName as usNormalizeEntityName } from "./providers/AddressParserProvider";
import { 
  validateAddress as uspsValidate, 
  validateFullAddress as uspsValidateFull,
  isProviderAvailable as isUSPSAvailable,
  type USPSValidatedAddress 
} from "./providers/USPSProvider";

export interface USPSEnhancedAddress extends AddressComponents {
  uspsValidated: boolean;
  zip4?: string;
  dpvConfirmation?: string;
  returnText?: string;
}

/**
 * Validate an address using USPS API and return standardized address with ZIP+4
 * Falls back to input address if USPS validation fails
 */
export async function validateWithUSPS(addr: AddressComponents): Promise<USPSEnhancedAddress> {
  const baseResult: USPSEnhancedAddress = {
    ...addr,
    uspsValidated: false,
  };

  if (!isUSPSAvailable()) {
    console.log('[AddressNormalizer] USPS not available (USPS_USER_ID not set)');
    return baseResult;
  }

  // USPS requires line1, state, and either city OR zip
  if (!addr.line1 || !addr.stateCode || (!addr.city && !addr.postalCode)) {
    console.log('[AddressNormalizer] Insufficient address components for USPS validation');
    return baseResult;
  }

  try {
    // Pass city if available, otherwise USPS can infer from ZIP
    const result = await uspsValidate(
      addr.line1,
      addr.city || '', // USPS can work with ZIP alone
      addr.stateCode,
      addr.postalCode || ''
    );

    if (result.success && result.validated) {
      const validated = result.validated;
      // Normalize USPS output to uppercase for consistency with rest of normalizer
      return {
        line1: (validated.address1 || addr.line1).toUpperCase(),
        line2: validated.address2 ? validated.address2.toUpperCase() : addr.line2,
        city: (validated.city || addr.city).toUpperCase(),
        stateCode: (validated.state || addr.stateCode).toUpperCase(),
        postalCode: validated.zipFull || validated.zip5 || addr.postalCode,
        zip4: validated.zip4,
        countryCode: 'US',
        latitude: addr.latitude,
        longitude: addr.longitude,
        raw: addr.raw,
        uspsValidated: true,
        dpvConfirmation: validated.dpvConfirmation,
        returnText: validated.returnText,
      };
    }

    console.log(`[AddressNormalizer] USPS validation failed: ${result.error || 'Unknown error'}`);
    return baseResult;
  } catch (error) {
    console.error('[AddressNormalizer] USPS validation error:', error);
    return baseResult;
  }
}

/**
 * Parse and validate a full address string using USPS
 */
export async function parseAndValidateWithUSPS(input: string): Promise<USPSEnhancedAddress | null> {
  if (!input) return null;

  // First parse the address
  const parsed = await parseAddressAsync(input);
  if (!parsed) return null;

  // Then validate with USPS
  return validateWithUSPS(parsed);
}

/**
 * Direct USPS validation from a full address string (bypasses local parsing)
 */
export async function validateFullAddressWithUSPS(fullAddress: string): Promise<USPSEnhancedAddress | null> {
  if (!fullAddress) return null;

  if (!isUSPSAvailable()) {
    console.log('[AddressNormalizer] USPS not available, falling back to local parsing');
    const parsed = await parseAddressAsync(fullAddress);
    return parsed ? { ...parsed, uspsValidated: false } : null;
  }

  try {
    const result = await uspsValidateFull(fullAddress);

    if (result.success && result.validated) {
      const validated = result.validated;
      // Normalize USPS output to uppercase for consistency with rest of normalizer
      // Add null guards for safety
      return {
        line1: (validated.address1 || '').toUpperCase(),
        line2: validated.address2 ? validated.address2.toUpperCase() : undefined,
        city: (validated.city || '').toUpperCase(),
        stateCode: (validated.state || '').toUpperCase(),
        postalCode: validated.zipFull || validated.zip5 || undefined,
        zip4: validated.zip4,
        countryCode: 'US',
        raw: fullAddress,
        uspsValidated: true,
        dpvConfirmation: validated.dpvConfirmation,
        returnText: validated.returnText,
      };
    }

    // Fall back to local parsing if USPS fails
    console.log(`[AddressNormalizer] USPS full validation failed: ${result.error}, falling back`);
    const parsed = await parseAddressAsync(fullAddress);
    return parsed ? { ...parsed, uspsValidated: false } : null;
  } catch (error) {
    console.error('[AddressNormalizer] USPS full validation error:', error);
    const parsed = await parseAddressAsync(fullAddress);
    return parsed ? { ...parsed, uspsValidated: false } : null;
  }
}

export async function parseAddressAsync(input: string): Promise<AddressComponents | null> {
  if (!input) return null;
  
  try {
    const result = await usAddressParse(input);
    
    if (result.success && result.normalized) {
      const normalized = result.normalized;
      return {
        line1: normalized.line1,
        line2: normalized.line2 || undefined,
        city: normalized.city,
        stateCode: normalizeStateCode(normalized.stateCode),
        postalCode: normalized.postalCode || undefined,
        countryCode: normalized.countryCode || 'US',
        raw: input,
      };
    }
  } catch (error) {
    console.error('[AddressNormalizer] usaddress parse failed, falling back to regex:', error);
  }
  
  return parseFromDescription(input);
}

export async function normalizeEntityNameAsync(name: string): Promise<string> {
  if (!name) return '';
  
  try {
    const result = await usNormalizeEntityName(name);
    if (result.success) {
      return result.normalized;
    }
  } catch (error) {
    console.error('[AddressNormalizer] Entity name normalization failed:', error);
  }
  
  return name;
}

export function isValidForSearch(addr: AddressComponents): boolean {
  return !!(addr.line1 && addr.stateCode);
}

export function getValidationErrors(addr: AddressComponents): string[] {
  const errors: string[] = [];
  
  if (!addr.line1) errors.push('Missing street address');
  if (!addr.stateCode) errors.push('Missing state');
  if (!STATE_CODES.has(addr.stateCode)) errors.push(`Invalid state code: ${addr.stateCode}`);
  
  return errors;
}
