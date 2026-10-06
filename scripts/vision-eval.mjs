/**
 * Evaluates the on-device seven-segment reader (BP monitors and weighing scales)
 * under plain Node, no build and no network:
 *
 *   npm run vision:eval                      # synthetic displays, every layout
 *   npm run vision:eval -- --n 300 --dump out/   # more cases; write failing images as PGM
 *   npm run vision:eval -- --real manifest.json  # real photos (converted with scripts/vision/to-pgm.py)
 *
 * A case passes when the systolic/diastolic/pulse (or kg) read from the image equal
 * the truth; "pulse" may be null in the truth when the photo does not show it.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { src } from "./soie-node-hooks.mjs";
import { readPGM, writePGM } from "./vision/pgm.mjs";

const { readSevenSegment } = await import(src("lib/vision/seven-segment.ts"));
const { interpretBP } = await import(src("lib/vision/bp-reader.ts"));
const { interpretWeight, pickDisplayNumber } = await import(src("lib/vision/weight-reader.ts"));
const { synthesize } = await import(src("lib/vision/eval/synth.ts"));
const { debugMasks, digitZoneDensities } = await import(src("lib/vision/seven-segment.ts"));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);
const n = Number(flag("--n", 120));
const dump = flag("--dump", null);
const real = flag("--real", null);
const verbose = has("--verbose");
if (dump) fs.mkdirSync(dump, { recursive: true });

function describe(results) {
  return results
    .map((r) => `${r.polarity}${r.rotation ? `@${r.rotation}` : ""}${r.window ? `/w${r.window}` : ""}: ` + r.rows.map((row) => `[h${Math.round(row.digitHeight)} ${row.tokens.map((t) => t.text).join("")}]`).join(" "))
    .join(" | ");
}

function evaluateCase(image, truth, name, params) {
  const t0 = performance.now();
  const results = readSevenSegment(image);
  const ms = performance.now() - t0;
  let ok;
  let got;
  if (truth.display !== undefined) {
    // A scale of any unit: the number shown must be read exactly as displayed.
    const d = pickDisplayNumber(results);
    got = d ? `${d.text} c=${d.confidence.toFixed(2)} (${d.polarity}, h${Math.round(d.digitHeight)})` : "none";
    ok = Boolean(d) && (d.text === truth.display || Number(d.text) === Number(truth.display));
  } else if (truth.kg !== undefined) {
    const w = interpretWeight(results);
    got = w ? `${w.kg}${w.decimalAssumed ? "(dot assumed)" : ""} c=${w.confidence.toFixed(2)}` : "none";
    ok = Boolean(w) && Math.abs(w.kg - truth.kg) < 0.001;
  } else {
    const bp = interpretBP(results);
    got = bp ? `${bp.systolic}/${bp.diastolic} p=${bp.pulse ?? "-"} c=${bp.confidence.toFixed(2)}` : "none";
    ok =
      Boolean(bp) &&
      bp.systolic === truth.systolic &&
      bp.diastolic === truth.diastolic &&
      (truth.pulse === null || truth.pulse === undefined ? true : bp.pulse === truth.pulse);
  }
  const want = truth.display !== undefined ? `"${truth.display}"` : truth.kg !== undefined ? `${truth.kg} kg` : `${truth.systolic}/${truth.diastolic} p=${truth.pulse ?? "-"}`;
  if (!ok || verbose) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: want ${want}, got ${got}  (${ms.toFixed(0)} ms)${params ? " " + JSON.stringify(params) : ""}`);
    if (!ok) console.log(`       rows: ${describe(results)}`);
  }
  return { ok, ms, none: got === "none" };
}

function toPgm(file) {
  if (file.endsWith(".pgm")) return file;
  const pgm = path.join(path.dirname(file), path.basename(file).replace(/\.[^.]+$/, "") + ".pgm");
  if (!fs.existsSync(pgm)) {
    const r = spawnSync("python3", [path.join(path.dirname(new URL(import.meta.url).pathname), "vision", "to-pgm.py"), file, pgm, "1200"], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${file}: ${r.stderr.trim().split("\n").pop()}`);
  }
  return pgm;
}

const seedArg = flag("--seed", null);
const fileArg = flag("--file", null);
if (seedArg !== null || fileArg !== null) {
  const seed = seedArg !== null ? Number(seedArg) : 0;
  const layout = flag("--layout", seed >= 2000 ? "scale" : seed >= 1000 ? "bp-side" : "bp-stacked");
  const c = fileArg ? { image: readPGM(toPgm(fileArg)), truth: {}, params: { file: path.basename(fileArg) } } : synthesize({ seed, layout });
  const tag = fileArg ? path.basename(fileArg).replace(/\.[^.]+$/, "") : `seed-${seed}`;
  const results = readSevenSegment(c.image, {
    trace: (e) => {
      if (!has("--trace")) return;
      if (e.type === "band") {
        console.log(`  trace ${e.polarity} BAND y=${e.y0}-${e.y1} h=${e.y1 - e.y0 + 1} cells=${e.cells} shear=${e.shear} ${e.kept ? "" : "(dropped)"} raw=[${e.raw ?? ""}]`);
        return;
      }
      const d = e.densities ? e.densities.map((v) => v.toFixed(2)).join(" ") : "-";
      const sc = e.scores ? e.scores.map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" ") : "-";
      console.log(`  trace ${e.polarity} shear=${e.shear} rowH=${e.rowHeight} box=${e.box.x0}-${e.box.x1}x${e.box.y0}-${e.box.y1} -> ${e.result}  zones=${d}  ${sc}`);
    },
  });
  console.log("truth", c.truth, c.params);
  for (const r of results) {
    console.log(`\n${r.polarity} rotation=${r.rotation} score=${r.score.toFixed(1)}`);
    for (const row of r.rows) {
      console.log(`  row h=${row.digitHeight} box=${JSON.stringify(row.box)}`);
      for (const t of row.tokens) console.log(`     ${t.kind.padEnd(7)} ${t.text} c=${t.confidence.toFixed(2)} box=${JSON.stringify(t.box)} w/h=${((t.box.x1 - t.box.x0 + 1) / (t.box.y1 - t.box.y0 + 1)).toFixed(2)}`);
      for (const n of row.numbers) console.log(`     number ${n.text} c=${n.confidence.toFixed(2)}`);
    }
  }
  console.log("\nBP:", interpretBP(results), "\nWeight:", interpretWeight(results));
  const outDir = flag("--dump", "/tmp");
  fs.mkdirSync(outDir, { recursive: true });
  writePGM(path.join(outDir, `${tag}.pgm`), c.image);
  const windowFraction = flag("--window", null) ? Number(flag("--window", null)) : undefined;
  for (const m of debugMasks(c.image, { windowFraction })) {
    const r0 = results.find((x) => x.polarity === m.polarity);
    for (const row of r0?.rows ?? []) for (const t of row.tokens) {
      if (t.kind === "digit" || t.kind === "unknown") console.log(`  zones ${m.polarity} ${t.text}: ${digitZoneDensities(m.mask, t.box).map((v) => v.toFixed(2)).join(" ")}  (a b c d e f g)`);
    }
    const img = { width: m.mask.width, height: m.mask.height, data: new Uint8Array(m.mask.data.length) };
    for (let i = 0; i < img.data.length; i++) img.data[i] = m.mask.data[i] ? 0 : 255;
    // draw the token boxes as grey frames
    const r = results.find((x) => x.polarity === m.polarity);
    for (const row of r?.rows ?? []) for (const t of row.tokens) {
      for (let x = t.box.x0; x <= t.box.x1; x++) { if (t.box.y0 >= 0) img.data[t.box.y0 * img.width + x] = 128; if (t.box.y1 < img.height) img.data[t.box.y1 * img.width + x] = 128; }
      for (let y = t.box.y0; y <= t.box.y1; y++) { img.data[y * img.width + t.box.x0] = 128; img.data[y * img.width + t.box.x1] = 128; }
    }
    writePGM(path.join(outDir, `${tag}-${m.polarity}-mask.pgm`), img);
  }
  console.log(`images in ${outDir}`);
  process.exit(0);
}

if (real) {
  const manifest = JSON.parse(fs.readFileSync(real, "utf8"));
  const items = Array.isArray(manifest) ? manifest : manifest.items;
  let passed = 0;
  let total = 0;
  let none = 0;
  const times = [];
  for (const item of items) {
    const file = item.file;
    let pgm = file;
    if (!file.endsWith(".pgm")) {
      pgm = path.join(path.dirname(file), path.basename(file).replace(/\.[^.]+$/, "") + ".pgm");
      if (!fs.existsSync(pgm)) {
        const r = spawnSync("python3", [path.join(path.dirname(new URL(import.meta.url).pathname), "vision", "to-pgm.py"), file, pgm, "1200"], { encoding: "utf8" });
        if (r.status !== 0) {
          console.log(`  skip ${file}: ${r.stderr.trim().split("\n").pop()}`);
          continue;
        }
      }
    }
    const image = readPGM(pgm);
    const truth =
      item.kind === "weight" || item.truth?.value !== undefined
        ? { display: String(item.truth.display ?? item.truth.value) }
        : { systolic: item.truth.systolic, diastolic: item.truth.diastolic, pulse: item.truth.pulse ?? null };
    const { ok, ms, none: wasNone } = evaluateCase(image, truth, path.basename(file), { polarity: item.polarity, notes: item.notes });
    total++;
    if (ok) passed++;
    else if (wasNone) none++;
    times.push(ms);
  }
  console.log(`\nReal photos: ${passed}/${total} correct, ${total - passed - none} wrong, ${none} no reading (median ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)]?.toFixed(0) ?? "-"} ms)`);
  process.exit(passed === total ? 0 : 1);
}

const layouts = ["bp-stacked", "bp-side", "scale"];
const summary = {};
let allOk = true;
for (const layout of layouts) {
  let passed = 0;
  const times = [];
  console.log(`\n${layout}`);
  for (let i = 0; i < n; i++) {
    const seed = 1000 * layouts.indexOf(layout) + i;
    const c = synthesize({ seed, layout });
    const { ok, ms } = evaluateCase(c.image, c.truth, `seed ${seed}`, c.params);
    if (ok) passed++;
    else if (dump) writePGM(path.join(dump, `${layout}-${seed}.pgm`), c.image);
    times.push(ms);
  }
  times.sort((a, b) => a - b);
  summary[layout] = { passed, n, medianMs: times[Math.floor(times.length / 2)] };
  if (passed < n * 0.97) allOk = false;
}
console.log("\nSynthetic displays:");
for (const [layout, s] of Object.entries(summary)) console.log(`  ${layout.padEnd(12)} ${s.passed}/${s.n}  (median ${s.medianMs.toFixed(0)} ms)`);
process.exit(allOk ? 0 : 1);
