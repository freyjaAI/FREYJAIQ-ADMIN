import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "jspdf",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// ESM-only packages that must be external
const esmOnlyPackages = [
  "bcrypt",
  "memoizee", 
  "memorystore",
  "connect-pg-simple",
  "openid-client",
  "p-limit",
  "p-retry",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  // Build as ESM first
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.mjs",
    banner: {
      js: `import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: [...externals, ...esmOnlyPackages],
    logLevel: "info",
  });

  // Create a CJS wrapper that imports the ESM bundle
  const cjsWrapper = `
const { pathToFileURL } = require('url');
const { resolve } = require('path');

const esmPath = resolve(__dirname, 'index.mjs');
import(pathToFileURL(esmPath).href).catch(err => {
  console.error('Failed to load ESM module:', err);
  process.exit(1);
});
`;
  await writeFile("dist/index.cjs", cjsWrapper.trim());
  console.log("Created CJS wrapper at dist/index.cjs");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
