/**
 * Lets plain Node (22.18+/24, built-in TypeScript stripping) import the SOIE
 * sources: maps the "@/..." alias and extensionless relative imports the way the
 * Next.js build does. Imported by soie-eval.mjs and soie-wire-check.mjs.
 */
import { registerHooks } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (typeof registerHooks !== "function") {
  console.error("This script needs Node 22.18+ (module.registerHooks and TypeScript type stripping).");
  process.exit(2);
}

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      if (fs.statSync(candidate).isFile()) return pathToFileURL(candidate).href;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) base = path.join(root, "src", specifier.slice(2));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const hit = base ? resolveFile(base) : null;
    return hit ? { url: hit, shortCircuit: true } : nextResolve(specifier, context);
  },
});

export const src = (rel) => pathToFileURL(path.join(root, "src", rel)).href;
