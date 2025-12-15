import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { trackProviderCall } from "../providerConfig";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EmailCandidate {
  email: string;
  pattern: string;
  confidence: number;
  verified: boolean | null;
  verification_message: string;
}

export interface EmailDiscoveryResult {
  success: boolean;
  error?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  domain: string;
  hasMxRecords?: boolean;
  mxRecords?: string[];
  smtpAvailable?: boolean;
  bestMatch?: EmailCandidate;
  verifiedEmails?: EmailCandidate[];
  allCandidates?: EmailCandidate[];
  candidateCount?: number;
}

const SCRIPT_PATH = path.join(__dirname, "../python/email_sleuth.py");
const TIMEOUT_MS = 30000;

function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[EmailSleuth] Running email discovery for: ${args[0]} @ ${args[1]}`);
    
    const proc = spawn("python3", [SCRIPT_PATH, ...args], {
      timeout: TIMEOUT_MS,
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
        console.error(`[EmailSleuth] Process exited with code ${code}`);
        console.error(`[EmailSleuth] stderr: ${stderr}`);
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      console.error(`[EmailSleuth] Process error:`, err);
      reject(err);
    });
  });
}

/**
 * Discover professional email addresses for a person at a company domain.
 * 
 * @param name - Full name of the person (e.g., "John Smith")
 * @param domain - Company domain (e.g., "example.com")
 * @param verifySmtp - Whether to attempt SMTP verification (default: true)
 * @returns Email discovery result with candidates and best match
 */
export async function discoverEmail(
  name: string,
  domain: string,
  verifySmtp: boolean = true
): Promise<EmailDiscoveryResult> {
  console.log(`[EmailSleuth] Discovering email for "${name}" at ${domain}`);
  
  try {
    const args = [name, domain];
    if (!verifySmtp) {
      args.push("--no-verify");
    }
    
    const output = await runPythonScript(args);
    const result = JSON.parse(output) as EmailDiscoveryResult;
    
    if (result.success) {
      trackProviderCall("email_sleuth", false);
      console.log(`[EmailSleuth] Found ${result.candidateCount} candidates, best match: ${result.bestMatch?.email}`);
    } else {
      console.error(`[EmailSleuth] Discovery failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[EmailSleuth] Discovery error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      name,
      domain,
    };
  }
}

/**
 * Quick email pattern generation without SMTP verification.
 * Faster but less accurate.
 */
export async function generateEmailPatterns(
  name: string,
  domain: string
): Promise<EmailDiscoveryResult> {
  return discoverEmail(name, domain, false);
}

/**
 * Get the best email guess for a person at a domain.
 * Returns null if no valid patterns could be generated.
 */
export async function getBestEmailGuess(
  name: string,
  domain: string,
  verifySmtp: boolean = false
): Promise<string | null> {
  const result = await discoverEmail(name, domain, verifySmtp);
  return result.bestMatch?.email || null;
}

/**
 * Batch discover emails for multiple name/domain pairs.
 */
export async function discoverEmailsBatch(
  contacts: Array<{ name: string; domain: string }>,
  verifySmtp: boolean = false
): Promise<EmailDiscoveryResult[]> {
  console.log(`[EmailSleuth] Batch discovering emails for ${contacts.length} contacts`);
  
  const results: EmailDiscoveryResult[] = [];
  
  for (const contact of contacts) {
    try {
      const result = await discoverEmail(contact.name, contact.domain, verifySmtp);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        name: contact.name,
        domain: contact.domain,
      });
    }
  }
  
  return results;
}

export function isProviderAvailable(): boolean {
  return true;
}
