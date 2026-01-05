import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { dataRetentionScheduler } from "./dataRetentionScheduler";
import { loadMetricsFromDb } from "./providerConfig";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Paths containing sensitive data that should not be logged
const SENSITIVE_PATHS = [
  '/api/owners',
  '/api/properties',
  '/api/contacts',
  '/api/dossier',
  '/api/search',
  '/api/external',
  '/api/llcs',
  '/api/persons',
  '/api/auth',
];

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATHS.some(p => path.startsWith(p));
}

function sanitizeLogPayload(payload: Record<string, any>): string {
  // Only log summary info, never full PII
  const summary: Record<string, any> = {};
  if (payload.message) summary.message = payload.message;
  if (payload.success !== undefined) summary.success = payload.success;
  if (payload.total !== undefined) summary.total = payload.total;
  if (payload.count !== undefined) summary.count = payload.count;
  if (Array.isArray(payload)) summary.count = payload.length;
  if (payload.id) summary.id = payload.id;
  if (payload.cached !== undefined) summary.cached = payload.cached;
  return JSON.stringify(summary);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Only log sanitized summary for sensitive paths, skip body for auth
      if (capturedJsonResponse && !path.startsWith('/api/auth')) {
        if (isSensitivePath(path)) {
          logLine += ` :: ${sanitizeLogPayload(capturedJsonResponse)}`;
        } else {
          // Non-sensitive paths can log full response (admin stats, etc)
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      
      // Load persisted provider metrics from database
      await loadMetricsFromDb();
      
      // Start automated data retention scheduler
      dataRetentionScheduler.start();
    },
  );

  // Graceful shutdown
  const shutdown = () => {
    log("Shutting down gracefully...");
    dataRetentionScheduler.stop();
    httpServer.close(() => {
      log("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
