import pLimit from "p-limit";
import pRetry from "p-retry";
import * as PacificEast from "./providers/PacificEastProvider";
import * as Perplexity from "./providers/PerplexityProvider";
import { OpenMartProvider, OpenMartBusiness, OpenMartSearchParams } from "./providers/OpenMartProvider";
import { ApifyStartupInvestorsProvider, InvestorProfile, ApifyInvestorSearchParams } from "./providers/ApifyStartupInvestorsProvider";
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
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  companyName?: string;
  title?: string;
  linkedinUrl?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  source: string;
  confidence: number;
  hasEmail?: boolean;
  hasPhone?: boolean;
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

// SEC EDGAR Provider - 100% FREE, no API key required
// Searches for 13F filers (family offices managing $100M+)
export interface SECEdgarFiler {
  cik: string;
  name: string;
  filingCount: number;
  latestFilingDate?: string;
  entityType?: string;
}

export class SECEdgarProvider {
  private baseUrl = "https://data.sec.gov";
  private userAgent = "FreyjaIQ admin@freyjafinancialgroup.net";

  // Search for ACTUAL family offices - not Fortune 500 companies
  // Family offices typically have explicit naming patterns and are private investment vehicles
  async searchFamilyOfficeFilers(searchTerms: string[] = ["family office"], limit: number = 500): Promise<SECEdgarFiler[]> {
    const results: SECEdgarFiler[] = [];
    
    try {
      console.log(`[SEC EDGAR] Searching for FAMILY OFFICES (limit: ${limit})`);
      
      // Use SEC company tickers which is freely available
      const tickersUrl = "https://www.sec.gov/files/company_tickers.json";
      
      const response = await fetch(tickersUrl, {
        headers: { "User-Agent": this.userAgent }
      });
      
      if (!response.ok) {
        console.error(`[SEC EDGAR] Failed to fetch company tickers: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      const companies = Object.values(data) as Array<{ cik_str: string; title: string; ticker?: string }>;
      
      console.log(`[SEC EDGAR] Loaded ${companies.length} total companies from SEC`);
      
      // TIER 1: HIGH-CONFIDENCE Family Office patterns (prioritize these)
      const familyOfficePatterns = [
        "family office", "family trust", "family capital", "family partners",
        "family investment", "family fund", "family wealth", "family foundation",
        "family holdings llc", "family holdings lp", "family holdings limited",
        " fo ", " f.o.", "sfo ", "mfo ", // Single/Multi-family office abbreviations
      ];
      
      // TIER 2: Investment firm patterns (secondary, more likely to be private)
      const investmentFirmPatterns = [
        "wealth management", "wealth advisors", "wealth partners", "private wealth",
        "capital advisors", "capital partners llc", "capital partners lp",
        "investment advisors", "investment advisers", "investment counsel",
        "asset management llc", "asset management lp",
        "private capital", "private investment", "private equity partners",
        "fiduciary", "trust company",
        ...searchTerms.map(t => t.toLowerCase())
      ];
      
      // BLOCKLIST: Fortune 500 / Major public companies to exclude
      // These have "Holdings", "Capital", "Management" but are NOT family offices
      const publicCompanyBlocklist = [
        // Tech giants
        "apple", "microsoft", "amazon", "alphabet", "google", "meta", "facebook",
        "nvidia", "tesla", "netflix", "paypal", "adobe", "salesforce", "oracle",
        "intel", "cisco", "ibm", "crowdstrike", "palo alto", "snowflake", "datadog",
        "arm holdings", "seagate", "western digital", "lumentum",
        // Finance giants (banks, not family offices)
        "jpmorgan", "bank of america", "wells fargo", "citigroup", "goldman sachs",
        "morgan stanley", "hsbc", "nomura", "northern trust", "lpl financial",
        "ubs", "credit suisse", "barclays", "deutsche bank",
        // Insurance
        "berkshire", "aig", "allstate", "progressive", "travelers", "chubb",
        "aflac", "prudential", "metlife", "equitable holdings", "arch capital",
        // Industrial
        "waste management", "republic services", "boeing", "lockheed", "raytheon",
        "caterpillar", "deere", "3m", "honeywell", "ge ", "general electric",
        "parker hannifin", "emerson", "rockwell", "siemens", "abb",
        // Consumer
        "coca-cola", "pepsi", "mcdonalds", "starbucks", "nike", "walmart",
        "target", "costco", "home depot", "lowes", "yum china", "yum brands",
        "hilton", "marriott", "booking holdings", "airbnb", "uber", "lyft",
        // Healthcare/Pharma
        "pfizer", "johnson & johnson", "merck", "abbvie", "bristol", "lilly",
        "amgen", "gilead", "biogen", "regeneron", "vertex", "moderna",
        "unitedhealth", "anthem", "cigna", "humana", "labcorp", "quest",
        "medpace", "iqvia", "zimmer biomet", "stryker", "medtronic",
        // Energy
        "exxon", "chevron", "shell", "bp", "conocophillips", "enterprise products",
        "energy transfer", "kinder morgan", "williams", "western midstream",
        "cheniere", "posco",
        // Retail/E-commerce
        "alibaba", "jd.com", "pdd holdings", "pinduoduo", "shopify", "mercadolibre",
        "grab holdings", "nu holdings", "ke holdings", "futu holdings",
        // Transportation
        "fedex", "ups", "delta", "united airlines", "southwest", "american airlines",
        "ryanair", "aercap", "viking holdings",
        // Media/Entertainment
        "disney", "comcast", "warner", "paramount", "fox", "tko group",
        // Real estate (large REITs, not family offices)
        "brookfield", "blackstone", "starwood", "prologis", "equinix",
        "digital realty", "crown castle", "american tower",
        // Telecom
        "at&t", "verizon", "t-mobile", "comcast",
        // Misc Fortune 500
        "fairfax financial", "vertiv", "ss&c technologies", "affirm",
        "capitec bank", "resona", "geely", "blue owl"
      ];
      
      // Helper to check if name matches blocklist
      const isBlockedCompany = (name: string): boolean => {
        const lower = name.toLowerCase();
        return publicCompanyBlocklist.some(blocked => lower.includes(blocked));
      };
      
      // First pass: Find TIER 1 (family office patterns)
      const tier1Results: SECEdgarFiler[] = [];
      const tier2Results: SECEdgarFiler[] = [];
      
      for (const company of companies) {
        const nameLower = company.title.toLowerCase();
        
        // Skip blocked public companies
        if (isBlockedCompany(nameLower)) continue;
        
        // Check TIER 1 patterns first
        if (familyOfficePatterns.some(pattern => nameLower.includes(pattern))) {
          tier1Results.push({
            cik: String(company.cik_str).padStart(10, "0"),
            name: company.title,
            filingCount: 0,
            entityType: "Family Office",
          });
        }
        // Then check TIER 2 patterns
        else if (investmentFirmPatterns.some(pattern => nameLower.includes(pattern))) {
          tier2Results.push({
            cik: String(company.cik_str).padStart(10, "0"),
            name: company.title,
            filingCount: 0,
            entityType: "Investment Advisor",
          });
        }
      }
      
      console.log(`[SEC EDGAR] Found ${tier1Results.length} family offices (TIER 1) and ${tier2Results.length} investment advisors (TIER 2)`);
      
      // Combine: prioritize TIER 1, then add TIER 2 up to limit
      results.push(...tier1Results.slice(0, limit));
      if (results.length < limit) {
        results.push(...tier2Results.slice(0, limit - results.length));
      }
      
      console.log(`[SEC EDGAR] Returning ${results.length} family office/investment advisor filers`);
      
    } catch (error) {
      console.error("[SEC EDGAR] Search error:", error);
    }
    
    return results;
  }

  // Get filings for a specific CIK
  async getCompanyFilings(cik: string): Promise<any> {
    try {
      const paddedCik = cik.padStart(10, "0");
      const url = `${this.baseUrl}/submissions/CIK${paddedCik}.json`;
      
      console.log(`[SEC EDGAR] Fetching filings for CIK ${paddedCik}`);
      
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent }
      });
      
      if (!response.ok) {
        console.error(`[SEC EDGAR] Failed to fetch filings: ${response.status}`);
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error("[SEC EDGAR] Filings fetch error:", error);
      return null;
    }
  }

  // Search all 13F filers using the bulk submissions data
  async search13FFilers(limit: number = 500): Promise<SECEdgarFiler[]> {
    const results: SECEdgarFiler[] = [];
    
    try {
      console.log(`[SEC EDGAR] Fetching 13F filers from SEC...`);
      
      // Use the SEC's full-text search API for 13F forms
      // This searches for recent 13F-HR filings and extracts filer info
      const searchUrl = "https://efts.sec.gov/LATEST/search-index?q=*&dateRange=custom&startdt=2024-01-01&enddt=2025-12-31&forms=13F-HR&size=200";
      
      const response = await fetch(searchUrl, {
        headers: { 
          "User-Agent": this.userAgent,
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        // Fallback: use company tickers and filter for investment-related names
        console.log(`[SEC EDGAR] Full-text search unavailable, using company tickers fallback`);
        return this.searchFamilyOfficeFilers([
          "family office", "capital partners", "capital management",
          "asset management", "wealth management", "investment management",
          "private equity", "venture capital", "holdings"
        ]);
      }
      
      const data = await response.json();
      const hits = data.hits?.hits || [];
      
      const seen = new Set<string>();
      for (const hit of hits) {
        const source = hit._source || {};
        const cik = source.ciks?.[0];
        const name = source.display_names?.[0] || source.entity_name;
        
        if (cik && name && !seen.has(cik)) {
          seen.add(cik);
          results.push({
            cik: String(cik).padStart(10, "0"),
            name,
            filingCount: 1,
            latestFilingDate: source.file_date,
            entityType: "13F Filer",
          });
        }
        
        if (results.length >= limit) break;
      }
      
      console.log(`[SEC EDGAR] Found ${results.length} unique 13F filers`);
      
    } catch (error) {
      console.error("[SEC EDGAR] 13F search error:", error);
      // Fallback to company tickers search
      return this.searchFamilyOfficeFilers([
        "family office", "capital", "investment", "wealth", "asset management"
      ]);
    }
    
    return results;
  }
}

export class ALeadsProvider {
  private apiKey: string;
  private baseUrl = "https://api.a-leads.co/gateway/v1/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Extract LinkedIn username from URL
  private extractLinkedInUsername(linkedinUrl: string | undefined): string | null {
    if (!linkedinUrl) return null;
    // Handle formats: linkedin.com/in/username, www.linkedin.com/in/username, https://linkedin.com/in/username
    const match = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    return match ? match[1] : null;
  }

  // Reveal email using LinkedIn username via find-email/personal endpoint
  async revealEmail(linkedinUsername: string): Promise<string | null> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return null;
    }

    try {
      console.log(`[A-Leads] Revealing email for LinkedIn: ${linkedinUsername}`);
      
      const response = await fetch(`${this.baseUrl}/find-email/personal`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          data: {
            linkedin_username: linkedinUsername,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[A-Leads] Email reveal error (${response.status}):`, errorText.slice(0, 200));
        return null;
      }

      const result = await response.json();
      // Only count as API call if email was found (per docs: credits only deducted on success)
      const email = result?.data?.personal_email || null;
      if (email) {
        apiUsageTracker.recordRequest("aleads", 1);
        console.log(`[A-Leads] Found email for ${linkedinUsername}: ${email}`);
      } else {
        console.log(`[A-Leads] No email found for ${linkedinUsername}`);
      }
      return email;
    } catch (error: any) {
      console.error(`[A-Leads] Email reveal error:`, error?.message || error);
      return null;
    }
  }

  // Reveal phone using LinkedIn username via find-phone endpoint
  async revealPhone(linkedinUsername: string): Promise<string | null> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return null;
    }

    try {
      console.log(`[A-Leads] Revealing phone for LinkedIn: ${linkedinUsername}`);
      
      const response = await fetch(`${this.baseUrl}/find-phone`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          data: {
            linkedin_username: linkedinUsername,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[A-Leads] Phone reveal error (${response.status}):`, errorText.slice(0, 200));
        return null;
      }

      const result = await response.json();
      // Try multiple possible phone field names from A-Leads response
      const phone = result?.data?.phone || result?.data?.mobile_phone || result?.data?.personal_phone || result?.data?.phone_number || null;
      if (phone) {
        apiUsageTracker.recordRequest("aleads", 1);
        console.log(`[A-Leads] Found phone for ${linkedinUsername}: ${phone}`);
      } else {
        console.log(`[A-Leads] No phone found for ${linkedinUsername}, response:`, JSON.stringify(result).slice(0, 200));
      }
      return phone;
    } catch (error: any) {
      console.error(`[A-Leads] Phone reveal error:`, error?.message || error);
      return null;
    }
  }

  // Reveal email and phone for a contact with LinkedIn URL (used during enrichment phase)
  async revealContactInfo(contact: ALeadsContact): Promise<{ email?: string; phone?: string }> {
    const result: { email?: string; phone?: string } = {};
    
    if (!contact.linkedinUrl) {
      return result;
    }
    
    const linkedinUsername = this.extractLinkedInUsername(contact.linkedinUrl);
    if (!linkedinUsername) {
      return result;
    }
    
    // Reveal email and phone in parallel for speed
    const promises: Promise<void>[] = [];
    
    if (!contact.email && contact.hasEmail) {
      promises.push(
        this.revealEmail(linkedinUsername).then(email => {
          if (email) result.email = email;
        })
      );
    }
    
    if (!contact.phone && contact.hasPhone) {
      promises.push(
        this.revealPhone(linkedinUsername).then(phone => {
          if (phone) result.phone = phone;
        })
      );
    }
    
    await Promise.all(promises);
    return result;
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

  // Search for contacts at a company - fetch all people, filter decision-makers client-side
  // Uses multiple name variants for better matching with SEC EDGAR company names
  // Uses SIC code filtering ("67" = Holding and Investment Offices) to improve precision
  async searchContactsWithTitles(companyName: string, titles: string[], location?: string): Promise<ALeadsContact[]> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      // Generate multiple company name variants for better matching
      // SEC EDGAR names often have legal suffixes that A-Leads may not have
      const nameVariants = this.generateCompanyNameVariants(companyName);
      console.log(`[A-Leads] Searching for people at "${companyName}" using ${nameVariants.length} variants...`);
      
      // Decision-maker keywords for filtering
      const decisionMakerKeywords = [
        "ceo", "chief executive", "president", "founder", "owner",
        "managing director", "managing partner", "principal", "partner",
        "cio", "chief investment", "director", "cfo", "chief financial",
        "vp", "vice president", "head of", "executive"
      ];
      const titlesLower = titles.map(t => t.toLowerCase());
      
      let filteredResults: any[] = [];
      const seenIds = new Set<string>();
      
      // Try each variant until we find DECISION MAKERS (not just any contacts)
      // Start WITHOUT SIC filtering for broader coverage, since investment firms
      // may register under various codes (65 real estate, 67 investment offices, etc.)
      console.log(`[A-Leads] Will try up to ${Math.min(nameVariants.length, 3)} variants for "${companyName}"`);
      
      for (const variant of nameVariants.slice(0, 3)) {
        // Search by company name WITHOUT SIC filtering for broader coverage
        const advancedFilters: Record<string, any> = {
          company_name: variant,
        };

        const requestBody = {
          advanced_filters: advancedFilters,
          current_page: 1,
          search_type: "total",
        };

        console.log(`[A-Leads] Trying variant: "${variant}" (current decision-makers: ${filteredResults.length})`);

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
          console.error(`[A-Leads] Error response (${response.status}):`, errorText.slice(0, 200));
          continue;
        }

        const data = await response.json();
        const results = data.data || [];
        apiUsageTracker.recordRequest("aleads", 1);
        
        const beforeCount = filteredResults.length;
        this.processALeadsResults(results, seenIds, filteredResults, titlesLower, decisionMakerKeywords, variant);
        const addedCount = filteredResults.length - beforeCount;
        
        console.log(`[A-Leads] Variant "${variant}": ${results.length} raw -> ${addedCount} new decision-makers (total: ${filteredResults.length})`);
        
        // OPTIMIZATION: Stop at 2 decision-makers for faster bulk processing
        // Full enrichment can be done on individual companies later
        if (filteredResults.length >= 2) {
          console.log(`[A-Leads] Found ${filteredResults.length} decision-makers, stopping early for speed`);
          break;
        }
      }
      
      console.log(`[A-Leads] Final: ${filteredResults.length} decision-makers for "${companyName}"`);

      return filteredResults.map((contact: any) => ({
        name: contact.member_full_name || `${contact.member_name_first || ""} ${contact.member_name_last || ""}`.trim(),
        email: contact.email,
        phone: contact.phone_number_available ? "Available" : undefined,
        address: contact.member_location_raw_address || contact.hq_full_address,
        company: contact.company_name,
        title: contact.job_title,
        linkedinUrl: contact.member_linkedin_url,
        source: "a-leads",
        confidence: 80,
      }));
    } catch (error: any) {
      console.error("[A-Leads] Company search error:", error?.message || error);
      return [];
    }
  }
  
  // Helper to process and filter A-Leads results
  private processALeadsResults(
    results: any[], 
    seenIds: Set<string>, 
    filteredResults: any[],
    titlesLower: string[],
    decisionMakerKeywords: string[],
    variant: string
  ): void {
    let newDecisionMakers = 0;
    
    for (const r of results) {
      const id = r.member_linkedin_url || `${r.member_name_first}_${r.member_name_last}_${r.company_name}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      
      // Filter for decision-makers immediately
      const jobTitle = (r.job_title || "").toLowerCase();
      if (!jobTitle) continue;
      
      const isDecisionMaker = titlesLower.some(t => jobTitle.includes(t)) ||
                              decisionMakerKeywords.some(kw => jobTitle.includes(kw));
      
      if (isDecisionMaker) {
        filteredResults.push(r);
        newDecisionMakers++;
      }
    }
    
    console.log(`[A-Leads] Variant "${variant}": ${results.length} raw results, ${newDecisionMakers} new decision-makers (total: ${filteredResults.length})`);
  }
  
  // Generate company name variants for better API matching
  // SEC EDGAR names like "Capri Holdings Ltd" may be in A-Leads as "Capri Holdings" or "Capri"
  private generateCompanyNameVariants(name: string): string[] {
    const variants: string[] = [];
    
    // 1. Original name
    variants.push(name);
    
    // 2. Remove legal suffixes (LLC, Ltd, Inc, etc.)
    const withoutSuffixes = name
      .replace(/\b(LLC|L\.L\.C\.|LP|L\.P\.|LLP|L\.L\.P\.|Inc\.?|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|NA|N\.A\.|PLC|P\.L\.C\.)\b/gi, "")
      .replace(/[,.\-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (withoutSuffixes && withoutSuffixes !== name) {
      variants.push(withoutSuffixes);
    }
    
    // 3. Remove common investment suffixes for broader match
    const coreName = withoutSuffixes
      .replace(/\b(Capital|Partners|Advisors|Management|Investments|Holdings|Group|Associates|Wealth|Asset|Fund)\b$/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (coreName && coreName !== withoutSuffixes && coreName.length > 3) {
      variants.push(coreName);
    }
    
    // 4. First word only (for very unique company names)
    const firstWord = name.split(/\s+/)[0];
    if (firstWord && firstWord.length > 3 && !variants.includes(firstWord)) {
      // Only add if first word is substantial and not a common word
      const commonWords = ["the", "and", "for", "new", "first", "old", "big"];
      if (!commonWords.includes(firstWord.toLowerCase())) {
        variants.push(firstWord);
      }
    }
    
    return variants;
  }

  // NEW: Direct family office discovery via industry/title filters
  // This is THE SIMPLE APPROACH - one call returns decision-makers with contacts
  async searchFamilyOfficeDecisionMakers(options: {
    titles?: string[];
    industries?: string[];
    countryCodes?: string[];
    limit?: number;
  } = {}): Promise<ALeadsContact[]> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return [];
    }

    try {
      // IMPORTANT: These values must match A-Leads exact filter values (lowercase)
      // See: https://storage.a-leads.co/public/filters/filter_possible_values.json
      const {
        titles = ["CEO", "Founder", "Managing Director", "Managing Partner", "Principal", "President"],
        industries = [
          "investment management",
          "venture capital and private equity principals",
          "capital markets",
          "investment banking"
        ],
        countryCodes = ["United States"],
        limit = 100
      } = options;

      console.log(`[A-Leads] Searching family office decision-makers...`);
      console.log(`[A-Leads] Titles: ${titles.join(", ")}`);
      console.log(`[A-Leads] Industries: ${industries.join(", ")}`);
      console.log(`[A-Leads] Countries: ${countryCodes.join(", ")}`);

      const requestBody: any = {
        advanced_filters: {
          job_title: titles,
          industry: industries,
        },
        page_size: limit,
      };
      
      // Add country filter if specified
      if (countryCodes.length > 0) {
        requestBody.advanced_filters.member_location_country = countryCodes;
      }

      console.log(`[A-Leads] Request: POST ${this.baseUrl}/advanced-search`);
      console.log(`[A-Leads] Body:`, JSON.stringify(requestBody, null, 2));

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
        console.error(`[A-Leads] Error (${response.status}):`, errorText.slice(0, 500));
        return [];
      }

      const data = await response.json();
      const results = data.data || [];
      apiUsageTracker.recordRequest("aleads", results.length || 1);
      
      console.log(`[A-Leads] SUCCESS: Found ${results.length} family office decision-makers`);

      // Log a sample result with ALL fields to understand the API response structure
      if (results.length > 0) {
        const sample = results[0];
        console.log(`[A-Leads] Sample result (full structure):`, JSON.stringify(sample, null, 2));
      }

      // Map results - NO reveals during search (deferred to enrichment phase for speed)
      // Store LinkedIn info for later reveal via revealContactInfo() method
      const mappedContacts: ALeadsContact[] = results.map((contact: any) => {
        // Try multiple possible email fields from A-Leads response
        const email = contact.email || contact.member_email || contact.personal_email || contact.work_email || null;
        const linkedinUrl = contact.member_linkedin_url;
        const hasPhoneFlag = contact.phone_number_available === true || contact.phone_number_available === "true";
        const phone = contact.phone || contact.phone_number || contact.member_phone || contact.mobile_phone || null;
        
        return {
          name: contact.member_full_name || `${contact.member_name_first || ""} ${contact.member_name_last || ""}`.trim(),
          firstName: contact.member_name_first,
          lastName: contact.member_name_last,
          email: email,
          phone: phone,
          address: contact.member_location_raw_address || contact.hq_full_address,
          company: contact.company_name,
          companyName: contact.company_name,
          title: contact.job_title,
          linkedinUrl: linkedinUrl,
          location: contact.member_location_raw_address || contact.hq_location,
          industry: contact.industry,
          companySize: contact.size_range || (contact.company_headcount ? `${contact.company_headcount} employees` : undefined),
          source: "a-leads" as const,
          confidence: 85,
          hasEmail: !!email || contact.email_found === true,
          hasPhone: !!phone || hasPhoneFlag,
        };
      });
      
      const withEmail = mappedContacts.filter(c => c.email).length;
      const withPhone = mappedContacts.filter(c => c.phone).length;
      const canRevealEmail = mappedContacts.filter(c => !c.email && c.linkedinUrl).length;
      const canRevealPhone = mappedContacts.filter(c => !c.phone && c.hasPhone && c.linkedinUrl).length;
      console.log(`[A-Leads] Results: ${withEmail} with email, ${withPhone} with phone | Revealable: ${canRevealEmail} emails, ${canRevealPhone} phones`);
      
      return mappedContacts;
    } catch (error: any) {
      console.error("[A-Leads] Family office search error:", error?.message || error);
      return [];
    }
  }

  async skipTrace(input: { name: string; address?: string; city?: string; state?: string; zip?: string }): Promise<ALeadsContact | null> {
    const check = apiUsageTracker.canMakeRequest("aleads");
    if (!check.allowed) {
      console.error(`[A-LEADS BLOCKED] ${check.reason}`);
      return null;
    }

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
      apiUsageTracker.recordRequest("aleads", results.length || 1);
      
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
  private secEdgar: SECEdgarProvider;  // Always available - FREE, no API key
  private pacificEastEnabled: boolean = false;
  private openMart?: OpenMartProvider;
  private apifyInvestors?: ApifyStartupInvestorsProvider;

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
    // SEC EDGAR is always available - FREE, no API key required
    this.secEdgar = new SECEdgarProvider();
    console.log("✓ SEC EDGAR provider initialized (FREE - 13F filers)");
    // Pacific East is always enabled (uses hardcoded dev key or env var)
    this.pacificEastEnabled = true;
    console.log("✓ Pacific East provider initialized (DataPrime, FPA, EMA, EMV)");
    // OpenMart - Business leads with decision-maker contacts
    if (process.env.OPENMART_API_KEY) {
      this.openMart = new OpenMartProvider(process.env.OPENMART_API_KEY);
      console.log("✓ OpenMart provider initialized (Business leads discovery)");
    }
    // Apify Startup Investors - Investor profiles with contact info
    if (process.env.APIFY_API_TOKEN) {
      this.apifyInvestors = new ApifyStartupInvestorsProvider(process.env.APIFY_API_TOKEN);
      console.log("✓ Apify Startup Investors provider initialized (9,312+ investor profiles)");
    }
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
    if (this.secEdgar) providers.push("secedgar");
    if (this.pacificEastEnabled) providers.push("pacificeast");
    if (this.openMart) providers.push("openmart");
    if (this.apifyInvestors) providers.push("apifyinvestors");
    return providers;
  }

  // SEC EDGAR - FREE family office/13F filer search
  async searchSECFamilyOffices(searchTerms?: string[], limit?: number): Promise<SECEdgarFiler[]> {
    return this.secEdgar.searchFamilyOfficeFilers(searchTerms, limit);
  }

  async searchSEC13FFilers(limit?: number): Promise<SECEdgarFiler[]> {
    return this.secEdgar.search13FFilers(limit);
  }

  async getSECCompanyFilings(cik: string): Promise<any> {
    return this.secEdgar.getCompanyFilings(cik);
  }

  // A-LEADS: Direct family office discovery (THE SIMPLE APPROACH)
  // One API call returns decision-makers with their contact info and company details
  async searchFamilyOfficeDecisionMakers(options?: {
    titles?: string[];
    industries?: string[];
    countryCodes?: string[];
    limit?: number;
  }): Promise<ALeadsContact[]> {
    if (!this.aLeads) {
      console.warn("A-Leads provider not configured");
      return [];
    }
    return this.aLeads.searchFamilyOfficeDecisionMakers(options);
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

  /**
   * Smart person lookup - prioritizes Apify (cheaper) over Data Axle
   * Only falls back to Data Axle if Apify returns no results or for high-value targets
   */
  async searchPersonSmart(
    name: string,
    location?: { address?: string; city?: string; state?: string; zip?: string },
    options?: { requireEmail?: boolean; highValue?: boolean }
  ): Promise<DataAxlePerson[]> {
    const results: DataAxlePerson[] = [];
    const apifyApiToken = process.env.APIFY_API_TOKEN;

    // Try Apify skip trace first (cheaper/free)
    if (apifyApiToken) {
      try {
        console.log(`[SMART LOOKUP] Trying Apify first for: ${name}`);
        const ApifySkipTrace = await import("./providers/ApifySkipTraceProvider");
        const apifyResult = await ApifySkipTrace.skipTraceIndividual(
          name,
          location?.address || "",
          location?.city || "",
          location?.state || ""
        );

        if (apifyResult && (apifyResult.phones.length > 0 || apifyResult.emails.length > 0)) {
          console.log(`[SMART LOOKUP] Apify returned data for: ${name}`);
          results.push({
            firstName: apifyResult.firstName || name.split(" ")[0] || "",
            lastName: apifyResult.lastName || name.split(" ").slice(1).join(" ") || "",
            emails: apifyResult.emails.map(e => e.email),
            phones: apifyResult.phones.map(p => p.number),
            cellPhones: apifyResult.phones.filter(p => p.type === "Wireless").map(p => p.number),
            title: undefined,
            company: undefined,
            address: apifyResult.currentAddress?.streetAddress,
            city: apifyResult.currentAddress?.city,
            state: apifyResult.currentAddress?.state,
            zip: apifyResult.currentAddress?.postalCode,
            infousa_id: undefined,
            confidenceScore: 85,
          });

          // If we have enough data (email or phone), skip Data Axle
          const hasEmail = apifyResult.emails.length > 0;
          const hasPhone = apifyResult.phones.length > 0;
          
          if (hasEmail || (hasPhone && !options?.requireEmail)) {
            console.log(`[SMART LOOKUP] Using Apify result, skipping Data Axle`);
            return results;
          }
        }
      } catch (error) {
        console.error(`[SMART LOOKUP] Apify error for ${name}:`, error);
      }
    }

    // Fall back to Data Axle only for high-value targets or if Apify failed
    if (options?.highValue || results.length === 0) {
      if (this.dataAxle) {
        console.log(`[SMART LOOKUP] Falling back to Data Axle for: ${name}`);
        const dataAxleResults = await this.dataAxle.searchPeopleV2(name, location);
        results.push(...dataAxleResults);
      }
    }

    return results;
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

  // Search for people associated with LLC officers (using smart lookup - Apify first, then Data Axle)
  async findOfficerContacts(officers: Array<{ name: string; position?: string }>, location?: { state?: string }): Promise<Array<{
    officer: { name: string; position?: string };
    contacts: DataAxlePerson[];
  }>> {
    const results: Array<{ officer: { name: string; position?: string }; contacts: DataAxlePerson[] }> = [];
    
    // Filter out corporate entities (registered agents) - only search for real people
    const corporatePatterns = /\b(COMPANY|CORP|INC|LLC|TRUST|NETWORK|SERVICE|SERVICES|CORPORATION|REGISTERED|AGENT)\b/i;
    const realPeopleOfficers = officers.filter(o => !corporatePatterns.test(o.name));

    for (const officer of realPeopleOfficers) {
      try {
        console.log(`[OFFICER LOOKUP] Searching for officer: ${officer.name}`);
        // Use smart lookup (Apify first, Data Axle fallback)
        const people = await this.searchPersonSmart(officer.name, { state: location?.state });
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

  // Search for decision-makers by company name using A-Leads
  // Must specify titles because A-Leads needs filters beyond just company name
  async searchPeopleByCompany(companyName: string, location?: { city?: string; state?: string }): Promise<ALeadsContact[]> {
    if (!this.aLeads) {
      console.warn("A-Leads provider not configured");
      return [];
    }
    
    try {
      const locationStr = location ? `${location.city || ""}, ${location.state || ""}`.trim() : undefined;
      console.log(`[A-Leads] Searching for decision-makers at company: "${companyName}" location: "${locationStr}"`);
      
      // A-Leads needs title filters to find people at a company - just company name doesn't work
      // Search for common decision-maker titles
      const decisionMakerTitles = [
        "CEO", "Chief Executive", "President", "Founder", "Owner",
        "Managing Director", "Managing Partner", "Principal", "Partner",
        "CIO", "Chief Investment", "Director", "CFO", "Chief Financial"
      ];
      
      return await this.aLeads.searchContactsWithTitles(companyName, decisionMakerTitles, locationStr);
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

  // OpenMart - Business leads discovery with decision-maker contacts
  async searchOpenMartBusinesses(params: OpenMartSearchParams): Promise<OpenMartBusiness[]> {
    if (!this.openMart) {
      console.warn("OpenMart provider not configured");
      return [];
    }

    try {
      const response = await this.openMart.searchBusinesses(params);
      return response.businesses;
    } catch (error) {
      console.error("Error searching OpenMart:", error);
      return [];
    }
  }

  async searchOpenMartFamilyOffices(location?: string, limit: number = 100): Promise<OpenMartBusiness[]> {
    if (!this.openMart) {
      console.warn("OpenMart provider not configured");
      return [];
    }

    try {
      return await this.openMart.searchFamilyOffices(location, limit);
    } catch (error) {
      console.error("Error searching OpenMart family offices:", error);
      return [];
    }
  }

  async searchOpenMartInvestmentFirms(location?: string, limit: number = 100): Promise<OpenMartBusiness[]> {
    if (!this.openMart) {
      console.warn("OpenMart provider not configured");
      return [];
    }

    try {
      return await this.openMart.searchInvestmentFirms(location, limit);
    } catch (error) {
      console.error("Error searching OpenMart investment firms:", error);
      return [];
    }
  }

  extractOpenMartDecisionMakers(business: OpenMartBusiness): Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    company: string;
  }> {
    if (!this.openMart) {
      return [];
    }
    return this.openMart.extractDecisionMakers(business);
  }

  // Apify Startup Investors - Investor profiles with contact info
  async searchApifyInvestors(params: ApifyInvestorSearchParams): Promise<InvestorProfile[]> {
    if (!this.apifyInvestors) {
      console.warn("Apify Startup Investors provider not configured");
      return [];
    }

    try {
      return await this.apifyInvestors.searchInvestors(params);
    } catch (error) {
      console.error("Error searching Apify Investors:", error);
      return [];
    }
  }

  async searchApifyFamilyOfficeInvestors(location?: string, limit: number = 100): Promise<InvestorProfile[]> {
    if (!this.apifyInvestors) {
      console.warn("Apify Startup Investors provider not configured");
      return [];
    }

    try {
      return await this.apifyInvestors.searchFamilyOfficeInvestors(location, limit);
    } catch (error) {
      console.error("Error searching Apify family office investors:", error);
      return [];
    }
  }

  async searchApifyRealEstateInvestors(location?: string, limit: number = 100): Promise<InvestorProfile[]> {
    if (!this.apifyInvestors) {
      console.warn("Apify Startup Investors provider not configured");
      return [];
    }

    try {
      return await this.apifyInvestors.searchRealEstateInvestors(location, limit);
    } catch (error) {
      console.error("Error searching Apify real estate investors:", error);
      return [];
    }
  }

  async searchApifyInvestorByName(name: string): Promise<InvestorProfile | null> {
    if (!this.apifyInvestors) {
      console.warn("Apify Startup Investors provider not configured");
      return null;
    }

    try {
      return await this.apifyInvestors.searchByInvestorName(name);
    } catch (error) {
      console.error("Error searching Apify investor by name:", error);
      return null;
    }
  }

  async searchApifyInvestorsByFirm(firmName: string, limit: number = 10): Promise<InvestorProfile[]> {
    if (!this.apifyInvestors) {
      console.warn("Apify Startup Investors provider not configured");
      return [];
    }

    try {
      return await this.apifyInvestors.searchByFirmName(firmName, limit);
    } catch (error) {
      console.error("Error searching Apify investors by firm:", error);
      return [];
    }
  }
}

export const dataProviders = new DataProviderManager();

// Re-export types for use in other modules
export type { OpenMartBusiness, OpenMartSearchParams } from "./providers/OpenMartProvider";
export type { InvestorProfile, ApifyInvestorSearchParams } from "./providers/ApifyStartupInvestorsProvider";
