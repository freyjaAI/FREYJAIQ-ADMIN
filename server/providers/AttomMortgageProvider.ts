/**
 * ATTOM Mortgage Provider
 * 
 * Fetches mortgage/lien data from ATTOM API with caching and cost tracking.
 * Uses the property/detailmortgage endpoint for comprehensive mortgage information.
 */

import pLimit from "p-limit";
import pRetry from "p-retry";
import { parseFromDescription, toAttomSplitQuery, isValidForSearch } from "../addressNormalizer";
import { apiUsageTracker } from "../apiUsageTracker";
import { getCachedResult, setCachedResult, generateCacheKey, CachePrefix } from "../cacheService";
import { trackProviderCall, trackProviderError, getProviderPricing } from "../providerConfig";

const ATTOM_BASE_URL = "https://api.gateway.attomdata.com";
const limit = pLimit(2);

const MORTGAGE_CACHE_TTL = 30 * 24 * 60 * 60;

export interface MortgageRecord {
  loanAmount: number;
  interestRate?: number;
  interestRateType?: "Fixed" | "ARM" | "Variable" | string;
  lenderName?: string;
  lenderFullName?: string;
  loanType?: string;
  loanTypeCode?: string;
  loanPurpose?: string;
  originationDate?: string;
  recordingDate?: string;
  maturityDate?: string;
  dueDate?: string;
  termMonths?: number;
  loanPosition?: "First" | "Second" | "Third" | string;
  documentNumber?: string;
  isRefinance?: boolean;
}

export interface AttomMortgageResult {
  attomId?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
  };
  propertyType?: string;
  propertyUse?: string;
  currentMortgage?: MortgageRecord;
  mortgageHistory?: MortgageRecord[];
  rawResponse?: any;
}

export class AttomMortgageProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ATTOM_API_KEY || "";
    if (!this.apiKey) {
      console.warn("[AttomMortgage] No ATTOM_API_KEY configured");
    }
  }

  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      throw new Error("ATTOM API key not configured");
    }

    const url = new URL(`${ATTOM_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
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
            const errorBody = await response.text();
            console.error(`[AttomMortgage] API error: ${response.status} - ${errorBody}`);
            const apiError = new Error(`ATTOM API error: ${response.status} - ${errorBody}`);
            trackProviderError("attom", apiError);
            throw apiError;
          }

          return response.json();
        },
        { retries: 3 }
      )
    );
  }

  private parseMortgageFromResponse(mortgageData: any, saleData?: any): MortgageRecord {
    const lenderName = mortgageData.lender?.lastname ||
                       mortgageData.lender?.fullname ||
                       mortgageData.lenderName ||
                       mortgageData.lenderFullName;

    return {
      loanAmount: mortgageData.amount || 0,
      interestRate: mortgageData.interestrate || mortgageData.interestRate,
      interestRateType: mortgageData.interestratetype || mortgageData.interestRateType,
      lenderName: lenderName,
      lenderFullName: mortgageData.lender?.fullname || mortgageData.lenderFullName,
      loanType: mortgageData.loantypecode || mortgageData.loanType,
      loanTypeCode: mortgageData.loantypecode,
      loanPurpose: mortgageData.loanPurpose || this.inferLoanPurpose(mortgageData),
      originationDate: mortgageData.date || saleData?.saleTransDate,
      recordingDate: saleData?.saleRecDate || mortgageData.recordingDate,
      maturityDate: mortgageData.duedate || mortgageData.dueDate,
      dueDate: mortgageData.duedate || mortgageData.dueDate,
      termMonths: mortgageData.term,
      loanPosition: this.determineLoanPosition(mortgageData),
      documentNumber: saleData?.documentNumber || mortgageData.documentNumber,
      isRefinance: this.isRefinance(mortgageData, saleData),
    };
  }

  private inferLoanPurpose(mortgageData: any): string | undefined {
    const loanType = (mortgageData.loantypecode || "").toLowerCase();
    if (loanType.includes("refi") || loanType.includes("refinance")) {
      return "Refinance";
    }
    if (loanType.includes("purchase") || loanType.includes("acquisition")) {
      return "Purchase";
    }
    if (loanType.includes("equity") || loanType.includes("heloc")) {
      return "Home Equity";
    }
    if (loanType.includes("construction")) {
      return "Construction";
    }
    return undefined;
  }

  private determineLoanPosition(mortgageData: any): "First" | "Second" | "Third" | string {
    const position = mortgageData.loanPosition || mortgageData.mortgagePosition;
    if (position) return position;
    
    const loanType = (mortgageData.loantypecode || "").toLowerCase();
    if (loanType.includes("second") || loanType.includes("2nd") || loanType.includes("junior")) {
      return "Second";
    }
    if (loanType.includes("third") || loanType.includes("3rd")) {
      return "Third";
    }
    return "First";
  }

  private isRefinance(mortgageData: any, saleData?: any): boolean {
    const loanType = (mortgageData.loantypecode || "").toLowerCase();
    const loanPurpose = (mortgageData.loanPurpose || "").toLowerCase();
    
    return loanType.includes("refi") || 
           loanPurpose.includes("refi") ||
           loanType.includes("refinance") ||
           saleData?.saleType?.toLowerCase().includes("refi");
  }

  /**
   * Get mortgage data for a property by address
   * Returns structured mortgage data with caching (30-day TTL)
   */
  async getMortgageData(address: string): Promise<AttomMortgageResult | null> {
    if (!this.apiKey) {
      console.warn("[AttomMortgage] Provider not configured (no API key)");
      return null;
    }

    const cacheKey = generateCacheKey(CachePrefix.PROPERTY, "attom_mortgage_v2", address);
    const pricing = getProviderPricing("attom");
    const costPerCall = pricing?.costPerCall || 0.08;

    const cached = await getCachedResult<AttomMortgageResult>("attom_mortgage", cacheKey, costPerCall);
    if (cached) {
      return cached;
    }

    try {
      const parsed = parseFromDescription(address);
      let params: Record<string, string>;

      if (parsed && isValidForSearch(parsed)) {
        const split = toAttomSplitQuery(parsed);
        params = {
          address1: split.address1,
          address2: split.address2,
        };
      } else {
        params = { address1: address, address2: "" };
      }

      console.log(`[AttomMortgage] Fetching mortgage data for: ${address}`);
      
      const data = await this.request<any>("/propertyapi/v1.0.0/property/detailmortgage", params);

      apiUsageTracker.recordRequest("attom", 1);
      trackProviderCall("attom", false);

      if (!data.property?.[0]) {
        console.log("[AttomMortgage] No property found");
        await setCachedResult(cacheKey, null, MORTGAGE_CACHE_TTL);
        return null;
      }

      const prop = data.property[0];
      const mortgage = prop.mortgage;
      const sale = prop.sale;

      const result: AttomMortgageResult = {
        attomId: prop.identifier?.attomId?.toString(),
        address: {
          line1: prop.address?.line1 || prop.address?.oneLine || "",
          city: prop.address?.locality || "",
          state: prop.address?.countrySubd || "",
          zip: prop.address?.postal1 || "",
          county: prop.area?.countyName,
        },
        propertyType: prop.summary?.proptype || prop.summary?.propertyType,
        propertyUse: prop.summary?.propsubtype || prop.summary?.propertyUse,
        rawResponse: data,
      };

      if (mortgage) {
        result.currentMortgage = this.parseMortgageFromResponse(mortgage, sale);
        console.log(
          `[AttomMortgage] Found mortgage: $${result.currentMortgage.loanAmount}, ` +
          `rate: ${result.currentMortgage.interestRate || "N/A"}%, ` +
          `lender: ${result.currentMortgage.lenderName || "Unknown"}, ` +
          `recording: ${result.currentMortgage.recordingDate || "Unknown"}`
        );
      } else {
        console.log("[AttomMortgage] No mortgage data on property");
      }

      await setCachedResult(cacheKey, result, MORTGAGE_CACHE_TTL);

      return result;
    } catch (error) {
      console.error("[AttomMortgage] Error fetching mortgage data:", error);
      trackProviderError("attom", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Get mortgage data by ATTOM property ID
   */
  async getMortgageDataById(attomId: string): Promise<AttomMortgageResult | null> {
    if (!this.apiKey) {
      console.warn("[AttomMortgage] Provider not configured (no API key)");
      return null;
    }

    const cacheKey = generateCacheKey(CachePrefix.PROPERTY, "attom_mortgage_id_v2", attomId);
    const pricing = getProviderPricing("attom");
    const costPerCall = pricing?.costPerCall || 0.08;

    const cached = await getCachedResult<AttomMortgageResult>("attom_mortgage", cacheKey, costPerCall);
    if (cached) {
      return cached;
    }

    try {
      console.log(`[AttomMortgage] Fetching mortgage data by ID: ${attomId}`);
      
      const data = await this.request<any>("/propertyapi/v1.0.0/property/detailmortgage", {
        id: attomId,
      });

      apiUsageTracker.recordRequest("attom", 1);
      trackProviderCall("attom", false);

      if (!data.property?.[0]) {
        console.log("[AttomMortgage] No property found for ID");
        await setCachedResult(cacheKey, null, MORTGAGE_CACHE_TTL);
        return null;
      }

      const prop = data.property[0];
      const mortgage = prop.mortgage;
      const sale = prop.sale;

      const result: AttomMortgageResult = {
        attomId: prop.identifier?.attomId?.toString(),
        address: {
          line1: prop.address?.line1 || prop.address?.oneLine || "",
          city: prop.address?.locality || "",
          state: prop.address?.countrySubd || "",
          zip: prop.address?.postal1 || "",
          county: prop.area?.countyName,
        },
        propertyType: prop.summary?.proptype || prop.summary?.propertyType,
        propertyUse: prop.summary?.propsubtype || prop.summary?.propertyUse,
        rawResponse: data,
      };

      if (mortgage) {
        result.currentMortgage = this.parseMortgageFromResponse(mortgage, sale);
      }

      await setCachedResult(cacheKey, result, MORTGAGE_CACHE_TTL);

      return result;
    } catch (error) {
      console.error("[AttomMortgage] Error fetching mortgage data by ID:", error);
      trackProviderError("attom", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Get sales history which includes historical mortgage/refinance data
   */
  async getMortgageHistory(attomId: string): Promise<MortgageRecord[]> {
    if (!this.apiKey) {
      console.warn("[AttomMortgage] Provider not configured (no API key)");
      return [];
    }

    const cacheKey = generateCacheKey(CachePrefix.PROPERTY, "attom_mortgage_history", attomId);
    const pricing = getProviderPricing("attom");
    const costPerCall = pricing?.costPerCall || 0.08;

    const cached = await getCachedResult<MortgageRecord[]>("attom_mortgage", cacheKey, costPerCall);
    if (cached) {
      return cached;
    }

    try {
      console.log(`[AttomMortgage] Fetching mortgage history for: ${attomId}`);
      
      const data = await this.request<any>("/propertyapi/v1.0.0/saleshistory/detail", {
        id: attomId,
      });

      apiUsageTracker.recordRequest("attom", 1);
      trackProviderCall("attom", false);

      const history: MortgageRecord[] = [];

      if (data.property?.[0]?.salehistory) {
        for (const sale of data.property[0].salehistory) {
          if (sale.mortgage) {
            history.push(this.parseMortgageFromResponse(sale.mortgage, sale));
          }
        }
      }

      console.log(`[AttomMortgage] Found ${history.length} historical mortgage records`);
      
      await setCachedResult(cacheKey, history, MORTGAGE_CACHE_TTL);

      return history;
    } catch (error) {
      console.error("[AttomMortgage] Error fetching mortgage history:", error);
      trackProviderError("attom", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

let mortgageProviderInstance: AttomMortgageProvider | null = null;

export function getAttomMortgageProvider(): AttomMortgageProvider {
  if (!mortgageProviderInstance) {
    mortgageProviderInstance = new AttomMortgageProvider();
  }
  return mortgageProviderInstance;
}

export async function getMortgageData(address: string): Promise<AttomMortgageResult | null> {
  const provider = getAttomMortgageProvider();
  return provider.getMortgageData(address);
}

export async function getMortgageDataById(attomId: string): Promise<AttomMortgageResult | null> {
  const provider = getAttomMortgageProvider();
  return provider.getMortgageDataById(attomId);
}

export async function getMortgageHistory(attomId: string): Promise<MortgageRecord[]> {
  const provider = getAttomMortgageProvider();
  return provider.getMortgageHistory(attomId);
}
