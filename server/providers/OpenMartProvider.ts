import { withUsageTracking } from "../apiUsageTracker";

export interface OpenMartBusiness {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  website?: string;
  email?: string;
  category?: string;
  ownershipType?: string;
  staffs?: Array<{
    name: string;
    role?: string;
    email?: string;
    phone?: string;
  }>;
  rating?: number;
  reviewCount?: number;
  hours?: Record<string, string>;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
  description?: string;
  yearEstablished?: number;
  employeeCount?: string;
}

export interface OpenMartSearchParams {
  query: string;
  location?: string;
  page?: number;
  limit?: number;
  has_contact_info?: boolean;
  ownership_type?: string;
  min_reviews?: number;
  category?: string;
}

export interface OpenMartSearchResponse {
  businesses: OpenMartBusiness[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class OpenMartProvider {
  private apiKey: string;
  private baseUrl = "https://api.openmart.ai/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchBusinesses(params: OpenMartSearchParams): Promise<OpenMartSearchResponse> {
    return withUsageTracking("openmart", async () => {
      const searchParams = new URLSearchParams();
      searchParams.append("query", params.query);
      
      if (params.location) {
        searchParams.append("location", params.location);
      }
      if (params.page) {
        searchParams.append("page", params.page.toString());
      }
      if (params.limit) {
        searchParams.append("limit", Math.min(params.limit, 500).toString());
      }
      if (params.has_contact_info !== undefined) {
        searchParams.append("has_contact_info", params.has_contact_info.toString());
      }
      if (params.ownership_type) {
        searchParams.append("ownership_type", params.ownership_type);
      }
      if (params.min_reviews) {
        searchParams.append("min_reviews", params.min_reviews.toString());
      }
      if (params.category) {
        searchParams.append("category", params.category);
      }

      const url = `${this.baseUrl}/search?${searchParams.toString()}`;
      console.log(`[OpenMart] Searching: ${params.query} (location: ${params.location || "any"})`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenMart] API error ${response.status}: ${errorText}`);
        throw new Error(`OpenMart API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const businesses: OpenMartBusiness[] = (data.results || data.businesses || data.data || []).map((item: any) => ({
        id: item.id || item.business_id || "",
        name: item.name || item.business_name || "",
        address: item.address || item.street_address || "",
        city: item.city || "",
        state: item.state || item.region || "",
        zip: item.zip || item.postal_code || "",
        country: item.country || "US",
        phone: item.phone || item.phone_number || "",
        website: item.website || item.url || "",
        email: item.email || "",
        category: item.category || item.industry || "",
        ownershipType: item.ownership_type || "",
        staffs: (item.staffs || item.employees || item.contacts || []).map((s: any) => ({
          name: s.name || `${s.first_name || ""} ${s.last_name || ""}`.trim(),
          role: s.role || s.title || s.position || "",
          email: s.email || "",
          phone: s.phone || s.direct_phone || ""
        })),
        rating: item.rating || item.average_rating,
        reviewCount: item.review_count || item.reviews_count,
        description: item.description || item.about || "",
        yearEstablished: item.year_established || item.founded_year,
        employeeCount: item.employee_count || item.employees_range || ""
      }));

      console.log(`[OpenMart] Found ${businesses.length} businesses`);

      return {
        businesses,
        total: data.total || data.total_count || businesses.length,
        page: data.page || params.page || 1,
        limit: data.limit || params.limit || 50,
        hasMore: data.has_more || (businesses.length >= (params.limit || 50))
      };
    });
  }

  async searchFamilyOffices(location?: string, limit: number = 100): Promise<OpenMartBusiness[]> {
    const familyOfficeQueries = [
      "family office",
      "private investment office",
      "wealth management family",
      "single family office",
      "multi family office"
    ];

    const allResults: OpenMartBusiness[] = [];
    const seenIds = new Set<string>();

    for (const query of familyOfficeQueries) {
      if (allResults.length >= limit) break;
      
      try {
        const response = await this.searchBusinesses({
          query,
          location,
          limit: Math.min(100, limit - allResults.length),
          has_contact_info: true
        });

        for (const biz of response.businesses) {
          if (!seenIds.has(biz.id)) {
            seenIds.add(biz.id);
            allResults.push(biz);
          }
        }
      } catch (error) {
        console.error(`[OpenMart] Error searching "${query}":`, error);
      }
    }

    return allResults.slice(0, limit);
  }

  async searchInvestmentFirms(location?: string, limit: number = 100): Promise<OpenMartBusiness[]> {
    const investmentQueries = [
      "private equity",
      "venture capital",
      "investment management",
      "asset management",
      "hedge fund",
      "real estate investment"
    ];

    const allResults: OpenMartBusiness[] = [];
    const seenIds = new Set<string>();

    for (const query of investmentQueries) {
      if (allResults.length >= limit) break;
      
      try {
        const response = await this.searchBusinesses({
          query,
          location,
          limit: Math.min(100, limit - allResults.length),
          has_contact_info: true
        });

        for (const biz of response.businesses) {
          if (!seenIds.has(biz.id)) {
            seenIds.add(biz.id);
            allResults.push(biz);
          }
        }
      } catch (error) {
        console.error(`[OpenMart] Error searching "${query}":`, error);
      }
    }

    return allResults.slice(0, limit);
  }

  extractDecisionMakers(business: OpenMartBusiness): Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    company: string;
  }> {
    const decisionMakerTitles = [
      "ceo", "chief executive", "president", "founder", "owner",
      "managing director", "managing partner", "principal", "partner",
      "cio", "chief investment", "director", "cfo", "chief financial",
      "chairman", "vice president", "vp", "head of", "general partner"
    ];

    const decisionMakers: Array<{
      name: string;
      title?: string;
      email?: string;
      phone?: string;
      company: string;
    }> = [];

    if (business.staffs) {
      for (const staff of business.staffs) {
        const role = (staff.role || "").toLowerCase();
        const isDecisionMaker = decisionMakerTitles.some(title => role.includes(title));
        
        if (isDecisionMaker || !staff.role) {
          decisionMakers.push({
            name: staff.name,
            title: staff.role,
            email: staff.email,
            phone: staff.phone,
            company: business.name
          });
        }
      }
    }

    return decisionMakers;
  }
}
