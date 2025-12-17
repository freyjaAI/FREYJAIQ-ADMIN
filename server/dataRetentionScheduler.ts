import { storage } from "./storage";

interface RetentionConfig {
  searchHistoryDays: number;
  dossierCacheDays: number;
  dossierExportsDays: number;
  intervalHours: number;
  enabled: boolean;
}

interface CleanupResult {
  searchHistory: number;
  dossierCache: number;
  dossierExports: number;
  timestamp: Date;
  duration: number;
}

class DataRetentionScheduler {
  private config: RetentionConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private startupTimeoutId: NodeJS.Timeout | null = null;
  private lastRun: CleanupResult | null = null;
  private isRunning: boolean = false;
  private isStopped: boolean = false;
  private runCount: number = 0;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): RetentionConfig {
    return {
      searchHistoryDays: parseInt(process.env.RETENTION_SEARCH_HISTORY_DAYS || "90"),
      dossierCacheDays: parseInt(process.env.RETENTION_DOSSIER_CACHE_DAYS || "180"),
      dossierExportsDays: parseInt(process.env.RETENTION_DOSSIER_EXPORTS_DAYS || "365"),
      intervalHours: parseInt(process.env.RETENTION_INTERVAL_HOURS || "24"),
      enabled: process.env.RETENTION_SCHEDULER_ENABLED !== "false",
    };
  }

  refreshConfig(): void {
    this.config = this.loadConfig();
    console.log("[RETENTION SCHEDULER] Configuration refreshed");
  }

  start(): void {
    this.isStopped = false;
    this.refreshConfig();

    if (!this.config.enabled) {
      console.log("[RETENTION SCHEDULER] Disabled via configuration");
      return;
    }

    if (this.intervalId || this.startupTimeoutId) {
      console.log("[RETENTION SCHEDULER] Already running");
      return;
    }

    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    const jitterMs = Math.random() * 60000; // Random 0-60 second jitter

    console.log(`[RETENTION SCHEDULER] Starting with ${this.config.intervalHours}h interval`);
    console.log(`[RETENTION SCHEDULER] Retention periods: search=${this.config.searchHistoryDays}d, cache=${this.config.dossierCacheDays}d, exports=${this.config.dossierExportsDays}d`);

    // Initial delayed run with jitter to avoid thundering herd
    this.startupTimeoutId = setTimeout(() => {
      if (this.isStopped) return; // Don't run if stopped during startup delay
      this.startupTimeoutId = null;
      this.runCleanup();
      // Then schedule recurring runs
      if (!this.isStopped) {
        this.intervalId = setInterval(() => {
          if (!this.isStopped) this.runCleanup();
        }, intervalMs);
      }
    }, jitterMs + 5000); // 5 second minimum delay on startup
  }

  stop(): void {
    this.isStopped = true;
    
    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log("[RETENTION SCHEDULER] Stopped");
  }

  async runCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      console.log("[RETENTION SCHEDULER] Cleanup already in progress, skipping");
      return this.lastRun || {
        searchHistory: 0,
        dossierCache: 0,
        dossierExports: 0,
        timestamp: new Date(),
        duration: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log("[RETENTION SCHEDULER] Starting automated cleanup...");

    try {
      const [searchHistory, dossierCache, dossierExports] = await Promise.all([
        storage.cleanupOldSearchHistory(this.config.searchHistoryDays),
        storage.cleanupOldDossierCache(this.config.dossierCacheDays),
        storage.cleanupOldDossierExports(this.config.dossierExportsDays),
      ]);

      const result: CleanupResult = {
        searchHistory,
        dossierCache,
        dossierExports,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };

      this.lastRun = result;
      this.runCount++;

      console.log(`[RETENTION SCHEDULER] Cleanup completed in ${result.duration}ms`);
      console.log(`[RETENTION SCHEDULER] Deleted: ${searchHistory} search records, ${dossierCache} cache entries, ${dossierExports} exports`);

      // Log the automated cleanup (system-initiated, no user ID)
      console.log("[RETENTION SCHEDULER] Audit: automated_data_cleanup", {
        searchHistoryDeleted: searchHistory,
        dossierCacheDeleted: dossierCache,
        dossierExportsDeleted: dossierExports,
        retentionConfig: this.config,
      });

      return result;
    } catch (error) {
      console.error("[RETENTION SCHEDULER] Cleanup failed:", error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  getStatus(): {
    enabled: boolean;
    running: boolean;
    config: RetentionConfig;
    lastRun: CleanupResult | null;
    runCount: number;
    nextRunIn: string | null;
  } {
    let nextRunIn: string | null = null;
    if (this.intervalId && this.lastRun) {
      const nextRunTime = this.lastRun.timestamp.getTime() + (this.config.intervalHours * 60 * 60 * 1000);
      const msUntilNext = nextRunTime - Date.now();
      if (msUntilNext > 0) {
        const hours = Math.floor(msUntilNext / (60 * 60 * 1000));
        const minutes = Math.floor((msUntilNext % (60 * 60 * 1000)) / (60 * 1000));
        nextRunIn = `${hours}h ${minutes}m`;
      }
    }

    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      config: this.config,
      lastRun: this.lastRun,
      runCount: this.runCount,
      nextRunIn,
    };
  }
}

export const dataRetentionScheduler = new DataRetentionScheduler();
