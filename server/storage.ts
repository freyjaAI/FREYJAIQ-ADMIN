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
  type User,
  type UpsertUser,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { email: string; passwordHash: string; firstName?: string | null; lastName?: string | null; role?: string }): Promise<User>;
  updateUserPassword(email: string, passwordHash: string): Promise<void>;
  upsertUser(user: UpsertUser): Promise<User>;

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

  async createUser(userData: { email: string; passwordHash: string; firstName?: string | null; lastName?: string | null; role?: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        passwordHash: userData.passwordHash,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role || "broker",
      })
      .returning();
    return user;
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
}

export const storage = new DatabaseStorage();
