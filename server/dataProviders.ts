import pLimit from "p-limit";
import pRetry from "p-retry";

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
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
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
  source: string;
  confidence: number;
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
            throw new Error(`ATTOM API error: ${response.status}`);
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  async searchByAddress(address: string): Promise<AttomPropertyData | null> {
    try {
      const data = await this.request<any>("/propertyapi/v1.0.0/property/basicprofile", {
        address,
      });

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

  async searchCompanies(query: string, jurisdiction?: string): Promise<OpenCorporatesCompany[]> {
    try {
      const params: Record<string, string> = { q: query, per_page: "30" };
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

      if (!company) return null;

      return {
        companyNumber: company.company_number || "",
        name: company.name || "",
        jurisdictionCode: company.jurisdiction_code || "",
        incorporationDate: company.incorporation_date || "",
        companyType: company.company_type || "",
        currentStatus: company.current_status || "",
        registeredAddress: company.registered_address_in_full,
        officers: (company.officers || []).map((o: any) => ({
          name: o.officer?.name || "",
          position: o.officer?.position || "",
          startDate: o.officer?.start_date,
        })),
        filings: (company.filings || []).map((f: any) => ({
          title: f.filing?.title || "",
          date: f.filing?.date || "",
          url: f.filing?.url,
        })),
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
}

export class DataAxleProvider {
  private apiToken: string;
  private baseUrl = "https://api.data-axle.com/v1";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
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
              "X-AUTH-TOKEN": this.apiToken,
            },
          });

          if (!response.ok) {
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

  async searchBusinesses(query: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxleContact[]> {
    try {
      const params: Record<string, string> = {
        query,
        packages: "standard_v1",
        limit: "25",
      };

      if (location?.city) params.city = location.city;
      if (location?.state) params.state = location.state;
      if (location?.zip) params.postal_code = location.zip;

      const data = await this.request<any>("/places/search", params);

      return (data.documents || []).map((doc: any) => ({
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        email: doc.email,
        phone: doc.phone,
        title: doc.title,
        company: doc.name,
        address: doc.street,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code,
        confidenceScore: doc.confidence_score || 80,
      }));
    } catch (error) {
      console.error("Data Axle search error:", error);
      return [];
    }
  }

  async searchPeople(name: string, location?: { city?: string; state?: string; zip?: string }): Promise<DataAxleContact[]> {
    try {
      const params: Record<string, string> = {
        query: name,
        packages: "standard_v1",
        limit: "25",
      };

      if (location?.city) params.city = location.city;
      if (location?.state) params.state = location.state;
      if (location?.zip) params.postal_code = location.zip;

      const data = await this.request<any>("/people/search", params);

      return (data.documents || []).map((doc: any) => ({
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        email: doc.email,
        phone: doc.phone,
        title: doc.title,
        company: doc.employer_name,
        address: doc.street,
        city: doc.city,
        state: doc.state,
        zip: doc.postal_code,
        confidenceScore: doc.confidence_score || 75,
      }));
    } catch (error) {
      console.error("Data Axle people search error:", error);
      return [];
    }
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
        body: JSON.stringify({ match_input: matchData, packages: "standard_v1" }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const doc = data.document;

      if (!doc) return null;

      return {
        firstName: doc.first_name || "",
        lastName: doc.last_name || "",
        email: doc.email,
        phone: doc.phone,
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
      const params = new URLSearchParams({
        id: this.apiKey,
        format: "json",
        act: "Check,Verify,Append",
        ...(input.fullName && { full: input.fullName }),
        ...(input.address && { a1: input.address }),
        ...(input.city && { city: input.city }),
        ...(input.state && { state: input.state }),
        ...(input.zip && { postal: input.zip }),
        ...(input.email && { email: input.email }),
        ...(input.phone && { phone: input.phone }),
      });

      const response = await fetch(`https://personator.melissadata.net/v3/WEB/ContactVerify/doContactVerify?${params}`);

      if (!response.ok) return null;

      const data = await response.json();
      const record = data.Records?.[0];

      if (!record) return null;

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

export class ALeadsProvider {
  private apiKey: string;
  private baseUrl = "https://api.a-leads.co/v1";

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
              Authorization: `Bearer ${this.apiKey}`,
            },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error("Rate limited");
            }
            throw new Error(`A-Leads API error: ${response.status}`);
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  async searchContacts(query: { name?: string; company?: string; location?: string }): Promise<ALeadsContact[]> {
    try {
      const params: Record<string, string> = {};
      if (query.name) params.name = query.name;
      if (query.company) params.company = query.company;
      if (query.location) params.location = query.location;

      const data = await this.request<any>("/contacts/search", params);

      return (data.contacts || data.results || []).map((contact: any) => ({
        name: contact.name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
        email: contact.email,
        phone: contact.phone || contact.mobile,
        address: contact.address,
        source: "a-leads",
        confidence: contact.confidence || contact.score || 75,
      }));
    } catch (error) {
      console.error("A-Leads search error:", error);
      return [];
    }
  }

  async skipTrace(input: { name: string; address?: string; city?: string; state?: string; zip?: string }): Promise<ALeadsContact | null> {
    try {
      const response = await fetch(`${this.baseUrl}/skip-trace`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const contact = data.contact || data.result;

      if (!contact) return null;

      return {
        name: contact.name || input.name,
        email: contact.email,
        phone: contact.phone || contact.mobile,
        address: contact.address,
        source: "a-leads-skip-trace",
        confidence: contact.confidence || 80,
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

  constructor() {
    if (process.env.ATTOM_API_KEY) {
      this.attom = new AttomDataProvider(process.env.ATTOM_API_KEY);
    }
    if (process.env.OPENCORPORATES_API_KEY) {
      this.openCorporates = new OpenCorporatesProvider(process.env.OPENCORPORATES_API_KEY);
    }
    if (process.env.DATA_AXLE_API_KEY) {
      this.dataAxle = new DataAxleProvider(process.env.DATA_AXLE_API_KEY);
    }
    if (process.env.MELISSA_API_KEY) {
      this.melissa = new MelissaDataProvider(process.env.MELISSA_API_KEY);
    }
    if (process.env.ALEADS_API_KEY) {
      this.aLeads = new ALeadsProvider(process.env.ALEADS_API_KEY);
    }
  }

  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.attom) providers.push("attom");
    if (this.openCorporates) providers.push("opencorporates");
    if (this.dataAxle) providers.push("dataaxle");
    if (this.melissa) providers.push("melissa");
    if (this.aLeads) providers.push("aleads");
    return providers;
  }

  async searchPropertyByAddress(address: string): Promise<AttomPropertyData | null> {
    if (!this.attom) {
      console.warn("ATTOM provider not configured");
      return null;
    }
    return this.attom.searchByAddress(address);
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
    return this.openCorporates.getCompany(bestMatch.jurisdictionCode, bestMatch.companyNumber);
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
}

export const dataProviders = new DataProviderManager();
