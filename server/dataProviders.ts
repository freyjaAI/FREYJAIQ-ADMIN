import pLimit from "p-limit";
import pRetry from "p-retry";
import * as PacificEast from "./providers/PacificEastProvider";
import * as Perplexity from "./providers/PerplexityProvider";
import { parseFromDescription, toAttomQuery, toAttomSplitQuery, isValidForSearch, AddressComponents } from "./addressNormalizer";
import { apiUsageTracker, withUsageTracking } from "./apiUsageTracker";

const limit = pLimit(3);

interface AttomPropertyData {
  attomId: string;
  address: {
    line1: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  };
  parcel: {
    apn: string;
    fips: string;
  };
  ownership: {
    ownerName: string;
    ownerType: string;
    mailingAddress?: string;
  };
  assessment: {
    assessedValue: number;
    marketValue: number;
    taxAmount: number;
    taxYear: number;
  };
  building: {
    yearBuilt: number;
    sqft: number;
    bedrooms: number;
    bathrooms: number;
    propertyType: string;
  };
  sales: Array<{
    saleDate: string;
    saleAmount: number;
    saleType: string;
  }>;
  avm?: {
    value: number;
    confidence: number;
  };
}

interface OpenCorporatesCompany {
  companyNumber: string;
  name: string;
  jurisdictionCode: string;
  incorporationDate: string;
  companyType: string;
  currentStatus: string;
  registeredAddress?: string;
  agentName?: string;
  agentAddress?: string;
  principalAddress?: string;
  opencorporatesUrl?: string;
  status?: string;
  entityType?: string;
  /** Branch relationship - links foreign registrations to their parent company */
  branch?: {
    parentCompanyNumber: string;
    parentJurisdictionCode: string;
    parentName: string;
    parentOpencorporatesUrl: string;
  };
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
    address?: string;
  }>;
  filings: Array<{
    title: string;
    date: string;
    url?: string;
  }>;
}

interface DataAxleContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  confidenceScore: number;
}

interface MelissaAddressResult {
  verified: boolean;
  standardizedAddress: {
    line1: string;
    city: string;
    state: string;
    zip: string;
    plus4: string;
    county: string;
  };
  deliverability: string;
  resultCodes: string[];
}

interface ALeadsContact {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  title?: string;
  linkedinUrl?: string;
  source: string;
  confidence: number;
}

interface GoogleAddressValidationResult {
  isValid: boolean;
  formattedAddress: string;
  addressComponents: {
    streetNumber?: string;
    route?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  geocode?: {
    lat: number;
    lng: number;
  };
  verdict: {
    inputGranularity: string;
    validationGranularity: string;
    geocodeGranularity: string;
    addressComplete: boolean;
    hasUnconfirmedComponents: boolean;
    hasInferredComponents: boolean;
    hasReplacedComponents: boolean;
  };
}

export interface ContactEnrichmentResult {
  companyEmails: Array<{
    email: string;
    type: "general" | "personal" | "department";
    confidence: number;
  }>;
  directDials: Array<{
    phone: string;
    type: "mobile" | "direct" | "office";
    name?: string;
    title?: string;
    confidence: number;
  }>;
  employeeProfiles: Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    confidence: number;
  }>;
  sources: string[];
  lastUpdated: string;
}

export interface MelissaEnrichmentResult {
  nameMatch: {
    verified: boolean;
    standardizedName: {
      first: string;
      last: string;
      full: string;
    };
    confidence: number;
  } | null;
  addressMatch: {
    verified: boolean;
    standardizedAddress: {
      line1: string;
      city: string;
      state: string;
      zip: string;
      plus4: string;
      county: string;
    };
    deliverability: string;
    residenceType: "single-family" | "multi-family" | "commercial" | "unknown";
    confidence: number;
  } | null;
  phoneMatches: Array<{
    phone: string;
    type: "mobile" | "landline" | "voip";
    lineType: string;
    carrier?: string;
    verified: boolean;
    confidence: number;
  }>;
  occupancy: {
    currentOccupant: boolean;
    lengthOfResidence?: number;
    moveDate?: string;
    ownerOccupied: boolean;
  } | null;
  moveHistory: Array<{
    address: string;
    moveInDate?: string;
    moveOutDate?: string;
    type: "previous" | "current";
  }>;
  demographics: {
    ageRange?: string;
    gender?: string;
    homeownerStatus?: string;
  } | null;
  lastUpdated: string;
}

export interface LlcUnmaskingResult {
  companyNumber: string;
  name: string;
  jurisdictionCode: string;
  incorporationDate: string | null;
  companyType: string | null;
  currentStatus: string;
  registeredAddress: string | null;
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
    address?: string;
    role: "officer" | "agent" | "member" | "manager";
    confidenceScore: number;
  }>;
  registeredAgent: {
    name: string;
    address?: string;
  } | null;
  filings: Array<{
    title: string;
    date: string;
    url?: string;
  }>;
  lastUpdated: string;
  isPrivacyProtected?: boolean;
  aiInferredOwners?: Array<{
    name: string;
    role: string;
    confidence: "high" | "medium" | "low";
    sources: string[];
    reasoning: string;
  }>;
  aiRelatedEntities?: string[];
  aiCitations?: string[];
}

export class AttomDataProvider {
  private apiKey: string;
  private baseUrl = "https://api.gateway.attomdata.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return limit(() =>
      pRetry(
        async () => {
          const response = await fetch(url.toString(), {
            headers: {
              Accept: "application/json",
              apikey: this.apiKey,
            },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error("Rate limited");
            }
            if (response.status === 400) {
              const errorBody = await response.text();
              try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.status?.msg === "SuccessWithoutResult") {
                  console.log("ATTOM: Property not found in database (SuccessWithoutResult)");
                  return { property: [] };
                }
              } catch (e) {
              }
              console.error(`ATTOM API error response: ${response.status} - ${errorBody}`);
              throw new Error(`ATTOM API error: ${response.status} - ${errorBody}`);
            }
            const errorBody = await response.text();
            console.error(`ATTOM API error response: ${response.status} - ${errorBody}`);
            throw new Error(`ATTOM API error: ${response.status} - ${errorBody}`);
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  async searchByAddress(address: string): Promise<AttomPropertyData | null> {
    try {
      const parsed = parseFromDescription(address);
      let params: Record<string, string>;
      
      if (parsed && isValidForSearch(parsed)) {
        const split = toAttomSplitQuery(parsed);
        params = {
          address1: split.address1,
          address2: split.address2,
        };
        console.log(`ATTOM using split format: address1="${split.address1}", address2="${split.address2}"`);
      } else {
        params = { address };
        console.log(`ATTOM using single address format: "${address}"`);
      }
      
      const data = await this.request<any>("/propertyapi/v1.0.0/property/basicprofile", params);

      if (!data.property?.[0]) return null;

      const prop = data.property[0];
      return {
        attomId: prop.identifier?.attomId?.toString() || "",
        address: {
          line1: prop.address?.line1 || "",
          city: prop.address?.locality || "",
          state: prop.address?.countrySubd || "",
          zip: prop.address?.postal1 || "",
          county: prop.area?.countyName || "",
        },
        parcel: {
          apn: prop.identifier?.apn || "",
          fips: prop.identifier?.fips || "",
        },
        ownership: {
          ownerName: prop.assessment?.owner?.owner1?.fullName || "",
          ownerType: prop.assessment?.owner?.corporateIndicator === "Y" ? "entity" : "individual",
          mailingAddress: prop.assessment?.owner?.mailingAddress?.line1,
        },
        assessment: {
          assessedValue: prop.assessment?.assessed?.assdTtlValue || 0,
          marketValue: prop.assessment?.market?.mktTtlValue || 0,
          taxAmount: prop.assessment?.tax?.taxAmt || 0,
          taxYear: prop.assessment?.tax?.taxYear || 0,
        },
        building: {
          yearBuilt: prop.building?.summary?.yearBuilt || 0,
          sqft: prop.building?.size?.universalSize || 0,
          bedrooms: prop.building?.rooms?.beds || 0,
          bathrooms: prop.building?.rooms?.bathsTotal || 0,
          propertyType: prop.summary?.propertyType || "",
        },
        sales: [],
        avm: prop.avm ? {
          value: prop.avm.amount?.value || 0,
          confidence: prop.avm.amount?.scr || 0,
        } : undefined,
      };
    } catch (error) {
      console.error("ATTOM search error:", error);
      return null;
    }
  }

  async searchByApn(apn: string, fips: string): Promise<AttomPropertyData | null> {
    try {
      const data = await this.request<any>("/propertyapi/v1.0.0/property/basicprofile", {
        apn,
        fips,
      });

      if (!data.property?.[0]) return null;
      return this.searchByAddress(data.property[0].address?.oneLine || "");
    } catch (error) {
      console.error("ATTOM APN search error:", error);
      return null;
    }
  }

  async getSalesHistory(attomId: string): Promise<AttomPropertyData["sales"]> {
    try {
      const data = await this.request<any>("/propertyapi/v1.0.0/saleshistory/detail", {
        id: attomId,
      });

      return (data.property?.[0]?.saleHistory || []).map((sale: any) => ({
        saleDate: sale.amount?.saleRecDate || "",
        saleAmount: sale.amount?.saleAmt || 0,
        saleType: sale.amount?.saleTransType || "",
      }));
    } catch (error) {
      console.error("ATTOM sales history error:", error);
      return [];
    }
  }

  async getOwnershipByName(ownerName: string, state?: string): Promise<AttomPropertyData[]> {
    try {
      const params: Record<string, string> = { ownerName };
      if (state) params.state = state;

      const data = await this.request<any>("/propertyapi/v1.0.0/property/expandedprofile", params);
      
      return (data.property || []).map((prop: any) => ({
        attomId: prop.identifier?.attomId?.toString() || "",
        address: {
          line1: prop.address?.line1 || "",
          city: prop.address?.locality || "",
          state: prop.address?.countrySubd || "",
          zip: prop.address?.postal1 || "",
          county: prop.area?.countyName || "",
        },
        parcel: {
          apn: prop.identifier?.apn || "",
          fips: prop.identifier?.fips || "",
        },
        ownership: {
          ownerName: prop.assessment?.owner?.owner1?.fullName || ownerName,
          ownerType: prop.assessment?.owner?.corporateIndicator === "Y" ? "entity" : "individual",
        },
        assessment: {
          assessedValue: prop.assessment?.assessed?.assdTtlValue || 0,
          marketValue: prop.assessment?.market?.mktTtlValue || 0,
          taxAmount: prop.assessment?.tax?.taxAmt || 0,
          taxYear: prop.assessment?.tax?.taxYear || 0,
        },
        building: {
          yearBuilt: prop.building?.summary?.yearBuilt || 0,
          sqft: prop.building?.size?.universalSize || 0,
          bedrooms: prop.building?.rooms?.beds || 0,
          bathrooms: prop.building?.rooms?.bathsTotal || 0,
          propertyType: prop.summary?.propertyType || "",
        },
        sales: [],
      }));
    } catch (error) {
      console.error("ATTOM ownership search error:", error);
      return [];
    }
  }
}

export class OpenCorporatesProvider {
  private apiToken: string;
  private baseUrl = "https://api.opencorporates.com/v0.4";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append("api_token", this.apiToken);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return limit(() =>
      pRetry(
        async () => {
          const response = await fetch(url.toString(), {
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error("Rate limited");
            }
            throw new Error(`OpenCorporates API error: ${response.status}`);
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  /**
   * Normalize spaced letter sequences for better search matching.
   * Examples: "JOHNSTON JAKE L L C" -> "JOHNSTON JAKE LLC", "ACME C O R P" -> "ACME CORP"
   */
  private normalizeSearchQuery(query: string): string {
    // Handle periods between letters: "L.L.C." -> "LLC", "C.O.R.P." -> "CORP"
    let normalized = query.replace(/\b([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2$3$4');
    normalized = normalized.replace(/\b([A-Z])(?:\.\s*)+([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2$3');
    normalized = normalized.replace(/\b([A-Z])(?:\.\s*)+([A-Z])\.?\b/gi, '$1$2');
    
    // Normalize spaced letters: "L L C" -> "LLC", "C O R P" -> "CORP"
    normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z])\b/gi, '$1$2$3$4');
    normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\b/gi, '$1$2$3');
    normalized = normalized.replace(/\b([A-Z])\s+([A-Z])\b/gi, '$1$2');
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
  }

  async searchCompanies(query: string, jurisdiction?: string): Promise<OpenCorporatesCompany[]> {
    try {
      // Normalize the query to handle "L L C" -> "LLC" style variations
      const normalizedQuery = this.normalizeSearchQuery(query);
      console.log(`OpenCorporates: Searching for "${query}" (normalized: "${normalizedQuery}")`);
      
      const params: Record<string, string> = { q: normalizedQuery, per_page: "30" };
      if (jurisdiction) params.jurisdiction_code = jurisdiction;

      const data = await this.request<any>("/companies/search", params);

      return (data.results?.companies || []).map((item: any) => {
        const company = item.company;
        return {
          companyNumber: company.company_number || "",
          name: company.name || "",
          jurisdictionCode: company.jurisdiction_code || "",
          incorporationDate: company.incorporation_date || "",
          companyType: company.company_type || "",
          currentStatus: company.current_status || "",
          registeredAddress: company.registered_address_in_full,
          officers: [],
          filings: [],
        };
      });
    } catch (error) {
      console.error("OpenCorporates search error:", error);
      return [];
    }
  }

  async getCompany(jurisdictionCode: string, companyNumber: string): Promise<OpenCorporatesCompany | null> {
    try {
      const data = await this.request<any>(`/companies/${jurisdictionCode}/${companyNumber}`);
      const company = data.results?.company;

      if (!company) {
        console.log("OpenCorporates: No company data in response");
        return null;
      }

      console.log(`OpenCorporates company data: name=${company.name}, status=${company.current_status}, officers=${company.officers?.length || 0}, filings=${company.filings?.length || 0}`);
      
      if (company.agent_name) {
        console.log(`OpenCorporates registered agent: ${company.agent_name}`);
      }

      // Parse branch relationship (for foreign registrations)
      let branch: OpenCorporatesCompany["branch"] = undefined;
      if (company.branch) {
        const branchCompany = company.branch;
        branch = {
          parentCompanyNumber: branchCompany.company_number || "",
          parentJurisdictionCode: branchCompany.jurisdiction_code || "",
          parentName: branchCompany.name || "",
          parentOpencorporatesUrl: branchCompany.opencorporates_url || "",
        };
        console.log(`OpenCorporates branch detected: "${company.name}" is branch of "${branch.parentName}" (${branch.parentJurisdictionCode})`);
      }

      const officers = (company.officers || []).map((o: any) => ({
        name: o.officer?.name || o.name || "",
        position: o.officer?.position || o.position || "",
        startDate: o.officer?.start_date || o.start_date,
        address: o.officer?.address || o.address,
      }));

      const filings = (company.filings || []).map((f: any) => ({
        title: f.filing?.title || f.title || "",
        date: f.filing?.date || f.date || "",
        url: f.filing?.url || f.url,
      }));

      return {
        companyNumber: company.company_number || "",
        name: company.name || "",
        jurisdictionCode: company.jurisdiction_code || "",
        incorporationDate: company.incorporation_date || "",
        companyType: company.company_type || "",
        currentStatus: company.current_status || "",
        registeredAddress: company.registered_address_in_full,
        agentName: company.agent_name,
        agentAddress: company.agent_address,
        branch,
        officers,
        filings,
      };
    } catch (error) {
      console.error("OpenCorporates get company error:", error);
      return null;
    }
  }

  async getOfficers(jurisdictionCode: string, companyNumber: string): Promise<OpenCorporatesCompany["officers"]> {
    try {
      const data = await this.request<any>(`/companies/${jurisdictionCode}/${companyNumber}/officers`);

      return (data.results?.officers || []).map((item: any) => ({
        name: item.officer?.name || "",
        position: item.officer?.position || "",
        startDate: item.officer?.start_date,
      }));
    } catch (error) {
      console.error("OpenCorporates officers error:", error);
      return [];
    }
  }

  async searchOfficers(name: string, jurisdiction?: string): Promise<Array<{ name: string; position: string; companyName: string; companyNumber: string }>> {
    try {
      const params: Record<string, string> = { q: name.replace(/ /g, "+") };
      if (jurisdiction) params.jurisdiction_code = jurisdiction;

      const data = await this.request<any>("/officers/search", params);

      return (data.results?.officers || []).map((item: any) => ({
        name: item.officer?.name || "",
        position: item.officer?.position || "",
        companyName: item.officer?.company?.name || "",
        companyNumber: item.officer?.company?.company_number || "",
      }));
    } catch (error) {
      console.error("OpenCorporates officer search error:", error);
      return [];
    }
  }

  /**
   * Follow branch relationship to get parent company with officers.
   * Foreign registrations (branches) often have no officers listed, but the parent company does.
   */
  async getParentCompanyWithOfficers(company: OpenCorporatesCompany): Promise<OpenCorporatesCompany | null> {
    if (!company.branch) {
      return null;
    }

    const { parentJurisdictionCode, parentCompanyNumber, parentName } = company.branch;
    
    if (!parentJurisdictionCode || !parentCompanyNumber) {
      console.log(`OpenCorporates: Branch detected for "${company.name}" but missing parent company identifiers`);
      return null;
    }

    console.log(`OpenCorporates: Following branch to parent company "${parentName}" (${parentJurisdictionCode}/${parentCompanyNumber})`);

    try {
      const parentCompany = await this.getCompany(parentJurisdictionCode, parentCompanyNumber);
      
      if (!parentCompany) {
        console.log(`OpenCorporates: Parent company lookup failed for "${parentName}"`);
        return null;
      }

      // If parent has no officers in main response, try the officers endpoint
      if (parentCompany.officers.length === 0) {
        console.log(`OpenCorporates: Parent company has no officers in response, fetching via officers endpoint`);
        const officers = await this.getOfficers(parentJurisdictionCode, parentCompanyNumber);
        if (officers.length > 0) {
          parentCompany.officers = officers;
        }
      }

      console.log(`OpenCorporates: Parent company "${parentCompany.name}" has ${parentCompany.officers.length} officers`);
      return parentCompany;
    } catch (error) {
      console.error(`OpenCorporates: Error fetching parent company:`, error);
      return null;
    }
  }
}

export interface DataAxlePerson {
  firstName: string;
  lastName: string;
  emails: string[];
  phones: string[];
  cellPhones: string[];
  title?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  infousa_id?: string;
  confidenceScore: number;
}

export interface DataAxlePlace {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  uccFilings?: Array<{
    filingNumber: string;
    filingDate: string;
    filingType: string;
    securedParty?: string;
  }>;
  employees?: number;
  salesVolume?: number;
  naicsCode?: string;
  sicCode?: string;
  infousa_id?: string;
}

export class DataAxleProvider {
  private apiToken: string;
  private baseUrl = "https://api.data-axle.com/v1";
  
  // Package configurations based on user's subscription
  private peoplePackages = "enhanced_v2,emails_v2,cell_phones_v2";
  private placesPackages = "enhanced_v3,email_v2,ucc_filings_v1";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    console.log(`Data Axle request: ${url.toString()}`);

    return limit(() =>
      pRetry(
        async () => {
          const response = await fetch(url.toString(), {
            headers: {
              Accept: "application/json",
              "X-AUTH-TOKEN": this.apiToken,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Data Axle error response (${response.status}):`, errorText.slice(0, 500));
            if (response.status === 429) {
              throw new Error("Rate limited");
            }
            throw new Error(`Data Axle API error: ${response.status}`);
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  // Search for people using People v2 with enhanced data, emails, and cell phones
  async searchPeopleV2(name: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxlePerson[]> {
    const check = apiUsageTracker.canMakeRequest("data_axle_people");
    if (!check.allowed) {
      console.error(`[DATA AXLE BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      console.log(`Data Axle searchPeopleV2: "${name}" location:`, location);
      const params: Record<string, string> = {
        query: name,
        packages: this.peoplePackages,
        limit: "25",
      };

      if (location?.city) params.city = location.city;
      if (location?.state) params.state = location.state;
      if (location?.zip) params.postal_code = location.zip;

      const data = await this.request<any>("/people/search", params);
      const resultCount = data.documents?.length || 0;
      apiUsageTracker.recordRequest("data_axle_people", resultCount || 1);
      console.log(`Data Axle People v2 returned ${resultCount} results`);

      return (data.documents || []).map((doc: any) => ({
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        emails: this.extractEmails(doc),
        phones: this.extractPhones(doc),
        cellPhones: this.extractCellPhones(doc),
        title: doc.title || doc.occupation,
        company: doc.employer_name || doc.business_name,
        address: doc.street || doc.address_line_1,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code || doc.zip,
        infousa_id: doc.infousa_id,
        confidenceScore: doc.match_score || doc.confidence_score || 75,
      }));
    } catch (error: any) {
      console.error("Data Axle People v2 search error:", error?.message || error);
      return [];
    }
  }

  // Search for people by employer/company name
  async searchPeopleByEmployer(companyName: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxlePerson[]> {
    const check = apiUsageTracker.canMakeRequest("data_axle_people");
    if (!check.allowed) {
      console.error(`[DATA AXLE BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      console.log(`Data Axle searchPeopleByEmployer: "${companyName}" location:`, location);
      const params: Record<string, string> = {
        employer_name: companyName,
        packages: this.peoplePackages,
        limit: "50",
      };

      if (location?.city) params.city = location.city;
      if (location?.state) params.state = location.state;
      if (location?.zip) params.postal_code = location.zip;

      const data = await this.request<any>("/people/search", params);
      const resultCount = data.documents?.length || 0;
      apiUsageTracker.recordRequest("data_axle_people", resultCount || 1);
      console.log(`Data Axle People by employer returned ${resultCount} results`);

      return (data.documents || []).map((doc: any) => ({
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        emails: this.extractEmails(doc),
        phones: this.extractPhones(doc),
        cellPhones: this.extractCellPhones(doc),
        title: doc.title || doc.occupation,
        company: doc.employer_name || doc.business_name,
        address: doc.street || doc.address_line_1,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code || doc.zip,
        infousa_id: doc.infousa_id,
        confidenceScore: doc.match_score || doc.confidence_score || 75,
      }));
    } catch (error: any) {
      console.error("Data Axle People by employer search error:", error?.message || error);
      return [];
    }
  }

  // Search for places/businesses using Places v3 with UCC filings
  async searchPlacesV3(query: string, location?: { city?: string; state?: string; zip?: string }, maxResults = 100): Promise<DataAxlePlace[]> {
    const check = apiUsageTracker.canMakeRequest("data_axle_places");
    if (!check.allowed) {
      console.error(`[DATA AXLE BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      console.log(`Data Axle searchPlacesV3: "${query}" location:`, location);
      const params: Record<string, string> = {
        query,
        packages: this.placesPackages,
        limit: String(maxResults),
      };

      if (location?.city) params.city = location.city;
      if (location?.state) params.state = location.state;
      if (location?.zip) params.postal_code = location.zip;

      const data = await this.request<any>("/places/search", params);
      const resultCount = data.documents?.length || 0;
      apiUsageTracker.recordRequest("data_axle_places", resultCount || 1);
      console.log(`Data Axle Places v3 returned ${resultCount} results`);

      return (data.documents || []).map((doc: any) => ({
        name: doc.name || doc.company_name || "",
        address: doc.street || doc.address_line_1,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code || doc.zip,
        phone: doc.phone || doc.primary_phone,
        email: doc.email || doc.primary_email,
        uccFilings: this.extractUccFilings(doc),
        employees: doc.employee_count || doc.employees,
        salesVolume: doc.sales_volume || doc.annual_sales,
        naicsCode: doc.naics_code || doc.primary_naics,
        sicCode: doc.sic_code || doc.primary_sic,
        infousa_id: doc.infousa_id,
      }));
    } catch (error: any) {
      console.error("Data Axle Places v3 search error:", error?.message || error);
      return [];
    }
  }

  private extractEmails(doc: any): string[] {
    const emails: string[] = [];
    if (doc.email) emails.push(doc.email);
    if (doc.emails && Array.isArray(doc.emails)) {
      emails.push(...doc.emails.map((e: any) => typeof e === 'string' ? e : e.email).filter(Boolean));
    }
    if (doc.email_1) emails.push(doc.email_1);
    if (doc.email_2) emails.push(doc.email_2);
    if (doc.email_3) emails.push(doc.email_3);
    return Array.from(new Set(emails));
  }

  private extractPhones(doc: any): string[] {
    const phones: string[] = [];
    if (doc.phone) phones.push(doc.phone);
    if (doc.phones && Array.isArray(doc.phones)) {
      phones.push(...doc.phones.map((p: any) => typeof p === 'string' ? p : p.phone).filter(Boolean));
    }
    if (doc.home_phone) phones.push(doc.home_phone);
    if (doc.work_phone) phones.push(doc.work_phone);
    return Array.from(new Set(phones));
  }

  private extractCellPhones(doc: any): string[] {
    const cells: string[] = [];
    if (doc.cell_phone) cells.push(doc.cell_phone);
    if (doc.mobile_phone) cells.push(doc.mobile_phone);
    if (doc.cell_phones && Array.isArray(doc.cell_phones)) {
      cells.push(...doc.cell_phones.map((p: any) => typeof p === 'string' ? p : p.phone).filter(Boolean));
    }
    return Array.from(new Set(cells));
  }

  private extractUccFilings(doc: any): DataAxlePlace["uccFilings"] {
    if (!doc.ucc_filings && !doc.uccFilings) return undefined;
    
    const filings = doc.ucc_filings || doc.uccFilings || [];
    if (!Array.isArray(filings)) return undefined;

    return filings.map((f: any) => ({
      filingNumber: f.filing_number || f.filingNumber || "",
      filingDate: f.filing_date || f.filingDate || "",
      filingType: f.filing_type || f.filingType || "",
      securedParty: f.secured_party || f.securedParty,
    }));
  }

  // Legacy methods for backwards compatibility
  async searchBusinesses(query: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxleContact[]> {
    const places = await this.searchPlacesV3(query, location);
    return places.map(p => ({
      firstName: "",
      lastName: "",
      email: p.email,
      phone: p.phone,
      title: undefined,
      company: p.name,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      confidenceScore: 80,
    }));
  }

  async searchPeople(name: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxleContact[]> {
    const people = await this.searchPeopleV2(name, location);
    return people.map(p => ({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.emails[0],
      phone: p.cellPhones[0] || p.phones[0],
      title: p.title,
      company: p.company,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      confidenceScore: p.confidenceScore,
    }));
  }

  async enrichContact(contact: { name?: string; email?: string; phone?: string; address?: string }): Promise<DataAxleContact | null> {
    try {
      const matchData: Record<string, string> = {};
      if (contact.name) matchData.name = contact.name;
      if (contact.email) matchData.email = contact.email;
      if (contact.phone) matchData.phone = contact.phone;
      if (contact.address) matchData.street = contact.address;

      const response = await fetch(`${this.baseUrl}/people/match`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-AUTH-TOKEN": this.apiToken,
        },
        body: JSON.stringify({ match_input: matchData, packages: this.peoplePackages }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const doc = data.document;

      if (!doc) return null;

      return {
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        email: this.extractEmails(doc)[0],
        phone: this.extractCellPhones(doc)[0] || this.extractPhones(doc)[0],
        title: doc.title,
        company: doc.employer_name,
        address: doc.street,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code,
        confidenceScore: doc.match_score || 70,
      };
    } catch (error) {
      console.error("Data Axle enrich error:", error);
      return null;
    }
  }
}

export class MelissaDataProvider {
  private apiKey: string;
  private baseUrl = "https://address.melissadata.net/v3";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async verifyAddress(address: { line1: string; city?: string; state?: string; zip?: string }): Promise<MelissaAddressResult | null> {
    try {
      const params = new URLSearchParams({
        id: this.apiKey,
        format: "json",
        a1: address.line1,
        ...(address.city && { city: address.city }),
        ...(address.state && { state: address.state }),
        ...(address.zip && { postal: address.zip }),
      });

      const response = await fetch(`${this.baseUrl}/WEB/GlobalAddress/doGlobalAddress?${params}`);

      if (!response.ok) return null;

      const data = await response.json();
      const record = data.Records?.[0];

      if (!record) return null;

      const resultCodes = (record.Results || "").split(",");
      const verified = resultCodes.some((code: string) => code.startsWith("AV"));

      return {
        verified,
        standardizedAddress: {
          line1: record.AddressLine1 || address.line1,
          city: record.Locality || address.city || "",
          state: record.AdministrativeArea || address.state || "",
          zip: record.PostalCode || address.zip || "",
          plus4: record.PostalCodePlus4 || "",
          county: record.SubAdministrativeArea || "",
        },
        deliverability: record.DeliveryIndicator || "unknown",
        resultCodes,
      };
    } catch (error) {
      console.error("Melissa verify address error:", error);
      return null;
    }
  }

  async lookupPersonator(input: {
    fullName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    email?: string;
    phone?: string;
  }): Promise<{
    name: { first: string; last: string };
    address: MelissaAddressResult["standardizedAddress"];
    phone?: string;
    email?: string;
    gender?: string;
  } | null> {
    try {
      console.log("Melissa lookupPersonator input:", input);
      
      const params = new URLSearchParams();
      params.append("id", this.apiKey);
      params.append("format", "json");
      params.append("act", "Check,Verify,Append");
      
      if (input.fullName) params.append("full", input.fullName);
      if (input.address) params.append("a1", input.address);
      if (input.city) params.append("city", input.city);
      if (input.state) params.append("state", input.state);
      if (input.zip) params.append("postal", input.zip);
      if (input.email) params.append("email", input.email);
      if (input.phone) params.append("phone", input.phone);

      const url = `https://personator.melissadata.net/v3/WEB/ContactVerify/doContactVerify?${params}`;
      console.log("Melissa request URL:", url.replace(this.apiKey, "***"));
      
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Melissa API error (${response.status}):`, errorText.slice(0, 500));
        return null;
      }

      const data = await response.json();
      console.log("Melissa response:", JSON.stringify(data).slice(0, 500));
      
      const record = data.Records?.[0];

      if (!record) {
        console.log("Melissa: No records in response");
        return null;
      }

      console.log("Melissa record fields:", {
        NameFirst: record.NameFirst,
        NameLast: record.NameLast,
        AddressLine1: record.AddressLine1,
        City: record.City,
        PhoneNumber: record.PhoneNumber,
        Results: record.Results,
      });

      return {
        name: {
          first: record.NameFirst || "",
          last: record.NameLast || "",
        },
        address: {
          line1: record.AddressLine1 || "",
          city: record.City || "",
          state: record.State || "",
          zip: record.PostalCode || "",
          plus4: record.Plus4 || "",
          county: record.CountyName || "",
        },
        phone: record.PhoneNumber,
        email: record.EmailAddress,
        gender: record.Gender,
      };
    } catch (error) {
      console.error("Melissa personator error:", error);
      return null;
    }
  }
}

export class GoogleAddressValidationProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async validateAddress(address: string): Promise<GoogleAddressValidationResult | null> {
    try {
      const response = await fetch(
        `https://addressvalidation.googleapis.com/v1:validateAddress?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: {
              addressLines: [address],
            },
          }),
        }
      );

      if (!response.ok) {
        console.error("Google Address Validation API error:", response.status);
        return null;
      }

      const data = await response.json();
      const result = data.result;

      if (!result) return null;

      const addressComponents: any = {};
      (result.address?.addressComponents || []).forEach((comp: any) => {
        const type = comp.componentType;
        if (type === "street_number") addressComponents.streetNumber = comp.componentName?.text;
        if (type === "route") addressComponents.route = comp.componentName?.text;
        if (type === "locality") addressComponents.city = comp.componentName?.text;
        if (type === "administrative_area_level_1") addressComponents.state = comp.componentName?.text;
        if (type === "postal_code") addressComponents.postalCode = comp.componentName?.text;
        if (type === "country") addressComponents.country = comp.componentName?.text;
      });

      return {
        isValid: result.verdict?.addressComplete === true,
        formattedAddress: result.address?.formattedAddress || address,
        addressComponents,
        geocode: result.geocode?.location
          ? {
              lat: result.geocode.location.latitude,
              lng: result.geocode.location.longitude,
            }
          : undefined,
        verdict: {
          inputGranularity: result.verdict?.inputGranularity || "UNKNOWN",
          validationGranularity: result.verdict?.validationGranularity || "UNKNOWN",
          geocodeGranularity: result.verdict?.geocodeGranularity || "UNKNOWN",
          addressComplete: result.verdict?.addressComplete || false,
          hasUnconfirmedComponents: result.verdict?.hasUnconfirmedComponents || false,
          hasInferredComponents: result.verdict?.hasInferredComponents || false,
          hasReplacedComponents: result.verdict?.hasReplacedComponents || false,
        },
      };
    } catch (error) {
      console.error("Google Address Validation error:", error);
      return null;
    }
  }

  async autocomplete(input: string): Promise<Array<{ description: string; placeId: string }>> {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&key=${this.apiKey}`
      );

      if (!response.ok) return [];

      const data = await response.json();
      return (data.predictions || []).map((pred: any) => ({
        description: pred.description,
        placeId: pred.place_id,
      }));
    } catch (error) {
      console.error("Google Places autocomplete error:", error);
      return [];
    }
  }

  async getPlaceDetails(placeId: string): Promise<any | null> {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,address_components,geometry&key=${this.apiKey}`
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.result || null;
    } catch (error) {
      console.error("Google Places details error:", error);
      return null;
    }
  }
}

export class ALeadsProvider {
  private apiKey: string;
  private baseUrl = "https://api.a-leads.co/gateway/v1/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchContacts(query: { name?: string; company?: string; location?: string }): Promise<ALeadsContact[]> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      console.log(`A-Leads searchContacts:`, query);
      
      const advancedFilters: Record<string, any> = {};
      
      if (query.name) {
        const nameParts = query.name.split(' ').filter(p => p.length > 0);
        if (nameParts.length >= 2) {
          // Use first part as first name, last part as last name (ignoring middle initials)
          advancedFilters.member_name_first = nameParts[0];
          advancedFilters.member_name_last = nameParts[nameParts.length - 1];
        } else {
          advancedFilters.member_full_name = query.name;
        }
      }
      if (query.company) {
        advancedFilters.company_name = query.company;
      }
      if (query.location) {
        advancedFilters.member_location_raw_address = query.location;
      }

      const requestBody = {
        advanced_filters: advancedFilters,
        current_page: 1,
        search_type: "total",
      };

      console.log(`A-Leads request: POST ${this.baseUrl}/advanced-search`);
      console.log(`A-Leads request body:`, JSON.stringify(requestBody));

      const response = await fetch(`${this.baseUrl}/advanced-search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`A-Leads error response (${response.status}):`, errorText.slice(0, 500));
        return [];
      }

      const data = await response.json();
      const results = data.data || [];
      apiUsageTracker.recordRequest("aleads", results.length || 1);
      console.log(`A-Leads returned ${results.length} results`);

      return results.map((contact: any) => ({
        name: contact.member_full_name || `${contact.member_name_first || ""} ${contact.member_name_last || ""}`.trim(),
        email: contact.email,
        phone: contact.phone_number_available ? "Available" : undefined,
        address: contact.member_location_raw_address || contact.hq_full_address,
        company: contact.company_name,
        title: contact.job_title,
        linkedinUrl: contact.member_linkedin_url,
        source: "a-leads",
        confidence: 75,
      }));
    } catch (error: any) {
      console.error("A-Leads search error:", error?.message || error);
      return [];
    }
  }

  async skipTrace(input: { name: string; address?: string; city?: string; state?: string; zip?: string }): Promise<ALeadsContact | null> {
    try {
      const advancedFilters: Record<string, any> = {};
      
      const nameParts = input.name.split(' ').filter(p => p.length > 0);
      if (nameParts.length >= 2) {
        // Use first part as first name, last part as last name (ignoring middle initials)
        advancedFilters.member_name_first = nameParts[0];
        advancedFilters.member_name_last = nameParts[nameParts.length - 1];
      } else {
        advancedFilters.member_full_name = input.name;
      }
      
      if (input.address) {
        advancedFilters.member_location_raw_address = input.address;
      }
      if (input.city) {
        advancedFilters.member_location_city = input.city;
      }
      if (input.state) {
        advancedFilters.member_location_state = input.state;
      }

      const requestBody = {
        advanced_filters: advancedFilters,
        current_page: 1,
        search_type: "total",
      };

      console.log(`A-Leads skip trace: POST ${this.baseUrl}/advanced-search`);

      const response = await fetch(`${this.baseUrl}/advanced-search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`A-Leads skip trace error (${response.status}):`, errorText.slice(0, 500));
        return null;
      }

      const data = await response.json();
      const results = data.data || [];
      
      if (results.length === 0) return null;

      const contact = results[0];
      return {
        name: contact.member_full_name || input.name,
        email: contact.email,
        phone: contact.phone_number_available ? "Available" : undefined,
        address: contact.member_location_raw_address,
        company: contact.company_name,
        title: contact.job_title,
        linkedinUrl: contact.member_linkedin_url,
        source: "a-leads-skip-trace",
        confidence: 80,
      };
    } catch (error) {
      console.error("A-Leads skip trace error:", error);
      return null;
    }
  }
}

export class DataProviderManager {
  private attom?: AttomDataProvider;
  private openCorporates?: OpenCorporatesProvider;
  private dataAxle?: DataAxleProvider;
  private melissa?: MelissaDataProvider;
  private aLeads?: ALeadsProvider;
  private google?: GoogleAddressValidationProvider;
  private pacificEastEnabled: boolean = false;

  constructor() {
    console.log("Initializing DataProviderManager...");
    if (process.env.ATTOM_API_KEY) {
      this.attom = new AttomDataProvider(process.env.ATTOM_API_KEY);
      console.log("✓ ATTOM provider initialized");
    }
    if (process.env.OPENCORPORATES_API_KEY) {
      this.openCorporates = new OpenCorporatesProvider(process.env.OPENCORPORATES_API_KEY);
      console.log("✓ OpenCorporates provider initialized");
    }
    if (process.env.DATA_AXLE_API_KEY) {
      this.dataAxle = new DataAxleProvider(process.env.DATA_AXLE_API_KEY);
      console.log("✓ Data Axle provider initialized");
    }
    if (process.env.MELISSA_API_KEY) {
      this.melissa = new MelissaDataProvider(process.env.MELISSA_API_KEY);
      console.log("✓ Melissa provider initialized");
    }
    if (process.env.ALEADS_API_KEY) {
      this.aLeads = new ALeadsProvider(process.env.ALEADS_API_KEY);
      console.log("✓ A-Leads provider initialized");
    }
    if (process.env.GOOGLE_MAPS_API_KEY) {
      this.google = new GoogleAddressValidationProvider(process.env.GOOGLE_MAPS_API_KEY);
      console.log("✓ Google provider initialized");
    }
    // Pacific East is always enabled (uses hardcoded dev key or env var)
    this.pacificEastEnabled = true;
    console.log("✓ Pacific East provider initialized (DataPrime, FPA, EMA, EMV)");
    console.log("Available providers:", this.getAvailableProviders());
  }

  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.attom) providers.push("attom");
    if (this.openCorporates) providers.push("opencorporates");
    if (this.dataAxle) providers.push("dataaxle");
    if (this.melissa) providers.push("melissa");
    if (this.aLeads) providers.push("aleads");
    if (this.google) providers.push("google");
    if (this.pacificEastEnabled) providers.push("pacificeast");
    return providers;
  }

  private normalizeAddressForAttom(address: string): string {
    const parsed = parseFromDescription(address);
    if (parsed && isValidForSearch(parsed)) {
      const query = toAttomQuery(parsed);
      console.log(`Address normalized: "${address}" -> "${query}" (city: ${parsed.city}, state: ${parsed.stateCode})`);
      return query;
    }
    console.warn(`Could not parse address, using raw: "${address}"`);
    return address
      .replace(/,?\s*USA$/i, "")
      .replace(/,?\s*United States$/i, "")
      .trim();
  }

  async searchPropertyByAddress(address: string): Promise<AttomPropertyData | null> {
    if (!this.attom) {
      console.warn("ATTOM provider not configured");
      return null;
    }
    const normalizedAddress = this.normalizeAddressForAttom(address);
    console.log(`ATTOM search: "${address}" -> "${normalizedAddress}"`);
    return this.attom.searchByAddress(normalizedAddress);
  }

  async searchPropertyByApn(apn: string, fips: string): Promise<AttomPropertyData | null> {
    if (!this.attom) {
      console.warn("ATTOM provider not configured");
      return null;
    }
    return this.attom.searchByApn(apn, fips);
  }

  async searchPropertiesByOwner(ownerName: string, state?: string): Promise<AttomPropertyData[]> {
    if (!this.attom) {
      console.warn("ATTOM provider not configured");
      return [];
    }
    return this.attom.getOwnershipByName(ownerName, state);
  }

  async lookupLlc(companyName: string, state?: string): Promise<OpenCorporatesCompany | null> {
    if (!this.openCorporates) {
      console.warn("OpenCorporates provider not configured");
      return null;
    }

    const results = await this.openCorporates.searchCompanies(companyName, state ? `us_${state.toLowerCase()}` : undefined);
    
    if (results.length === 0) return null;

    const bestMatch = results[0];
    const company = await this.openCorporates.getCompany(bestMatch.jurisdictionCode, bestMatch.companyNumber);
    if (company) {
      company.status = company.currentStatus;
      company.entityType = company.companyType;
      company.opencorporatesUrl = `https://opencorporates.com/companies/${company.jurisdictionCode}/${company.companyNumber}`;
      
      // If company has no officers and is a branch (foreign registration), get parent company officers
      if (company.officers.length === 0 && company.branch) {
        console.log(`lookupLlc: No officers for "${company.name}", checking parent company via branch...`);
        const parentCompany = await this.openCorporates.getParentCompanyWithOfficers(company);
        if (parentCompany && parentCompany.officers.length > 0) {
          company.officers = parentCompany.officers;
          if (parentCompany.agentName && !company.agentName) {
            company.agentName = parentCompany.agentName;
            company.agentAddress = parentCompany.agentAddress;
          }
          console.log(`lookupLlc: Got ${company.officers.length} officers from parent company "${parentCompany.name}"`);
        }
      }
    }
    return company;
  }

  async searchOpenCorporates(query: string, jurisdiction?: string): Promise<Array<{
    name: string;
    jurisdiction: string;
    registrationNumber: string;
    status: string;
    entityType: string;
    opencorporatesUrl: string;
  }>> {
    if (!this.openCorporates) {
      console.warn("OpenCorporates provider not configured");
      return [];
    }

    try {
      const jCode = jurisdiction ? `us_${jurisdiction.toLowerCase()}` : undefined;
      const results = await this.openCorporates.searchCompanies(query, jCode);
      
      return results.map(r => ({
        name: r.name,
        jurisdiction: r.jurisdictionCode?.replace("us_", "").toUpperCase() || "",
        registrationNumber: r.companyNumber,
        status: r.currentStatus || "Unknown",
        entityType: r.companyType || "Entity",
        opencorporatesUrl: `https://opencorporates.com/companies/${r.jurisdictionCode}/${r.companyNumber}`,
      }));
    } catch (error) {
      console.error("OpenCorporates search error:", error);
      return [];
    }
  }

  async searchLlcOfficers(companyName: string): Promise<Array<{ name: string; position: string; companyName: string }>> {
    if (!this.openCorporates) {
      console.warn("OpenCorporates provider not configured");
      return [];
    }

    const companies = await this.openCorporates.searchCompanies(companyName);
    const allOfficers: Array<{ name: string; position: string; companyName: string }> = [];

    for (const company of companies.slice(0, 3)) {
      const officers = await this.openCorporates.getOfficers(company.jurisdictionCode, company.companyNumber);
      officers.forEach(officer => {
        allOfficers.push({
          name: officer.name,
          position: officer.position,
          companyName: company.name,
        });
      });
    }

    return allOfficers;
  }

  async fetchLlcUnmasking(companyName: string, jurisdiction?: string): Promise<LlcUnmaskingResult | null> {
    if (!this.openCorporates) {
      console.warn("OpenCorporates provider not configured");
      return null;
    }

    try {
      console.log(`Searching OpenCorporates for: "${companyName}" (jurisdiction: ${jurisdiction || "any"})`);
      
      const commonJurisdictions = [
        jurisdiction ? `us_${jurisdiction.toLowerCase()}` : null,
        "us_de",
        "us_fl", 
        "us_ca",
        "us_ny",
        "us_tx",
        "us_nv",
        "us_wy",
        null
      ].filter((v, i, a) => v === null ? a.indexOf(null) === i : true);

      let companies: any[] = [];
      let searchedJurisdiction: string | undefined;
      
      for (const jur of commonJurisdictions) {
        try {
          const results = await this.openCorporates.searchCompanies(
            companyName, 
            jur || undefined
          );
          if (results.length > 0) {
            companies = results;
            searchedJurisdiction = jur || undefined;
            console.log(`Found ${results.length} companies in jurisdiction: ${jur || "all"}`);
            break;
          }
        } catch (err) {
          console.log(`No results in ${jur || "all"}, trying next...`);
        }
      }
      
      if (companies.length === 0) {
        console.log("No companies found in OpenCorporates");
        return null;
      }

      const company = companies[0];
      console.log(`Fetching details for: ${company.name} (${company.jurisdictionCode}/${company.companyNumber})`);
      
      const fullCompany = await this.openCorporates.getCompany(
        company.jurisdictionCode, 
        company.companyNumber
      );

      if (!fullCompany) {
        console.log("Could not fetch full company details");
        return null;
      }

      let officers: any[] = fullCompany.officers || [];
      console.log(`Found ${officers.length} officers in company data`);
      
      if (officers.length === 0) {
        try {
          officers = await this.openCorporates.getOfficers(
            company.jurisdictionCode, 
            company.companyNumber
          );
          console.log(`Fetched ${officers.length} officers from separate endpoint`);
        } catch (err) {
          console.log("Officers endpoint not available, using company data");
        }
      }

      // If still no officers, check if this is a branch (foreign registration) and get parent company officers
      if (officers.length === 0 && fullCompany.branch) {
        console.log(`No officers found, checking parent company via branch relationship...`);
        const parentCompany = await this.openCorporates.getParentCompanyWithOfficers(fullCompany);
        if (parentCompany && parentCompany.officers.length > 0) {
          console.log(`Found ${parentCompany.officers.length} officers from parent company "${parentCompany.name}"`);
          officers = parentCompany.officers;
          // Update registered agent from parent if available
          if (parentCompany.agentName && !fullCompany.agentName) {
            fullCompany.agentName = parentCompany.agentName;
            fullCompany.agentAddress = parentCompany.agentAddress;
          }
        }
      }

      const categorizeRole = (position: string): "officer" | "agent" | "member" | "manager" => {
        const pos = position.toLowerCase();
        if (pos.includes("agent") || pos.includes("registered")) return "agent";
        if (pos.includes("manager") || pos.includes("managing")) return "manager";
        if (pos.includes("member")) return "member";
        return "officer";
      };

      let registeredAgent: { name: string; address?: string } | null = null;
      
      if (fullCompany.agentName) {
        registeredAgent = { 
          name: fullCompany.agentName, 
          address: fullCompany.agentAddress 
        };
        console.log(`Found registered agent from company data: ${fullCompany.agentName}`);
      } else {
        const agentOfficer = officers.find(o => 
          o.position.toLowerCase().includes("agent") || 
          o.position.toLowerCase().includes("registered")
        );
        if (agentOfficer) {
          registeredAgent = { name: agentOfficer.name, address: agentOfficer.address };
          console.log(`Found registered agent from officers: ${agentOfficer.name}`);
        }
      }

      const normalizedOfficers = officers.map(o => ({
        name: o.name,
        position: o.position,
        startDate: o.startDate,
        address: o.address,
        role: categorizeRole(o.position),
        confidenceScore: 85,
      }));

      // Detect privacy-protected entities
      // Common patterns: only registered agents listed, corporate service company names, 
      // officer names that are clearly service companies
      const corporateServicePatterns = /\b(REGISTERED AGENT|CORP SERVICE|CORPORATE SERVICE|CT CORPORATION|CSC|NATIONAL REGISTERED|UNITED AGENT|INCORP SERVICES|VCORP|LEGALZOOM|NORTHWEST REGISTERED|HARVARD BUSINESS|COGENCY GLOBAL|CORPORATION SERVICE)\b/i;
      
      const realPersonOfficers = normalizedOfficers.filter(o => {
        const isAgent = o.role === "agent";
        const isCorporateService = corporateServicePatterns.test(o.name);
        const looksLikeCorporate = /\b(INC|LLC|CORP|COMPANY|SERVICES|SERVICE|TRUST|NETWORK)\b/i.test(o.name);
        return !isAgent && !isCorporateService && !looksLikeCorporate;
      });

      let isPrivacyProtected = realPersonOfficers.length === 0;
      console.log(`Privacy protection check: ${isPrivacyProtected ? "YES - only agents/service companies found" : "NO - real person officers found"}`);

      // If privacy-protected and we searched with a specific jurisdiction, try other states to find home filing with real officers
      if (isPrivacyProtected && searchedJurisdiction) {
        console.log(`Retrying search without jurisdiction constraint to find home state filing with real officers...`);
        
        // Search all jurisdictions without filter
        const broadResults = await this.openCorporates.searchCompanies(companyName);
        
        // Filter to find registrations in different jurisdictions that might have real officers
        const alternativeFilings = broadResults.filter(c => 
          c.jurisdictionCode !== searchedJurisdiction && 
          c.name.toUpperCase().includes(companyName.toUpperCase().split(' ')[0])
        );
        
        console.log(`Found ${alternativeFilings.length} alternative filings in other jurisdictions`);
        
        // Try each alternative filing to find one with real person officers
        for (const altCompany of alternativeFilings.slice(0, 5)) {
          console.log(`Checking ${altCompany.name} in ${altCompany.jurisdictionCode}...`);
          
          const altFullCompany = await this.openCorporates.getCompany(
            altCompany.jurisdictionCode,
            altCompany.companyNumber
          );
          
          if (!altFullCompany) continue;
          
          let altOfficers = altFullCompany.officers || [];
          if (altOfficers.length === 0) {
            try {
              altOfficers = await this.openCorporates.getOfficers(
                altCompany.jurisdictionCode,
                altCompany.companyNumber
              );
            } catch (err) {
              // Ignore errors
            }
          }
          
          const altNormalizedOfficers = altOfficers.map(o => ({
            name: o.name,
            position: o.position,
            startDate: o.startDate,
            address: o.address,
            role: categorizeRole(o.position),
            confidenceScore: 85,
          }));
          
          const altRealPersonOfficers = altNormalizedOfficers.filter(o => {
            const isAgent = o.role === "agent";
            const isCorporateService = corporateServicePatterns.test(o.name);
            const looksLikeCorporate = /\b(INC|LLC|CORP|COMPANY|SERVICES|SERVICE|TRUST|NETWORK)\b/i.test(o.name);
            return !isAgent && !isCorporateService && !looksLikeCorporate;
          });
          
          if (altRealPersonOfficers.length > 0) {
            console.log(`Found ${altRealPersonOfficers.length} real person officers in ${altCompany.jurisdictionCode}! Using this filing.`);
            
            // Update our data to use this better filing
            Object.assign(fullCompany, altFullCompany);
            officers = altOfficers;
            normalizedOfficers.length = 0;
            normalizedOfficers.push(...altNormalizedOfficers);
            isPrivacyProtected = false;
            
            // Update registered agent from the better filing
            if (altFullCompany.agentName) {
              registeredAgent = { 
                name: altFullCompany.agentName, 
                address: altFullCompany.agentAddress 
              };
            }
            break;
          }
        }
        
        if (isPrivacyProtected) {
          console.log(`No alternative filings with real person officers found`);
        }
      }

      let aiInferredOwners: LlcUnmaskingResult["aiInferredOwners"];
      let aiRelatedEntities: string[] | undefined;
      let aiCitations: string[] | undefined;

      // If privacy-protected, attempt Perplexity AI discovery
      if (isPrivacyProtected && Perplexity.isProviderAvailable()) {
        console.log("Attempting Perplexity AI ownership discovery for privacy-protected entity...");
        
        const perplexityResult = await Perplexity.discoverLlcOwnership({
          entityName: fullCompany.name,
          registeredAddress: fullCompany.registeredAddress,
          registeredAgent: registeredAgent?.name,
          jurisdiction: fullCompany.jurisdictionCode,
        });

        if (perplexityResult && perplexityResult.discoveredOwners.length > 0) {
          console.log(`Perplexity found ${perplexityResult.discoveredOwners.length} potential owners`);
          aiInferredOwners = perplexityResult.discoveredOwners;
          aiRelatedEntities = perplexityResult.relatedEntities;
          aiCitations = perplexityResult.citations;
        } else {
          console.log("Perplexity did not find additional ownership information");
        }
      } else if (isPrivacyProtected) {
        console.log("Perplexity API not configured - cannot perform AI ownership discovery");
      }

      return {
        companyNumber: fullCompany.companyNumber,
        name: fullCompany.name,
        jurisdictionCode: fullCompany.jurisdictionCode,
        incorporationDate: fullCompany.incorporationDate || null,
        companyType: fullCompany.companyType || null,
        currentStatus: fullCompany.currentStatus,
        registeredAddress: fullCompany.registeredAddress || null,
        officers: normalizedOfficers,
        registeredAgent,
        filings: fullCompany.filings || [],
        lastUpdated: new Date().toISOString(),
        isPrivacyProtected,
        aiInferredOwners,
        aiRelatedEntities,
        aiCitations,
      };
    } catch (error) {
      console.error("Error fetching LLC unmasking data:", error);
      return null;
    }
  }

  async enrichContact(input: { name?: string; email?: string; phone?: string; address?: string }): Promise<DataAxleContact | null> {
    if (this.dataAxle) {
      const result = await this.dataAxle.enrichContact(input);
      if (result) return result;
    }

    if (this.aLeads && input.name) {
      const result = await this.aLeads.skipTrace({ name: input.name, address: input.address });
      if (result) {
        return {
          firstName: result.name.split(" ")[0] || "",
          lastName: result.name.split(" ").slice(1).join(" ") || "",
          email: result.email,
          phone: result.phone,
          address: result.address,
          confidenceScore: result.confidence,
        };
      }
    }

    return null;
  }

  async findContactsByName(name: string, location?: { city?: string; state?: string }): Promise<DataAxleContact[]> {
    const results: DataAxleContact[] = [];

    if (this.dataAxle) {
      const dataAxleResults = await this.dataAxle.searchPeople(name, location);
      results.push(...dataAxleResults);
    }

    if (this.aLeads) {
      const aLeadsResults = await this.aLeads.searchContacts({ name, location: location ? `${location.city || ""}, ${location.state || ""}` : undefined });
      aLeadsResults.forEach(contact => {
        results.push({
          firstName: contact.name.split(" ")[0] || "",
          lastName: contact.name.split(" ").slice(1).join(" ") || "",
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          confidenceScore: contact.confidence,
        });
      });
    }

    return results;
  }

  // Search people using Data Axle People v2 with enhanced data, emails, and cell phones
  async searchPeopleV2(name: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxlePerson[]> {
    if (!this.dataAxle) {
      console.warn("Data Axle provider not configured");
      return [];
    }
    return this.dataAxle.searchPeopleV2(name, location);
  }

  // Search people by employer/company name
  async searchPeopleByEmployer(companyName: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxlePerson[]> {
    if (!this.dataAxle) {
      console.warn("Data Axle provider not configured");
      return [];
    }
    return this.dataAxle.searchPeopleByEmployer(companyName, location);
  }

  // Search places/businesses using Data Axle Places v3 with UCC filings
  async searchPlacesV3(query: string, location?: { city?: string; state?: string; zip?: string }, maxResults = 100): Promise<DataAxlePlace[]> {
    if (!this.dataAxle) {
      console.warn("Data Axle provider not configured");
      return [];
    }
    return this.dataAxle.searchPlacesV3(query, location, maxResults);
  }

  // Search for people associated with LLC officers (using Data Axle People v2)
  async findOfficerContacts(officers: Array<{ name: string; position?: string }>, location?: { state?: string }): Promise<Array<{
    officer: { name: string; position?: string };
    contacts: DataAxlePerson[];
  }>> {
    if (!this.dataAxle) {
      console.warn("Data Axle provider not configured");
      return [];
    }

    const results: Array<{ officer: { name: string; position?: string }; contacts: DataAxlePerson[] }> = [];
    
    // Filter out corporate entities (registered agents) - only search for real people
    const corporatePatterns = /\b(COMPANY|CORP|INC|LLC|TRUST|NETWORK|SERVICE|SERVICES|CORPORATION|REGISTERED|AGENT)\b/i;
    const realPeopleOfficers = officers.filter(o => !corporatePatterns.test(o.name));

    for (const officer of realPeopleOfficers) {
      try {
        console.log(`Searching Data Axle for officer: ${officer.name}`);
        const people = await this.dataAxle.searchPeopleV2(officer.name, location);
        results.push({
          officer,
          contacts: people,
        });
      } catch (error) {
        console.error(`Error searching for officer ${officer.name}:`, error);
        results.push({ officer, contacts: [] });
      }
    }

    return results;
  }

  async verifyAddress(address: { line1: string; city?: string; state?: string; zip?: string }): Promise<MelissaAddressResult | null> {
    if (!this.melissa) {
      console.warn("Melissa provider not configured");
      return null;
    }
    return this.melissa.verifyAddress(address);
  }

  async lookupPerson(input: { name?: string; address?: string; city?: string; state?: string; zip?: string; email?: string; phone?: string }) {
    if (!this.melissa) {
      console.warn("Melissa provider not configured");
      return null;
    }
    return this.melissa.lookupPersonator({
      fullName: input.name,
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      email: input.email,
      phone: input.phone,
    });
  }

  async validateAddressWithGoogle(address: string): Promise<GoogleAddressValidationResult | null> {
    if (!this.google) {
      console.warn("Google Address Validation provider not configured");
      return null;
    }
    return this.google.validateAddress(address);
  }

  async getAddressAutocomplete(input: string): Promise<Array<{ description: string; placeId: string }>> {
    if (!this.google) {
      console.warn("Google Places provider not configured");
      return [];
    }
    return this.google.autocomplete(input);
  }

  async getPlaceDetails(placeId: string): Promise<any | null> {
    if (!this.google) {
      console.warn("Google Places provider not configured");
      return null;
    }
    return this.google.getPlaceDetails(placeId);
  }

  async fetchContactEnrichment(
    companyName: string,
    location?: { city?: string; state?: string; zip?: string }
  ): Promise<ContactEnrichmentResult | null> {
    const sources: string[] = [];
    const companyEmails: ContactEnrichmentResult["companyEmails"] = [];
    const directDials: ContactEnrichmentResult["directDials"] = [];
    const employeeProfiles: ContactEnrichmentResult["employeeProfiles"] = [];

    try {
      if (this.dataAxle) {
        sources.push("data-axle");
        const businessResults = await this.dataAxle.searchBusinesses(companyName, location);
        
        for (const contact of businessResults) {
          if (contact.email) {
            const isPersonal = contact.firstName && contact.lastName;
            companyEmails.push({
              email: contact.email,
              type: isPersonal ? "personal" : "general",
              confidence: contact.confidenceScore,
            });
          }
          
          if (contact.phone) {
            directDials.push({
              phone: contact.phone,
              type: "office",
              name: `${contact.firstName} ${contact.lastName}`.trim() || undefined,
              title: contact.title,
              confidence: contact.confidenceScore,
            });
          }
          
          if (contact.firstName || contact.lastName) {
            employeeProfiles.push({
              name: `${contact.firstName} ${contact.lastName}`.trim(),
              title: contact.title,
              email: contact.email,
              phone: contact.phone,
              confidence: contact.confidenceScore,
            });
          }
        }
      }

      if (this.aLeads) {
        sources.push("a-leads");
        const locationStr = location ? `${location.city || ""}, ${location.state || ""}`.trim() : undefined;
        const aLeadsResults = await this.aLeads.searchContacts({ 
          company: companyName, 
          location: locationStr 
        });
        
        for (const contact of aLeadsResults) {
          if (contact.email && !companyEmails.some(e => e.email === contact.email)) {
            companyEmails.push({
              email: contact.email,
              type: "personal",
              confidence: contact.confidence,
            });
          }
          
          if (contact.phone && !directDials.some(d => d.phone === contact.phone)) {
            directDials.push({
              phone: contact.phone,
              type: "direct",
              name: contact.name,
              confidence: contact.confidence,
            });
          }
          
          if (contact.name && !employeeProfiles.some(p => p.name === contact.name)) {
            employeeProfiles.push({
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              confidence: contact.confidence,
            });
          }
        }
      }

      if (sources.length === 0) {
        console.warn("No contact enrichment providers configured");
        return null;
      }

      companyEmails.sort((a, b) => b.confidence - a.confidence);
      directDials.sort((a, b) => b.confidence - a.confidence);
      employeeProfiles.sort((a, b) => b.confidence - a.confidence);

      return {
        companyEmails: companyEmails.slice(0, 10),
        directDials: directDials.slice(0, 10),
        employeeProfiles: employeeProfiles.slice(0, 10),
        sources,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching contact enrichment:", error);
      return null;
    }
  }

  async searchALeadsByName(name: string, location?: { city?: string; state?: string }): Promise<ALeadsContact[]> {
    if (!this.aLeads) {
      return [];
    }
    
    try {
      const locationStr = location ? `${location.city || ""}, ${location.state || ""}`.trim() : undefined;
      console.log(`A-Leads search by person name: "${name}" location: "${locationStr}"`);
      return await this.aLeads.searchContacts({ name, location: locationStr });
    } catch (error) {
      console.error("Error searching A-Leads by name:", error);
      return [];
    }
  }

  // Search for people by company name using A-Leads
  async searchPeopleByCompany(companyName: string, location?: { city?: string; state?: string }): Promise<ALeadsContact[]> {
    if (!this.aLeads) {
      console.warn("A-Leads provider not configured");
      return [];
    }
    
    try {
      const locationStr = location ? `${location.city || ""}, ${location.state || ""}`.trim() : undefined;
      console.log(`[A-Leads] Searching for people at company: "${companyName}" location: "${locationStr}"`);
      return await this.aLeads.searchContacts({ company: companyName, location: locationStr });
    } catch (error) {
      console.error(`A-Leads company search error:`, error);
      return [];
    }
  }

  async fetchMelissaEnrichment(input: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    email?: string;
  }): Promise<MelissaEnrichmentResult | null> {
    if (!this.melissa) {
      console.warn("Melissa provider not configured");
      return null;
    }

    try {
      const result: MelissaEnrichmentResult = {
        nameMatch: null,
        addressMatch: null,
        phoneMatches: [],
        occupancy: null,
        moveHistory: [],
        demographics: null,
        lastUpdated: new Date().toISOString(),
      };

      const personatorResult = await this.melissa.lookupPersonator({
        fullName: input.name,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        email: input.email,
        phone: input.phone,
      });

      if (personatorResult) {
        const firstName = personatorResult.name.first?.trim() || "";
        const lastName = personatorResult.name.last?.trim() || "";
        
        if (firstName || lastName) {
          result.nameMatch = {
            verified: true,
            standardizedName: {
              first: firstName,
              last: lastName,
              full: `${firstName} ${lastName}`.trim(),
            },
            confidence: 85,
          };
        }

        const addressLine = personatorResult.address.line1?.trim() || "";
        if (addressLine) {
          result.addressMatch = {
            verified: true,
            standardizedAddress: {
              line1: addressLine,
              city: personatorResult.address.city?.trim() || "",
              state: personatorResult.address.state?.trim() || "",
              zip: personatorResult.address.zip?.trim() || "",
              plus4: personatorResult.address.plus4?.trim() || "",
              county: personatorResult.address.county?.trim() || "",
            },
            deliverability: "verified",
            residenceType: "unknown",
            confidence: 90,
          };
        }

        const phoneNum = personatorResult.phone?.trim() || "";
        if (phoneNum) {
          result.phoneMatches.push({
            phone: phoneNum,
            type: "landline",
            lineType: "standard",
            verified: true,
            confidence: 85,
          });
        }

        if (personatorResult.gender) {
          result.demographics = {
            gender: personatorResult.gender,
          };
        }
      }

      if (input.address) {
        const addressResult = await this.melissa.verifyAddress({
          line1: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
        });

        if (addressResult && !result.addressMatch) {
          result.addressMatch = {
            verified: addressResult.verified,
            standardizedAddress: addressResult.standardizedAddress,
            deliverability: addressResult.deliverability,
            residenceType: "unknown",
            confidence: addressResult.verified ? 90 : 50,
          };
        }

        if (addressResult?.verified && input.address) {
          result.moveHistory.push({
            address: addressResult.standardizedAddress.line1 + ", " + 
                     addressResult.standardizedAddress.city + ", " + 
                     addressResult.standardizedAddress.state + " " + 
                     addressResult.standardizedAddress.zip,
            type: "current",
          });
        }
      }

      return result;
    } catch (error) {
      console.error("Error fetching Melissa enrichment:", error);
      return null;
    }
  }

  async enrichContactWithPacificEast(params: {
    firstName?: string;
    lastName: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<PacificEast.EnrichedContactData | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.enrichContactFull(params);
    } catch (error) {
      console.error("Error with Pacific East enrichment:", error);
      return null;
    }
  }

  async enrichBusinessWithPacificEast(params: {
    businessName: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<PacificEast.EnrichedContactData | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.enrichBusinessContact(params);
    } catch (error) {
      console.error("Error with Pacific East business enrichment:", error);
      return null;
    }
  }

  async validateEmailWithPacificEast(email: string): Promise<PacificEast.EmailValidationResult | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.validateEmail(email);
    } catch (error) {
      console.error("Error with Pacific East email validation:", error);
      return null;
    }
  }

  async searchDataPrime(params: {
    firstName?: string;
    lastName: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }): Promise<PacificEast.DataPrimeResult | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.searchDataPrime(params);
    } catch (error) {
      console.error("Error with DataPrime search:", error);
      return null;
    }
  }

  async appendPhoneWithPacificEast(params: {
    firstName?: string;
    lastName?: string;
    businessName?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }): Promise<PacificEast.PhoneAppendResult | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.appendPhone(params);
    } catch (error) {
      console.error("Error with Pacific East phone append:", error);
      return null;
    }
  }

  async appendEmailWithPacificEast(params: {
    firstName?: string;
    lastName: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }): Promise<PacificEast.EmailAppendResult | null> {
    if (!this.pacificEastEnabled) {
      console.warn("Pacific East provider not enabled");
      return null;
    }

    try {
      return await PacificEast.appendEmail(params);
    } catch (error) {
      console.error("Error with Pacific East email append:", error);
      return null;
    }
  }
}

export const dataProviders = new DataProviderManager();
