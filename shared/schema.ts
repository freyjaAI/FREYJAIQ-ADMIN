import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("broker"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Owner entity - can be individual or LLC/entity
export const owners = pgTable("owners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull().default("individual"), // individual | entity
  name: varchar("name").notNull(),
  akaNames: text("aka_names").array(),
  primaryAddress: text("primary_address"),
  mailingAddress: text("mailing_address"),
  riskFlags: text("risk_flags").array(),
  sellerIntentScore: integer("seller_intent_score"),
  contactConfidenceScore: integer("contact_confidence_score"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ownersRelations = relations(owners, ({ many }) => ({
  properties: many(properties),
  contactInfos: many(contactInfos),
  legalEvents: many(legalEvents),
  linkedLlcs: many(ownerLlcLinks),
}));

export const insertOwnerSchema = createInsertSchema(owners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type Owner = typeof owners.$inferSelect;

// Property entity
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  apn: varchar("apn"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  propertyType: varchar("property_type"),
  units: integer("units"),
  sqFt: integer("sq_ft"),
  assessedValue: integer("assessed_value"),
  marketValue: integer("market_value"),
  lastSaleDate: timestamp("last_sale_date"),
  lastSalePrice: integer("last_sale_price"),
  yearBuilt: integer("year_built"),
  riskSignals: text("risk_signals").array(),
  ownerId: varchar("owner_id").references(() => owners.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  owner: one(owners, {
    fields: [properties.ownerId],
    references: [owners.id],
  }),
  legalEvents: many(legalEvents),
}));

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

// Contact information
export const contactInfos = pgTable("contact_infos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => owners.id).notNull(),
  kind: varchar("kind").notNull(), // phone | email
  value: varchar("value").notNull(),
  source: varchar("source"),
  confidenceScore: integer("confidence_score"),
  lineType: varchar("line_type"),
  isVerified: boolean("is_verified").default(false),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contactInfosRelations = relations(contactInfos, ({ one }) => ({
  owner: one(owners, {
    fields: [contactInfos.ownerId],
    references: [owners.id],
  }),
}));

export const insertContactInfoSchema = createInsertSchema(contactInfos).omit({
  id: true,
  createdAt: true,
});
export type InsertContactInfo = z.infer<typeof insertContactInfoSchema>;
export type ContactInfo = typeof contactInfos.$inferSelect;

// Legal events - liens, lawsuits, bankruptcies, evictions
export const legalEvents = pgTable("legal_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => owners.id),
  propertyId: varchar("property_id").references(() => properties.id),
  type: varchar("type").notNull(), // lien | judgment | lawsuit | bankruptcy | eviction
  jurisdiction: varchar("jurisdiction"),
  caseNumber: varchar("case_number"),
  filedDate: timestamp("filed_date"),
  status: varchar("status"),
  amount: integer("amount"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const legalEventsRelations = relations(legalEvents, ({ one }) => ({
  owner: one(owners, {
    fields: [legalEvents.ownerId],
    references: [owners.id],
  }),
  property: one(properties, {
    fields: [legalEvents.propertyId],
    references: [properties.id],
  }),
}));

export const insertLegalEventSchema = createInsertSchema(legalEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertLegalEvent = z.infer<typeof insertLegalEventSchema>;
export type LegalEvent = typeof legalEvents.$inferSelect;

// Owner to LLC links (for unmasking)
export const ownerLlcLinks = pgTable("owner_llc_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => owners.id).notNull(),
  llcOwnerId: varchar("llc_owner_id").references(() => owners.id).notNull(),
  relationship: varchar("relationship"), // officer | agent | member | manager
  confidenceScore: integer("confidence_score"),
  aiRationale: text("ai_rationale"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ownerLlcLinksRelations = relations(ownerLlcLinks, ({ one }) => ({
  owner: one(owners, {
    fields: [ownerLlcLinks.ownerId],
    references: [owners.id],
    relationName: "personOwner",
  }),
  llc: one(owners, {
    fields: [ownerLlcLinks.llcOwnerId],
    references: [owners.id],
    relationName: "llcOwner",
  }),
}));

export const insertOwnerLlcLinkSchema = createInsertSchema(ownerLlcLinks).omit({
  id: true,
  createdAt: true,
});
export type InsertOwnerLlcLink = z.infer<typeof insertOwnerLlcLinkSchema>;
export type OwnerLlcLink = typeof ownerLlcLinks.$inferSelect;

// Search history for tracking user queries
export const searchHistory = pgTable("search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  searchType: varchar("search_type").notNull(), // property | owner
  query: jsonb("query").notNull(),
  resultCount: integer("result_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, {
    fields: [searchHistory.userId],
    references: [users.id],
  }),
}));

export const insertSearchHistorySchema = createInsertSchema(searchHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;

// Dossier exports tracking
export const dossierExports = pgTable("dossier_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  ownerId: varchar("owner_id").references(() => owners.id).notNull(),
  format: varchar("format").default("pdf"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dossierExportsRelations = relations(dossierExports, ({ one }) => ({
  user: one(users, {
    fields: [dossierExports.userId],
    references: [users.id],
  }),
  owner: one(owners, {
    fields: [dossierExports.ownerId],
    references: [owners.id],
  }),
}));

export const insertDossierExportSchema = createInsertSchema(dossierExports).omit({
  id: true,
  createdAt: true,
});
export type InsertDossierExport = z.infer<typeof insertDossierExportSchema>;
export type DossierExport = typeof dossierExports.$inferSelect;

// Dossier cache - stores enrichment data to avoid repeated API calls
export const dossierCache = pgTable("dossier_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => owners.id).notNull().unique(),
  llcUnmasking: jsonb("llc_unmasking"),
  contactEnrichment: jsonb("contact_enrichment"),
  melissaEnrichment: jsonb("melissa_enrichment"),
  enrichedOfficers: jsonb("enriched_officers"), // Officers with matched emails/phones
  aiOutreach: text("ai_outreach"),
  sellerIntentScore: integer("seller_intent_score"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enriched officer type for TypeScript
export type EnrichedOfficer = {
  name: string;
  position: string;
  role: "officer" | "member" | "agent";
  address: string | null;
  emails: Array<{ email: string; source: string; confidence: number }>;
  phones: Array<{ phone: string; type: string; source: string; confidence: number }>;
  confidenceScore: number;
};

export const dossierCacheRelations = relations(dossierCache, ({ one }) => ({
  owner: one(owners, {
    fields: [dossierCache.ownerId],
    references: [owners.id],
  }),
}));

export type DossierCache = typeof dossierCache.$inferSelect;
export type InsertDossierCache = typeof dossierCache.$inferInsert;
