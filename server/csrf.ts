import crypto from "crypto";
import type { RequestHandler } from "express";

/**
 * CSRF Protection using Synchronized Token Pattern
 * 
 * This is more secure than double-submit cookie because:
 * 1. Token is stored server-side in the session (never exposed to client-side JS via cookies)
 * 2. Client fetches token via API and includes in request headers
 * 3. Server validates header token matches session-stored token
 * 4. No httpOnly: false cookies needed
 */

const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_LENGTH = 32;

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Get or create CSRF token for the current session
 */
export function getCsrfToken(req: any): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  return req.session.csrfToken;
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * Token must be sent in x-csrf-token header and match session token
 */
export const csrfProtection: RequestHandler = (req: any, res, next) => {
  // Skip for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip for auth endpoints (login/register establish session)
  if (req.path.startsWith("/api/auth/login") || 
      req.path.startsWith("/api/auth/register") ||
      req.path === "/api/auth/logout") {
    return next();
  }

  // Skip if no session (unauthenticated requests are blocked by isAuthenticated anyway)
  if (!req.session?.userId) {
    return next();
  }

  const sessionToken = req.session.csrfToken;
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  // In development, log warnings but allow (for easier testing)
  if (process.env.NODE_ENV !== "production") {
    if (!sessionToken || !headerToken || sessionToken !== headerToken) {
      // Only warn once per path to avoid log spam
      console.warn(`[CSRF] Token validation skipped in dev: ${req.method} ${req.path}`);
    }
    return next();
  }

  // In production, strictly enforce CSRF protection
  if (!sessionToken) {
    return res.status(403).json({ message: "Session expired, please refresh" });
  }

  if (!headerToken) {
    return res.status(403).json({ message: "Missing security token" });
  }

  // Use timing-safe comparison to prevent timing attacks
  const sessionTokenBuffer = Buffer.from(sessionToken);
  const headerTokenBuffer = Buffer.from(headerToken);
  
  if (sessionTokenBuffer.length !== headerTokenBuffer.length ||
      !crypto.timingSafeEqual(sessionTokenBuffer, headerTokenBuffer)) {
    return res.status(403).json({ message: "Invalid security token" });
  }

  next();
};
