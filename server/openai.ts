import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry from "p-retry";
import type { Owner, Property, ContactInfo, LegalEvent } from "@shared/schema";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access
// without requiring your own OpenAI API key. Charges are billed to your Replit credits.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

const limit = pLimit(2);

async function callOpenAI(prompt: string): Promise<string> {
  return await limit(() =>
    pRetry(
      async () => {
        try {
          // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: 8192,
          });
          return response.choices[0]?.message?.content || "";
        } catch (error: any) {
          if (isRateLimitError(error)) {
            throw error;
          }
          throw new pRetry.AbortError(error);
        }
      },
      {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 16000,
        factor: 2,
      }
    )
  );
}

export interface LlcUnmaskingResult {
  confidenceScore: number;
  rationale: string;
  likelyOwner?: string;
  relationship?: string;
}

export async function unmaskLlc(
  llcName: string,
  registeredAgent?: string,
  mailingAddress?: string,
  officers?: string[]
): Promise<LlcUnmaskingResult> {
  const prompt = `You are an expert at identifying the real human owners behind LLC entities used for real estate holdings.

Given the following LLC information, analyze and determine if you can identify the likely real person(s) behind this entity:

LLC Name: ${llcName}
Registered Agent: ${registeredAgent || "Unknown"}
Mailing Address: ${mailingAddress || "Unknown"}
Officers/Members: ${officers?.join(", ") || "Unknown"}

Analyze the patterns and provide:
1. A confidence score (0-100) for how likely you can identify the real owner
2. Your rationale for the confidence score
3. If confident, the likely owner name
4. The likely relationship (officer, agent, member, manager)

Respond in JSON format:
{
  "confidenceScore": <number 0-100>,
  "rationale": "<explanation>",
  "likelyOwner": "<name or null>",
  "relationship": "<officer|agent|member|manager or null>"
}`;

  try {
    let response = await callOpenAI(prompt);
    // Strip markdown code fences if present (```json ... ```)
    response = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(response);
    return {
      confidenceScore: parsed.confidenceScore || 0,
      rationale: parsed.rationale || "",
      likelyOwner: parsed.likelyOwner,
      relationship: parsed.relationship,
    };
  } catch (error) {
    console.error("Error unmasking LLC:", error);
    return {
      confidenceScore: 0,
      rationale: "Unable to analyze LLC information",
    };
  }
}

export function calculateSellerIntentScore(
  owner: Owner,
  properties: Property[],
  legalEvents: LegalEvent[]
): { score: number; breakdown: Record<string, any> } {
  let score = 50; // Base score
  const breakdown: Record<string, any> = {
    yearsOwned: 0,
    taxDelinquent: false,
    absenteeOwner: false,
    hasLiens: false,
    marketAppreciation: 0,
  };

  // Calculate years owned from oldest property
  const oldestSale = properties.reduce((oldest, p) => {
    if (!p.lastSaleDate) return oldest;
    const saleDate = new Date(p.lastSaleDate);
    return !oldest || saleDate < oldest ? saleDate : oldest;
  }, null as Date | null);

  if (oldestSale) {
    const yearsOwned = (Date.now() - oldestSale.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    breakdown.yearsOwned = Math.round(yearsOwned);
    
    // Long ownership = higher likelihood of selling (10+ years)
    if (yearsOwned > 10) score += 15;
    else if (yearsOwned > 7) score += 10;
    else if (yearsOwned > 5) score += 5;
  }

  // Check for tax delinquency
  const hasTaxDelinquency = properties.some(
    (p) => p.riskSignals?.includes("tax_delinquent")
  );
  if (hasTaxDelinquency) {
    breakdown.taxDelinquent = true;
    score += 20;
  }

  // Check for absentee owner
  const isAbsentee = owner.mailingAddress && owner.primaryAddress &&
    owner.mailingAddress !== owner.primaryAddress;
  if (isAbsentee) {
    breakdown.absenteeOwner = true;
    score += 10;
  }

  // Check for liens
  const hasLiens = legalEvents.some((e) => e.type === "lien" || e.type === "tax_lien");
  if (hasLiens) {
    breakdown.hasLiens = true;
    score += 15;
  }

  // Check for litigation
  const hasLitigation = legalEvents.some((e) => e.type === "lawsuit" || e.type === "judgment");
  if (hasLitigation) {
    score += 10;
  }

  // Check for bankruptcy
  const hasBankruptcy = legalEvents.some((e) => e.type === "bankruptcy");
  if (hasBankruptcy) {
    score += 25;
  }

  // Market appreciation (mock calculation)
  const totalValue = properties.reduce((sum, p) => sum + (p.assessedValue || 0), 0);
  const totalPurchasePrice = properties.reduce((sum, p) => sum + (p.lastSalePrice || 0), 0);
  if (totalPurchasePrice > 0) {
    const appreciation = ((totalValue - totalPurchasePrice) / totalPurchasePrice) * 100;
    breakdown.marketAppreciation = Math.round(appreciation);
    if (appreciation > 50) score += 10;
  }

  // Cap score at 100
  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

export async function generateOutreachSuggestion(
  owner: Owner,
  properties: Property[],
  sellerIntentScore: number
): Promise<string> {
  const propertyList = properties
    .slice(0, 3)
    .map((p) => `${p.address}, ${p.city} ${p.state}`)
    .join("; ");

  const prompt = `You are a commercial real estate broker writing a personalized outreach message.

Owner: ${owner.name}
Owner Type: ${owner.type === "entity" ? "LLC/Entity" : "Individual"}
Properties: ${propertyList}
Number of Properties: ${properties.length}
Seller Intent Score: ${sellerIntentScore}/100 (higher = more likely to sell)

Write a brief, professional cold outreach message (2-3 sentences) that:
1. Is personalized to the owner's situation
2. Mentions a specific reason for reaching out
3. Ends with a soft call to action

Keep it conversational and not salesy. Do not include subject line or greeting.`;

  try {
    const response = await callOpenAI(prompt);
    return response.trim();
  } catch (error) {
    console.error("Error generating outreach:", error);
    return `Hi ${owner.name}, I noticed your portfolio of ${properties.length} properties and wanted to reach out to discuss potential opportunities in the current market. Would you have a few minutes to chat about your investment goals?`;
  }
}

export async function calculateContactConfidence(
  phone: string,
  email: string,
  source: string
): Promise<{ phoneConfidence: number; emailConfidence: number }> {
  // In production, this would call verification APIs like IDICIA, TowerData, etc.
  // For MVP, we use heuristics based on source and format
  
  let phoneConfidence = 50;
  let emailConfidence = 50;

  // Phone confidence based on format and source
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      phoneConfidence += 15;
    }
    if (source === "IDICIA" || source === "carrier_verified") {
      phoneConfidence += 25;
    } else if (source === "public_records") {
      phoneConfidence += 10;
    }
  }

  // Email confidence based on format and source
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      emailConfidence += 15;
    }
    if (source === "TowerData" || source === "verified") {
      emailConfidence += 25;
    } else if (source === "public_records") {
      emailConfidence += 10;
    }
    // Business emails are more reliable
    if (!email.includes("gmail") && !email.includes("yahoo") && !email.includes("hotmail")) {
      emailConfidence += 10;
    }
  }

  return {
    phoneConfidence: Math.min(100, phoneConfidence),
    emailConfidence: Math.min(100, emailConfidence),
  };
}
