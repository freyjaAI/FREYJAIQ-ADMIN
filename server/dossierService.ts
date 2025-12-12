import { db } from "./db";
import { eq, ilike, or } from "drizzle-orm";
import {
  owners,
  properties,
  contactInfos,
  legalEvents,
  ownerLlcLinks,
  dossierCache,
  llcOwnershipChains,
  Owner,
  Property,
  ContactInfo,
  LegalEvent,
} from "@shared/schema";
import { resolveOwnershipChain, formatChainForDisplay } from "./llcChainResolver";
import { findRelatedHoldingsForPerson } from "./personPropertyLinker";
import { dataProviders } from "./dataProviders";
import { trackProviderCall } from "./providerConfig";

export type EntityType = "individual" | "entity" | "property";

export type EnrichmentStatus = "idle" | "pending" | "running" | "complete" | "failed" | "stale";

export interface LinkedEntity {
  id: string;
  name: string;
  type: EntityType;
  relationship?: string;
  confidence?: number;
  route: string;
}

export interface CoreSection {
  name: string;
  typeLabel: string;
  addresses: {
    primary?: string;
    mailing?: string;
    previous?: Array<{ address: string; city?: string; state?: string; zip?: string; timespan?: string }>;
  };
  identifiers: {
    apn?: string;
    ein?: string;
    ssn?: string;
  };
  scoring: {
    sellerIntent?: number;
    contactConfidence?: number;
    riskFlags?: string[];
  };
  demographics?: {
    age?: number;
    birthDate?: string;
  };
  propertyDetails?: {
    propertyType?: string;
    sqFt?: number;
    units?: number;
    yearBuilt?: number;
    assessedValue?: number;
    marketValue?: number;
    lastSaleDate?: string;
    lastSalePrice?: number;
  };
}

export interface ContactSection {
  primaryContacts: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: number;
    source?: string;
    lineType?: string;
    isVerified?: boolean;
  }>;
  altContacts: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: number;
    source?: string;
  }>;
  relatives?: Array<{ name: string; age?: number }>;
  associates?: Array<{ name: string; age?: number }>;
}

export interface OwnershipSection {
  owners: LinkedEntity[];
  holdings: Array<{
    entity: LinkedEntity;
    properties: LinkedEntity[];
    relationship: string;
    confidence: number;
  }>;
  ultimateBeneficialOwners: LinkedEntity[];
  chain?: {
    levels: Array<{
      depth: number;
      entities: Array<{
        name: string;
        type: string;
        role?: string;
        confidence?: number;
      }>;
    }>;
  };
}

export interface NetworkSection {
  linkedIndividuals: LinkedEntity[];
  relatedEntities: LinkedEntity[];
  relatedProperties: LinkedEntity[];
  legalEvents: Array<{
    id: string;
    type: string;
    status?: string;
    amount?: number;
    filedDate?: string;
    description?: string;
  }>;
}

export interface MetaSection {
  lastUpdated?: string;
  enrichmentUpdatedAt?: string;
  providersUsed: string[];
  enrichmentStatus: EnrichmentStatus;
  enrichmentSource?: string;
  cacheInfo?: {
    cached: boolean;
    cacheAge?: number;
  };
}

export interface UnifiedDossier {
  id: string;
  entityType: EntityType;
  core: CoreSection;
  contact: ContactSection;
  ownership: OwnershipSection;
  network: NetworkSection;
  meta: MetaSection;
}

const STALE_THRESHOLD_HOURS = 72;

function isEnrichmentStale(enrichmentUpdatedAt: Date | null): boolean {
  if (!enrichmentUpdatedAt) return true;
  const ageMs = Date.now() - enrichmentUpdatedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours > STALE_THRESHOLD_HOURS;
}

function getRoute(type: EntityType, id: string): string {
  return `/dossier/${id}`;
}

export async function resolveEntityById(id: string): Promise<{ entityType: EntityType; record: Owner | Property } | null> {
  const ownerResults = await db.select().from(owners).where(eq(owners.id, id)).limit(1);
  if (ownerResults[0]) {
    const owner = ownerResults[0];
    return {
      entityType: owner.type === "entity" ? "entity" : "individual",
      record: owner,
    };
  }

  const propertyResults = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (propertyResults[0]) {
    return {
      entityType: "property",
      record: propertyResults[0],
    };
  }

  return null;
}

async function buildCoreSection(entityType: EntityType, record: Owner | Property): Promise<CoreSection> {
  if (entityType === "property") {
    const prop = record as Property;
    return {
      name: prop.address,
      typeLabel: prop.propertyType || "Property",
      addresses: {
        primary: `${prop.address}${prop.city ? `, ${prop.city}` : ""}${prop.state ? `, ${prop.state}` : ""} ${prop.zipCode || ""}`.trim(),
      },
      identifiers: {
        apn: prop.apn || undefined,
      },
      scoring: {
        riskFlags: prop.riskSignals || undefined,
      },
      propertyDetails: {
        propertyType: prop.propertyType || undefined,
        sqFt: prop.sqFt || undefined,
        units: prop.units || undefined,
        yearBuilt: prop.yearBuilt || undefined,
        assessedValue: prop.assessedValue || undefined,
        marketValue: prop.marketValue || undefined,
        lastSaleDate: prop.lastSaleDate?.toISOString() || undefined,
        lastSalePrice: prop.lastSalePrice || undefined,
      },
    };
  }

  const owner = record as Owner;
  const previousAddresses = owner.previousAddresses as Array<{ address: string; city?: string; state?: string; zip?: string; timespan?: string }> | null;

  return {
    name: owner.name,
    typeLabel: owner.type === "entity" ? "LLC / Entity" : "Individual",
    addresses: {
      primary: owner.primaryAddress || undefined,
      mailing: owner.mailingAddress || undefined,
      previous: previousAddresses || undefined,
    },
    identifiers: {},
    scoring: {
      sellerIntent: owner.sellerIntentScore || undefined,
      contactConfidence: owner.contactConfidenceScore || undefined,
      riskFlags: owner.riskFlags || undefined,
    },
    demographics: owner.type === "individual" ? {
      age: owner.age || undefined,
      birthDate: owner.birthDate || undefined,
    } : undefined,
  };
}

async function buildContactSection(entityType: EntityType, record: Owner | Property): Promise<ContactSection> {
  if (entityType === "property") {
    return { primaryContacts: [], altContacts: [] };
  }

  const owner = record as Owner;
  const contacts = await db.select().from(contactInfos).where(eq(contactInfos.ownerId, owner.id));

  const sorted = contacts.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  const primary = sorted.slice(0, 3);
  const alt = sorted.slice(3);

  const relatives = owner.relatives as Array<{ name: string; age?: number }> | null;
  const associates = owner.associates as Array<{ name: string; age?: number }> | null;

  return {
    primaryContacts: primary.map((c) => ({
      type: c.kind as "phone" | "email",
      value: c.value,
      confidence: c.confidenceScore || undefined,
      source: c.source || undefined,
      lineType: c.lineType || undefined,
      isVerified: c.isVerified || undefined,
    })),
    altContacts: alt.map((c) => ({
      type: c.kind as "phone" | "email",
      value: c.value,
      confidence: c.confidenceScore || undefined,
      source: c.source || undefined,
    })),
    relatives: relatives || undefined,
    associates: associates || undefined,
  };
}

async function buildOwnershipSection(entityType: EntityType, record: Owner | Property): Promise<OwnershipSection> {
  const result: OwnershipSection = {
    owners: [],
    holdings: [],
    ultimateBeneficialOwners: [],
  };

  if (entityType === "property") {
    const prop = record as Property;
    if (prop.ownerId) {
      const ownerResults = await db.select().from(owners).where(eq(owners.id, prop.ownerId)).limit(1);
      if (ownerResults[0]) {
        const owner = ownerResults[0];
        result.owners.push({
          id: owner.id,
          name: owner.name,
          type: owner.type === "entity" ? "entity" : "individual",
          route: getRoute(owner.type === "entity" ? "entity" : "individual", owner.id),
        });
      }
    }
    return result;
  }

  const owner = record as Owner;

  if (entityType === "individual") {
    const holdings = await findRelatedHoldingsForPerson(owner.name, owner.id);
    
    for (const holding of holdings.llcHoldings) {
      result.holdings.push({
        entity: {
          id: holding.owner.id,
          name: holding.owner.name,
          type: "entity",
          route: getRoute("entity", holding.owner.id),
        },
        properties: holding.properties.map((p) => ({
          id: p.id,
          name: p.address,
          type: "property" as EntityType,
          route: getRoute("property", p.id),
        })),
        relationship: holding.relationship,
        confidence: holding.confidence,
      });
    }
  } else {
    const chainResults = await db
      .select()
      .from(llcOwnershipChains)
      .where(eq(llcOwnershipChains.rootEntityName, owner.name))
      .limit(1);

    if (chainResults[0]) {
      const chain = chainResults[0];
      const ubos = chain.ultimateBeneficialOwners as Array<{ name: string; type: string; role?: string }>;
      
      for (const ubo of ubos || []) {
        const uboOwner = await db
          .select()
          .from(owners)
          .where(ilike(owners.name, `%${ubo.name}%`))
          .limit(1);
        
        if (uboOwner[0]) {
          result.ultimateBeneficialOwners.push({
            id: uboOwner[0].id,
            name: uboOwner[0].name,
            type: "individual",
            relationship: ubo.role,
            route: getRoute("individual", uboOwner[0].id),
          });
        } else {
          result.ultimateBeneficialOwners.push({
            id: `ubo-${ubo.name.replace(/\s+/g, "-").toLowerCase()}`,
            name: ubo.name,
            type: "individual",
            relationship: ubo.role,
            route: "#",
          });
        }
      }

      const chainData = chain.chain as Array<{ name: string; type: string; role?: string; depth: number; confidence?: number }>;
      const levelMap = new Map<number, Array<{ name: string; type: string; role?: string; confidence?: number }>>();
      
      for (const node of chainData || []) {
        const existing = levelMap.get(node.depth) || [];
        existing.push({ name: node.name, type: node.type, role: node.role, confidence: node.confidence });
        levelMap.set(node.depth, existing);
      }

      result.chain = {
        levels: Array.from(levelMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([depth, entities]) => ({ depth, entities })),
      };
    }

    const ownedProperties = await db.select().from(properties).where(eq(properties.ownerId, owner.id));
    if (ownedProperties.length > 0) {
      result.holdings.push({
        entity: {
          id: owner.id,
          name: owner.name,
          type: "entity",
          route: getRoute("entity", owner.id),
        },
        properties: ownedProperties.map((p) => ({
          id: p.id,
          name: p.address,
          type: "property" as EntityType,
          route: getRoute("property", p.id),
        })),
        relationship: "direct_owner",
        confidence: 100,
      });
    }
  }

  return result;
}

async function buildNetworkSection(entityType: EntityType, record: Owner | Property): Promise<NetworkSection> {
  const result: NetworkSection = {
    linkedIndividuals: [],
    relatedEntities: [],
    relatedProperties: [],
    legalEvents: [],
  };

  if (entityType === "property") {
    const prop = record as Property;
    const events = await db.select().from(legalEvents).where(eq(legalEvents.propertyId, prop.id));
    result.legalEvents = events.map((e) => ({
      id: e.id,
      type: e.type,
      status: e.status || undefined,
      amount: e.amount || undefined,
      filedDate: e.filedDate?.toISOString() || undefined,
      description: e.description || undefined,
    }));
    return result;
  }

  const owner = record as Owner;

  if (entityType === "entity") {
    const links = await db.select().from(ownerLlcLinks).where(eq(ownerLlcLinks.llcOwnerId, owner.id));
    
    for (const link of links) {
      const individual = await db.select().from(owners).where(eq(owners.id, link.ownerId)).limit(1);
      if (individual[0]) {
        result.linkedIndividuals.push({
          id: individual[0].id,
          name: individual[0].name,
          type: "individual",
          relationship: link.relationship || "linked",
          confidence: link.confidenceScore || undefined,
          route: getRoute("individual", individual[0].id),
        });
      }
    }
  } else {
    const links = await db.select().from(ownerLlcLinks).where(eq(ownerLlcLinks.ownerId, owner.id));
    
    for (const link of links) {
      const llc = await db.select().from(owners).where(eq(owners.id, link.llcOwnerId)).limit(1);
      if (llc[0]) {
        result.relatedEntities.push({
          id: llc[0].id,
          name: llc[0].name,
          type: "entity",
          relationship: link.relationship || "linked",
          confidence: link.confidenceScore || undefined,
          route: getRoute("entity", llc[0].id),
        });
      }
    }
  }

  const directProps = await db.select().from(properties).where(eq(properties.ownerId, owner.id));
  result.relatedProperties = directProps.map((p) => ({
    id: p.id,
    name: p.address,
    type: "property" as EntityType,
    route: getRoute("property", p.id),
  }));

  const events = await db.select().from(legalEvents).where(eq(legalEvents.ownerId, owner.id));
  result.legalEvents = events.map((e) => ({
    id: e.id,
    type: e.type,
    status: e.status || undefined,
    amount: e.amount || undefined,
    filedDate: e.filedDate?.toISOString() || undefined,
    description: e.description || undefined,
  }));

  return result;
}

function buildMetaSection(entityType: EntityType, record: Owner | Property, providersUsed: string[]): MetaSection {
  if (entityType === "property") {
    const prop = record as Property;
    return {
      lastUpdated: prop.updatedAt?.toISOString() || prop.createdAt?.toISOString(),
      providersUsed,
      enrichmentStatus: "complete",
    };
  }

  const owner = record as Owner;
  const isStale = isEnrichmentStale(owner.enrichmentUpdatedAt);
  
  let status: EnrichmentStatus = "idle";
  if (owner.enrichmentSource) {
    status = isStale ? "stale" : "complete";
  }

  return {
    lastUpdated: owner.updatedAt?.toISOString() || owner.createdAt?.toISOString(),
    enrichmentUpdatedAt: owner.enrichmentUpdatedAt?.toISOString() || undefined,
    providersUsed,
    enrichmentStatus: status,
    enrichmentSource: owner.enrichmentSource || undefined,
  };
}

export async function buildUnifiedDossier(id: string): Promise<UnifiedDossier | null> {
  const resolved = await resolveEntityById(id);
  if (!resolved) return null;

  const { entityType, record } = resolved;

  const providersUsed: string[] = [];
  if (entityType !== "property") {
    const owner = record as Owner;
    if (owner.enrichmentSource) {
      providersUsed.push(owner.enrichmentSource);
    }
  }

  const [core, contact, ownership, network] = await Promise.all([
    buildCoreSection(entityType, record),
    buildContactSection(entityType, record),
    buildOwnershipSection(entityType, record),
    buildNetworkSection(entityType, record),
  ]);

  const meta = buildMetaSection(entityType, record, providersUsed);

  return {
    id,
    entityType,
    core,
    contact,
    ownership,
    network,
    meta,
  };
}

export async function runFullEnrichment(id: string): Promise<{ success: boolean; providersUsed: string[]; error?: string }> {
  const resolved = await resolveEntityById(id);
  if (!resolved) {
    return { success: false, providersUsed: [], error: "Entity not found" };
  }

  if (resolved.entityType === "property") {
    return { success: true, providersUsed: [], error: "Properties do not require enrichment" };
  }

  const owner = resolved.record as Owner;
  const providersUsed: string[] = [];
  
  try {
    console.log(`[Enrichment] Starting full enrichment for ${owner.name} (${id})`);

    const contacts = await db.select().from(contactInfos).where(eq(contactInfos.ownerId, id));
    const hasContacts = contacts.length > 0;
    
    if (!hasContacts || isEnrichmentStale(owner.enrichmentUpdatedAt)) {
      console.log(`[Enrichment] Running contact enrichment waterfall for ${owner.name}`);
      
      const enrichmentResult = await runContactWaterfall(owner.name, owner.primaryAddress || undefined);
      providersUsed.push(...enrichmentResult.providersUsed);

      if (enrichmentResult.contacts.length > 0) {
        for (const contact of enrichmentResult.contacts) {
          await db.insert(contactInfos).values({
            ownerId: id,
            kind: contact.type,
            value: contact.value,
            source: contact.source,
            confidenceScore: contact.confidence,
          }).onConflictDoNothing();
        }
      }

      if (enrichmentResult.personData) {
        await db.update(owners).set({
          age: enrichmentResult.personData.age,
          birthDate: enrichmentResult.personData.birthDate,
          relatives: enrichmentResult.personData.relatives,
          associates: enrichmentResult.personData.associates,
          previousAddresses: enrichmentResult.personData.previousAddresses,
          enrichmentSource: enrichmentResult.primaryProvider,
          enrichmentUpdatedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(owners.id, id));
      }
    }

    if (resolved.entityType === "entity") {
      console.log(`[Enrichment] Running LLC chain resolution for ${owner.name}`);
      try {
        const chain = await resolveOwnershipChain(owner.name);
        providersUsed.push("gemini_deep_research");
        
        await db.insert(llcOwnershipChains).values({
          rootEntityName: owner.name,
          chain: chain.chain,
          ultimateBeneficialOwners: chain.ultimateBeneficialOwners,
          maxDepthReached: chain.maxDepthReached,
          totalApiCalls: chain.totalApiCalls,
        }).onConflictDoNothing();
      } catch (err) {
        console.error(`[Enrichment] LLC chain resolution failed:`, err);
      }
    }

    console.log(`[Enrichment] Complete for ${owner.name}, providers: ${providersUsed.join(", ")}`);
    return { success: true, providersUsed };

  } catch (error) {
    console.error(`[Enrichment] Failed for ${id}:`, error);
    return { 
      success: false, 
      providersUsed, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

interface WaterfallResult {
  contacts: Array<{ type: "phone" | "email"; value: string; source: string; confidence: number }>;
  personData?: {
    age?: number;
    birthDate?: string;
    relatives?: Array<{ name: string; age?: number }>;
    associates?: Array<{ name: string; age?: number }>;
    previousAddresses?: Array<{ address: string; city?: string; state?: string; zip?: string }>;
  };
  providersUsed: string[];
  primaryProvider?: string;
}

async function runContactWaterfall(name: string, address?: string): Promise<WaterfallResult> {
  const result: WaterfallResult = {
    contacts: [],
    providersUsed: [],
  };

  const nameParts = name.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  try {
    console.log(`[Waterfall] Trying Melissa Personator for ${name}`);
    const melissaResult = await dataProviders.lookupPerson({ name, address });
    
    if (melissaResult) {
      result.providersUsed.push("melissa");
      trackProviderCall("melissa");
      
      if (melissaResult.phone) {
        result.contacts.push({
          type: "phone",
          value: melissaResult.phone,
          source: "melissa",
          confidence: 80,
        });
      }
      if (melissaResult.email) {
        result.contacts.push({
          type: "email",
          value: melissaResult.email,
          source: "melissa",
          confidence: 75,
        });
      }
      
      result.primaryProvider = "melissa";

      if (result.contacts.length >= 2) {
        return result;
      }
    }
  } catch (err) {
    console.error("[Waterfall] Melissa failed:", err);
  }

  try {
    console.log(`[Waterfall] Trying Data Axle for ${name}`);
    const dataAxleResult = await dataProviders.enrichContact({ name, address });
    
    if (dataAxleResult) {
      result.providersUsed.push("data_axle");
      trackProviderCall("data_axle");
      
      if (dataAxleResult.phone) {
        result.contacts.push({
          type: "phone",
          value: dataAxleResult.phone,
          source: "data_axle",
          confidence: dataAxleResult.confidenceScore || 70,
        });
      }
      if (dataAxleResult.email) {
        result.contacts.push({
          type: "email",
          value: dataAxleResult.email,
          source: "data_axle",
          confidence: dataAxleResult.confidenceScore || 70,
        });
      }
      
      if (!result.primaryProvider) {
        result.primaryProvider = "data_axle";
      }

      if (result.contacts.length >= 2) {
        return result;
      }
    }
  } catch (err) {
    console.error("[Waterfall] Data Axle failed:", err);
  }

  try {
    console.log(`[Waterfall] Trying Pacific East for ${name}`);
    const pacificResult = await dataProviders.enrichContactWithPacificEast({
      firstName,
      lastName,
      address,
    });
    
    if (pacificResult) {
      result.providersUsed.push("pacific_east");
      trackProviderCall("pacific_east");
      
      if (pacificResult.phones) {
        for (const phone of pacificResult.phones) {
          result.contacts.push({
            type: "phone",
            value: phone.number,
            source: "pacific_east",
            confidence: phone.matchScore || 65,
          });
        }
      }
      if (pacificResult.emails) {
        for (const email of pacificResult.emails) {
          result.contacts.push({
            type: "email",
            value: email.address,
            source: "pacific_east",
            confidence: email.confidence || 60,
          });
        }
      }
      
      if (!result.primaryProvider) {
        result.primaryProvider = "pacific_east";
      }

      if (result.contacts.length >= 2) {
        return result;
      }
    }
  } catch (err) {
    console.error("[Waterfall] Pacific East failed:", err);
  }

  try {
    console.log(`[Waterfall] Trying A-Leads for ${name}`);
    const aleadsResult = await dataProviders.searchALeadsByName(name);
    
    if (aleadsResult && aleadsResult.length > 0) {
      result.providersUsed.push("a_leads");
      trackProviderCall("a_leads");
      
      const first = aleadsResult[0];
      if (first.phone) {
        result.contacts.push({
          type: "phone",
          value: first.phone,
          source: "a_leads",
          confidence: 60,
        });
      }
      if (first.email) {
        result.contacts.push({
          type: "email",
          value: first.email,
          source: "a_leads",
          confidence: 55,
        });
      }
      
      if (!result.primaryProvider) {
        result.primaryProvider = "a_leads";
      }
    }
  } catch (err) {
    console.error("[Waterfall] A-Leads failed:", err);
  }

  return result;
}
