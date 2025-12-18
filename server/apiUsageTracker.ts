import { storage } from "./storage";

export interface ProviderQuota {
  provider: string;
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
}

export interface UsageStats {
  provider: string;
  dailyCount: number;
  monthlyCount: number;
  dailyLimit: number;
  monthlyLimit: number;
  isBlocked: boolean;
  warningLevel: "ok" | "warning" | "critical" | "blocked";
  lastReset: string;
}

const DEFAULT_QUOTAS: Record<string, ProviderQuota> = {
  data_axle_places: {
    provider: "data_axle_places",
    dailyLimit: parseInt(process.env.QUOTA_DATA_AXLE_PLACES_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_DATA_AXLE_PLACES_MONTHLY || "5000"),
    warningThreshold: 0.8,
  },
  data_axle_people: {
    provider: "data_axle_people",
    dailyLimit: parseInt(process.env.QUOTA_DATA_AXLE_PEOPLE_DAILY || "100"),
    monthlyLimit: parseInt(process.env.QUOTA_DATA_AXLE_PEOPLE_MONTHLY || "1000"),
    warningThreshold: 0.8,
  },
  aleads: {
    provider: "aleads",
    dailyLimit: parseInt(process.env.QUOTA_ALEADS_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_ALEADS_MONTHLY || "10000"),
    warningThreshold: 0.8,
  },
  melissa: {
    provider: "melissa",
    dailyLimit: parseInt(process.env.QUOTA_MELISSA_DAILY || "1000"),
    monthlyLimit: parseInt(process.env.QUOTA_MELISSA_MONTHLY || "20000"),
    warningThreshold: 0.8,
  },
  attom: {
    provider: "attom",
    dailyLimit: parseInt(process.env.QUOTA_ATTOM_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_ATTOM_MONTHLY || "5000"),
    warningThreshold: 0.8,
  },
  opencorporates: {
    provider: "opencorporates",
    dailyLimit: parseInt(process.env.QUOTA_OPENCORPORATES_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_OPENCORPORATES_MONTHLY || "5000"),
    warningThreshold: 0.8,
  },
  google_maps: {
    provider: "google_maps",
    dailyLimit: parseInt(process.env.QUOTA_GOOGLE_MAPS_DAILY || "1000"),
    monthlyLimit: parseInt(process.env.QUOTA_GOOGLE_MAPS_MONTHLY || "25000"),
    warningThreshold: 0.8,
  },
  perplexity: {
    provider: "perplexity",
    dailyLimit: parseInt(process.env.QUOTA_PERPLEXITY_DAILY || "100"),
    monthlyLimit: parseInt(process.env.QUOTA_PERPLEXITY_MONTHLY || "2000"),
    warningThreshold: 0.8,
  },
  openai: {
    provider: "openai",
    dailyLimit: parseInt(process.env.QUOTA_OPENAI_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_OPENAI_MONTHLY || "10000"),
    warningThreshold: 0.8,
  },
  pacific_east: {
    provider: "pacific_east",
    dailyLimit: parseInt(process.env.QUOTA_PACIFIC_EAST_DAILY || "500"),
    monthlyLimit: parseInt(process.env.QUOTA_PACIFIC_EAST_MONTHLY || "10000"),
    warningThreshold: 0.8,
  },
  apify: {
    provider: "apify",
    dailyLimit: parseInt(process.env.QUOTA_APIFY_DAILY || "100"),
    monthlyLimit: parseInt(process.env.QUOTA_APIFY_MONTHLY || "2000"),
    warningThreshold: 0.8,
  },
};

interface UsageData {
  dailyCount: number;
  monthlyCount: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
}

class APIUsageTracker {
  private usage: Map<string, UsageData> = new Map();
  private quotas: Record<string, ProviderQuota> = DEFAULT_QUOTAS;
  private initialized = false;

  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  private getMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  private getOrCreateUsage(provider: string): UsageData {
    const today = this.getTodayKey();
    const month = this.getMonthKey();

    let data = this.usage.get(provider);

    if (!data) {
      data = {
        dailyCount: 0,
        monthlyCount: 0,
        lastDailyReset: today,
        lastMonthlyReset: month,
      };
      this.usage.set(provider, data);
    }

    if (data.lastDailyReset !== today) {
      console.log(`[API USAGE] Resetting daily count for ${provider} (was ${data.dailyCount})`);
      data.dailyCount = 0;
      data.lastDailyReset = today;
    }

    if (data.lastMonthlyReset !== month) {
      console.log(`[API USAGE] Resetting monthly count for ${provider} (was ${data.monthlyCount})`);
      data.monthlyCount = 0;
      data.lastMonthlyReset = month;
    }

    return data;
  }

  canMakeRequest(provider: string): { allowed: boolean; reason?: string } {
    const quota = this.quotas[provider];
    if (!quota) {
      return { allowed: true };
    }

    const usage = this.getOrCreateUsage(provider);

    if (usage.dailyCount >= quota.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit reached for ${provider}: ${usage.dailyCount}/${quota.dailyLimit}`,
      };
    }

    if (usage.monthlyCount >= quota.monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly limit reached for ${provider}: ${usage.monthlyCount}/${quota.monthlyLimit}`,
      };
    }

    return { allowed: true };
  }

  recordRequest(provider: string, count: number = 1): void {
    const usage = this.getOrCreateUsage(provider);
    usage.dailyCount += count;
    usage.monthlyCount += count;

    const quota = this.quotas[provider];
    if (quota) {
      const dailyPercent = usage.dailyCount / quota.dailyLimit;
      const monthlyPercent = usage.monthlyCount / quota.monthlyLimit;

      if (dailyPercent >= quota.warningThreshold || monthlyPercent >= quota.warningThreshold) {
        console.warn(
          `[API USAGE WARNING] ${provider}: Daily ${usage.dailyCount}/${quota.dailyLimit} (${Math.round(dailyPercent * 100)}%), Monthly ${usage.monthlyCount}/${quota.monthlyLimit} (${Math.round(monthlyPercent * 100)}%)`
        );
      }
    }

    console.log(`[API USAGE] ${provider}: +${count} (daily: ${usage.dailyCount}, monthly: ${usage.monthlyCount})`);
  }

  getStats(provider: string): UsageStats {
    const quota = this.quotas[provider] || {
      provider,
      dailyLimit: Infinity,
      monthlyLimit: Infinity,
      warningThreshold: 0.8,
    };
    const usage = this.getOrCreateUsage(provider);

    const dailyPercent = usage.dailyCount / quota.dailyLimit;
    const monthlyPercent = usage.monthlyCount / quota.monthlyLimit;

    let warningLevel: UsageStats["warningLevel"] = "ok";
    let isBlocked = false;

    if (dailyPercent >= 1 || monthlyPercent >= 1) {
      warningLevel = "blocked";
      isBlocked = true;
    } else if (dailyPercent >= 0.9 || monthlyPercent >= 0.9) {
      warningLevel = "critical";
    } else if (dailyPercent >= quota.warningThreshold || monthlyPercent >= quota.warningThreshold) {
      warningLevel = "warning";
    }

    return {
      provider,
      dailyCount: usage.dailyCount,
      monthlyCount: usage.monthlyCount,
      dailyLimit: quota.dailyLimit,
      monthlyLimit: quota.monthlyLimit,
      isBlocked,
      warningLevel,
      lastReset: usage.lastDailyReset,
    };
  }

  getAllStats(): UsageStats[] {
    const providers = Object.keys(this.quotas);
    return providers.map((p) => this.getStats(p));
  }

  setQuota(provider: string, dailyLimit?: number, monthlyLimit?: number): void {
    if (!this.quotas[provider]) {
      this.quotas[provider] = {
        provider,
        dailyLimit: dailyLimit || 1000,
        monthlyLimit: monthlyLimit || 10000,
        warningThreshold: 0.8,
      };
    } else {
      if (dailyLimit !== undefined) this.quotas[provider].dailyLimit = dailyLimit;
      if (monthlyLimit !== undefined) this.quotas[provider].monthlyLimit = monthlyLimit;
    }
    console.log(`[API USAGE] Updated quota for ${provider}: daily=${this.quotas[provider].dailyLimit}, monthly=${this.quotas[provider].monthlyLimit}`);
  }

  resetProvider(provider: string): void {
    const usage = this.usage.get(provider);
    if (usage) {
      console.log(`[API USAGE] Manually resetting ${provider} (was daily: ${usage.dailyCount}, monthly: ${usage.monthlyCount})`);
      usage.dailyCount = 0;
      usage.monthlyCount = 0;
      usage.lastDailyReset = this.getTodayKey();
      usage.lastMonthlyReset = this.getMonthKey();
    }
  }

  resetAll(): void {
    console.log(`[API USAGE] Resetting all provider usage counters`);
    this.usage.clear();
  }

  getSummary(): { totalCalls: number; totalRecords: number; trackingStarted: string } {
    let totalCalls = 0;
    let totalRecords = 0;
    let earliestReset = new Date().toISOString();

    for (const [, data] of this.usage.entries()) {
      totalCalls += 1;
      totalRecords += data.dailyCount + data.monthlyCount;
      if (data.lastDailyReset < earliestReset) {
        earliestReset = data.lastDailyReset;
      }
    }

    return {
      totalCalls,
      totalRecords,
      trackingStarted: earliestReset,
    };
  }
}

export const apiUsageTracker = new APIUsageTracker();

export function withUsageTracking<T>(
  provider: string,
  fn: () => Promise<T>,
  recordCount: number = 1
): Promise<T> {
  const check = apiUsageTracker.canMakeRequest(provider);
  if (!check.allowed) {
    console.error(`[API USAGE BLOCKED] ${check.reason}`);
    throw new Error(check.reason);
  }

  return fn().then((result) => {
    apiUsageTracker.recordRequest(provider, recordCount);
    return result;
  });
}
