import pLimit from "p-limit";
import pRetry from "p-retry";

const PACIFIC_EAST_ACCOUNT_KEY = process.env.PACIFIC_EAST_ACCOUNT_KEY || "dhn-6DAr2M7z";

const ENDPOINTS = {
  dataPrime: "https://dev-api.idicia.com/Services/NameAddress/DataPrime/1_1/dataprime.svc",
  phoneAppend: "https://dev-api.idicia.com/Services/Forward/Append/1_1/Append.svc",
  emailAppend: "https://dev-api.idicia.com/Services/Email/Append/1_3/Append.svc",
  emailValidation: "https://dev-api.idicia.com/Services/Email/Validation/1_1/emailvalidation.svc",
};

const limiter = pLimit(2);

export interface DataPrimeAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  dwellingType: string;
  isMostRecent: boolean;
  effectiveDate: string;
  deliveryScore: number;
  isCMRA: boolean;
}

export interface DataPrimeName {
  firstName: string;
  lastName: string;
  middleName: string;
  fullName: string;
  prefix: string;
  suffix: string;
}

export interface DataPrimeResult {
  status: number;
  lookupResult: number;
  addressAction: number;
  addresses: DataPrimeAddress[];
  names: DataPrimeName[];
  dob: string | null;
  knownDeceased: boolean;
  verifiedIdentity: boolean;
  referenceID: string | null;
}

export interface PhoneAppendContact {
  phoneNumber: string;
  contactType: string;
  source: string;
  startDate: string;
  transactionDate: string;
  firstName: string;
  lastName: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  matchScore: {
    firstName: number;
    lastName: number;
    overallName: number;
    streetAddress: number;
    overallAddress: number;
    location: number;
  };
  dataQualityConfidence?: number;
  isVerifiedSource?: boolean;
  monthsSinceVerified?: number;
  startAgeYears?: number;
}

export interface PhoneAppendResult {
  status: number;
  lookupResult: number;
  contactsFound: number;
  contacts: PhoneAppendContact[];
  referenceID: string | null;
}

export interface EmailAppendResult {
  status: number;
  lookupResult: number;
  emailAddress: string | null;
  matchType: string | null;
  validationStatus: string | null;
  referenceID: string | null;
}

export interface EmailValidationResult {
  status: number;
  validationStatus: number;
  deliverability: number;
  domainType: number;
  correctionCode: number;
  validatedEmail: string;
  referenceID: string | null;
}

class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

async function makeRequest<T>(url: string, retries = 3): Promise<T | null> {
  return limiter(() =>
    pRetry(
      async () => {
        console.log(`Pacific East request: ${url.replace(PACIFIC_EAST_ACCOUNT_KEY, "***")}`);
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-PacificEast-Acct": PACIFIC_EAST_ACCOUNT_KEY,
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Pacific East error ${response.status}: ${errorText}`);
          if (response.status === 403) {
            throw new AbortError("Unauthorized - check account key");
          }
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`Pacific East response status: ${data.status}, lookupResult: ${data.lookupResult}`);
        return data as T;
      },
      {
        retries,
        onFailedAttempt: (error) => {
          console.log(`Pacific East attempt ${error.attemptNumber} failed`);
        },
      }
    )
  ).catch((err) => {
    console.error("Pacific East request failed:", err?.message || err);
    return null;
  });
}

export async function searchDataPrime(params: {
  firstName?: string;
  lastName: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): Promise<DataPrimeResult | null> {
  const { firstName, lastName, address1, address2, city, state, postalCode } = params;

  const queryParams = new URLSearchParams();
  queryParams.set("accountKey", PACIFIC_EAST_ACCOUNT_KEY);
  if (firstName) queryParams.set("firstName", firstName);
  if (address1) queryParams.set("address1", address1);
  if (address2) queryParams.set("address2", address2);
  if (city) queryParams.set("city", city);
  if (state) queryParams.set("state", state);
  if (postalCode) queryParams.set("postalCode", postalCode);

  const url = `${ENDPOINTS.dataPrime}/${encodeURIComponent(lastName)}?${queryParams.toString()}`;
  return makeRequest<DataPrimeResult>(url);
}

export async function appendPhone(params: {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  queryType?: "0" | "1" | "2";
}): Promise<PhoneAppendResult | null> {
  const { firstName, lastName, businessName, address, city, state, postalCode, queryType = "0" } = params;

  const queryParams = new URLSearchParams();
  queryParams.set("purpose", "AD");
  if (firstName) queryParams.set("firstName", firstName);
  if (lastName) queryParams.set("lastName", lastName);
  if (businessName) queryParams.set("businessName", businessName);
  if (address) queryParams.set("address", address);
  if (city) queryParams.set("city", city);
  if (state) queryParams.set("state", state);
  if (postalCode) queryParams.set("postalCode", postalCode);

  const url = `${ENDPOINTS.phoneAppend}/${queryType}?${queryParams.toString()}`;
  
  const response = await makeRequest<any>(url);
  
  // Log the raw FPA response to debug data quality issues
  console.log(`FPA raw response:`, JSON.stringify(response, null, 2));
  
  if (!response || response.status !== 0) {
    return null;
  }

  const contacts: PhoneAppendContact[] = [];
  
  if (response.contacts && Array.isArray(response.contacts)) {
    for (const contact of response.contacts) {
      const phoneInfo = contact.phoneInformation || {};
      const nameInfo = contact.nameInformation || {};
      const addressInfo = contact.addressInformation || {};
      const matchInfo = response.matchInfo?.[0] || {};
      
      // Log each contact's actual data including source and dates
      console.log(`FPA contact raw data: phone=${phoneInfo.phoneNumber}, name=${nameInfo.firstName} ${nameInfo.lastName}, addr=${addressInfo.address}, ${addressInfo.city}, ${addressInfo.state}, source=${phoneInfo.source}, startDate=${phoneInfo.startDate}`);
      
      // Check data quality based on source and recency
      const isVerifiedSource = phoneInfo.source === "DA"; // Directory Assistance is verified
      const transactionDate = phoneInfo.transactionDate; // When Pacific East last verified this
      const startDate = phoneInfo.startDate; // When association first recorded
      
      // Calculate how recently this was verified (using transactionDate)
      let monthsSinceVerified = 999;
      if (transactionDate && transactionDate.length === 8) {
        const txYear = parseInt(transactionDate.substring(0, 4));
        const txMonth = parseInt(transactionDate.substring(4, 6));
        const now = new Date();
        monthsSinceVerified = (now.getFullYear() - txYear) * 12 + (now.getMonth() + 1 - txMonth);
      }
      
      // Calculate how old the original association is
      let startAgeYears = 0;
      if (startDate && startDate.length === 8) {
        const year = parseInt(startDate.substring(0, 4));
        startAgeYears = new Date().getFullYear() - year;
      }
      
      console.log(`FPA contact data quality: source=${phoneInfo.source} (verified=${isVerifiedSource}), startAge=${startAgeYears}y, verifiedMonthsAgo=${monthsSinceVerified}`);
      
      // Assign confidence based on data quality
      // - Recent verification (< 6 months) = higher confidence
      // - DA source = higher confidence  
      // - Old start date but recent verification = medium confidence (may have transferred)
      let dataQualityConfidence = 70;
      if (isVerifiedSource) {
        dataQualityConfidence = 90;
      } else if (monthsSinceVerified <= 6) {
        dataQualityConfidence = 80; // Recently verified
      } else if (monthsSinceVerified <= 12) {
        dataQualityConfidence = 70;
      } else {
        dataQualityConfidence = 50; // Stale verification
      }
      
      // Reject if verification is too old (over 24 months)
      if (monthsSinceVerified > 24) {
        console.log(`FPA rejecting ${phoneInfo.phoneNumber}: last verified ${monthsSinceVerified} months ago (too stale)`);
        continue;
      }

      contacts.push({
        phoneNumber: phoneInfo.phoneNumber || "",
        contactType: phoneInfo.contactType || "",
        source: phoneInfo.source || "",
        startDate: phoneInfo.startDate || "",
        transactionDate: phoneInfo.transactionDate || "",
        firstName: nameInfo.firstName || "",
        lastName: nameInfo.lastName || "",
        businessName: nameInfo.businessName || "",
        address: addressInfo.address || "",
        city: addressInfo.city || "",
        state: addressInfo.state || "",
        postalCode: addressInfo.postalCode || "",
        latitude: addressInfo.latitude || "",
        longitude: addressInfo.longitude || "",
        matchScore: {
          firstName: matchInfo.firstName ?? -1,
          lastName: matchInfo.lastName ?? -1,
          overallName: matchInfo.overallName ?? -1,
          streetAddress: matchInfo.streetAddress ?? -1,
          overallAddress: matchInfo.overallAddress ?? -1,
          location: matchInfo.location ?? -1,
        },
        dataQualityConfidence,
        isVerifiedSource,
        monthsSinceVerified,
        startAgeYears,
      });
    }
  }

  return {
    status: response.status,
    lookupResult: response.lookupResult,
    contactsFound: response.contactsFound || 0,
    contacts,
    referenceID: response.referenceID,
  };
}

export async function appendEmail(params: {
  firstName?: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  queryType?: "individual" | "household";
}): Promise<EmailAppendResult | null> {
  const { firstName, lastName, address, city, state, postalCode, queryType = "individual" } = params;

  const queryParams = new URLSearchParams();
  queryParams.set("accountKey", PACIFIC_EAST_ACCOUNT_KEY);
  queryParams.set("purpose", "AD");
  queryParams.set("lastName", lastName);
  if (firstName) queryParams.set("firstName", firstName);
  if (address) queryParams.set("address", address);
  if (city) queryParams.set("city", city);
  if (state) queryParams.set("state", state);
  if (postalCode) queryParams.set("postalCode", postalCode);

  const url = `${ENDPOINTS.emailAppend}/REST/${queryType}?${queryParams.toString()}`;
  return makeRequest<EmailAppendResult>(url);
}

export async function validateEmail(email: string): Promise<EmailValidationResult | null> {
  const queryParams = new URLSearchParams();
  queryParams.set("purpose", "AD");

  const encodedEmail = encodeURIComponent(email);
  const url = `${ENDPOINTS.emailValidation}/${encodedEmail}?${queryParams.toString()}`;
  return makeRequest<EmailValidationResult>(url);
}

export interface EnrichedContactData {
  phones: Array<{
    number: string;
    type: string;
    source: string;
    confidence: number;
    matchScore: number;
    residentName?: string;
  }>;
  emails: Array<{
    address: string;
    validated: boolean;
    deliverability: string;
    matchType: string;
    confidence: number;
  }>;
  addresses: Array<{
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    isCurrent: boolean;
    verifiedDeliverable: boolean;
    dwellingType: string;
  }>;
  identity: {
    firstName: string;
    lastName: string;
    middleName: string;
    dob: string | null;
    isDeceased: boolean;
    verified: boolean;
  } | null;
}

export async function enrichContactFull(params: {
  firstName?: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<EnrichedContactData> {
  const { firstName, lastName, address, city, state, zip } = params;
  
  console.log(`Pacific East enrichContactFull: ${firstName} ${lastName} at ${address}, ${city}, ${state} ${zip}`);

  const result: EnrichedContactData = {
    phones: [],
    emails: [],
    addresses: [],
    identity: null,
  };

  // STRATEGY: Address-first search to find ALL residents at the property
  // This handles name typos/misspellings from ATTOM data
  
  // Step 1: Search by address only (no name filter) to get all residents
  // queryType: 0=all, 1=landline, 2=cell/mobile
  console.log(`Pacific East: Searching by address only for CELL phones at ${address}, ${city}, ${state} ${zip}`);
  
  const addressOnlyPhoneResult = await appendPhone({
    address: address,
    city: city,
    state: state,
    postalCode: zip,
    queryType: "2", // Cell/mobile phones only
  });
  
  // Step 2: Also try with name for email (email API requires lastName)
  const emailResult = await appendEmail({
    firstName: firstName,
    lastName: lastName,
    address: address,
    city: city,
    state: state,
    postalCode: zip,
    queryType: "household", // Get household emails
  });
  
  // Use address-only results as primary phone source
  const phoneResult = addressOnlyPhoneResult;
  
  if (phoneResult && phoneResult.contactsFound > 0) {
    console.log(`Pacific East address-only search found ${phoneResult.contactsFound} residents at this address`);
  } else {
    console.log(`Pacific East address-only search: no results found`);
  }

  // Process phone results - for address-only search, we accept all contacts at the address
  if (phoneResult && phoneResult.status === 0 && phoneResult.lookupResult === 1) {
    console.log(`Phone Append found ${phoneResult.contactsFound} contacts at address`);
    
    for (const contact of phoneResult.contacts) {
      if (contact.phoneNumber) {
        const locationScore = contact.matchScore.location;
        const addressScore = contact.matchScore.overallAddress;
        
        const dataQuality = contact.dataQualityConfidence || 70;
        const verifiedMonths = contact.monthsSinceVerified || 999;
        const startAge = contact.startAgeYears || 0;
        
        // For address-only search, we care about address/location match, not name match
        console.log(`FPA contact ${contact.phoneNumber} (${contact.firstName} ${contact.lastName}): locationScore=${locationScore}, addressScore=${addressScore}, dataQuality=${dataQuality}, verifiedMonths=${verifiedMonths}, startAge=${startAge}y`);
        
        // Only require good address/location match (not name match since we searched by address)
        const hasAcceptableLocationMatch = locationScore === -1 || locationScore >= 2;
        const hasAcceptableAddressMatch = addressScore === -1 || addressScore >= 2;
        
        if (!hasAcceptableLocationMatch && !hasAcceptableAddressMatch) {
          console.log(`FPA rejecting ${contact.phoneNumber}: poor location/address match (loc=${locationScore}, addr=${addressScore})`);
          continue;
        }
        
        // Calculate confidence based on address match quality and data quality
        const addressMatchQuality = (locationScore >= 8 || addressScore >= 8) ? 85 : 75;
        
        // Final confidence is the MINIMUM of match quality and data quality
        const finalConfidence = Math.min(addressMatchQuality, dataQuality);
        
        console.log(`FPA accepting ${contact.phoneNumber} (${contact.firstName} ${contact.lastName}): addressQuality=${addressMatchQuality}, dataQuality=${dataQuality}, finalConfidence=${finalConfidence}`);
        
        // Add address info to result for display
        result.addresses.push({
          address1: contact.address,
          address2: "",
          city: contact.city,
          state: contact.state,
          zip: contact.postalCode,
          isCurrent: true,
          verifiedDeliverable: true,
          dwellingType: "unknown",
        });
        
        result.phones.push({
          number: contact.phoneNumber,
          type: contact.contactType === "R" ? "residential" : contact.contactType === "B" ? "business" : "unknown",
          source: contact.source || "pacific_east",
          confidence: finalConfidence,
          matchScore: addressScore,
          residentName: `${contact.firstName} ${contact.lastName}`.trim() || undefined,
        });
      }
    }
  }

  if (emailResult && emailResult.status === 0 && emailResult.lookupResult === 1 && emailResult.emailAddress) {
    console.log(`Email Append found: ${emailResult.emailAddress} (${emailResult.validationStatus})`);
    
    const isValidated = emailResult.validationStatus === "Validated";
    
    let validatedResult: EmailValidationResult | null = null;
    if (isValidated || emailResult.validationStatus === "Unknown") {
      validatedResult = await validateEmail(emailResult.emailAddress);
    }

    const deliverability = validatedResult?.deliverability === 50 
      ? "deliverable" 
      : validatedResult?.deliverability === 40 
        ? "valid" 
        : validatedResult?.deliverability === 30 
          ? "risky" 
          : "unknown";

    result.emails.push({
      address: emailResult.emailAddress,
      validated: isValidated || validatedResult?.validationStatus === 1,
      deliverability,
      matchType: emailResult.matchType || "unknown",
      confidence: isValidated ? 90 : emailResult.matchType === "Individual" ? 80 : 70,
    });
  }

  console.log(`Pacific East enrichment complete: ${result.phones.length} phones, ${result.emails.length} emails, ${result.addresses.length} addresses`);
  
  return result;
}

export async function enrichBusinessContact(params: {
  businessName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<EnrichedContactData> {
  const { businessName, address, city, state, zip } = params;
  
  console.log(`Pacific East enrichBusinessContact: ${businessName} at ${address}, ${city}, ${state} ${zip}`);

  const result: EnrichedContactData = {
    phones: [],
    emails: [],
    addresses: [],
    identity: null,
  };

  const phoneResult = await appendPhone({
    businessName,
    address,
    city,
    state,
    postalCode: zip,
  });

  if (phoneResult && phoneResult.status === 0 && phoneResult.lookupResult === 1) {
    console.log(`Business Phone Append found ${phoneResult.contactsFound} contacts`);
    
    for (const contact of phoneResult.contacts) {
      if (contact.phoneNumber) {
        result.phones.push({
          number: contact.phoneNumber,
          type: "business",
          source: contact.source || "pacific_east",
          confidence: 85,
          matchScore: contact.matchScore.overallName,
        });
      }
    }
  }

  return result;
}
