/**
 * Validates a food catalogue file and exits non-zero on any error.
 *
 *   node scripts/food/validate-catalogue.mjs <file.json> [--ifct <ifct.json>] [--quiet]
 *
 * A part file looks like { "items": [...], "ifct": [...] }; the merged catalogue
 * is a plain array. Calories are cross-checked against protein, carbs and fat
 * (Atwater factors 4 / 4 / 9, fibre 2) because a calorie figure that does not
 * follow from its own macros is the commonest way a nutrition table goes wrong.
 */
import fs from "node:fs";
import { CATEGORIES, CONFIDENCE, DIETS, RAW_CATEGORIES, REGIONS, UNITS } from "./catalogue-spec.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--ifct");
const quiet = args.includes("--quiet");
const ifctPath = args.includes("--ifct") ? args[args.indexOf("--ifct") + 1] : null;

if (!file) {
  console.error("usage: validate-catalogue.mjs <file.json> [--ifct ifct.json] [--quiet]");
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(raw) ? raw : raw.items ?? [];
const ifctMeta = Array.isArray(raw) ? [] : raw.ifct ?? [];
const ifctRows = ifctPath ? new Map(JSON.parse(fs.readFileSync(ifctPath, "utf8")).map((r) => [r.code, r])) : null;

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEVANAGARI_RE = /[ऀ-ॿ]/;
const EMOJI_RE = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]*$/u;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function checkEmoji(id, emoji) {
  if (typeof emoji !== "string" || !EMOJI_RE.test(emoji)) return err(id, `emoji "${emoji}" is not a single emoji`);
  const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(emoji)];
  if (segments.length !== 1) err(id, `emoji "${emoji}" is more than one symbol`);
}

function checkMeta(id, it, { needsPortion }) {
  if (typeof it.hi !== "string" || !DEVANAGARI_RE.test(it.hi)) err(id, "hi must be a Devanagari name");
  if (!Array.isArray(it.alias)) err(id, "alias must be an array (can be empty)");
  else {
    for (const a of it.alias) {
      if (typeof a !== "string" || a.length < 2 || a.length > 48) err(id, `bad alias ${JSON.stringify(a)}`);
      else if (a !== a.toLowerCase() && !DEVANAGARI_RE.test(a)) err(id, `alias "${a}" must be lower-case`);
    }
    if (new Set(it.alias).size !== it.alias.length) err(id, "duplicate aliases");
  }
  if (!CATEGORIES.includes(it.cat)) err(id, `cat "${it.cat}" is not allowed`);
  if (!REGIONS.includes(it.region)) err(id, `region "${it.region}" is not allowed`);
  if (!DIETS.includes(it.diet)) err(id, `diet "${it.diet}" must be one of ${DIETS.join("/")}`);
  checkEmoji(id, it.emoji);
  if (it.core !== undefined && typeof it.core !== "boolean") err(id, "core must be true/false");

  const portions = it.portions ?? [];
  if (!Array.isArray(portions)) err(id, "portions must be an array");
  else {
    if (needsPortion && portions.length === 0) err(id, "at least one household portion is required");
    for (const p of portions) {
      if (typeof p?.n !== "string" || p.n.length < 2) err(id, `portion needs a name: ${JSON.stringify(p)}`);
      if (!isNum(p?.g) || p.g <= 0 || p.g > 1500) err(id, `portion "${p?.n}" grams out of range: ${p?.g}`);
      if (p?.hi !== undefined && !DEVANAGARI_RE.test(p.hi)) err(id, `portion "${p?.n}" hi must be Devanagari`);
    }
    if (new Set(portions.map((p) => p.n)).size !== portions.length) err(id, "duplicate portion names");
  }
}

// ---- Full items -------------------------------------------------------------------------
const slugs = new Set();
const names = new Map();
for (const it of items) {
  const id = it?.slug ?? `#${items.indexOf(it)}`;
  if (typeof it.slug !== "string" || !SLUG_RE.test(it.slug)) err(id, "slug must be lower-case kebab-case ASCII");
  if (slugs.has(it.slug)) err(id, "duplicate slug");
  slugs.add(it.slug);
  if (typeof it.name !== "string" || it.name.length < 2 || it.name.length > 90) err(id, "name must be 2-90 characters");
  const nameKey = String(it.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (names.has(nameKey)) err(id, `same name as ${names.get(nameKey)}`);
  names.set(nameKey, id);

  if (!UNITS.includes(it.unit)) err(id, `unit must be ${UNITS.join(" or ")}`);
  for (const k of ["kcal", "p", "c", "f", "fib"]) if (!isNum(it[k]) || it[k] < 0) err(id, `${k} must be a number >= 0`);
  if (it.na !== undefined && it.na !== null && (!isNum(it.na) || it.na < 0 || it.na > 40000)) err(id, "na (sodium mg per 100) out of range");
  if (!CONFIDENCE.includes(it.conf)) err(id, `conf must be ${CONFIDENCE.join("/")}`);
  if (typeof it.src !== "string" || it.src.length < 3) err(id, "src (where the numbers come from) is required");
  if (it.note !== undefined && typeof it.note !== "string") err(id, "note must be a string");
  checkMeta(id, it, { needsPortion: !RAW_CATEGORIES.has(it.cat) });

  if ([it.kcal, it.p, it.c, it.f, it.fib].every(isNum)) {
    const macroSum = it.p + it.c + it.f + it.fib;
    if (macroSum > 101) err(id, `protein+carbs+fat+fibre = ${macroSum.toFixed(1)} g, more than 100 g`);
    if (it.kcal > 900) err(id, `${it.kcal} kcal per 100 is above the 900 kcal ceiling (pure fat)`);

    // Atwater cross-check: energy must follow from the macros, with or without fibre energy.
    const base = 4 * it.p + 4 * it.c + 9 * it.f;
    const nearest = Math.min(Math.abs(it.kcal - base), Math.abs(it.kcal - (base + 2 * it.fib)));
    // IFCT rows are lab-measured and use their own energy factors, so they get a wider band.
    const lab = /^IFCT/.test(it.src);
    const tolerance = lab ? Math.max(20, 0.25 * Math.max(base, it.kcal)) : Math.max(12, 0.15 * Math.max(base, it.kcal));
    if (nearest > tolerance) err(id, `kcal ${it.kcal} does not match macros (P${it.p} C${it.c} F${it.f} Fib${it.fib} -> ~${base.toFixed(0)} kcal)`);

    // Plausibility ranges. Warnings only: a real outlier needs a one-line note explaining it.
    const loud = !it.note;
    const range = {
      fruit: [8, 160],
      vegetable: [5, 130],
      salad: [5, 160],
      soup: [8, 120],
      beverage: [0, 130],
      sabzi: [20, 260],
      dal: [20, 220],
      rice: [60, 260],
      roti: [150, 480],
      tiffin: [40, 400],
      sweet: [80, 560],
      snack: [60, 650],
    }[it.cat];
    if (range && (it.kcal < range[0] || it.kcal > range[1]) && loud) warn(id, `${it.kcal} kcal is outside the usual ${range[0]}-${range[1]} for ${it.cat}; add a "note" if intended`);
    if ((it.cat === "vegetable" || it.cat === "fruit") && it.f > 12 && loud) warn(id, `fat ${it.f} g is high for ${it.cat}`);
    if (it.cat === "beverage" && it.unit !== "ml") warn(id, "beverages are normally per 100 ml");
  }

  for (const p of it.portions ?? []) {
    if (isNum(p?.g) && isNum(it.kcal) && (p.g * it.kcal) / 100 > 1300) warn(id, `portion "${p.n}" is ${Math.round((p.g * it.kcal) / 100)} kcal, check the grams`);
  }
}

// ---- IFCT metadata (numbers come from the lab table, only labels are authored) -----------
const seenCodes = new Set();
for (const m of ifctMeta) {
  const id = m?.code ?? "ifct#?";
  if (seenCodes.has(m.code)) err(id, "duplicate IFCT code");
  seenCodes.add(m.code);
  if (ifctRows && !ifctRows.has(m.code)) err(id, "unknown IFCT code");
  if (typeof m.name !== "string" || m.name.length < 2) err(id, "name required");
  if (typeof m.slug !== "string" || !SLUG_RE.test(m.slug)) err(id, "slug must be lower-case kebab-case ASCII");
  if (slugs.has(m.slug)) err(id, `slug ${m.slug} duplicates a full item`);
  slugs.add(m.slug);
  checkMeta(id, m, { needsPortion: false });
}
if (ifctRows && ifctMeta.length) {
  const wanted = args.includes("--groups") ? args[args.indexOf("--groups") + 1].split(",") : null;
  if (wanted) {
    const missing = [...ifctRows.values()].filter((r) => wanted.includes(r.code[0]) && !seenCodes.has(r.code));
    for (const r of missing) err(r.code, `IFCT row "${r.name}" has no metadata entry`);
  }
}

if (!quiet) for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`${file}: ${items.length} items, ${ifctMeta.length} IFCT labels, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
