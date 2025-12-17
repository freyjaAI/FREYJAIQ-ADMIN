import { db } from "./db";
import { sql } from "drizzle-orm";

export type AuditEventType = 
  | "user_login"
  | "user_logout"
  | "user_register"
  | "account_delete"
  | "search_performed"
  | "dossier_view"
  | "dossier_export"
  | "contact_access"
  | "llc_unmasking"
  | "data_enrichment"
  | "admin_action";

export interface AuditEvent {
  eventType: AuditEventType;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditLogger {
  private enabled: boolean = true;

  async log(event: AuditEvent): Promise<void> {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...event,
    };

    // Log to console in structured format for compliance
    console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);

    // In production, you would also want to persist audit logs to a separate table
    // For now, we're using structured console logging which can be captured by log aggregation
  }

  async logLogin(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      eventType: "user_login",
      userId,
      ipAddress,
      userAgent,
    });
  }

  async logLogout(userId: string): Promise<void> {
    await this.log({
      eventType: "user_logout",
      userId,
    });
  }

  async logAccountDelete(userId: string, deletedData: { deletedSearchHistory: number; deletedDossierExports: number }): Promise<void> {
    await this.log({
      eventType: "account_delete",
      userId,
      metadata: {
        searchHistoryDeleted: deletedData.deletedSearchHistory,
        dossierExportsDeleted: deletedData.deletedDossierExports,
      },
    });
  }

  async logSearch(userId: string, query: string, searchType: string, resultsCount: number): Promise<void> {
    await this.log({
      eventType: "search_performed",
      userId,
      metadata: {
        query: query.substring(0, 100), // Truncate for privacy
        searchType,
        resultsCount,
      },
    });
  }

  async logDossierView(userId: string, ownerId: string, ownerName?: string): Promise<void> {
    await this.log({
      eventType: "dossier_view",
      userId,
      resourceType: "owner",
      resourceId: ownerId,
      metadata: {
        ownerName: ownerName?.substring(0, 50),
      },
    });
  }

  async logDossierExport(userId: string, ownerId: string, format: string): Promise<void> {
    await this.log({
      eventType: "dossier_export",
      userId,
      resourceType: "owner",
      resourceId: ownerId,
      metadata: { format },
    });
  }

  async logContactAccess(userId: string, ownerId: string, contactCount: number): Promise<void> {
    await this.log({
      eventType: "contact_access",
      userId,
      resourceType: "owner",
      resourceId: ownerId,
      metadata: { contactCount },
    });
  }

  async logLlcUnmasking(userId: string, llcName: string, resultCount: number): Promise<void> {
    await this.log({
      eventType: "llc_unmasking",
      userId,
      metadata: {
        llcName: llcName.substring(0, 100),
        officersFound: resultCount,
      },
    });
  }

  async logDataEnrichment(userId: string, entityId: string, providers: string[]): Promise<void> {
    await this.log({
      eventType: "data_enrichment",
      userId,
      resourceId: entityId,
      metadata: {
        providers,
      },
    });
  }

  async logAdminAction(userId: string, action: string, details?: Record<string, any>): Promise<void> {
    await this.log({
      eventType: "admin_action",
      userId,
      metadata: {
        action,
        ...details,
      },
    });
  }
}

export const auditLogger = new AuditLogger();
