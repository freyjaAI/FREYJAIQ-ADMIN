import {
  users,
  owners,
  properties,
  contactInfos,
  legalEvents,
  ownerLlcLinks,
  searchHistory,
  dossierExports,
  dossierCache,
  llcs,
  llcOwnershipChains,
  firms,
  tiers,
  usageSummaries,
  type User,
  type UpsertUser,
  type Firm,
  type Tier,
  type UsageSummary,
  type Owner,
  type InsertOwner,
  type Property,
  type InsertProperty,
  type ContactInfo,
  type InsertContactInfo,
  type LegalEvent,
  type InsertLegalEvent,
  type OwnerLlcLink,
  type InsertOwnerLlcLink,
  type SearchHistory,
  type InsertSearchHistory,
  type DossierExport,
  type InsertDossierExport,
  type DossierCache,
  type InsertDossierCache,
  type Llc,
  type InsertLlc,
  type LlcOwnershipChain,
  type InsertLlcOwnershipChain,
  bulkEnrichmentJobs,
  bulkEnrichmentTargets,
  bulkEnrichmentResults,
  type BulkEnrichmentJob,
  type InsertBulkEnrichmentJob,
  type BulkEnrichmentTarget,
  type InsertBulkEnrichmentTarget,
  type BulkEnrichmentResult,
  type InsertBulkEnrichmentResult,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByFirmId(firmId: string): Promise<User[]>;
  createUser(user: { email: string; passwordHash: string; firstName?: string | null; lastName?: string | null; role?: string; firmId?: string | null }): Promise<User>;
  updateUser(id: string, updates: Partial<{ firstName: string | null; lastName: string | null; role: string }>): Promise<User | undefined>;
  updateUserPassword(email: string, passwordHash: string): Promise<void>;
  upsertUser(user: UpsertUser): Promise<User>;
  deleteUserAccount(userId: string): Promise<{ deletedSearchHistory: number; deletedDossierExports: number }>;
  
  // Firm operations
  getFirmBySignupCode(signupCode: string): Promise<(Firm & { tier: Tier | null }) | undefined>;
  getFirm(id: string): Promise<Firm | undefined>;
  getFirmWithTier(id: string): Promise<(Firm & { tier: Tier | null }) | undefined>;
  
  // Usage summary operations
  getUsageSummary(firmId: string | null, userId: string | null, period: string): Promise<UsageSummary | undefined>;
  incrementUsage(firmId: string | null, userId: string | null, period: string, count?: number): Promise<void>;
  getUsageForFirm(firmId: string, period: string): Promise<{ firmUsage: number; userUsages: Array<{ userId: string; email: string; firstName: string | null; lastName: string | null; usage: number }> }>;
  getAllFirmsUsage(period: string): Promise<Array<{ firm: Firm; tier: Tier | null; usage: number }>>;

  // Owner operations
  getOwner(id: string): Promise<Owner | undefined>;
  getOwners(): Promise<Owner[]>;
  createOwner(owner: InsertOwner): Promise<Owner>;
  updateOwner(id: string, owner: Partial<InsertOwner>): Promise<Owner | undefined>;
  searchOwners(query: string): Promise<Owner[]>;

  // Property operations
  getProperty(id: string): Promise<Property | undefined>;
  getProperties(): Promise<Property[]>;
  getPropertiesByOwner(ownerId: string): Promise<Property[]>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: string, property: Partial<InsertProperty>): Promise<Property | undefined>;
  searchProperties(query: string): Promise<Property[]>;

  // Contact operations
  getContactsByOwner(ownerId: string): Promise<ContactInfo[]>;
  createContact(contact: InsertContactInfo): Promise<ContactInfo>;
  updateContact(id: string, contact: Partial<InsertContactInfo>): Promise<ContactInfo | undefined>;

  // Legal events
  getLegalEventsByOwner(ownerId: string): Promise<LegalEvent[]>;
  getLegalEventsByProperty(propertyId: string): Promise<LegalEvent[]>;
  createLegalEvent(event: InsertLegalEvent): Promise<LegalEvent>;

  // LLC links
  getLlcLinksByOwner(ownerId: string): Promise<OwnerLlcLink[]>;
  createLlcLink(link: InsertOwnerLlcLink): Promise<OwnerLlcLink>;

  // Search history
  getSearchHistory(userId: string, limit?: number): Promise<SearchHistory[]>;
  createSearchHistory(history: InsertSearchHistory): Promise<SearchHistory>;

  // Dossier exports
  getDossierExports(userId: string): Promise<DossierExport[]>;
  createDossierExport(export_: InsertDossierExport): Promise<DossierExport>;

  // Dossier cache
  getDossierCache(ownerId: string): Promise<DossierCache | undefined>;
  upsertDossierCache(cache: InsertDossierCache): Promise<DossierCache>;

  // LLC operations
  getLlc(id: string): Promise<Llc | undefined>;
  getLlcs(): Promise<Llc[]>;
  createLlc(llc: InsertLlc): Promise<Llc>;
  updateLlc(id: string, llc: Partial<InsertLlc>): Promise<Llc | undefined>;
  searchLlcs(query: string): Promise<Llc[]>;
  getLlcByName(name: string, jurisdiction?: string): Promise<Llc | undefined>;

  // LLC Ownership Chains
  getLlcOwnershipChain(rootEntityName: string, jurisdiction?: string): Promise<LlcOwnershipChain | undefined>;
  saveLlcOwnershipChain(chain: InsertLlcOwnershipChain): Promise<LlcOwnershipChain>;

  // Stats
  getStats(userId: string): Promise<{
    totalOwners: number;
    totalProperties: number;
    dossiersGenerated: number;
  }>;

  // Data retention cleanup
  cleanupOldSearchHistory(daysOld: number): Promise<number>;
  cleanupOldDossierCache(daysOld: number): Promise<number>;
  cleanupOldDossierExports(daysOld: number): Promise<number>;

  // Bulk Enrichment
  createBulkEnrichmentJob(job: InsertBulkEnrichmentJob): Promise<BulkEnrichmentJob>;
  getBulkEnrichmentJob(id: string): Promise<BulkEnrichmentJob | undefined>;
  getBulkEnrichmentJobs(userId: string): Promise<BulkEnrichmentJob[]>;
  updateBulkEnrichmentJob(id: string, updates: Partial<InsertBulkEnrichmentJob> & { startedAt?: Date; completedAt?: Date }): Promise<BulkEnrichmentJob | undefined>;
  createBulkEnrichmentTarget(target: InsertBulkEnrichmentTarget): Promise<BulkEnrichmentTarget>;
  getBulkEnrichmentTargets(jobId: string): Promise<BulkEnrichmentTarget[]>;
  updateBulkEnrichmentTarget(id: string, updates: Partial<InsertBulkEnrichmentTarget> & { processedAt?: Date }): Promise<BulkEnrichmentTarget | undefined>;
  createBulkEnrichmentResult(result: InsertBulkEnrichmentResult): Promise<BulkEnrichmentResult>;
  getBulkEnrichmentResults(jobId: string): Promise<BulkEnrichmentResult[]>;
  updateBulkEnrichmentResult(id: string, updates: Partial<InsertBulkEnrichmentResult>): Promise<BulkEnrichmentResult | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsersByFirmId(firmId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.firmId, firmId));
  }

  async createUser(userData: { email: string; passwordHash: string; firstName?: string | null; lastName?: string | null; role?: string; firmId?: string | null }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        passwordHash: userData.passwordHash,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role || "user",
        firmId: userData.firmId || null,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<{ firstName: string | null; lastName: string | null; role: string }>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
  
  async getFirmBySignupCode(signupCode: string): Promise<(Firm & { tier: Tier | null }) | undefined> {
    const [result] = await db
      .select({
        firm: firms,
        tier: tiers,
      })
      .from(firms)
      .leftJoin(tiers, eq(firms.tierId, tiers.id))
      .where(eq(firms.signupCode, signupCode));
    
    if (!result) return undefined;
    
    return {
      ...result.firm,
      tier: result.tier,
    };
  }
  
  async getFirm(id: string): Promise<Firm | undefined> {
    const [firm] = await db.select().from(firms).where(eq(firms.id, id));
    return firm;
  }
  
  async getFirmWithTier(id: string): Promise<(Firm & { tier: Tier | null }) | undefined> {
    const [result] = await db
      .select({
        firm: firms,
        tier: tiers,
      })
      .from(firms)
      .leftJoin(tiers, eq(firms.tierId, tiers.id))
      .where(eq(firms.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.firm,
      tier: result.tier,
    };
  }
  
  async getUsageSummary(firmId: string | null, userId: string | null, period: string): Promise<UsageSummary | undefined> {
    const conditions = [eq(usageSummaries.periodStart, period)];
    
    if (firmId) {
      conditions.push(eq(usageSummaries.firmId, firmId));
    }
    if (userId) {
      conditions.push(eq(usageSummaries.userId, userId));
    }
    
    const [summary] = await db
      .select()
      .from(usageSummaries)
      .where(and(...conditions));
    
    return summary;
  }
  
  async incrementUsage(firmId: string | null, userId: string | null, period: string, count: number = 1): Promise<void> {
    if (firmId) {
      const existingFirmUsage = await this.getUsageSummary(firmId, null, period);
      if (existingFirmUsage) {
        await db
          .update(usageSummaries)
          .set({ 
            totalCalls: sql`${usageSummaries.totalCalls} + ${count}`,
            updatedAt: new Date()
          })
          .where(eq(usageSummaries.id, existingFirmUsage.id));
      } else {
        await db.insert(usageSummaries).values({
          firmId,
          userId: null,
          periodStart: period,
          totalCalls: count,
        });
      }
    }
    
    if (userId) {
      const existingUserUsage = await this.getUsageSummary(null, userId, period);
      if (existingUserUsage) {
        await db
          .update(usageSummaries)
          .set({ 
            totalCalls: sql`${usageSummaries.totalCalls} + ${count}`,
            updatedAt: new Date()
          })
          .where(eq(usageSummaries.id, existingUserUsage.id));
      } else {
        await db.insert(usageSummaries).values({
          firmId: null,
          userId,
          periodStart: period,
          totalCalls: count,
        });
      }
    }
  }
  
  async getUsageForFirm(firmId: string, period: string): Promise<{ firmUsage: number; userUsages: Array<{ userId: string; email: string; firstName: string | null; lastName: string | null; usage: number }> }> {
    const firmSummary = await this.getUsageSummary(firmId, null, period);
    const firmUsage = firmSummary?.totalCalls || 0;
    
    const firmUsers = await db.select().from(users).where(eq(users.firmId, firmId));
    
    const userUsages = await Promise.all(
      firmUsers.map(async (user) => {
        const userSummary = await this.getUsageSummary(null, user.id, period);
        return {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          usage: userSummary?.totalCalls || 0,
        };
      })
    );
    
    return { firmUsage, userUsages };
  }
  
  async getAllFirmsUsage(period: string): Promise<Array<{ firm: Firm; tier: Tier | null; usage: number }>> {
    const allFirms = await db
      .select({
        firm: firms,
        tier: tiers,
      })
      .from(firms)
      .leftJoin(tiers, eq(firms.tierId, tiers.id));
    
    const result = await Promise.all(
      allFirms.map(async ({ firm, tier }) => {
        const summary = await this.getUsageSummary(firm.id, null, period);
        return {
          firm,
          tier,
          usage: summary?.totalCalls || 0,
        };
      })
    );
    
    return result;
  }

  async updateUserPassword(email: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, email));
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async deleteUserAccount(userId: string): Promise<{ deletedSearchHistory: number; deletedDossierExports: number }> {
    // Delete user's search history
    const deletedHistory = await db.delete(searchHistory).where(eq(searchHistory.userId, userId));
    
    // Delete user's dossier exports
    const deletedExports = await db.delete(dossierExports).where(eq(dossierExports.userId, userId));
    
    // Delete the user account
    await db.delete(users).where(eq(users.id, userId));
    
    return {
      deletedSearchHistory: deletedHistory.rowCount || 0,
      deletedDossierExports: deletedExports.rowCount || 0,
    };
  }

  // Owner operations
  async getOwner(id: string): Promise<Owner | undefined> {
    const [owner] = await db.select().from(owners).where(eq(owners.id, id));
    return owner;
  }

  async getOwners(): Promise<Owner[]> {
    return await db.select().from(owners).orderBy(desc(owners.createdAt));
  }

  async createOwner(owner: InsertOwner): Promise<Owner> {
    const [newOwner] = await db.insert(owners).values(owner).returning();
    return newOwner;
  }

  async updateOwner(id: string, owner: Partial<InsertOwner>): Promise<Owner | undefined> {
    const [updated] = await db
      .update(owners)
      .set({ ...owner, updatedAt: new Date() })
      .where(eq(owners.id, id))
      .returning();
    return updated;
  }

  async searchOwners(query: string): Promise<Owner[]> {
    const searchPattern = `%${query}%`;
    return await db
      .select()
      .from(owners)
      .where(
        or(
          ilike(owners.name, searchPattern),
          ilike(owners.primaryAddress, searchPattern)
        )
      )
      .limit(50);
  }

  // Property operations
  async getProperty(id: string): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  async getProperties(): Promise<Property[]> {
    return await db.select().from(properties).orderBy(desc(properties.createdAt));
  }

  async getPropertiesByOwner(ownerId: string): Promise<Property[]> {
    return await db.select().from(properties).where(eq(properties.ownerId, ownerId));
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const [newProperty] = await db.insert(properties).values(property).returning();
    return newProperty;
  }

  async updateProperty(id: string, property: Partial<InsertProperty>): Promise<Property | undefined> {
    const [updated] = await db
      .update(properties)
      .set({ ...property, updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    return updated;
  }

  async searchProperties(query: string): Promise<Property[]> {
    const searchPattern = `%${query}%`;
    return await db
      .select()
      .from(properties)
      .where(
        or(
          ilike(properties.address, searchPattern),
          ilike(properties.city, searchPattern),
          ilike(properties.apn, searchPattern)
        )
      )
      .limit(50);
  }

  // Contact operations
  async getContactsByOwner(ownerId: string): Promise<ContactInfo[]> {
    return await db.select().from(contactInfos).where(eq(contactInfos.ownerId, ownerId));
  }

  async createContact(contact: InsertContactInfo): Promise<ContactInfo> {
    const [newContact] = await db.insert(contactInfos).values(contact).returning();
    return newContact;
  }

  async updateContact(id: string, contact: Partial<InsertContactInfo>): Promise<ContactInfo | undefined> {
    const [updated] = await db
      .update(contactInfos)
      .set(contact)
      .where(eq(contactInfos.id, id))
      .returning();
    return updated;
  }

  // Legal events
  async getLegalEventsByOwner(ownerId: string): Promise<LegalEvent[]> {
    return await db
      .select()
      .from(legalEvents)
      .where(eq(legalEvents.ownerId, ownerId))
      .orderBy(desc(legalEvents.filedDate));
  }

  async getLegalEventsByProperty(propertyId: string): Promise<LegalEvent[]> {
    return await db
      .select()
      .from(legalEvents)
      .where(eq(legalEvents.propertyId, propertyId))
      .orderBy(desc(legalEvents.filedDate));
  }

  async createLegalEvent(event: InsertLegalEvent): Promise<LegalEvent> {
    const [newEvent] = await db.insert(legalEvents).values(event).returning();
    return newEvent;
  }

  // LLC links
  async getLlcLinksByOwner(ownerId: string): Promise<OwnerLlcLink[]> {
    return await db.select().from(ownerLlcLinks).where(eq(ownerLlcLinks.ownerId, ownerId));
  }

  async createLlcLink(link: InsertOwnerLlcLink): Promise<OwnerLlcLink> {
    const [newLink] = await db.insert(ownerLlcLinks).values(link).returning();
    return newLink;
  }

  // Search history
  async getSearchHistory(userId: string, limit = 10): Promise<SearchHistory[]> {
    return await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limit);
  }

  async createSearchHistory(history: InsertSearchHistory): Promise<SearchHistory> {
    const [newHistory] = await db.insert(searchHistory).values(history).returning();
    return newHistory;
  }

  // Dossier exports
  async getDossierExports(userId: string): Promise<DossierExport[]> {
    return await db
      .select()
      .from(dossierExports)
      .where(eq(dossierExports.userId, userId))
      .orderBy(desc(dossierExports.createdAt));
  }

  async createDossierExport(export_: InsertDossierExport): Promise<DossierExport> {
    const [newExport] = await db.insert(dossierExports).values(export_).returning();
    return newExport;
  }

  // Dossier cache
  async getDossierCache(ownerId: string): Promise<DossierCache | undefined> {
    const [cache] = await db.select().from(dossierCache).where(eq(dossierCache.ownerId, ownerId));
    return cache;
  }

  async upsertDossierCache(cache: InsertDossierCache): Promise<DossierCache> {
    const [result] = await db
      .insert(dossierCache)
      .values(cache)
      .onConflictDoUpdate({
        target: dossierCache.ownerId,
        set: {
          llcUnmasking: cache.llcUnmasking,
          contactEnrichment: cache.contactEnrichment,
          melissaEnrichment: cache.melissaEnrichment,
          aiOutreach: cache.aiOutreach,
          sellerIntentScore: cache.sellerIntentScore,
          scoreBreakdown: cache.scoreBreakdown,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Stats
  async getStats(userId: string): Promise<{
    totalOwners: number;
    totalProperties: number;
    dossiersGenerated: number;
  }> {
    const [ownerCount] = await db.select({ count: sql<number>`count(*)` }).from(owners);
    const [propertyCount] = await db.select({ count: sql<number>`count(*)` }).from(properties);
    const [dossierCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dossierExports)
      .where(eq(dossierExports.userId, userId));

    return {
      totalOwners: Number(ownerCount?.count || 0),
      totalProperties: Number(propertyCount?.count || 0),
      dossiersGenerated: Number(dossierCount?.count || 0),
    };
  }

  // Data retention cleanup methods
  async cleanupOldSearchHistory(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(searchHistory)
      .where(sql`${searchHistory.createdAt} < ${cutoffDate}`);
    
    return result.rowCount || 0;
  }

  async cleanupOldDossierCache(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(dossierCache)
      .where(sql`${dossierCache.updatedAt} < ${cutoffDate}`);
    
    return result.rowCount || 0;
  }

  async cleanupOldDossierExports(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(dossierExports)
      .where(sql`${dossierExports.createdAt} < ${cutoffDate}`);
    
    return result.rowCount || 0;
  }

  // LLC operations
  async getLlc(id: string): Promise<Llc | undefined> {
    const [llc] = await db.select().from(llcs).where(eq(llcs.id, id));
    return llc;
  }

  async getLlcs(): Promise<Llc[]> {
    return await db.select().from(llcs).orderBy(desc(llcs.createdAt));
  }

  async createLlc(llc: InsertLlc): Promise<Llc> {
    const [newLlc] = await db.insert(llcs).values(llc).returning();
    return newLlc;
  }

  async updateLlc(id: string, llc: Partial<InsertLlc>): Promise<Llc | undefined> {
    const [updated] = await db
      .update(llcs)
      .set({ ...llc, updatedAt: new Date() })
      .where(eq(llcs.id, id))
      .returning();
    return updated;
  }

  async searchLlcs(query: string, jurisdiction?: string): Promise<Llc[]> {
    const conditions = [
      or(
        ilike(llcs.name, `%${query}%`),
        ilike(llcs.registrationNumber, `%${query}%`),
        ilike(llcs.registeredAgent, `%${query}%`)
      )
    ];
    
    if (jurisdiction) {
      conditions.push(ilike(llcs.jurisdiction, jurisdiction));
    }
    
    return await db
      .select()
      .from(llcs)
      .where(and(...conditions))
      .orderBy(desc(llcs.createdAt));
  }

  async getLlcByName(name: string, jurisdiction?: string): Promise<Llc | undefined> {
    const normalizedName = name.toUpperCase().trim();
    const results = await db
      .select()
      .from(llcs)
      .where(ilike(llcs.name, normalizedName));
    
    if (jurisdiction && results.length > 1) {
      return results.find(l => l.jurisdiction?.toUpperCase() === jurisdiction.toUpperCase()) || results[0];
    }
    return results[0];
  }

  // LLC Ownership Chains
  async getLlcOwnershipChain(rootEntityName: string, jurisdiction?: string): Promise<LlcOwnershipChain | undefined> {
    const normalizedName = rootEntityName.toUpperCase().trim();
    const conditions = [ilike(llcOwnershipChains.rootEntityName, normalizedName)];
    
    if (jurisdiction) {
      conditions.push(ilike(llcOwnershipChains.rootEntityJurisdiction, jurisdiction));
    }
    
    const [chain] = await db
      .select()
      .from(llcOwnershipChains)
      .where(and(...conditions))
      .orderBy(desc(llcOwnershipChains.resolvedAt))
      .limit(1);
    
    return chain;
  }

  async saveLlcOwnershipChain(chain: InsertLlcOwnershipChain): Promise<LlcOwnershipChain> {
    const [saved] = await db
      .insert(llcOwnershipChains)
      .values({
        ...chain,
        rootEntityName: chain.rootEntityName.toUpperCase().trim(),
      })
      .returning();
    return saved;
  }

  // Bulk Enrichment operations
  async createBulkEnrichmentJob(job: InsertBulkEnrichmentJob): Promise<BulkEnrichmentJob> {
    const [newJob] = await db.insert(bulkEnrichmentJobs).values(job).returning();
    return newJob;
  }

  async getBulkEnrichmentJob(id: string): Promise<BulkEnrichmentJob | undefined> {
    const [job] = await db.select().from(bulkEnrichmentJobs).where(eq(bulkEnrichmentJobs.id, id));
    return job;
  }

  async getBulkEnrichmentJobs(userId: string): Promise<BulkEnrichmentJob[]> {
    return await db
      .select()
      .from(bulkEnrichmentJobs)
      .where(eq(bulkEnrichmentJobs.userId, userId))
      .orderBy(desc(bulkEnrichmentJobs.createdAt));
  }

  async updateBulkEnrichmentJob(id: string, updates: Partial<InsertBulkEnrichmentJob> & { startedAt?: Date; completedAt?: Date }): Promise<BulkEnrichmentJob | undefined> {
    const [updated] = await db
      .update(bulkEnrichmentJobs)
      .set(updates)
      .where(eq(bulkEnrichmentJobs.id, id))
      .returning();
    return updated;
  }

  async createBulkEnrichmentTarget(target: InsertBulkEnrichmentTarget): Promise<BulkEnrichmentTarget> {
    const [newTarget] = await db.insert(bulkEnrichmentTargets).values(target).returning();
    return newTarget;
  }

  async getBulkEnrichmentTargets(jobId: string): Promise<BulkEnrichmentTarget[]> {
    return await db
      .select()
      .from(bulkEnrichmentTargets)
      .where(eq(bulkEnrichmentTargets.jobId, jobId))
      .orderBy(desc(bulkEnrichmentTargets.familyOfficeConfidence));
  }

  async updateBulkEnrichmentTarget(id: string, updates: Partial<InsertBulkEnrichmentTarget> & { processedAt?: Date }): Promise<BulkEnrichmentTarget | undefined> {
    const [updated] = await db
      .update(bulkEnrichmentTargets)
      .set(updates)
      .where(eq(bulkEnrichmentTargets.id, id))
      .returning();
    return updated;
  }

  async createBulkEnrichmentResult(result: InsertBulkEnrichmentResult): Promise<BulkEnrichmentResult> {
    const [newResult] = await db.insert(bulkEnrichmentResults).values(result).returning();
    return newResult;
  }

  async getBulkEnrichmentResults(jobId: string): Promise<BulkEnrichmentResult[]> {
    return await db
      .select()
      .from(bulkEnrichmentResults)
      .where(eq(bulkEnrichmentResults.jobId, jobId))
      .orderBy(desc(bulkEnrichmentResults.intentScore));
  }

  async updateBulkEnrichmentResult(id: string, updates: Partial<InsertBulkEnrichmentResult>): Promise<BulkEnrichmentResult | undefined> {
    const [updated] = await db
      .update(bulkEnrichmentResults)
      .set(updates)
      .where(eq(bulkEnrichmentResults.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
