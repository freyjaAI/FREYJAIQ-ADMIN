import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      this.store.forEach((entry, key) => {
        if (entry.resetTime < now) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.store.delete(key));
    }, 60000);
  }

  private getKey(req: Request, keyPrefix: string = ""): string {
    // Use user ID if authenticated, otherwise use IP
    const userId = (req as any).user?.claims?.sub;
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    return `${keyPrefix}:${userId || ip}`;
  }

  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    entry.count++;
    this.store.set(key, entry);

    return {
      allowed: entry.count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  }

  middleware(config: RateLimitConfig, keyPrefix: string = "default") {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req, keyPrefix);
      const result = this.check(key, config);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000).toString());

      if (!result.allowed) {
        console.log(`[RATE LIMIT] Key ${key} exceeded ${config.maxRequests} requests per ${config.windowMs}ms`);
        return res.status(429).json({
          message: config.message || "Too many requests, please try again later",
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
      }

      next();
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Pre-configured rate limit configs
export const rateLimitConfigs = {
  // Standard API rate limit: 100 requests per minute
  standard: {
    windowMs: 60000,
    maxRequests: 100,
    message: "Too many requests, please try again in a minute",
  } as RateLimitConfig,

  // Search rate limit: 30 searches per minute
  search: {
    windowMs: 60000,
    maxRequests: 30,
    message: "Search rate limit exceeded. Please wait before searching again.",
  } as RateLimitConfig,

  // Enrichment rate limit: 10 enrichments per minute
  enrichment: {
    windowMs: 60000,
    maxRequests: 10,
    message: "Enrichment rate limit exceeded. These operations are resource-intensive.",
  } as RateLimitConfig,

  // Export rate limit: 20 exports per minute
  export: {
    windowMs: 60000,
    maxRequests: 20,
    message: "Export rate limit exceeded. Please wait before exporting more dossiers.",
  } as RateLimitConfig,

  // Auth rate limit: 10 attempts per 15 minutes
  auth: {
    windowMs: 15 * 60000,
    maxRequests: 10,
    message: "Too many authentication attempts. Please try again later.",
  } as RateLimitConfig,

  // Admin rate limit: 50 requests per minute
  admin: {
    windowMs: 60000,
    maxRequests: 50,
    message: "Admin API rate limit exceeded.",
  } as RateLimitConfig,
};

// Convenience middleware exports
export const standardRateLimit = rateLimiter.middleware(rateLimitConfigs.standard, "standard");
export const searchRateLimit = rateLimiter.middleware(rateLimitConfigs.search, "search");
export const enrichmentRateLimit = rateLimiter.middleware(rateLimitConfigs.enrichment, "enrichment");
export const exportRateLimit = rateLimiter.middleware(rateLimitConfigs.export, "export");
export const authRateLimit = rateLimiter.middleware(rateLimitConfigs.auth, "auth");
export const adminRateLimit = rateLimiter.middleware(rateLimitConfigs.admin, "admin");
