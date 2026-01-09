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
  serial,
  numeric,
  date,
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

// Subscription tiers for firm-based multi-tenant system
export const tiers = pgTable("tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // e.g. "Tier 1", "Tier 2"
  description: text("description"),
  monthlyFirmCallLimit: integer("monthly_firm_call_limit"), // max API calls across all users in firm
  monthlyUserCallLimit: integer("monthly_user_call_limit"), // per-user limit
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tiersRelations = relations(tiers, ({ many }) => ({
  firms: many(firms),
}));

export const insertTierSchema = createInsertSchema(tiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTier = z.infer<typeof insertTierSchema>;
export type Tier = typeof tiers.$inferSelect;

// Firms - companies that contract with us
export const firms = pgTable("firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  externalId: varchar("external_id"), // optional CRM ID
  tierId: varchar("tier_id").references(() => tiers.id),
  signupCode: varchar("signup_code").notNull().unique(), // unique code users use to join
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const firmsRelations = relations(firms, ({ one, many }) => ({
  tier: one(tiers, {
    fields: [firms.tierId],
    references: [tiers.id],
  }),
  users: many(users),
}));

export const insertFirmSchema = createInsertSchema(firms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFirm = z.infer<typeof insertFirmSchema>;
export type Firm = typeof firms.$inferSelect;

// User storage table for email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"), // admin | firm_admin | user
  firmId: varchar("firm_id").references(() => firms.id), // nullable for admins
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  firm: one(firms, {
    fields: [users.firmId],
    references: [firms.id],
  }),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Usage tracking per firm and user per month
export const usageSummaries = pgTable("usage_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmId: varchar("firm_id").references(() => firms.id),
  userId: varchar("user_id").references(() => users.id),
  periodStart: varchar("period_start").notNull(), // YYYY-MM format for monthly tracking
  totalCalls: integer("total_calls").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_usage_firm_period").on(table.firmId, table.periodStart),
  index("idx_usage_user_period").on(table.userId, table.periodStart),
]);

export const usageSummariesRelations = relations(usageSummaries, ({ one }) => ({
  firm: one(firms, {
    fields: [usageSummaries.firmId],
    references: [firms.id],
  }),
  user: one(users, {
    fields: [usageSummaries.userId],
    references: [users.id],
  }),
}));

export const insertUsageSummarySchema = createInsertSchema(usageSummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUsageSummary = z.infer<typeof insertUsageSummarySchema>;
export type UsageSummary = typeof usageSummaries.$inferSelect;

// Provider health tracking for external API monitoring
export const providerHealth = pgTable("provider_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerKey: varchar("provider_key").notNull().unique(),
  displayName: varchar("display_name").notNull(),
  status: varchar("status").notNull().default("healthy"), // healthy | degraded | down
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at"),
  errorCountLastHour: integer("error_count_last_hour").default(0).notNull(),
  successCountLastHour: integer("success_count_last_hour").default(0).notNull(),
  errorRateLastHour: real("error_rate_last_hour").default(0).notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastSuccessAt: timestamp("last_success_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProviderHealthSchema = createInsertSchema(providerHealth).omit({
  id: true,
  updatedAt: true,
});
export type InsertProviderHealth = z.infer<typeof insertProviderHealthSchema>;
export type ProviderHealth = typeof providerHealth.$inferSelect;

// Owner entity - can be individual or LLC/entity
export const owners = pgTable("owners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull().default("individual"), // individual | entity
  name: varchar("name").notNull(),
  akaNames: text("aka_names").array(),
  primaryAddress: text("primary_address"),
  mailingAddress: text("mailing_address"),
  propertyUnit: varchar("property_unit", { length: 50 }), // Unit number context (e.g., "PH004", "101")
  riskFlags: text("risk_flags").array(),
  sellerIntentScore: integer("seller_intent_score"),
  contactConfidenceScore: integer("contact_confidence_score"),
  // Person enrichment data from Apify Skip Trace
  age: integer("age"),
  birthDate: varchar("birth_date"),
  relatives: jsonb("relatives"), // Array of { name, age }
  associates: jsonb("associates"), // Array of { name, age }
  previousAddresses: jsonb("previous_addresses"), // Array of { address, city, state, zip, timespan }
  enrichmentSource: varchar("enrichment_source"), // apify_skip_trace | data_axle | pacific_east | a_leads
  enrichmentUpdatedAt: timestamp("enrichment_updated_at"),
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
  baseAddress: text("base_address"), // Address without unit (for building-level matching)
  propertyUnit: varchar("property_unit", { length: 50 }), // Unit/apartment number (e.g., "PH004", "101")
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
  estimatedCost: real("estimated_cost"), // Approximate cost in dollars
  providerCalls: jsonb("provider_calls"), // Breakdown of API calls per provider
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

// LLCs table - dedicated storage for company/entity searches
export const llcs = pgTable("llcs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  jurisdiction: varchar("jurisdiction"), // State code (CA, DE, NY, etc.)
  entityType: varchar("entity_type"), // LLC, Corporation, LP, etc.
  status: varchar("status"), // Active, Inactive, Dissolved
  registrationNumber: varchar("registration_number"),
  formationDate: timestamp("formation_date"),
  registeredAgent: varchar("registered_agent"),
  registeredAddress: text("registered_address"),
  principalAddress: text("principal_address"),
  opencorporatesUrl: varchar("opencorporates_url"),
  officers: jsonb("officers"), // Array of officers/members
  enrichmentData: jsonb("enrichment_data"), // Contact enrichment results
  aiOutreach: text("ai_outreach"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LlcOfficer = {
  name: string;
  position: string;
  role: "officer" | "member" | "agent" | "director";
  address?: string;
  startDate?: string;
  emails?: Array<{ email: string; source: string; confidence: number }>;
  phones?: Array<{ phone: string; type: string; source: string; confidence: number }>;
};

export const insertLlcSchema = createInsertSchema(llcs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLlc = z.infer<typeof insertLlcSchema>;
export type Llc = typeof llcs.$inferSelect;

// LLC Ownership Chains - stores resolved ownership chains for entities
export const llcOwnershipChains = pgTable("llc_ownership_chains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rootEntityName: varchar("root_entity_name").notNull(),
  rootEntityJurisdiction: varchar("root_entity_jurisdiction"),
  chain: jsonb("chain").notNull(), // Array of ChainNode
  ultimateBeneficialOwners: jsonb("ultimate_beneficial_owners").notNull(), // Array of UBO names
  maxDepthReached: boolean("max_depth_reached").default(false),
  totalApiCalls: integer("total_api_calls").default(0),
  resolvedAt: timestamp("resolved_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LlcOwnershipChainNode = {
  name: string;
  type: "entity" | "individual";
  role?: string;
  confidence?: number;
  jurisdiction?: string;
  registeredAgent?: string;
  depth: number;
};

export const insertLlcOwnershipChainSchema = createInsertSchema(llcOwnershipChains).omit({
  id: true,
  createdAt: true,
});
export type InsertLlcOwnershipChain = z.infer<typeof insertLlcOwnershipChainSchema>;
export type LlcOwnershipChain = typeof llcOwnershipChains.$inferSelect;

// =============================================================================
// ENRICHMENT PIPELINE MODEL
// =============================================================================
// Defines the phases of data enrichment for owners/entities:
//   1. address     - Address validation/standardization (USPS, Melissa, Google)
//   2. property    - Property data lookup (ATTOM, HomeHarvest)
//   3. llc_chain   - LLC ownership chain resolution (OpenCorporates, Gemini, Perplexity)
//   4. principals  - Owner/officer discovery from LLCs
//   5. contacts    - Contact enrichment (Melissa, Data Axle, Pacific East, A-Leads)
//   6. franchise   - Franchise detection (corporate vs franchised locations)
//   7. ai_summary  - AI-generated outreach and scoring (OpenAI)

export type EnrichmentStepId =
  | "address"
  | "property"
  | "llc_chain"
  | "principals"
  | "contacts"
  | "franchise"
  | "ai_summary";

export type EnrichmentStepStatusValue = "idle" | "running" | "done" | "error" | "skipped";

export interface EnrichmentStepStatus {
  id: EnrichmentStepId;
  label: string;
  status: EnrichmentStepStatusValue;
  error?: string;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface EnrichmentPipelineState {
  entityId: string;
  entityType: "individual" | "entity" | "property";
  steps: EnrichmentStepStatus[];
  overallStatus: "idle" | "running" | "complete" | "partial" | "failed";
  startedAt?: string;
  completedAt?: string;
  providersUsed: string[];
}

export const ENRICHMENT_STEP_LABELS: Record<EnrichmentStepId, string> = {
  address: "Address Validation",
  property: "Property Data",
  llc_chain: "LLC Chain Resolution",
  principals: "Principal Discovery",
  contacts: "Contact Enrichment",
  franchise: "Franchise Detection",
  ai_summary: "AI Summary & Scoring",
};

export const ENRICHMENT_STEP_ORDER: EnrichmentStepId[] = [
  "address",
  "property",
  "llc_chain",
  "principals",
  "contacts",
  "franchise",
  "ai_summary",
];

export function createInitialPipelineState(
  entityId: string,
  entityType: "individual" | "entity" | "property"
): EnrichmentPipelineState {
  return {
    entityId,
    entityType,
    steps: ENRICHMENT_STEP_ORDER.map((id) => ({
      id,
      label: ENRICHMENT_STEP_LABELS[id],
      status: "idle",
    })),
    overallStatus: "idle",
    providersUsed: [],
  };
}

// =============================================================================
// Provider Source Status - tracks data freshness and errors for each provider
// =============================================================================

export type ProviderSourceStatus = "success" | "error" | "stale" | "fallback" | "cached";

export interface ProviderSource {
  name: string;
  displayName: string;
  status: ProviderSourceStatus;
  lastUpdated?: string;
  freshnessLabel?: string; // e.g., "fresh", "2d", "1w"
  error?: string;
  canRetry?: boolean;
  retryTarget?: "contacts" | "ownership" | "property" | "franchise";
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  usps: "USPS",
  attom: "ATTOM",
  opencorporates: "OpenCorporates",
  gemini: "Gemini",
  perplexity: "Perplexity",
  data_axle: "Data Axle",
  pacific_east: "Pacific East",
  a_leads: "A-Leads",
  melissa: "Melissa",
  apify_skip_trace: "Skip Trace",
  openai: "OpenAI",
  google_address: "Google Address",
  homeharvest: "HomeHarvest",
};

// =============================================================================
// Bug Reports - For beta tester feedback
// =============================================================================

export const bugReports = pgTable("bug_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  description: text("description").notNull(),
  issueType: varchar("issue_type").default("bug"), // bug | feature | question
  screenshot: text("screenshot"), // base64 encoded image
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  viewport: varchar("viewport"),
  consoleErrors: jsonb("console_errors"),
  status: varchar("status").default("open"), // open | investigating | resolved
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertBugReportSchema = createInsertSchema(bugReports).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export type InsertBugReport = z.infer<typeof insertBugReportSchema>;
export type BugReport = typeof bugReports.$inferSelect;

// =============================================================================
// Bulk Enrichment - Family Office / Decision Maker Lookup
// =============================================================================

export const bulkEnrichmentJobs = pgTable("bulk_enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: varchar("name").notNull(),
  sourceType: varchar("source_type").notNull().default("criteria"), // criteria | upload
  status: varchar("status").notNull().default("queued"), // queued | running | succeeded | failed | cancelled
  targetingConfig: jsonb("targeting_config"), // search criteria or upload metadata
  totalTargets: integer("total_targets").default(0),
  processedTargets: integer("processed_targets").default(0),
  enrichedContacts: integer("enriched_contacts").default(0),
  errorCount: integer("error_count").default(0),
  intentThreshold: integer("intent_threshold").default(50), // minimum intent score to include
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBulkEnrichmentJobSchema = createInsertSchema(bulkEnrichmentJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});
export type InsertBulkEnrichmentJob = z.infer<typeof insertBulkEnrichmentJobSchema>;
export type BulkEnrichmentJob = typeof bulkEnrichmentJobs.$inferSelect;

// Individual targets within a bulk job
export const bulkEnrichmentTargets = pgTable("bulk_enrichment_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => bulkEnrichmentJobs.id).notNull(),
  companyName: varchar("company_name").notNull(),
  normalizedName: varchar("normalized_name"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zip: varchar("zip"),
  naicsCode: varchar("naics_code"),
  sicCode: varchar("sic_code"),
  employeeCount: integer("employee_count"),
  salesVolume: integer("sales_volume"),
  familyOfficeConfidence: integer("family_office_confidence"), // 0-100
  familyOfficeSignals: jsonb("family_office_signals"), // detection reasons
  status: varchar("status").notNull().default("pending"), // pending | processing | enriched | skipped | error
  errorMessage: text("error_message"),
  dataAxleId: varchar("data_axle_id"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertBulkEnrichmentTargetSchema = createInsertSchema(bulkEnrichmentTargets).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});
export type InsertBulkEnrichmentTarget = z.infer<typeof insertBulkEnrichmentTargetSchema>;
export type BulkEnrichmentTarget = typeof bulkEnrichmentTargets.$inferSelect;

// Enriched decision makers from bulk jobs
export const bulkEnrichmentResults = pgTable("bulk_enrichment_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => bulkEnrichmentJobs.id).notNull(),
  targetId: varchar("target_id").references(() => bulkEnrichmentTargets.id).notNull(),
  companyName: varchar("company_name").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  fullName: varchar("full_name"),
  title: varchar("title"),
  email: varchar("email"),
  phone: varchar("phone"),
  cellPhone: varchar("cell_phone"),
  linkedinUrl: varchar("linkedin_url"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zip: varchar("zip"),
  confidenceScore: integer("confidence_score"),
  intentScore: integer("intent_score"), // 0-100 likelihood of data center interest
  intentSignals: jsonb("intent_signals"), // reasons for intent score
  intentTier: varchar("intent_tier"), // active | warm | monitor
  aiSummary: text("ai_summary"), // AI-generated explanation of why this is a good data center prospect
  whyReachOut: text("why_reach_out"), // Gemini: Why this contact is worth reaching out to
  howToReachOut: text("how_to_reach_out"), // Gemini: Best approach for outreach
  whyTheyreInterested: text("why_theyre_interested"), // Gemini: Why they'd be interested in data centers
  keyTalkingPoints: jsonb("key_talking_points"), // Gemini: Array of talking points
  investmentThesis: text("investment_thesis"), // Gemini: Likely investment thesis
  recentActivity: text("recent_activity"), // Gemini: Any recent news/deals
  geminiConfidenceScore: integer("gemini_confidence_score"), // Gemini: 0-100 confidence
  geminiResearchedAt: timestamp("gemini_researched_at"), // When Gemini research was done
  providerSource: varchar("provider_source"),
  dataAxleId: varchar("data_axle_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBulkEnrichmentResultSchema = createInsertSchema(bulkEnrichmentResults).omit({
  id: true,
  createdAt: true,
});
export type InsertBulkEnrichmentResult = z.infer<typeof insertBulkEnrichmentResultSchema>;
export type BulkEnrichmentResult = typeof bulkEnrichmentResults.$inferSelect;

// Signup audit logs - track signups with code used
export const signupAuditLogs = pgTable("signup_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  firmId: varchar("firm_id").references(() => firms.id),
  signupCode: varchar("signup_code").notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_signup_audit_firm").on(table.firmId),
  index("idx_signup_audit_code").on(table.signupCode),
]);

export const insertSignupAuditLogSchema = createInsertSchema(signupAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSignupAuditLog = z.infer<typeof insertSignupAuditLogSchema>;
export type SignupAuditLog = typeof signupAuditLogs.$inferSelect;

// Provider usage metrics - persisted to survive server restarts
export const providerUsageMetrics = pgTable("provider_usage_metrics", {
  id: serial("id").primaryKey(),
  providerName: varchar("provider_name").notNull(),
  calls: integer("calls").default(0).notNull(),
  cacheHits: integer("cache_hits").default(0).notNull(),
  cacheMisses: integer("cache_misses").default(0).notNull(),
  totalCost: real("total_cost").default(0).notNull(),
  date: varchar("date").notNull(), // YYYY-MM-DD format for daily aggregation
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProviderUsageMetricSchema = createInsertSchema(providerUsageMetrics).omit({
  id: true,
  updatedAt: true,
});
export type InsertProviderUsageMetric = z.infer<typeof insertProviderUsageMetricSchema>;
export type ProviderUsageMetric = typeof providerUsageMetrics.$inferSelect;

// Family office detection heuristics
export const FAMILY_OFFICE_INDICATORS = {
  naicsCodes: ["523920", "523930", "523991", "525990"], // Investment advisors, family offices, trusts
  sicCodes: ["6282", "6722", "6726", "6799"], // Investment advice, management investment, unit trusts
  namePatterns: [
    "family office", "family capital", "family holdings", "family partners",
    "capital partners", "capital management", "capital advisors",
    "wealth management", "private wealth", "asset management",
    "investment office", "investment holdings", "private capital",
    "trust company", "family trust", "legacy capital", "legacy partners",
  ],
  titlePatterns: [
    "chief investment officer", "cio", "cto", "chief technology officer",
    "head of infrastructure", "head of real assets", "head of alternatives",
    "managing director", "principal", "partner", "director of investments",
    "portfolio manager", "real estate director", "head of real estate",
  ],
  dataCenterKeywords: [
    "data center", "data centres", "datacenter", "colocation", "colo",
    "hyperscale", "digital infrastructure", "edge computing",
    "cloud infrastructure", "hosting", "server farm", "compute",
  ],
};

// Intent scoring configuration
export interface IntentSignal {
  signal: string;
  weight: number;
  score: number;
  source: string;
}

// Test cases for validating property search accuracy
export const testCases = pgTable("test_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: varchar("address").notNull(),
  expectedOwnerName: varchar("expected_owner_name").notNull(),
  expectedOwnerType: varchar("expected_owner_type").notNull(), // individual, llc, corporation
  expectedContacts: jsonb("expected_contacts"), // { phone?: string, email?: string }
  notes: text("notes"),
  source: varchar("source"), // where we verified the data
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTestCaseSchema = createInsertSchema(testCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCases.$inferSelect;

// Test run results
export const testRuns = pgTable("test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testCaseId: varchar("test_case_id").references(() => testCases.id),
  actualOwnerName: varchar("actual_owner_name"),
  matchStatus: varchar("match_status").notNull(), // exact, partial, mismatch, error
  providersUsed: jsonb("providers_used"), // array of provider names
  cost: real("cost").default(0),
  cacheHit: boolean("cache_hit").default(false),
  executionTimeMs: integer("execution_time_ms"),
  rawResponse: jsonb("raw_response"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const testRunsRelations = relations(testRuns, ({ one }) => ({
  testCase: one(testCases, {
    fields: [testRuns.testCaseId],
    references: [testCases.id],
  }),
}));

export const insertTestRunSchema = createInsertSchema(testRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type TestRun = typeof testRuns.$inferSelect;

// Legal acceptance tracking for compliance
export const userLegalAcceptances = pgTable("user_legal_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  termsVersion: varchar("terms_version").notNull(), // e.g. "2024-01-08"
  privacyVersion: varchar("privacy_version").notNull(),
  acceptedTerms: boolean("accepted_terms").default(false).notNull(),
  acceptedPrivacy: boolean("accepted_privacy").default(false).notNull(),
  acceptedB2bUseOnly: boolean("accepted_b2b_use_only").default(false).notNull(),
  acceptedTcpaFcraCompliance: boolean("accepted_tcpa_fcra_compliance").default(false).notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
});

export const userLegalAcceptancesRelations = relations(userLegalAcceptances, ({ one }) => ({
  user: one(users, {
    fields: [userLegalAcceptances.userId],
    references: [users.id],
  }),
}));

export const insertUserLegalAcceptanceSchema = createInsertSchema(userLegalAcceptances).omit({
  id: true,
  acceptedAt: true,
});
export type InsertUserLegalAcceptance = z.infer<typeof insertUserLegalAcceptanceSchema>;
export type UserLegalAcceptance = typeof userLegalAcceptances.$inferSelect;

// Current legal document versions - update these when terms change
export const CURRENT_TERMS_VERSION = "2025-01-08";
export const CURRENT_PRIVACY_VERSION = "2025-01-08";

// Term bucket enum values for mortgage maturity predictions
export const termBucketValues = ["5yr", "7yr", "10yr", "15yr", "20yr", "other"] as const;
export type TermBucket = typeof termBucketValues[number];

// Mortgage maturity predictions for commercial properties
export const mortgageMaturityPredictions = pgTable("mortgage_maturity_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull(), // ATTOM property ID or internal reference
  mortgageRecordingDate: date("mortgage_recording_date").notNull(),
  loanAmount: numeric("loan_amount", { precision: 18, scale: 2 }), // supports up to trillions with 2 decimal places
  loanType: varchar("loan_type"), // e.g. "commercial", "conventional"
  lenderName: varchar("lender_name"),
  propertyType: varchar("property_type"), // e.g. "office", "retail", "industrial"
  predictedMaturityDate: date("predicted_maturity_date"),
  predictedTermMonths: integer("predicted_term_months"), // e.g. 60, 84, 120, 240
  termBucket: varchar("term_bucket"), // "5yr", "7yr", "10yr", "15yr", "20yr", "other"
  confidenceScore: real("confidence_score"), // 0-1 model confidence
  predictionMethod: varchar("prediction_method").notNull(), // "ml_model", "industry_standard", "manual"
  features: jsonb("features"), // all feature data used for prediction
  attomRawData: jsonb("attom_raw_data"), // cache ATTOM mortgage API response
  knownMaturityDate: date("known_maturity_date"), // training data where actual maturity is known
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_mortgage_property_id").on(table.propertyId),
  index("idx_mortgage_predicted_maturity").on(table.predictedMaturityDate),
  index("idx_mortgage_confidence").on(table.confidenceScore),
  index("idx_mortgage_created_at").on(table.createdAt),
]);

export const insertMortgageMaturityPredictionSchema = createInsertSchema(mortgageMaturityPredictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  termBucket: z.enum(termBucketValues).nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
});
export type InsertMortgageMaturityPrediction = z.infer<typeof insertMortgageMaturityPredictionSchema>;
export type MortgageMaturityPrediction = typeof mortgageMaturityPredictions.$inferSelect;

export interface TargetingConfig {
  // Geographic filters
  states?: string[];
  cities?: string[];
  zipCodes?: string[];
  // Industry filters
  naicsCodes?: string[];
  sicCodes?: string[];
  // Size filters
  minEmployees?: number;
  maxEmployees?: number;
  minSalesVolume?: number;
  maxSalesVolume?: number;
  // Name/keyword filters
  companyNameKeywords?: string[];
  excludeKeywords?: string[];
  // Title filters for decision makers
  targetTitles?: string[];
  // Enrichment options
  includeIntentScoring?: boolean;
  dataCenterIntentFocus?: boolean;
  // Quality filters
  minConfidence?: number; // Minimum family office confidence score (default: 30)
  limit?: number; // Maximum number of targets to return
  // Data source options
  useSecEdgar?: boolean; // Use FREE SEC EDGAR 13F filings instead of Data Axle Places
  useOpenMart?: boolean; // Use OpenMart for business discovery with decision-maker contacts
  useApifyInvestors?: boolean; // Use Apify Startup Investors for decision-maker enrichment
  useALeads?: boolean; // Use A-Leads Advanced Search (THE SIMPLE APPROACH - one call returns decision-makers with contacts)
}
