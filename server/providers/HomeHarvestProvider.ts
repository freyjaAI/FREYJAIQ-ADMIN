import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HomeHarvestPropertyData {
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    fullAddress: string;
  };
  property: {
    propertyType: string;
    style: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    lotSqft: number | null;
    yearBuilt: number | null;
    stories: number | null;
    parkingGarage: number | null;
  };
  pricing: {
    listPrice: number | null;
    soldPrice: number | null;
    pricePerSqft: number | null;
    estimatedValue: number | null;
    taxAssessedValue: number | null;
  };
  listing: {
    status: string;
    listDate: string;
    soldDate: string;
    lastSoldDate: string;
    daysOnMls: number | null;
    mlsId: string;
    mlsNumber: string;
  };
  agent: {
    name: string;
    phone: string;
    email: string;
  };
  broker: {
    name: string;
    phone: string;
  };
  hoa: {
    fee: number | null;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    neighborhoods: string;
  };
  source: string;
  propertyUrl: string;
}

export interface HomeHarvestLookupResult {
  success: boolean;
  error?: string;
  data: HomeHarvestPropertyData | null;
}

export interface HomeHarvestSearchResult {
  success: boolean;
  error?: string;
  data: Array<{
    address: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    propertyType: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    listPrice: number | null;
    status: string;
    yearBuilt: number | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  count: number;
}

const SCRIPT_PATH = path.join(__dirname, "../python/homeharvest_lookup.py");
const TIMEOUT_MS = 30000;

function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[HomeHarvest] Running: python3 ${SCRIPT_PATH} ${args.join(" ")}`);
    
    const process = spawn("python3", [SCRIPT_PATH, ...args], {
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        console.error(`[HomeHarvest] Process exited with code ${code}`);
        console.error(`[HomeHarvest] stderr: ${stderr}`);
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    process.on("error", (err) => {
      console.error(`[HomeHarvest] Process error:`, err);
      reject(err);
    });
  });
}

export async function lookupProperty(address: string): Promise<HomeHarvestLookupResult> {
  console.log(`[HomeHarvest] Looking up property: ${address}`);
  
  try {
    const output = await runPythonScript(["lookup", address]);
    const result = JSON.parse(output) as HomeHarvestLookupResult;
    
    if (result.success && result.data) {
      console.log(`[HomeHarvest] Found property: ${result.data.address.fullAddress}`);
      console.log(`[HomeHarvest] Property details - sqft: ${result.data.property.sqft}, yearBuilt: ${result.data.property.yearBuilt}`);
    } else {
      console.log(`[HomeHarvest] No property found: ${result.error || "Unknown error"}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[HomeHarvest] Lookup failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      data: null,
    };
  }
}

export async function searchProperties(
  location: string,
  listingType: "for_sale" | "for_rent" | "sold" | "pending" = "for_sale",
  limit: number = 10
): Promise<HomeHarvestSearchResult> {
  console.log(`[HomeHarvest] Searching properties in: ${location}, type: ${listingType}, limit: ${limit}`);
  
  try {
    const output = await runPythonScript(["search", location, listingType, String(limit)]);
    const result = JSON.parse(output) as HomeHarvestSearchResult;
    
    console.log(`[HomeHarvest] Found ${result.count || 0} properties`);
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[HomeHarvest] Search failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      data: [],
      count: 0,
    };
  }
}

export function isProviderAvailable(): boolean {
  return true;
}
