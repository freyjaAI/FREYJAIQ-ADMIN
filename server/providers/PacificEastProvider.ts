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
      
      // Check data quality based on source
      const isVerifiedSource = phoneInfo.source === "DA"; // Directory Assistance is the only verified source
      const startDate = phoneInfo.startDate;
      
      // Calculate how old this association is
      let dataAgeYears = 0;
      if (startDate && startDate.length === 8) {
        const year = parseInt(startDate.substring(0, 4));
        const currentYear = new Date().getFullYear();
        dataAgeYears = currentYear - year;
      }
      
      console.log(`FPA contact data quality: source=${phoneInfo.source} (verified=${isVerifiedSource}), dataAgeYears=${dataAgeYears}`);
      
      // Reject data that is too old (over 5 years) or from unverified sources with old data
      if (!isVerifiedSource && dataAgeYears > 3) {
        console.log(`FPA rejecting ${phoneInfo.phoneNumber}: unverified source (${phoneInfo.source}) with old data (${dataAgeYears} years old)`);
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

  const [dataPrimeResult, phoneResult, emailResult] = await Promise.all([
    searchDataPrime({
      firstName,
      lastName,
      address1: address,
      city,
      state,
      postalCode: zip,
    }),
    appendPhone({
      firstName,
      lastName,
      address,
      city,
      state,
      postalCode: zip,
    }),
    appendEmail({
      firstName,
      lastName,
      address,
      city,
      state,
      postalCode: zip,
      queryType: "individual",
    }),
  ]);

  if (dataPrimeResult && dataPrimeResult.status === 0 && dataPrimeResult.lookupResult === 1) {
    console.log(`DataPrime found ${dataPrimeResult.addresses?.length || 0} addresses, ${dataPrimeResult.names?.length || 0} names`);
    
    for (const addr of dataPrimeResult.addresses || []) {
      result.addresses.push({
        address1: addr.address1,
        address2: addr.address2,
        city: addr.city,
        state: addr.state,
        zip: addr.postalCode,
        isCurrent: addr.isMostRecent,
        verifiedDeliverable: addr.deliveryScore <= 3,
        dwellingType: addr.dwellingType,
      });
    }

    const primaryName = dataPrimeResult.names?.[0];
    if (primaryName) {
      result.identity = {
        firstName: primaryName.firstName,
        lastName: primaryName.lastName,
        middleName: primaryName.middleName,
        dob: dataPrimeResult.dob,
        isDeceased: dataPrimeResult.knownDeceased,
        verified: dataPrimeResult.verifiedIdentity,
      };
    }
  }

  if (phoneResult && phoneResult.status === 0 && phoneResult.lookupResult === 1) {
    console.log(`Phone Append found ${phoneResult.contactsFound} contacts`);
    
    for (const contact of phoneResult.contacts) {
      if (contact.phoneNumber) {
        const nameScore = contact.matchScore.overallName;
        const locationScore = contact.matchScore.location;
        const addressScore = contact.matchScore.overallAddress;
        
        console.log(`FPA contact ${contact.phoneNumber}: nameScore=${nameScore}, locationScore=${locationScore}, addressScore=${addressScore}, name=${contact.firstName} ${contact.lastName}, addr=${contact.address}, ${contact.city}, ${contact.state}`);
        
        // Filter out poor matches:
        // - Require at least a low name match (score >= 2)
        // - Require location to match if it was compared (score >= 2 or -1 for not compared)
        // Score values: -1=not compared, 0=none, 2=low, 8=high, 10=exact
        const hasAcceptableNameMatch = nameScore >= 2;
        const hasAcceptableLocationMatch = locationScore === -1 || locationScore >= 2;
        const hasAcceptableAddressMatch = addressScore === -1 || addressScore >= 2;
        
        if (!hasAcceptableNameMatch) {
          console.log(`FPA rejecting ${contact.phoneNumber}: poor name match (${nameScore})`);
          continue;
        }
        
        if (!hasAcceptableLocationMatch && !hasAcceptableAddressMatch) {
          console.log(`FPA rejecting ${contact.phoneNumber}: poor location/address match (loc=${locationScore}, addr=${addressScore})`);
          continue;
        }
        
        const matchQuality = nameScore >= 8 && (locationScore >= 8 || addressScore >= 8)
          ? 90 
          : nameScore >= 8 
            ? 80
            : nameScore >= 2 
              ? 70 
              : 60;
        
        console.log(`FPA accepting ${contact.phoneNumber} with confidence ${matchQuality}`);
        
        result.phones.push({
          number: contact.phoneNumber,
          type: contact.contactType === "R" ? "residential" : contact.contactType === "B" ? "business" : "unknown",
          source: contact.source || "pacific_east",
          confidence: matchQuality,
          matchScore: nameScore,
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
