/**
 * Freyja IQ - API Cost Analysis Script
 * 
 * This script analyzes the estimated costs for each data provider API
 * used in the platform. Pricing is based on publicly available information
 * and typical enterprise pricing tiers.
 * 
 * Run with: npx tsx scripts/api-cost-analysis.ts
 */

interface ApiProvider {
  name: string;
  description: string;
  endpoints: {
    name: string;
    costPerCall: number;
    notes: string;
  }[];
  monthlyMinimum?: number;
  pricingModel: string;
  pricingSource: string;
}

const providers: ApiProvider[] = [
  {
    name: "Apify Skip Trace",
    description: "Primary skip tracing for individuals - cell phones, emails, relatives, associates",
    endpoints: [
      { name: "Skip Trace Lookup", costPerCall: 0.007, notes: "$7 per 1,000 results" },
    ],
    pricingModel: "Per result",
    pricingSource: "Apify marketplace pricing (one-api/skip-trace actor)",
  },
  {
    name: "ATTOM Data",
    description: "Property data, ownership info, assessment values, sale history",
    endpoints: [
      { name: "Property Basic Profile", costPerCall: 0.02, notes: "Address lookup with owner info" },
      { name: "Property Expanded Profile", costPerCall: 0.04, notes: "Full property details" },
      { name: "Sales History", costPerCall: 0.03, notes: "Transaction history" },
      { name: "Owner Search", costPerCall: 0.02, notes: "Search by owner name" },
    ],
    monthlyMinimum: 500,
    pricingModel: "Per API call with monthly minimum",
    pricingSource: "ATTOM enterprise pricing (varies by plan)",
  },
  {
    name: "OpenCorporates",
    description: "LLC/company lookup, officers, filings, registered agents",
    endpoints: [
      { name: "Company Search", costPerCall: 0.01, notes: "Basic search" },
      { name: "Company Details", costPerCall: 0.02, notes: "Full company profile with officers" },
      { name: "Officer Search", costPerCall: 0.015, notes: "Search for officer across companies" },
    ],
    monthlyMinimum: 250,
    pricingModel: "Per API call with monthly cap",
    pricingSource: "OpenCorporates API pricing (Professional tier)",
  },
  {
    name: "Data Axle (Infogroup)",
    description: "People search, business lookup, contact verification",
    endpoints: [
      { name: "People v2 Search", costPerCall: 0.08, notes: "Enhanced + emails + cell phones packages" },
      { name: "Places v3 Search", costPerCall: 0.10, notes: "Business lookup with UCC filings" },
      { name: "Consumer Append", costPerCall: 0.05, notes: "Contact append service" },
    ],
    monthlyMinimum: 1000,
    pricingModel: "Per record with package bundles",
    pricingSource: "Data Axle enterprise pricing (varies by package)",
  },
  {
    name: "A-Leads",
    description: "Professional contact data, skip tracing, B2B contacts",
    endpoints: [
      { name: "Advanced Search", costPerCall: 0.15, notes: "Full profile with contact info" },
      { name: "Enrichment", costPerCall: 0.12, notes: "Contact enrichment" },
    ],
    monthlyMinimum: 500,
    pricingModel: "Per contact retrieved",
    pricingSource: "A-Leads API pricing",
  },
  {
    name: "Melissa Data",
    description: "Address verification, personator, contact verification",
    endpoints: [
      { name: "Global Address Verify", costPerCall: 0.01, notes: "Address standardization" },
      { name: "Personator", costPerCall: 0.05, notes: "Name + address + phone verification" },
      { name: "Contact Verify", costPerCall: 0.04, notes: "Email/phone validation" },
    ],
    monthlyMinimum: 100,
    pricingModel: "Per transaction with credits",
    pricingSource: "Melissa Data standard API pricing",
  },
  {
    name: "Pacific East / Idicia",
    description: "DataPrime, Phone Append, Email Append, Email Validation",
    endpoints: [
      { name: "DataPrime (Name/Address)", costPerCall: 0.08, notes: "Identity verification" },
      { name: "Forward Phone Append (FPA)", costPerCall: 0.10, notes: "Phone number lookup with match score" },
      { name: "Email Append (EMA)", costPerCall: 0.06, notes: "Email discovery" },
      { name: "Email Validation (EMV)", costPerCall: 0.02, notes: "Email deliverability check" },
    ],
    pricingModel: "Per lookup",
    pricingSource: "Pacific East/Idicia enterprise pricing",
  },
  {
    name: "Perplexity AI (Sonar)",
    description: "AI-powered web search for LLC ownership discovery",
    endpoints: [
      { name: "Sonar Large 128k Online", costPerCall: 0.005, notes: "Per 1k input + output tokens combined" },
    ],
    pricingModel: "Per token (input + output)",
    pricingSource: "Perplexity API pricing ($5/1M tokens)",
  },
  {
    name: "Google Address Validation",
    description: "Geocoding and address standardization",
    endpoints: [
      { name: "Address Validation", costPerCall: 0.017, notes: "$17 per 1,000 requests" },
    ],
    pricingModel: "Per request",
    pricingSource: "Google Maps Platform pricing",
  },
  {
    name: "OpenAI (via Replit)",
    description: "AI scoring, outreach suggestions, LLC unmasking analysis",
    endpoints: [
      { name: "GPT-4o-mini", costPerCall: 0.002, notes: "Seller intent, contact confidence, outreach" },
    ],
    pricingModel: "Per completion (Replit credits)",
    pricingSource: "Replit AI Integrations (uses Replit credits)",
  },
];

// Typical usage scenarios
interface UsageScenario {
  name: string;
  description: string;
  calls: { provider: string; endpoint: string; count: number }[];
}

const scenarios: UsageScenario[] = [
  {
    name: "Single Address Search (Individual Owner)",
    description: "User searches an address, imports property, views dossier with full enrichment",
    calls: [
      { provider: "ATTOM Data", endpoint: "Property Basic Profile", count: 1 },
      { provider: "ATTOM Data", endpoint: "Sales History", count: 1 },
      { provider: "Apify Skip Trace", endpoint: "Skip Trace Lookup", count: 1 },
      { provider: "Data Axle (Infogroup)", endpoint: "People v2 Search", count: 1 },
      { provider: "Pacific East / Idicia", endpoint: "DataPrime (Name/Address)", count: 1 },
      { provider: "Pacific East / Idicia", endpoint: "Forward Phone Append (FPA)", count: 1 },
      { provider: "Pacific East / Idicia", endpoint: "Email Append (EMA)", count: 1 },
      { provider: "Pacific East / Idicia", endpoint: "Email Validation (EMV)", count: 2 },
      { provider: "A-Leads", endpoint: "Advanced Search", count: 1 },
      { provider: "Melissa Data", endpoint: "Global Address Verify", count: 1 },
      { provider: "OpenAI (via Replit)", endpoint: "GPT-4o-mini", count: 3 },
    ],
  },
  {
    name: "Single Address Search (LLC/Entity Owner)",
    description: "User searches an address with LLC owner, views dossier with LLC unmasking",
    calls: [
      { provider: "ATTOM Data", endpoint: "Property Basic Profile", count: 1 },
      { provider: "ATTOM Data", endpoint: "Sales History", count: 1 },
      { provider: "OpenCorporates", endpoint: "Company Search", count: 1 },
      { provider: "OpenCorporates", endpoint: "Company Details", count: 1 },
      { provider: "Perplexity AI (Sonar)", endpoint: "Sonar Large 128k Online", count: 1 },
      { provider: "Data Axle (Infogroup)", endpoint: "Places v3 Search", count: 1 },
      { provider: "Data Axle (Infogroup)", endpoint: "People v2 Search", count: 2 },
      { provider: "Pacific East / Idicia", endpoint: "Forward Phone Append (FPA)", count: 2 },
      { provider: "A-Leads", endpoint: "Advanced Search", count: 2 },
      { provider: "OpenAI (via Replit)", endpoint: "GPT-4o-mini", count: 4 },
    ],
  },
  {
    name: "Bulk Property Import (100 addresses)",
    description: "User imports 100 properties from ATTOM without viewing dossiers",
    calls: [
      { provider: "ATTOM Data", endpoint: "Property Basic Profile", count: 100 },
    ],
  },
  {
    name: "Monthly Active User (50 dossiers)",
    description: "Typical broker viewing 50 owner dossiers per month (mix of individual/entity)",
    calls: [
      { provider: "ATTOM Data", endpoint: "Property Basic Profile", count: 50 },
      { provider: "ATTOM Data", endpoint: "Sales History", count: 50 },
      { provider: "Apify Skip Trace", endpoint: "Skip Trace Lookup", count: 35 },
      { provider: "OpenCorporates", endpoint: "Company Search", count: 15 },
      { provider: "OpenCorporates", endpoint: "Company Details", count: 15 },
      { provider: "Perplexity AI (Sonar)", endpoint: "Sonar Large 128k Online", count: 15 },
      { provider: "Data Axle (Infogroup)", endpoint: "People v2 Search", count: 50 },
      { provider: "Data Axle (Infogroup)", endpoint: "Places v3 Search", count: 15 },
      { provider: "Pacific East / Idicia", endpoint: "DataPrime (Name/Address)", count: 35 },
      { provider: "Pacific East / Idicia", endpoint: "Forward Phone Append (FPA)", count: 50 },
      { provider: "Pacific East / Idicia", endpoint: "Email Append (EMA)", count: 50 },
      { provider: "Pacific East / Idicia", endpoint: "Email Validation (EMV)", count: 80 },
      { provider: "A-Leads", endpoint: "Advanced Search", count: 50 },
      { provider: "Melissa Data", endpoint: "Global Address Verify", count: 50 },
      { provider: "OpenAI (via Replit)", endpoint: "GPT-4o-mini", count: 150 },
    ],
  },
];

function calculateScenarioCost(scenario: UsageScenario): { total: number; breakdown: { provider: string; endpoint: string; count: number; cost: number }[] } {
  const breakdown: { provider: string; endpoint: string; count: number; cost: number }[] = [];
  let total = 0;

  for (const call of scenario.calls) {
    const provider = providers.find(p => p.name === call.provider);
    if (provider) {
      const endpoint = provider.endpoints.find(e => e.name === call.endpoint);
      if (endpoint) {
        const cost = endpoint.costPerCall * call.count;
        breakdown.push({
          provider: call.provider,
          endpoint: call.endpoint,
          count: call.count,
          cost,
        });
        total += cost;
      }
    }
  }

  return { total, breakdown };
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Main output
console.log("=".repeat(80));
console.log("FREYJA IQ - API COST ANALYSIS");
console.log("=".repeat(80));
console.log();

console.log("PROVIDER PRICING SUMMARY");
console.log("-".repeat(80));
for (const provider of providers) {
  console.log(`\n${provider.name}`);
  console.log(`  ${provider.description}`);
  console.log(`  Pricing Model: ${provider.pricingModel}`);
  if (provider.monthlyMinimum) {
    console.log(`  Monthly Minimum: ${formatCurrency(provider.monthlyMinimum)}`);
  }
  console.log(`  Source: ${provider.pricingSource}`);
  console.log(`  Endpoints:`);
  for (const endpoint of provider.endpoints) {
    console.log(`    - ${endpoint.name}: ${formatCurrency(endpoint.costPerCall)}/call (${endpoint.notes})`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("USAGE SCENARIO COST ESTIMATES");
console.log("=".repeat(80));

for (const scenario of scenarios) {
  console.log(`\n${scenario.name}`);
  console.log(`  ${scenario.description}`);
  console.log("-".repeat(60));

  const { total, breakdown } = calculateScenarioCost(scenario);

  // Group by provider
  const byProvider: Record<string, number> = {};
  for (const item of breakdown) {
    byProvider[item.provider] = (byProvider[item.provider] || 0) + item.cost;
  }

  for (const item of breakdown) {
    console.log(`  ${item.provider} - ${item.endpoint}: ${item.count}x @ ${formatCurrency(item.cost / item.count)} = ${formatCurrency(item.cost)}`);
  }
  console.log("-".repeat(60));
  console.log(`  TOTAL COST: ${formatCurrency(total)}`);
}

console.log("\n" + "=".repeat(80));
console.log("MONTHLY COST PROJECTIONS");
console.log("=".repeat(80));

const monthlyScenario = scenarios.find(s => s.name.includes("Monthly Active User"));
if (monthlyScenario) {
  const { total } = calculateScenarioCost(monthlyScenario);
  
  console.log(`\nPer User (50 dossiers/month): ${formatCurrency(total)}`);
  console.log("\nProjected Monthly Costs by User Count:");
  console.log("-".repeat(40));
  for (const userCount of [1, 5, 10, 25, 50, 100]) {
    const monthlyCost = total * userCount;
    console.log(`  ${userCount} user${userCount > 1 ? 's' : ''}: ${formatCurrency(monthlyCost)}/month`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("COST OPTIMIZATION RECOMMENDATIONS");
console.log("=".repeat(80));
console.log(`
1. CACHING STRATEGY
   - Cache ATTOM property data for 24-48 hours (property data changes rarely)
   - Cache OpenCorporates company data for 7 days (incorporations update weekly)
   - Cache skip trace results for 30 days (contacts change slowly)
   - Current implementation: Dossier cache prevents duplicate API calls

2. PRIORITIZE HIGH-VALUE CALLS
   - Apify Skip Trace provides best cell phone data at lowest cost ($0.007/call)
   - Use Pacific East as secondary validation
   - Data Axle People v2 is expensive ($0.08/call) - use for verification only

3. BATCH PROCESSING
   - ATTOM supports batch property lookups (up to 10 at once)
   - Consider nightly batch enrichment for frequently accessed properties

4. CONDITIONAL ENRICHMENT
   - Only call Perplexity for privacy-protected LLCs (when OpenCorporates fails)
   - Skip Melissa address verify if ATTOM already validated
   - Skip secondary providers if primary returns high-confidence data

5. MONTHLY MINIMUMS
   - ATTOM: $500/month - ensure consistent usage to maximize value
   - Data Axle: $1,000/month - consider usage patterns
   - OpenCorporates: $250/month - most cost-effective for LLC data
`);

console.log("=".repeat(80));
console.log("NOTES");
console.log("=".repeat(80));
console.log(`
- Pricing is estimated based on public information and typical enterprise tiers
- Actual costs may vary based on your specific contract and volume discounts
- OpenAI costs are covered by Replit AI Integrations (uses Replit credits)
- Pacific East/Idicia pricing based on development tier
- Consider negotiating volume discounts for >10,000 calls/month
`);
