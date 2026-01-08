import bcrypt from "bcrypt";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { z } from "zod";
import { db } from "./db";
import { signupAuditLogs } from "@shared/schema";

const SALT_ROUNDS = 12;

// Rate limiting for signup code validation (in-memory)
interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const signupCodeRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10; // Max 10 attempts per window
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minute block after exceeding

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(signupCodeRateLimits.entries());
  for (const [key, entry] of entries) {
    if (entry.blockedUntil && entry.blockedUntil < now) {
      signupCodeRateLimits.delete(key);
    } else if (now - entry.firstAttempt > RATE_LIMIT_WINDOW * 2) {
      signupCodeRateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

function checkSignupCodeRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = signupCodeRateLimits.get(ip);
  
  if (!entry) {
    signupCodeRateLimits.set(ip, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }
  
  // Check if blocked
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  
  // Reset if window expired
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) {
    signupCodeRateLimits.set(ip, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }
  
  // Increment attempts
  entry.attempts++;
  
  // Check if exceeded
  if (entry.attempts > MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION;
    return { allowed: false, retryAfter: Math.ceil(BLOCK_DURATION / 1000) };
  }
  
  return { allowed: true };
}

// Constant-time delay to prevent timing attacks
async function constantTimeDelay(minMs: number = 100, maxMs: number = 200): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise(resolve => setTimeout(resolve, delay));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getSession() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  signupCode: z.string().min(1, "Signup code is required"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Bootstrap admin user from environment variables (secure, no hardcoded credentials)
async function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  // Only bootstrap if both environment variables are set
  if (!adminEmail || !adminPassword) {
    if (process.env.NODE_ENV === "development") {
      console.log("Admin bootstrap skipped: Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to create admin user");
    }
    return;
  }
  
  // Validate password strength
  if (adminPassword.length < 12) {
    console.error("Admin bootstrap failed: ADMIN_PASSWORD must be at least 12 characters");
    return;
  }
  
  try {
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    if (!existingAdmin) {
      console.log("Creating admin user from environment configuration...");
      const passwordHash = await hashPassword(adminPassword);
      await storage.createUser({
        email: adminEmail,
        passwordHash,
        firstName: "Admin",
        lastName: "User",
        role: "admin",
      });
      console.log("Admin user created successfully");
    }
    // Note: We don't auto-update existing passwords - manual intervention required
  } catch (error) {
    console.error("Error ensuring admin user:", error);
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  
  // Ensure admin user exists
  await ensureAdminUser();

  // Handler for signup code validation - supports both query param and path param
  async function validateSignupCode(req: any, res: any, code: string | undefined) {
    // All paths get consistent timing to prevent enumeration
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 150; // Minimum response time in ms
    
    async function sendResponse(status: number, body: object) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await new Promise(r => setTimeout(r, MIN_RESPONSE_TIME - elapsed + Math.random() * 50));
      }
      return res.status(status).json(body);
    }
    
    try {
      // Get client IP for rate limiting
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
                       req.socket.remoteAddress || 
                       "unknown";
      
      // Check rate limit
      const rateCheck = checkSignupCodeRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.set("Retry-After", String(rateCheck.retryAfter));
        return sendResponse(429, { 
          message: "Too many attempts. Please try again later.",
          retryAfter: rateCheck.retryAfter
        });
      }
      
      if (!code) {
        return sendResponse(400, { message: "Signup code is required" });
      }

      const firmWithTier = await storage.getFirmBySignupCode(code.toUpperCase());
      
      if (!firmWithTier) {
        return sendResponse(404, { message: "Invalid signup code" });
      }

      if (!firmWithTier.tierId) {
        return sendResponse(400, { message: "This firm does not have an active subscription" });
      }

      return sendResponse(200, {
        firmId: firmWithTier.id,
        firmName: firmWithTier.name,
      });
    } catch (error) {
      console.error("Signup code validation error:", error);
      return sendResponse(500, { message: "Failed to validate signup code" });
    }
  }

  // Support query param: /api/auth/validate-signup-code?code=XXX
  app.get("/api/auth/validate-signup-code", async (req, res) => {
    return validateSignupCode(req, res, req.query.code as string);
  });

  // Support path param: /api/auth/validate-signup-code/XXX (used by frontend)
  app.get("/api/auth/validate-signup-code/:code", async (req, res) => {
    return validateSignupCode(req, res, req.params.code);
  });
  
  // Separate rate limit for registration to prevent brute-force on registration
  const registrationRateLimits = new Map<string, RateLimitEntry>();
  
  function checkRegistrationRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = registrationRateLimits.get(ip);
    
    if (!entry) {
      registrationRateLimits.set(ip, { attempts: 1, firstAttempt: now });
      return { allowed: true };
    }
    
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
    }
    
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) {
      registrationRateLimits.set(ip, { attempts: 1, firstAttempt: now });
      return { allowed: true };
    }
    
    entry.attempts++;
    
    // More strict limit for registration: 5 attempts
    if (entry.attempts > 5) {
      entry.blockedUntil = now + BLOCK_DURATION;
      return { allowed: false, retryAfter: Math.ceil(BLOCK_DURATION / 1000) };
    }
    
    return { allowed: true };
  }

  app.post("/api/auth/register", async (req, res) => {
    // All paths get consistent timing to prevent enumeration
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 150; // Minimum response time in ms
    
    async function sendResponse(status: number, body: object) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await new Promise(r => setTimeout(r, MIN_RESPONSE_TIME - elapsed + Math.random() * 50));
      }
      return res.status(status).json(body);
    }
    
    try {
      // Get client info for audit log
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
                       req.socket.remoteAddress || 
                       "unknown";
      const userAgent = req.headers["user-agent"] || null;
      
      // Rate limit registration attempts
      const rateCheck = checkRegistrationRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.set("Retry-After", String(rateCheck.retryAfter));
        return sendResponse(429, { 
          message: "Too many registration attempts. Please try again later.",
          retryAfter: rateCheck.retryAfter
        });
      }
      
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return sendResponse(400, { 
          message: result.error.errors[0]?.message || "Invalid input" 
        });
      }

      const { email, password, firstName, lastName, signupCode } = result.data;
      const normalizedCode = signupCode.toUpperCase();

      const firmWithTier = await storage.getFirmBySignupCode(normalizedCode);
      if (!firmWithTier) {
        return sendResponse(400, { message: "Invalid signup code" });
      }

      if (!firmWithTier.tierId) {
        return sendResponse(400, { message: "This firm does not have an active subscription" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return sendResponse(400, { message: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      
      const user = await storage.createUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        firmId: firmWithTier.id,
        role: "user",
      });

      // Record signup in audit log
      try {
        await db.insert(signupAuditLogs).values({
          userId: user.id,
          firmId: firmWithTier.id,
          signupCode: normalizedCode,
          ipAddress: clientIp,
          userAgent: userAgent,
        });
        console.log(`[SIGNUP AUDIT] User ${user.email} signed up with code ${normalizedCode} for firm ${firmWithTier.name}`);
      } catch (auditError) {
        console.error("Failed to log signup audit:", auditError);
        // Don't fail registration if audit log fails
      }

      req.session.userId = user.id;
      
      return sendResponse(200, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        firmId: user.firmId,
        firmName: firmWithTier.name,
      });
    } catch (error) {
      console.error("Registration error:", error);
      return sendResponse(500, { message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error.errors[0]?.message || "Invalid input" 
        });
      }

      const { email, password } = result.data;

      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.session.userId = user.id;
      
      let firmName: string | null = null;
      if (user.firmId) {
        const firm = await storage.getFirm(user.firmId);
        firmName = firm?.name || null;
      }
      
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        firmId: user.firmId,
        firmName,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      let firmName: string | null = null;
      if (user.firmId) {
        const firm = await storage.getFirm(user.firmId);
        firmName = firm?.name || null;
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
        firmId: user.firmId,
        firmName,
      });
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({ message: "Failed to check authentication" });
    }
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export const isFirmAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }
  
  if (user.role !== "firm_admin" && user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Firm admin access required" });
  }
  
  next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }
  
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  
  next();
};

export function getUserId(req: any): string | null {
  return req.session?.userId || null;
}
