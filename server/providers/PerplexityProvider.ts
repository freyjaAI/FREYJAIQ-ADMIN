import pLimit from "p-limit";
import pRetry from "p-retry";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

const limiter = pLimit(2);

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: string[];
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface DiscoveredOwner {
  name: string;
  role: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  reasoning: string;
}

export interface LlcOwnershipDiscoveryResult {
  entityName: string;
  discoveredOwners: DiscoveredOwner[];
  relatedEntities: string[];
  citations: string[];
  rawResponse: string;
  searchedAt: Date;
}

async function makePerplexityRequest(messages: PerplexityMessage[]): Promise<PerplexityResponse | null> {
  if (!PERPLEXITY_API_KEY) {
    console.error("Perplexity API key not configured");
    return null;
  }

  return limiter(() =>
    pRetry(
      async () => {
        console.log("Perplexity request: LLC ownership discovery");

        const response = await fetch(PERPLEXITY_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages,
            max_tokens: 2000,
            temperature: 0.1,
            top_p: 0.9,
            return_images: false,
            return_related_questions: false,
            stream: false,
            presence_penalty: 0,
            frequency_penalty: 1,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Perplexity error ${response.status}: ${errorText}`);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json() as PerplexityResponse;
        console.log(`Perplexity response received with ${data.citations?.length || 0} citations`);
        return data;
      },
      {
        retries: 3,
        onFailedAttempt: (error) => {
          console.log(`Perplexity attempt ${error.attemptNumber} failed`);
        },
      }
    )
  ).catch((err) => {
    console.error("Perplexity request failed:", err?.message || err);
    return null;
  });
}

export async function discoverLlcOwnership(params: {
  entityName: string;
  registeredAddress?: string;
  registeredAgent?: string;
  jurisdiction?: string;
  propertyAddress?: string;
}): Promise<LlcOwnershipDiscoveryResult | null> {
  const { entityName, registeredAddress, registeredAgent, jurisdiction, propertyAddress } = params;

  const contextParts: string[] = [];
  if (jurisdiction) contextParts.push(`registered in ${jurisdiction}`);
  if (registeredAddress) contextParts.push(`registered address: ${registeredAddress}`);
  if (registeredAgent) contextParts.push(`registered agent: ${registeredAgent}`);
  if (propertyAddress) contextParts.push(`owns property at: ${propertyAddress}`);

  const contextString = contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";

  const systemPrompt = `You are a business intelligence researcher specializing in corporate ownership research. Your task is to find the actual human owners, principals, managers, or controlling parties of LLCs and business entities.

Focus on finding:
1. Individual owners, managers, members, or principals
2. Officers like President, CEO, Managing Member, Franchisee
3. Related parent companies or holding entities
4. Business affiliations and connections
5. For franchises (McDonald's, Subway, Wendy's, etc.): Find the LOCAL FRANCHISEE who owns this specific location, not the corporate parent

Use sources like:
- BBB (Better Business Bureau) profiles - often lists franchise owners
- State Secretary of State filings
- News articles and press releases mentioning local ownership
- LinkedIn company pages
- Court records and legal filings
- Business directories and Yelp business info
- Local news articles about franchise openings
- Franchise disclosure documents (FDD)

For franchise businesses:
- The corporate parent (e.g., McDonald's Corporation) is NOT the owner we're looking for
- Look for the individual or company that operates this SPECIFIC location
- Search for "[Business Name] + [City] + owner" or "franchisee"

Always cite your sources. If you cannot find definitive ownership information, say so clearly.

IMPORTANT: Respond in valid JSON format only, with this exact structure:
{
  "owners": [
    {
      "name": "Person or Entity Name",
      "role": "Title/Role (e.g., President, Managing Member, Owner, Franchisee)",
      "confidence": "high|medium|low",
      "reasoning": "Brief explanation of why this person is connected"
    }
  ],
  "relatedEntities": ["Related Company 1", "Related Company 2"],
  "summary": "Brief summary of findings"
}`;

  const userPrompt = `Find the actual owners, principals, or managers of "${entityName}"${contextString}.

This entity appears to be privacy-protected in corporate filings, meaning only a registered agent or corporate service company is listed. I need to find the real human owners or controlling parties.

Search business databases, BBB, news, LinkedIn, and any other available sources to identify who actually owns or controls this entity.`;

  const messages: PerplexityMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await makePerplexityRequest(messages);

  if (!response || !response.choices?.[0]?.message?.content) {
    console.log("No valid response from Perplexity");
    return null;
  }

  const rawContent = response.choices[0].message.content;
  console.log("Perplexity raw response:", rawContent.substring(0, 500));

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("Could not extract JSON from Perplexity response");
      return {
        entityName,
        discoveredOwners: [],
        relatedEntities: [],
        citations: response.citations || [],
        rawResponse: rawContent,
        searchedAt: new Date(),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const discoveredOwners: DiscoveredOwner[] = (parsed.owners || []).map((owner: any) => ({
      name: owner.name || "Unknown",
      role: owner.role || "Unknown Role",
      confidence: ["high", "medium", "low"].includes(owner.confidence) ? owner.confidence : "low",
      sources: response.citations || [],
      reasoning: owner.reasoning || "",
    }));

    return {
      entityName,
      discoveredOwners,
      relatedEntities: parsed.relatedEntities || [],
      citations: response.citations || [],
      rawResponse: rawContent,
      searchedAt: new Date(),
    };
  } catch (parseError) {
    console.error("Failed to parse Perplexity response as JSON:", parseError);
    return {
      entityName,
      discoveredOwners: [],
      relatedEntities: [],
      citations: response.citations || [],
      rawResponse: rawContent,
      searchedAt: new Date(),
    };
  }
}

export function isProviderAvailable(): boolean {
  return !!PERPLEXITY_API_KEY;
}
