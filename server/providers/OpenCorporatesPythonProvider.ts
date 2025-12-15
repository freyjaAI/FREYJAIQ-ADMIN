import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { trackProviderCall } from "../providerConfig";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpenCorporatesCompanyResult {
  companyNumber: string;
  name: string;
  jurisdictionCode: string;
  incorporationDate: string | null;
  dissolutionDate: string | null;
  companyType: string | null;
  currentStatus: string;
  registryUrl: string | null;
  opencorporatesUrl: string | null;
  registeredAddress: string | null;
  agentName: string | null;
  agentAddress: string | null;
  branch: {
    parentCompanyNumber: string;
    parentJurisdictionCode: string;
    parentName: string;
    parentOpencorporatesUrl: string;
  } | null;
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
    endDate?: string;
    address?: string;
    occupation?: string;
    nationality?: string;
  }>;
  filings: Array<{
    title: string;
    date: string;
    url?: string;
    description?: string;
  }>;
  previousNames: string[];
  industryCodes: string[];
}

export interface OfficerSearchResult {
  name: string;
  position: string;
  startDate?: string;
  address?: string;
  companyName: string;
  companyNumber: string;
  jurisdictionCode: string;
}

export interface CompanySearchResponse {
  success: boolean;
  error?: string;
  companies: OpenCorporatesCompanyResult[];
  totalCount: number;
  query: string;
  normalizedQuery?: string;
}

export interface OfficerSearchResponse {
  success: boolean;
  error?: string;
  officers: OfficerSearchResult[];
  totalCount: number;
  query: string;
}

export interface CompanyFetchResponse {
  success: boolean;
  error?: string;
  company: OpenCorporatesCompanyResult | null;
}

export interface OfficersFetchResponse {
  success: boolean;
  error?: string;
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
    endDate?: string;
    address?: string;
    occupation?: string;
    nationality?: string;
  }>;
}

const SCRIPT_PATH = path.join(__dirname, "../python/opencorporates_lookup.py");
const TIMEOUT_MS = 30000;

function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[OpenCorporatesPython] Running: python3 ${args[0]} ...`);
    
    const proc = spawn("python3", [SCRIPT_PATH, ...args], {
      timeout: TIMEOUT_MS,
      env: {
        ...process.env,
        OPENCORPORATES_API_KEY: process.env.OPENCORPORATES_API_KEY || "",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[OpenCorporatesPython] Process exited with code ${code}`);
        console.error(`[OpenCorporatesPython] stderr: ${stderr}`);
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      console.error(`[OpenCorporatesPython] Process error:`, err);
      reject(err);
    });
  });
}

export async function searchCompanies(
  query: string,
  jurisdiction?: string
): Promise<CompanySearchResponse> {
  console.log(`[OpenCorporatesPython] Searching companies: "${query}"${jurisdiction ? ` in ${jurisdiction}` : ""}`);
  
  try {
    const args = ["search_companies", query];
    if (jurisdiction) {
      args.push(jurisdiction);
    }
    
    const output = await runPythonScript(args);
    const result = JSON.parse(output) as CompanySearchResponse;
    
    if (result.success) {
      trackProviderCall("opencorporates", false);
      console.log(`[OpenCorporatesPython] Found ${result.companies.length} companies (total: ${result.totalCount})`);
    } else {
      console.error(`[OpenCorporatesPython] Search failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenCorporatesPython] Search error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      companies: [],
      totalCount: 0,
      query,
    };
  }
}

export async function searchOfficers(
  name: string,
  jurisdiction?: string
): Promise<OfficerSearchResponse> {
  console.log(`[OpenCorporatesPython] Searching officers: "${name}"${jurisdiction ? ` in ${jurisdiction}` : ""}`);
  
  try {
    const args = ["search_officers", name];
    if (jurisdiction) {
      args.push(jurisdiction);
    }
    
    const output = await runPythonScript(args);
    const result = JSON.parse(output) as OfficerSearchResponse;
    
    if (result.success) {
      trackProviderCall("opencorporates", false);
      console.log(`[OpenCorporatesPython] Found ${result.officers.length} officers`);
    } else {
      console.error(`[OpenCorporatesPython] Officer search failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenCorporatesPython] Officer search error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      officers: [],
      totalCount: 0,
      query: name,
    };
  }
}

export async function getCompany(
  jurisdictionCode: string,
  companyNumber: string
): Promise<CompanyFetchResponse> {
  console.log(`[OpenCorporatesPython] Fetching company: ${jurisdictionCode}/${companyNumber}`);
  
  try {
    const output = await runPythonScript(["get_company", jurisdictionCode, companyNumber]);
    const result = JSON.parse(output) as CompanyFetchResponse;
    
    if (result.success && result.company) {
      trackProviderCall("opencorporates", false);
      console.log(`[OpenCorporatesPython] Fetched company: "${result.company.name}" with ${result.company.officers.length} officers`);
    } else {
      console.error(`[OpenCorporatesPython] Fetch failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenCorporatesPython] Fetch error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      company: null,
    };
  }
}

export async function getOfficers(
  jurisdictionCode: string,
  companyNumber: string
): Promise<OfficersFetchResponse> {
  console.log(`[OpenCorporatesPython] Fetching officers for: ${jurisdictionCode}/${companyNumber}`);
  
  try {
    const output = await runPythonScript(["get_officers", jurisdictionCode, companyNumber]);
    const result = JSON.parse(output) as OfficersFetchResponse;
    
    if (result.success) {
      trackProviderCall("opencorporates", false);
      console.log(`[OpenCorporatesPython] Fetched ${result.officers.length} officers`);
    } else {
      console.error(`[OpenCorporatesPython] Officers fetch failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenCorporatesPython] Officers fetch error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      officers: [],
    };
  }
}

export async function getCompanyWithParent(
  jurisdictionCode: string,
  companyNumber: string
): Promise<{
  company: OpenCorporatesCompanyResult | null;
  parentCompany: OpenCorporatesCompanyResult | null;
}> {
  const result = await getCompany(jurisdictionCode, companyNumber);
  
  if (!result.success || !result.company) {
    return { company: null, parentCompany: null };
  }
  
  let parentCompany: OpenCorporatesCompanyResult | null = null;
  
  if (result.company.branch) {
    const { parentJurisdictionCode, parentCompanyNumber } = result.company.branch;
    console.log(`[OpenCorporatesPython] Following branch to parent: ${parentJurisdictionCode}/${parentCompanyNumber}`);
    
    const parentResult = await getCompany(parentJurisdictionCode, parentCompanyNumber);
    if (parentResult.success && parentResult.company) {
      parentCompany = parentResult.company;
      
      if (parentCompany.officers.length === 0) {
        const officersResult = await getOfficers(parentJurisdictionCode, parentCompanyNumber);
        if (officersResult.success) {
          parentCompany.officers = officersResult.officers;
        }
      }
    }
  }
  
  return { company: result.company, parentCompany };
}

export function isProviderAvailable(): boolean {
  return !!process.env.OPENCORPORATES_API_KEY;
}
