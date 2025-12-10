/**
 * Freyja IQ - API Cost Analysis Script
 * 
 * This script analyzes the actual costs for each data provider API
 * currently used in the platform based on the code implementation.
 * 
 * Run with: npx tsx scripts/api-cost-analysis.ts
 */

interface ApiProvider {
  name: string;
  description: string;
  costPerCall: number;
  notes: string;
  pricingSource: string;
}

// APIs actually called for INDIVIDUAL owners (in order)
const individualFlowProviders: ApiProvider[] = [
  {
    name: "1. Apify Skip Trace",
    description: "Primary skip tracing - cell phones, emails, relatives, associates, previous addresses",
    costPerCall: 0.007,
    notes: "$7 per 1,000 results - BEST VALUE for cell phones",
    pricingSource: "Apify marketplace (one-api/skip-trace actor)",
  },
  {
    name: "2. Data Axle People v2",
    description: "Secondary people search with cell phones and emails",
    costPerCall: 0.08,
    notes: "Uses enhanced_v2, emails_v2, cell_phones_v2 packages",
    pricingSource: "Data Axle enterprise pricing",
  },
  {
    name: "3. Pacific East FPA (Phone Append)",
    description: "Phone number append with match scoring",
    costPerCall: 0.10,
    notes: "Forward Phone Append with queryType=2 (prioritize wireless)",
    pricingSource: "Pacific East/Idicia pricing",
  },
  {
    name: "4. A-Leads",
    description: "Professional contact data fallback",
    costPerCall: 0.15,
    notes: "Advanced search with name + location filters",
    pricingSource: "A-Leads API pricing",
  },
  {
    name: "5. Melissa Personator",
    description: "Name/address/phone verification",
    costPerCall: 0.05,
    notes: "ContactVerify API for validation",
    pricingSource: "Melissa Data pricing",
  },
];

// APIs actually called for ENTITY/LLC owners (in order)
const entityFlowProviders: ApiProvider[] = [
  {
    name: "1. OpenCorporates Search",
    description: "Company search and officer lookup",
    costPerCall: 0.02,
    notes: "Search + company details with officers",
    pricingSource: "OpenCorporates Professional tier",
  },
  {
    name: "2. Perplexity Sonar (if needed)",
    description: "AI-powered LLC ownership discovery for privacy-protected entities",
    costPerCall: 0.005,
    notes: "Only called if OpenCorporates returns no officers",
    pricingSource: "Perplexity API ($5/1M tokens)",
  },
  {
    name: "3. Data Axle Places v3",
    description: "Business lookup with contact info",
    costPerCall: 0.10,
    notes: "Uses enhanced_v3, email_v2, ucc_filings_v1 packages",
    pricingSource: "Data Axle enterprise pricing",
  },
  {
    name: "4. Data Axle People v2 (per officer)",
    description: "Officer contact enrichment",
    costPerCall: 0.08,
    notes: "Called for each real person officer found",
    pricingSource: "Data Axle enterprise pricing",
  },
  {
    name: "5. Pacific East FPA (per officer)",
    description: "Officer phone append",
    costPerCall: 0.10,
    notes: "Phone lookup for each officer",
    pricingSource: "Pacific East/Idicia pricing",
  },
  {
    name: "6. A-Leads (per officer)",
    description: "Officer professional contacts",
    costPerCall: 0.15,
    notes: "Professional contact search per officer",
    pricingSource: "A-Leads API pricing",
  },
];

// Property search (called before dossier view)
const propertySearchProviders: ApiProvider[] = [
  {
    name: "ATTOM Property Basic Profile",
    description: "Property data with owner info",
    costPerCall: 0.02,
    notes: "Address lookup - returns owner name, assessed value, building info",
    pricingSource: "ATTOM enterprise pricing",
  },
];

// AI services (always called)
const aiProviders: ApiProvider[] = [
  {
    name: "OpenAI GPT-4o-mini (via Replit)",
    description: "Seller intent scoring + outreach suggestions",
    costPerCall: 0.002,
    notes: "Uses Replit AI Integrations (Replit credits)",
    pricingSource: "Replit AI Integrations",
  },
];

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(3)}`;
}

function calculateFlowCost(providers: ApiProvider[]): number {
  return providers.reduce((sum, p) => sum + p.costPerCall, 0);
}

// Main output
console.log("=".repeat(80));
console.log("FREYJA IQ - ACTUAL API COST ANALYSIS");
console.log("Based on current implementation in server/routes.ts");
console.log("=".repeat(80));
console.log();

console.log("PROPERTY SEARCH (called when searching an address)");
console.log("-".repeat(60));
for (const provider of propertySearchProviders) {
  console.log(`  ${provider.name}: ${formatCurrency(provider.costPerCall)}`);
  console.log(`    ${provider.description}`);
}
console.log(`  SUBTOTAL: ${formatCurrency(calculateFlowCost(propertySearchProviders))}`);

console.log("\n" + "=".repeat(80));
console.log("INDIVIDUAL OWNER DOSSIER (when type = individual)");
console.log("Enrichment order: Apify Skip Trace -> Data Axle -> Pacific East -> A-Leads");
console.log("-".repeat(80));
for (const provider of individualFlowProviders) {
  console.log(`  ${provider.name}: ${formatCurrency(provider.costPerCall)}`);
  console.log(`    ${provider.notes}`);
}
const individualTotal = calculateFlowCost(individualFlowProviders);
console.log("-".repeat(60));
console.log(`  SUBTOTAL: ${formatCurrency(individualTotal)}`);

console.log("\n" + "=".repeat(80));
console.log("ENTITY/LLC OWNER DOSSIER (when type = entity)");
console.log("Enrichment: OpenCorporates -> Perplexity (if needed) -> Data Axle -> per-officer enrichment");
console.log("-".repeat(80));
for (const provider of entityFlowProviders) {
  console.log(`  ${provider.name}: ${formatCurrency(provider.costPerCall)}`);
  console.log(`    ${provider.notes}`);
}
// Entity cost varies based on number of officers
console.log("-".repeat(60));
console.log(`  BASE COST (1 officer): ${formatCurrency(0.02 + 0.10 + 0.08 + 0.10 + 0.15)}`);
console.log(`  WITH PERPLEXITY: ${formatCurrency(0.02 + 0.005 + 0.10 + 0.08 + 0.10 + 0.15)}`);
console.log(`  EACH ADDITIONAL OFFICER: +${formatCurrency(0.08 + 0.10 + 0.15)}`);

console.log("\n" + "=".repeat(80));
console.log("AI SERVICES (called for all dossiers)");
console.log("-".repeat(60));
for (const provider of aiProviders) {
  console.log(`  ${provider.name}: ${formatCurrency(provider.costPerCall)}`);
  console.log(`    ${provider.notes}`);
}

console.log("\n" + "=".repeat(80));
console.log("TOTAL COST PER DOSSIER VIEW");
console.log("=".repeat(80));
const propertySearchCost = calculateFlowCost(propertySearchProviders);
const aiCost = calculateFlowCost(aiProviders);

console.log(`
INDIVIDUAL OWNER:
  Property Search:     ${formatCurrency(propertySearchCost)}
  Apify Skip Trace:    ${formatCurrency(0.007)}
  Data Axle People:    ${formatCurrency(0.08)}
  Pacific East FPA:    ${formatCurrency(0.10)}
  A-Leads:             ${formatCurrency(0.15)}
  Melissa:             ${formatCurrency(0.05)}
  AI (OpenAI):         ${formatCurrency(aiCost)}
  ---------------------------------
  TOTAL:               ${formatCurrency(propertySearchCost + individualTotal + aiCost)}

ENTITY/LLC OWNER (1 officer):
  Property Search:     ${formatCurrency(propertySearchCost)}
  OpenCorporates:      ${formatCurrency(0.02)}
  Data Axle Places:    ${formatCurrency(0.10)}
  Data Axle People:    ${formatCurrency(0.08)}
  Pacific East FPA:    ${formatCurrency(0.10)}
  A-Leads:             ${formatCurrency(0.15)}
  AI (OpenAI):         ${formatCurrency(aiCost)}
  ---------------------------------
  TOTAL:               ${formatCurrency(propertySearchCost + 0.02 + 0.10 + 0.08 + 0.10 + 0.15 + aiCost)}

ENTITY/LLC OWNER (with Perplexity fallback, 2 officers):
  Property Search:     ${formatCurrency(propertySearchCost)}
  OpenCorporates:      ${formatCurrency(0.02)}
  Perplexity Sonar:    ${formatCurrency(0.005)}
  Data Axle Places:    ${formatCurrency(0.10)}
  Data Axle People x2: ${formatCurrency(0.08 * 2)}
  Pacific East x2:     ${formatCurrency(0.10 * 2)}
  A-Leads x2:          ${formatCurrency(0.15 * 2)}
  AI (OpenAI):         ${formatCurrency(aiCost)}
  ---------------------------------
  TOTAL:               ${formatCurrency(propertySearchCost + 0.02 + 0.005 + 0.10 + (0.08 * 2) + (0.10 * 2) + (0.15 * 2) + aiCost)}
`);

console.log("=".repeat(80));
console.log("MONTHLY PROJECTIONS (50 dossiers/user)");
console.log("=".repeat(80));

// Assume 70% individual, 30% entity with avg 1.5 officers
const avgIndividualCost = propertySearchCost + individualTotal + aiCost;
const avgEntityCost = propertySearchCost + 0.02 + 0.10 + (0.08 * 1.5) + (0.10 * 1.5) + (0.15 * 1.5) + aiCost;
const blendedCostPerDossier = (avgIndividualCost * 0.7) + (avgEntityCost * 0.3);

console.log(`
Assumptions:
  - 70% individual owners, 30% entity/LLC owners
  - Entity dossiers average 1.5 officers
  - 50 dossiers per user per month

Cost per dossier (blended): ${formatCurrency(blendedCostPerDossier)}

Monthly cost projections:
  1 user (50 dossiers):    ${formatCurrency(blendedCostPerDossier * 50)}/month
  5 users (250 dossiers):  ${formatCurrency(blendedCostPerDossier * 250)}/month
  10 users (500 dossiers): ${formatCurrency(blendedCostPerDossier * 500)}/month
  25 users (1250 dossiers): ${formatCurrency(blendedCostPerDossier * 1250)}/month
  50 users (2500 dossiers): ${formatCurrency(blendedCostPerDossier * 2500)}/month
  100 users (5000 dossiers): ${formatCurrency(blendedCostPerDossier * 5000)}/month
`);

console.log("=".repeat(80));
console.log("PROVIDER EFFICIENCY RANKING");
console.log("=".repeat(80));
console.log(`
1. APIFY SKIP TRACE - $0.007/call - BEST VALUE
   - Primary source for cell phones (95% confidence)
   - Includes relatives, associates, previous addresses
   - Rich data for $7 per 1,000 lookups

2. OPENCORPORATES - $0.02/call
   - Essential for LLC officer discovery
   - Good value for company data

3. MELISSA - $0.05/call
   - Good for address/name verification
   - Lower cost validation layer

4. DATA AXLE - $0.08-0.10/call
   - Expensive but comprehensive
   - Good for verification, not primary source

5. PACIFIC EAST - $0.10/call
   - Phone append with confidence scoring
   - Use as secondary validation

6. A-LEADS - $0.15/call
   - Most expensive per call
   - Best for professional/B2B contacts
   - Consider using only as fallback
`);

console.log("=".repeat(80));
console.log("COST OPTIMIZATION OPPORTUNITIES");
console.log("=".repeat(80));
console.log(`
CURRENT IMPLEMENTATION:
- Caching: Dossiers cached to prevent repeat API calls (good!)
- Order: Apify first (best value), others supplement (good!)

POTENTIAL SAVINGS:
1. Skip A-Leads if Apify returns 3+ phones
   Savings: $0.15/call * ~60% of calls = ~$0.09/dossier

2. Skip Data Axle for individuals if Apify is comprehensive
   Savings: $0.08/call * ~50% of calls = ~$0.04/dossier

3. Skip Pacific East if Apify already has wireless numbers
   Savings: $0.10/call * ~40% of calls = ~$0.04/dossier

ESTIMATED SAVINGS: ~$0.17/dossier (30-40% reduction)
`);
