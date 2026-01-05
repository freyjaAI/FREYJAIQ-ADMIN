import bcrypt from "bcrypt";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { z } from "zod";

const SALT_ROUNDS = 12;

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

  app.get("/api/auth/validate-signup-code", async (req, res) => {
    try {
      const code = req.query.code as string;
      if (!code) {
        return res.status(400).json({ message: "Signup code is required" });
      }

      const firmWithTier = await storage.getFirmBySignupCode(code.toUpperCase());
      if (!firmWithTier) {
        return res.status(404).json({ message: "Invalid signup code" });
      }

      if (!firmWithTier.tierId) {
        return res.status(400).json({ message: "This firm does not have an active subscription" });
      }

      res.json({
        firmId: firmWithTier.id,
        firmName: firmWithTier.name,
      });
    } catch (error) {
      console.error("Signup code validation error:", error);
      res.status(500).json({ message: "Failed to validate signup code" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error.errors[0]?.message || "Invalid input" 
        });
      }

      const { email, password, firstName, lastName, signupCode } = result.data;

      const firmWithTier = await storage.getFirmBySignupCode(signupCode.toUpperCase());
      if (!firmWithTier) {
        return res.status(400).json({ message: "Invalid signup code" });
      }

      if (!firmWithTier.tierId) {
        return res.status(400).json({ message: "This firm does not have an active subscription" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
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

      req.session.userId = user.id;
      
      res.json({
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
      res.status(500).json({ message: "Registration failed" });
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
