import { db } from "./db";
import { owners, properties, ownerLlcLinks, llcOwnershipChains } from "@shared/schema";
import { eq, ilike, or, sql } from "drizzle-orm";
import type { Owner, Property } from "@shared/schema";

export interface RelatedHolding {
  owner: Owner;
  properties: Property[];
  relationship: string;
  confidence: number;
}

export interface PersonPropertyLinks {
  personName: string;
  directProperties: Property[];
  llcHoldings: RelatedHolding[];
  relatedOwners: RelatedHolding[];
  totalProperties: number;
  totalLlcs: number;
}

function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeNameForComparison(name1);
  const n2 = normalizeNameForComparison(name2);
  
  if (n1 === n2) return 100;
  
  const words1 = n1.split(' ');
  const words2 = n2.split(' ');
  
  let matchingWords = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w2 === w1 || w2.includes(w1) || w1.includes(w2))) {
      matchingWords++;
    }
  }
  
  const maxWords = Math.max(words1.length, words2.length);
  return Math.round((matchingWords / maxWords) * 100);
}

export async function findRelatedHoldingsForPerson(
  personName: string,
  excludeOwnerId?: string
): Promise<PersonPropertyLinks> {
  const result: PersonPropertyLinks = {
    personName,
    directProperties: [],
    llcHoldings: [],
    relatedOwners: [],
    totalProperties: 0,
    totalLlcs: 0,
  };

  const normalizedName = normalizeNameForComparison(personName);
  const nameParts = normalizedName.split(' ').filter(p => p.length > 2);
  
  // Search for ALL matching owners (don't exclude the main owner - we need their LLC links)
  const matchingOwners = await db
    .select()
    .from(owners)
    .where(
      or(
        ilike(owners.name, `%${personName}%`),
        ...nameParts.map(part => ilike(owners.name, `%${part}%`))
      )
    )
    .limit(50);

  const relevantOwners = matchingOwners.filter(o => {
    const similarity = calculateNameSimilarity(personName, o.name);
    return similarity >= 60;
  });

  for (const owner of relevantOwners) {
    const isExcludedOwner = excludeOwnerId && owner.id === excludeOwnerId;
    
    const ownerProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.ownerId, owner.id));

    if (owner.type === 'individual') {
      // Only add direct properties if not from the excluded owner (to avoid duplicates)
      if (ownerProperties.length > 0 && !isExcludedOwner) {
        result.directProperties.push(...ownerProperties);
      }
      
      // Always look for LLC links, even for the excluded owner - this is the main value
      const llcLinks = await db
        .select()
        .from(ownerLlcLinks)
        .where(eq(ownerLlcLinks.ownerId, owner.id));
      
      for (const link of llcLinks) {
        const llcOwner = await db
          .select()
          .from(owners)
          .where(eq(owners.id, link.llcOwnerId))
          .limit(1);
        
        if (llcOwner[0]) {
          const llcProperties = await db
            .select()
            .from(properties)
            .where(eq(properties.ownerId, llcOwner[0].id));
          
          if (llcProperties.length > 0) {
            result.llcHoldings.push({
              owner: llcOwner[0],
              properties: llcProperties,
              relationship: link.relationship || 'linked',
              confidence: link.confidenceScore || 70,
            });
          }
        }
      }
    } else {
      // Only add related entity owners if not from the excluded owner
      if (ownerProperties.length > 0 && !isExcludedOwner) {
        const similarity = calculateNameSimilarity(personName, owner.name);
        result.relatedOwners.push({
          owner,
          properties: ownerProperties,
          relationship: 'name_match',
          confidence: similarity,
        });
      }
    }
  }

  const chainResults = await db
    .select()
    .from(llcOwnershipChains)
    .where(
      sql`${llcOwnershipChains.chain}::text ILIKE ${`%${personName}%`}`
    )
    .limit(20);

  for (const chain of chainResults) {
    const ubos = chain.ultimateBeneficialOwners as any[];
    if (ubos && ubos.length > 0) {
      const isUbo = ubos.some(
        (ubo: any) => calculateNameSimilarity(personName, ubo.name) >= 70
      );
      
      if (isUbo) {
        const llcOwner = await db
          .select()
          .from(owners)
          .where(eq(owners.name, chain.rootEntityName))
          .limit(1);
        
        if (llcOwner[0] && !result.llcHoldings.some(h => h.owner.id === llcOwner[0].id)) {
          const llcProperties = await db
            .select()
            .from(properties)
            .where(eq(properties.ownerId, llcOwner[0].id));
          
          if (llcProperties.length > 0) {
            result.llcHoldings.push({
              owner: llcOwner[0],
              properties: llcProperties,
              relationship: 'ubo',
              confidence: 85,
            });
          }
        }
      }
    }
  }

  const seenPropertyIds = new Set<string>();
  result.directProperties = result.directProperties.filter(p => {
    if (seenPropertyIds.has(p.id)) return false;
    seenPropertyIds.add(p.id);
    return true;
  });

  const seenLlcIds = new Set<string>();
  result.llcHoldings = result.llcHoldings.filter(h => {
    if (seenLlcIds.has(h.owner.id)) return false;
    seenLlcIds.add(h.owner.id);
    return true;
  });

  result.totalProperties = result.directProperties.length + 
    result.llcHoldings.reduce((sum, h) => sum + h.properties.length, 0) +
    result.relatedOwners.reduce((sum, r) => sum + r.properties.length, 0);
  result.totalLlcs = result.llcHoldings.length;

  return result;
}

export async function findOwnersLinkedToProperty(propertyId: string): Promise<{
  directOwner: Owner | null;
  linkedPersons: Array<{ owner: Owner; relationship: string; confidence: number }>;
  ubos: Array<{ name: string; role?: string }>;
}> {
  const property = await db
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property[0] || !property[0].ownerId) {
    return { directOwner: null, linkedPersons: [], ubos: [] };
  }

  const directOwner = await db
    .select()
    .from(owners)
    .where(eq(owners.id, property[0].ownerId))
    .limit(1);

  if (!directOwner[0]) {
    return { directOwner: null, linkedPersons: [], ubos: [] };
  }

  const linkedPersons: Array<{ owner: Owner; relationship: string; confidence: number }> = [];
  const ubos: Array<{ name: string; role?: string }> = [];

  if (directOwner[0].type === 'entity') {
    const links = await db
      .select()
      .from(ownerLlcLinks)
      .where(eq(ownerLlcLinks.llcOwnerId, directOwner[0].id));

    for (const link of links) {
      const person = await db
        .select()
        .from(owners)
        .where(eq(owners.id, link.ownerId))
        .limit(1);
      
      if (person[0]) {
        linkedPersons.push({
          owner: person[0],
          relationship: link.relationship || 'linked',
          confidence: link.confidenceScore || 70,
        });
      }
    }

    const chain = await db
      .select()
      .from(llcOwnershipChains)
      .where(eq(llcOwnershipChains.rootEntityName, directOwner[0].name))
      .limit(1);

    if (chain[0]) {
      const chainUbos = chain[0].ultimateBeneficialOwners as any[];
      if (chainUbos && chainUbos.length > 0) {
        ubos.push(...chainUbos);
      }
    }
  }

  return { directOwner: directOwner[0], linkedPersons, ubos };
}
