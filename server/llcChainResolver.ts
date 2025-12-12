import { getCachedLlcData } from "./routes";
import { trackProviderCall } from "./providerConfig";

export interface ChainNode {
  name: string;
  type: "entity" | "individual";
  role?: string;
  confidence?: number;
  jurisdiction?: string;
  registeredAgent?: string;
  depth: number;
}

export interface OwnershipChain {
  rootEntity: string;
  chain: ChainNode[];
  ultimateBeneficialOwners: ChainNode[];
  maxDepthReached: boolean;
  resolvedAt: Date;
  totalApiCalls: number;
}

const MAX_CHAIN_DEPTH = 5;
const ENTITY_KEYWORDS = ["LLC", "INC", "CORP", "LP", "LLP", "TRUST", "COMPANY", "HOLDINGS", "PROPERTIES", "INVESTMENTS", "CAPITAL", "PARTNERS", "GROUP", "VENTURES", "MANAGEMENT", "ENTERPRISES", "SERVICES", "REALTY", "DEVELOPMENT", "ASSOCIATES"];

function isEntityName(name: string): boolean {
  const upperName = name.toUpperCase();
  return ENTITY_KEYWORDS.some(keyword => upperName.includes(keyword));
}

function normalizeEntityName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
}

export async function resolveOwnershipChain(
  entityName: string,
  jurisdiction?: string
): Promise<OwnershipChain> {
  const visited = new Set<string>();
  const chain: ChainNode[] = [];
  const ultimateBeneficialOwners: ChainNode[] = [];
  let apiCalls = 0;
  let maxDepthReached = false;

  async function traverse(
    name: string,
    depth: number,
    role?: string
  ): Promise<void> {
    const normalizedName = normalizeEntityName(name);
    
    if (visited.has(normalizedName)) {
      console.log(`[LLC Chain] Loop detected: "${name}" already visited`);
      return;
    }
    
    if (depth > MAX_CHAIN_DEPTH) {
      console.log(`[LLC Chain] Max depth ${MAX_CHAIN_DEPTH} reached at "${name}"`);
      maxDepthReached = true;
      return;
    }

    visited.add(normalizedName);

    const node: ChainNode = {
      name,
      type: isEntityName(name) ? "entity" : "individual",
      role,
      depth,
    };

    chain.push(node);

    if (!isEntityName(name)) {
      console.log(`[LLC Chain] Found individual: "${name}" at depth ${depth}`);
      ultimateBeneficialOwners.push(node);
      return;
    }

    console.log(`[LLC Chain] Researching entity: "${name}" at depth ${depth}`);
    
    try {
      const llcData = await getCachedLlcData(name, jurisdiction);
      apiCalls++;

      if (!llcData) {
        console.log(`[LLC Chain] No data found for "${name}"`);
        return;
      }

      const llc = llcData.llc;
      node.jurisdiction = llc.jurisdictionCode;
      node.registeredAgent = llc.agentName;

      const officers = llc.officers || [];
      console.log(`[LLC Chain] Found ${officers.length} officers for "${name}"`);

      for (const officer of officers) {
        if (!officer.name) continue;
        
        const officerName = officer.name.trim();
        const officerRole = officer.position || officer.role || "officer";
        const confidence = officer.confidence;

        await traverse(officerName, depth + 1, officerRole);
        
        const lastNode = chain[chain.length - 1];
        if (lastNode && lastNode.name === officerName) {
          lastNode.confidence = confidence;
        }
      }

      if (llc.agentName && !isPrivacyAgent(llc.agentName)) {
        const agentVisited = visited.has(normalizeEntityName(llc.agentName));
        if (!agentVisited) {
          console.log(`[LLC Chain] Checking registered agent: "${llc.agentName}"`);
          await traverse(llc.agentName, depth + 1, "registered_agent");
        }
      }

    } catch (error) {
      console.error(`[LLC Chain] Error researching "${name}":`, error);
    }
  }

  await traverse(entityName, 0);

  return {
    rootEntity: entityName,
    chain,
    ultimateBeneficialOwners,
    maxDepthReached,
    resolvedAt: new Date(),
    totalApiCalls: apiCalls,
  };
}

const PRIVACY_AGENTS = [
  "CORPORATION SERVICE COMPANY",
  "CSC",
  "CT CORPORATION",
  "REGISTERED AGENTS INC",
  "NATIONAL REGISTERED AGENTS",
  "NORTHWEST REGISTERED AGENT",
  "INCORP SERVICES",
  "LEGALZOOM",
  "HARBOR COMPLIANCE",
  "COGENCY GLOBAL",
  "UNITED STATES CORPORATION AGENTS",
  "VCORP SERVICES",
];

function isPrivacyAgent(agentName: string): boolean {
  const upper = agentName.toUpperCase();
  return PRIVACY_AGENTS.some(agent => upper.includes(agent));
}

export function formatChainForDisplay(chain: OwnershipChain): {
  levels: Array<{
    depth: number;
    entities: ChainNode[];
  }>;
  ubos: ChainNode[];
} {
  const levelMap = new Map<number, ChainNode[]>();
  
  for (const node of chain.chain) {
    const existing = levelMap.get(node.depth) || [];
    existing.push(node);
    levelMap.set(node.depth, existing);
  }

  const levels = Array.from(levelMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([depth, entities]) => ({ depth, entities }));

  return {
    levels,
    ubos: chain.ultimateBeneficialOwners,
  };
}
