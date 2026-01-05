/**
 * Quota Enforcement Middleware
 * 
 * Enforces firm-level and user-level API call limits BEFORE any search/enrichment executes.
 * Uses the tier-based limits defined in the tiers table.
 */

import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { checkTierLimits, recordUserUsage, getCurrentBillingPeriod } from "./apiUsageTracker";

export interface QuotaCheckResult {
  allowed: boolean;
  error?: "firm_limit_reached" | "user_limit_reached";
  message?: string;
  firmUsage?: number;
  firmLimit?: number | null;
  userUsage?: number;
  userLimit?: number | null;
}

/**
 * Middleware that enforces quota limits before executing any API-consuming route.
 * Must be used after isAuthenticated middleware.
 * 
 * Usage:
 *   app.post("/api/search/external", isAuthenticated, enforceQuota, async (req, res) => { ... });
 */
export async function enforceQuota(
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user as { id?: string; firmId?: string | null } | undefined;
    
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const userId = user.id;
    const firmId = user.firmId || null;

    const tierCheck = await checkTierLimits(firmId, userId, storage);

    if (!tierCheck.allowed) {
      console.warn(`[QUOTA BLOCKED] User ${userId}${firmId ? ` (firm: ${firmId})` : ""}: ${tierCheck.error}`);
      
      if (tierCheck.error === "firm_limit_reached") {
        res.status(429).json({
          error: "quota_exceeded",
          code: "FIRM_LIMIT_REACHED",
          message: tierCheck.message || "Your firm has reached its monthly API call limit.",
          details: {
            firmUsage: tierCheck.firmUsage,
            firmLimit: tierCheck.firmLimit,
            period: getCurrentBillingPeriod(),
          }
        });
        return;
      }
      
      if (tierCheck.error === "user_limit_reached") {
        res.status(429).json({
          error: "quota_exceeded",
          code: "USER_LIMIT_REACHED",
          message: tierCheck.message || "You have reached your monthly API call limit.",
          details: {
            userUsage: tierCheck.userUsage,
            userLimit: tierCheck.userLimit,
            period: getCurrentBillingPeriod(),
          }
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error("[QUOTA ENFORCEMENT] Error checking quota:", error);
    next();
  }
}

/**
 * Helper function to perform quota check without middleware pattern.
 * Returns the check result for use in routes that need custom handling.
 */
export async function performQuotaCheck(
  userId: string,
  firmId: string | null
): Promise<QuotaCheckResult> {
  return checkTierLimits(firmId, userId, storage);
}

/**
 * Helper function to record usage after successful API call.
 * Should be called after the route successfully makes external API calls.
 */
export async function recordUsageAfterCall(
  userId: string,
  firmId: string | null,
  callCount: number = 1
): Promise<void> {
  await recordUserUsage(firmId, userId, storage, callCount);
}

/**
 * Combined enforcement: Check quota, execute function, record usage.
 * Throws error if quota exceeded.
 */
export async function withQuotaEnforcement<T>(
  userId: string,
  firmId: string | null,
  fn: () => Promise<T>,
  callCount: number = 1
): Promise<T> {
  const check = await performQuotaCheck(userId, firmId);
  
  if (!check.allowed) {
    const error = new Error(check.message || "Quota limit reached");
    (error as any).code = check.error === "firm_limit_reached" ? "FIRM_LIMIT_REACHED" : "USER_LIMIT_REACHED";
    (error as any).quotaDetails = check;
    throw error;
  }
  
  const result = await fn();
  
  await recordUsageAfterCall(userId, firmId, callCount);
  
  return result;
}
