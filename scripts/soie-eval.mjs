/**
 * Runs the SOIE evaluation suite under plain Node (no build, no network, no keys):
 *
 *   npm run soie:eval
 *
 * It executes the real engine modules (safety gate, IST date resolver, fact
 * ledger, answer verifier, rules engine, agent loop with a SCRIPTED fake model,
 * data loaders against an in-memory fake database) over synthetic patients.
 * It does not call Anthropic or any database.
 */
import { src } from "./soie-node-hooks.mjs";

const { runEval } = await import(src("services/soie/eval/index.ts"));
const report = await runEval();

console.log(`SOIE evaluation: ${report.passed}/${report.total} passed, ${report.failed} failed (${report.ms} ms)`);
for (const g of report.byGroup) console.log(`  ${g.group.padEnd(22)} ${g.passed}/${g.total}`);
for (const r of report.results.filter((x) => !x.passed)) {
  console.log(`\nFAIL ${r.id}: ${r.title}`);
  for (const f of r.failures) console.log(`    ${f}`);
}
process.exit(report.failed === 0 ? 0 : 1);
