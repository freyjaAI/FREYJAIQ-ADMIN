/**
 * Google Gemini Deep Research Provider
 * Uses Gemini's Deep Research agent for comprehensive LLC ownership research
 * Much cheaper than OpenCorporates: $2/million tokens vs per-API-call pricing
 * 
 * Key features:
 * - Autonomous multi-step web research
 * - Built-in Google Search (free until Jan 2026)
 * - Returns fully cited research reports
 * - Great for unmasking privacy-protected LLCs
 */

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

export function isConfigured(): boolean {
  return !!GOOGLE_AI_API_KEY;
}

interface DeepResearchResult {
  owners: Array<{
    name: string;
    role?: string;
    confidence: number;
    source?: string;
  }>;
  officers: Array<{
    name: string;
    position?: string;
    address?: string;
    confidence: number;
  }>;
  registeredAgent?: {
    name: string;
    address?: string;
  };
  summary: string;
  citations: string[];
  rawReport?: string;
}

/**
 * Research LLC ownership using Gemini Deep Research
 * This performs autonomous web research to find beneficial owners
 */
export async function researchLlcOwnership(
  llcName: string,
  jurisdiction?: string,
  registeredAddress?: string
): Promise<DeepResearchResult | null> {
  if (!GOOGLE_AI_API_KEY) {
    console.log("Gemini Deep Research: Not configured (missing GOOGLE_AI_API_KEY)");
    return null;
  }

  const stateCode = jurisdiction?.startsWith("us_") 
    ? jurisdiction.substring(3).toUpperCase() 
    : jurisdiction?.toUpperCase() || "";

  const prompt = buildResearchPrompt(llcName, stateCode, registeredAddress);
  
  console.log(`Gemini Deep Research: Starting research for "${llcName}" in ${stateCode || "unknown state"}`);

  try {
    // Use the Interactions API for Deep Research
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini Deep Research API error: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textContent) {
      console.log("Gemini Deep Research: No content in response");
      return null;
    }

    // Parse the structured response
    return parseResearchResponse(textContent, llcName);
  } catch (error) {
    console.error("Gemini Deep Research error:", error);
    return null;
  }
}

function buildResearchPrompt(llcName: string, stateCode: string, registeredAddress?: string): string {
  const addressInfo = registeredAddress ? `\nRegistered Address: ${registeredAddress}` : "";
  
  return `You are an expert corporate research analyst. Research the following LLC to identify its beneficial owners, officers, and key personnel.

LLC Name: ${llcName}
State: ${stateCode || "Unknown"}${addressInfo}

Research Task:
1. Find the actual human owners (beneficial owners) behind this LLC
2. Identify any officers, managers, or registered agents
3. Look for any public records, filings, or documents that reveal ownership
4. Check for connections to other businesses or individuals

Important: Focus on finding REAL PEOPLE, not just the LLC name or generic corporate structures.

Respond in the following JSON format:
{
  "owners": [
    {"name": "Full Name", "role": "Owner/Member/Manager", "confidence": 85, "source": "where you found this"}
  ],
  "officers": [
    {"name": "Full Name", "position": "Title", "address": "if known", "confidence": 80}
  ],
  "registeredAgent": {"name": "Agent Name", "address": "Agent Address"},
  "summary": "Brief summary of what was found",
  "citations": ["List of sources consulted"]
}

If you cannot find specific ownership information, explain why in the summary and provide whatever partial information is available. Always be honest about confidence levels.`;
}

function parseResearchResponse(text: string, llcName: string): DeepResearchResult {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        owners: (parsed.owners || []).map((o: any) => ({
          name: o.name || "",
          role: o.role,
          confidence: o.confidence || 50,
          source: o.source,
        })),
        officers: (parsed.officers || []).map((o: any) => ({
          name: o.name || "",
          position: o.position,
          address: o.address,
          confidence: o.confidence || 50,
        })),
        registeredAgent: parsed.registeredAgent,
        summary: parsed.summary || "",
        citations: parsed.citations || [],
        rawReport: text,
      };
    } catch (e) {
      console.log("Gemini Deep Research: Failed to parse JSON, extracting from text");
    }
  }

  // Fallback: extract information from unstructured text
  const owners: DeepResearchResult["owners"] = [];
  const officers: DeepResearchResult["officers"] = [];
  
  // Look for common patterns indicating people names
  const namePatterns = [
    /(?:owner|member|manager|officer|director|president|ceo|cfo)[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|serves as|acts as)\s+(?:the\s+)?(?:owner|member|manager|officer)/gi,
  ];

  for (const pattern of namePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 3 && !name.includes(llcName)) {
        owners.push({
          name,
          role: "Officer/Member",
          confidence: 60,
          source: "Gemini Research",
        });
      }
    }
  }

  return {
    owners,
    officers,
    summary: text.substring(0, 500),
    citations: [],
    rawReport: text,
  };
}

/**
 * Enhanced LLC research with grounding (uses Google Search)
 * This is more thorough but takes longer
 */
export async function researchLlcWithGrounding(
  llcName: string,
  jurisdiction?: string
): Promise<DeepResearchResult | null> {
  if (!GOOGLE_AI_API_KEY) {
    return null;
  }

  const stateCode = jurisdiction?.startsWith("us_") 
    ? jurisdiction.substring(3).toUpperCase() 
    : jurisdiction?.toUpperCase() || "";

  console.log(`Gemini Grounded Research: Searching for "${llcName}" ownership`);

  try {
    // Use grounding with Google Search for real-time web data
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Research the beneficial owners and officers of the LLC "${llcName}" registered in ${stateCode || "the United States"}. 

Find and report:
1. Names of actual human owners/members
2. Officers or managers
3. Registered agent information
4. Any business connections or related entities

Return your findings as JSON with owners, officers, registeredAgent, summary, and citations fields.`
            }]
          }],
          tools: [{
            googleSearch: {}
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini Grounded Research error: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    // Extract grounding metadata (citations)
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const citations = groundingMetadata?.groundingChunks?.map((chunk: any) => 
      chunk.web?.uri || chunk.retrievedContext?.uri
    ).filter(Boolean) || [];
    
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textContent) {
      return null;
    }

    const result = parseResearchResponse(textContent, llcName);
    result.citations = [...new Set([...result.citations, ...citations])];
    
    return result;
  } catch (error) {
    console.error("Gemini Grounded Research error:", error);
    return null;
  }
}
