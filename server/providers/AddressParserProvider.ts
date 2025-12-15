import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedAddressComponents {
  addressNumber: string;
  streetNamePreDirectional: string;
  streetName: string;
  streetNamePostType: string;
  streetNamePostDirectional: string;
  occupancyType: string;
  occupancyIdentifier: string;
  placeName: string;
  stateName: string;
  zipCode: string;
  addressType: string;
}

export interface NormalizedAddress {
  line1: string;
  line2: string;
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: string;
}

export interface AddressParseResult {
  success: boolean;
  error?: string;
  parsed: ParsedAddressComponents | null;
  normalized: NormalizedAddress | null;
  raw?: string;
}

export interface NameNormalizeResult {
  success: boolean;
  error?: string;
  normalized: string;
  raw?: string;
}

const SCRIPT_PATH = path.join(__dirname, "../python/address_parser.py");
const TIMEOUT_MS = 10000;

function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[AddressParser] Running: python3 ${SCRIPT_PATH} ${args[0]} ...`);
    
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
        console.error(`[AddressParser] Process exited with code ${code}`);
        console.error(`[AddressParser] stderr: ${stderr}`);
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    process.on("error", (err) => {
      console.error(`[AddressParser] Process error:`, err);
      reject(err);
    });
  });
}

export async function parseAddress(address: string): Promise<AddressParseResult> {
  console.log(`[AddressParser] Parsing address: ${address}`);
  
  try {
    const output = await runPythonScript(["parse", address]);
    const result = JSON.parse(output) as AddressParseResult;
    
    if (result.success && result.normalized) {
      console.log(`[AddressParser] Parsed: ${result.normalized.line1}, ${result.normalized.city}, ${result.normalized.stateCode}`);
    } else {
      console.log(`[AddressParser] Parse failed: ${result.error || "Unknown error"}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AddressParser] Parse failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      parsed: null,
      normalized: null,
    };
  }
}

export async function normalizeEntityName(name: string): Promise<NameNormalizeResult> {
  console.log(`[AddressParser] Normalizing name: ${name}`);
  
  try {
    const output = await runPythonScript(["normalize_name", name]);
    const result = JSON.parse(output) as NameNormalizeResult;
    
    if (result.success) {
      console.log(`[AddressParser] Normalized name: ${result.normalized}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AddressParser] Name normalization failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      normalized: name,
      raw: name,
    };
  }
}

export function isProviderAvailable(): boolean {
  return true;
}
