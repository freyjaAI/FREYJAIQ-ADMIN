import { withUsageTracking } from "../apiUsageTracker";

export interface InvestorProfile {
  id: string;
  name: string;
  title?: string;
  firm?: string;
  firmType?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  location?: string;
  bio?: string;
  investmentFocus?: string[];
  investmentStages?: string[];
  industries?: string[];
  portfolioCompanies?: Array<{
    name: string;
    website?: string;
    fundingRound?: string;
    amount?: string;
    date?: string;
  }>;
  totalInvestments?: number;
  averageCheckSize?: string;
  source: string;
}

export interface ApifyInvestorSearchParams {
  investorNames?: string[];
  firmTypes?: string[];
  industries?: string[];
  investmentStages?: string[];
  locations?: string[];
  limit?: number;
}

export interface ApifyActorRunResult {
  id: string;
  status: string;
  datasetId?: string;
  defaultDatasetId?: string;
}

export class ApifyStartupInvestorsProvider {
  private apiToken: string;
  private actorId = "johnvc/apify-startup-investors-data-scraper";
  private baseUrl = "https://api.apify.com/v2";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async searchInvestors(params: ApifyInvestorSearchParams): Promise<InvestorProfile[]> {
    return withUsageTracking("apify_investors", async () => {
      const input: Record<string, any> = {};

      if (params.investorNames?.length) {
        input.investorNames = params.investorNames;
      }
      if (params.firmTypes?.length) {
        input.firmTypes = params.firmTypes;
      }
      if (params.industries?.length) {
        input.industries = params.industries;
      }
      if (params.investmentStages?.length) {
        input.investmentStages = params.investmentStages;
      }
      if (params.locations?.length) {
        input.locations = params.locations;
      }
      if (params.limit) {
        input.maxItems = params.limit;
      }

      console.log(`[Apify Investors] Starting actor run with params:`, JSON.stringify(input));

      const runUrl = `${this.baseUrl}/acts/${encodeURIComponent(this.actorId)}/runs?token=${this.apiToken}`;
      
      const runResponse = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!runResponse.ok) {
        const errorText = await runResponse.text();
        console.error(`[Apify Investors] Failed to start actor: ${runResponse.status} - ${errorText}`);
        throw new Error(`Apify actor start failed: ${runResponse.status}`);
      }

      const runData: ApifyActorRunResult = await runResponse.json();
      const runId = runData.id;
      console.log(`[Apify Investors] Actor run started: ${runId}`);

      const result = await this.waitForRunCompletion(runId, 120000);
      
      if (!result.datasetId && !result.defaultDatasetId) {
        console.error(`[Apify Investors] No dataset found for run ${runId}`);
        return [];
      }

      const datasetId = result.datasetId || result.defaultDatasetId;
      return this.fetchDatasetItems(datasetId!);
    });
  }

  private async waitForRunCompletion(runId: string, timeoutMs: number): Promise<ApifyActorRunResult> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const statusUrl = `${this.baseUrl}/actor-runs/${runId}?token=${this.apiToken}`;
      const response = await fetch(statusUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to check run status: ${response.status}`);
      }

      const data = await response.json();
      const status = data.data?.status;

      console.log(`[Apify Investors] Run ${runId} status: ${status}`);

      if (status === "SUCCEEDED") {
        return {
          id: runId,
          status,
          datasetId: data.data?.defaultDatasetId,
          defaultDatasetId: data.data?.defaultDatasetId
        };
      }

      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        throw new Error(`Apify run failed with status: ${status}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Apify run timed out after ${timeoutMs}ms`);
  }

  private async fetchDatasetItems(datasetId: string): Promise<InvestorProfile[]> {
    const url = `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.status}`);
    }

    const items: any[] = await response.json();
    console.log(`[Apify Investors] Fetched ${items.length} investor profiles`);

    return items.map(item => this.mapToInvestorProfile(item));
  }

  private mapToInvestorProfile(item: any): InvestorProfile {
    return {
      id: item.id || item.investor_id || `apify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: item.name || item.investor_name || item.full_name || "",
      title: item.title || item.job_title || item.position || "",
      firm: item.firm || item.company || item.organization || item.firm_name || "",
      firmType: item.firm_type || item.investor_type || item.organization_type || "",
      email: item.email || item.contact_email || "",
      phone: item.phone || item.contact_phone || item.phone_number || "",
      linkedin: item.linkedin || item.linkedin_url || item.linkedin_profile || "",
      twitter: item.twitter || item.twitter_url || item.twitter_handle || "",
      location: item.location || item.city || item.region || "",
      bio: item.bio || item.description || item.about || "",
      investmentFocus: this.parseArray(item.investment_focus || item.focus_areas || item.sectors),
      investmentStages: this.parseArray(item.investment_stages || item.stages || item.funding_stages),
      industries: this.parseArray(item.industries || item.industry || item.verticals),
      portfolioCompanies: this.parsePortfolio(item.portfolio || item.investments || item.portfolio_companies),
      totalInvestments: item.total_investments || item.investment_count,
      averageCheckSize: item.average_check_size || item.check_size || item.typical_investment,
      source: "apify-startup-investors"
    };
  }

  private parseArray(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(v => typeof v === "string");
    if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }

  private parsePortfolio(portfolio: any): InvestorProfile["portfolioCompanies"] {
    if (!portfolio) return [];
    if (!Array.isArray(portfolio)) return [];
    
    return portfolio.map(p => ({
      name: p.name || p.company_name || "",
      website: p.website || p.url || "",
      fundingRound: p.funding_round || p.round || "",
      amount: p.amount || p.investment_amount || "",
      date: p.date || p.investment_date || ""
    })).filter(p => p.name);
  }

  async searchFamilyOfficeInvestors(location?: string, limit: number = 100): Promise<InvestorProfile[]> {
    return this.searchInvestors({
      firmTypes: ["Family Office", "Single Family Office", "Multi-Family Office", "Private Investment Office"],
      locations: location ? [location] : undefined,
      limit
    });
  }

  async searchRealEstateInvestors(location?: string, limit: number = 100): Promise<InvestorProfile[]> {
    return this.searchInvestors({
      industries: ["Real Estate", "Commercial Real Estate", "PropTech", "Real Estate Technology"],
      locations: location ? [location] : undefined,
      limit
    });
  }

  async searchByInvestorName(name: string): Promise<InvestorProfile | null> {
    const results = await this.searchInvestors({
      investorNames: [name],
      limit: 1
    });
    return results[0] || null;
  }

  async searchByFirmName(firmName: string, limit: number = 10): Promise<InvestorProfile[]> {
    return this.searchInvestors({
      investorNames: [firmName],
      limit
    });
  }
}
