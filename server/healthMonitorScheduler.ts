import { decayProviderErrorCounts, initializeProviders } from "./providerHealthService";

let healthMonitorInterval: NodeJS.Timeout | null = null;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startHealthMonitorScheduler(): void {
  if (healthMonitorInterval) {
    console.log("[HEALTH MONITOR] Scheduler already running");
    return;
  }

  console.log("[HEALTH MONITOR] Starting scheduler with 5-minute interval");
  
  initializeProviders().catch(err => {
    console.error("[HEALTH MONITOR] Failed to initialize providers:", err);
  });
  
  healthMonitorInterval = setInterval(async () => {
    try {
      console.log("[HEALTH MONITOR] Running periodic decay check...");
      await decayProviderErrorCounts();
    } catch (error) {
      console.error("[HEALTH MONITOR] Error in scheduled decay:", error);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopHealthMonitorScheduler(): void {
  if (healthMonitorInterval) {
    clearInterval(healthMonitorInterval);
    healthMonitorInterval = null;
    console.log("[HEALTH MONITOR] Scheduler stopped");
  }
}
