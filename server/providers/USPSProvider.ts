import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { trackProviderCall } from "../providerConfig";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface USPSValidatedAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip5: string;
  zip4: string;
  zipFull: string;
  returnText?: string;
  dpvConfirmation?: string;
  dpvFootnotes?: string;
}

export interface USPSValidationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  validated: USPSValidatedAddress | null;
  raw?: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zipcode: string;
  };
}

export interface USPSCheckResult {
  success: boolean;
  configured: boolean;
  message: string;
}

const SCRIPT_PATH = path.join(__dirname, "../python/usps_lookup.py");
const TIMEOUT_MS = 15000;

function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[USPS] Running: python3 usps_lookup.py ${args[0]} ...`);
    
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
        console.error(`[USPS] Process exited with code ${code}`);
        console.error(`[USPS] stderr: ${stderr}`);
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    process.on("error", (err) => {
      console.error(`[USPS] Process error:`, err);
      reject(err);
    });
  });
}

export async function validateAddress(
  address1: string,
  city: string,
  state: string,
  zipcode?: string
): Promise<USPSValidationResult> {
  console.log(`[USPS] Validating address: ${address1}, ${city}, ${state} ${zipcode || ""}`);
  
  try {
    const args = ["validate", address1, city, state];
    if (zipcode) {
      args.push(zipcode);
    }
    
    const output = await runPythonScript(args);
    const result = JSON.parse(output) as USPSValidationResult;
    
    if (result.success && result.validated) {
      trackProviderCall("usps", false);
      console.log(`[USPS] Validated: ${result.validated.address1}, ${result.validated.city}, ${result.validated.state} ${result.validated.zipFull}`);
    } else {
      console.log(`[USPS] Validation failed: ${result.error || "Unknown error"}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[USPS] Validation failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      validated: null,
    };
  }
}

export async function validateFullAddress(fullAddress: string): Promise<USPSValidationResult> {
  console.log(`[USPS] Validating full address: ${fullAddress}`);
  
  try {
    const output = await runPythonScript(["validate_full", fullAddress]);
    const result = JSON.parse(output) as USPSValidationResult;
    
    if (result.success && result.validated) {
      trackProviderCall("usps", false);
      console.log(`[USPS] Validated: ${result.validated.address1}, ${result.validated.city}, ${result.validated.state} ${result.validated.zipFull}`);
    } else {
      console.log(`[USPS] Validation failed: ${result.error || "Unknown error"}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[USPS] Validation failed:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      validated: null,
    };
  }
}

export async function checkConfiguration(): Promise<USPSCheckResult> {
  try {
    const output = await runPythonScript(["check"]);
    return JSON.parse(output) as USPSCheckResult;
  } catch (error) {
    return {
      success: false,
      configured: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function isProviderAvailable(): boolean {
  return !!process.env.USPS_USER_ID;
}
