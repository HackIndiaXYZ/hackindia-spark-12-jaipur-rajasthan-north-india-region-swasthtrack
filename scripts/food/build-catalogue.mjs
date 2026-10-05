/**
 * Builds src/data/food-catalogue.json, the Indian food catalogue the app bundles.
 *
 *   node scripts/food/build-catalogue.mjs --parts <dir of part .json files> --ifct <ifct.json> [--out <file>]
 *
 * Inputs
 *   - IFCT 2017 rows (ICMR-NIN, lab-measured, raw foods): the numbers come from here untouched.
 *   - Part files: { items: [...fully authored foods...], ifct: [...labels for IFCT codes...] }.
 *
 * What it does
 *   1. turns each IFCT label + its lab row into a full food (energy converted from kJ),
 *   2. merges duplicates (same name): lab data wins, then higher confidence; aliases are unioned,
 *   3. gives every food a stable id (UUID v5 of its slug) so the database seed, favourites and
 *      food-log links keep pointing at the same row across re-imports,
 *   4. writes one food per line so a change shows up as a readable diff.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foodEmoji } from "../../src/lib/food/emoji.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const partsDir = arg("--parts");
const ifctPath = arg("--ifct");
const outPath = arg("--out") ?? path.join(here, "..", "..", "src", "data", "food-catalogue.json");
if (!partsDir || !ifctPath) {
  console.error("usage: build-catalogue.mjs --parts <dir> --ifct <ifct.json> [--out <file>]");
  process.exit(2);
}

/** Fixed namespace so the same slug always yields the same id. Never change it. */
const NAMESPACE = "6f3c1a52-8d0b-4e47-9a6e-2b7d5c91e0a4";

function uuidV5(name, namespace = NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const round = (n, d = 1) => (n == null ? 0 : Math.round(n * 10 ** d) / 10 ** d);
const nameKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const CONF_RANK = { high: 3, medium: 2, low: 1 };

/**
 * IFCT energy fields that are wrong or missing in the published table. Oils and ghee list 0 kcal
 * (energy was never computed for them), chicken leg lists twice its macros, lemon juice counts
 * organic acids. Anything else that disagrees with its own macros by more than 30 % is recomputed
 * from protein, carbohydrate and fat (Atwater 4/4/9) instead of trusting the field.
 */
const LAB_ENERGY_OVERRIDES = { E033: { kcal: 22, why: "USDA lemon juice; IFCT energy field includes organic acids" } };
/**
 * IFCT analysed the same food several times and published each sample ("Brinjal, Variety 7"). They are
 * near-identical and would bury the real entry in search, so only the "All Varieties" row is kept.
 */
const DROP_IFCT_VARIANTS = /^(Brinjal|Green Chilli), Variety \d+/;

/** Closest-looking emoji for foods that have none of their own; applied only where an author left the plain plate. */
const GENERIC_EMOJI = [
  [/arbi|colocasia|suran|\byam\b|elephant foot|tapioca|cassava|kappa|lotus stem|kamal kakdi|singhara|water chestnut|jimikand|ratalu/i, "🥔"],
  [/banana flower|vazhaipoo|kele ka phool/i, "🌸"],
  [/banana stem|thandu/i, "🥬"],
  [/jackfruit|kathal|bael|wood apple|kaith/i, "🍈"],
  [/ker\b|sangri|gunda|lasoda|kachri/i, "🫛"],
  [/pomegranate|anar|rose apple/i, "🍎"],
  [/custard apple|sitaphal|soursop|\bber\b|jujube|amla|gooseberry|karonda|manila tamarind/i, "🍏"],
  [/star ?fruit|kamrakh/i, "🍋"],
  [/\bfig\b|anjeer|mangosteen|kokum|passion fruit|longan|jamun/i, "🍇"],
  [/litchi|lychee|rambutan/i, "🍓"],
  [/sapota|chikoo|sapodilla/i, "🍑"],
  [/tamarind|imli/i, "🌰"],
  [/dragon fruit/i, "🍉"],
  [/persimmon/i, "🍊"],
];
/** Plain one-word searches that should land on the everyday food: "rice" is steamed rice, "sabzi" is home-style mixed sabzi. */
const STAPLE_ALIASES = {
  "white-rice-cooked": ["rice"],
  "mix-veg-home": ["sabzi", "sabji", "subzi", "vegetable curry"],
};

const GENERIC_DISH_EMOJI = new Set(["🍲", "🍛", "🥘", "🍽️"]);
const VEGETABLE_EMOJI = new Set(["🍆", "🥔", "🥕", "🌽", "🧅", "🍅", "🫑", "🥒", "🎃", "🥬", "🥦", "🫛", "🍄", "🍠", "🌶️"]);
const ENERGY_RECOMPUTED_NOTE = "energy recomputed from protein, carbohydrate and fat because the IFCT energy field is missing or inconsistent";

const ifct = new Map(JSON.parse(fs.readFileSync(ifctPath, "utf8")).map((r) => [r.code, r]));
const partFiles = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort();

const log = [];
const candidates = []; // { food, lab, part }
for (const file of partFiles) {
  const part = JSON.parse(fs.readFileSync(path.join(partsDir, file), "utf8"));
  for (const label of part.ifct ?? []) {
    const row = ifct.get(label.code);
    if (!row) throw new Error(`${file}: unknown IFCT code ${label.code}`);
    if (DROP_IFCT_VARIANTS.test(label.name)) {
      log.push(`IFCT ${label.code} ${label.name}: dropped (numbered lab sample of a food that has an "All Varieties" row)`);
      continue;
    }
    const atwater = 4 * (row.protein ?? 0) + 4 * (row.carbs ?? 0) + 9 * (row.fat ?? 0);
    let kcal = Math.round(row.kcal ?? 0);
    let energyNote = null;
    if (LAB_ENERGY_OVERRIDES[label.code]) {
      kcal = LAB_ENERGY_OVERRIDES[label.code].kcal;
      energyNote = LAB_ENERGY_OVERRIDES[label.code].why;
      log.push(`IFCT ${label.code} ${row.name}: energy ${row.kcal} -> ${kcal} (${energyNote})`);
    } else if (Math.abs(kcal - atwater) > Math.max(25, 0.3 * atwater)) {
      log.push(`IFCT ${label.code} ${row.name}: energy ${row.kcal} -> ${Math.round(atwater)} (recomputed from macros)`);
      kcal = Math.round(atwater);
      energyNote = ENERGY_RECOMPUTED_NOTE;
    }
    candidates.push({
      lab: true,
      part: file,
      food: {
        slug: label.slug,
        name: label.name,
        hi: label.hi,
        alias: label.alias ?? [],
        cat: label.cat,
        region: label.region,
        diet: label.diet,
        emoji: label.emoji,
        unit: "g",
        kcal,
        p: round(row.protein),
        c: round(row.carbs),
        f: round(row.fat),
        fib: round(row.fibre),
        na: row.sodium_mg == null ? null : Math.round(row.sodium_mg),
        portions: label.portions ?? [],
        core: label.core === true,
        src: `IFCT 2017 (${label.code}), ICMR-NIN Hyderabad`,
        conf: "high",
        note: [label.note ?? "per 100 g edible portion, as analysed (raw unless the name says otherwise)", energyNote].filter(Boolean).join("; "),
      },
    });
  }
  for (const food of part.items ?? []) candidates.push({ lab: false, part: file, food: { ...food } });
}

// ---- merge duplicates ------------------------------------------------------------------------
// Two authors writing the same dish usually pick the same slug or the same name, so either match merges.
const byKey = new Map(); // nameKey or slug -> candidate
const merged = [];
for (const cand of candidates) {
  const keys = [`n:${nameKey(cand.food.name)}`, `s:${cand.food.slug}`];
  const existing = keys.map((k) => byKey.get(k)).find(Boolean);
  if (!existing) {
    for (const k of keys) byKey.set(k, cand);
    merged.push(cand);
    continue;
  }
  const better =
    (cand.lab && !existing.lab) ||
    (cand.lab === existing.lab && (CONF_RANK[cand.food.conf] ?? 0) > (CONF_RANK[existing.food.conf] ?? 0));
  const winner = better ? cand : existing;
  const loser = better ? existing : cand;
  winner.food.alias = [...new Set([...winner.food.alias, ...loser.food.alias, ...(nameKey(loser.food.name) === nameKey(winner.food.name) ? [] : [loser.food.name.toLowerCase()])])];
  winner.food.core = winner.food.core || loser.food.core;
  // Two independent estimates with the same confidence: the mean is closer to the truth than either alone.
  if (!cand.lab && !existing.lab && cand.food.conf === existing.food.conf) {
    const a = winner.food;
    const b = loser.food;
    if (Math.abs(a.kcal - b.kcal) / Math.max(a.kcal, b.kcal, 1) > 0.1) {
      for (const k of ["kcal", "p", "c", "f", "fib"]) a[k] = (a[k] + b[k]) / 2;
      if (a.na != null && b.na != null) a.na = (a.na + b.na) / 2;
      a.note = [a.note, "average of two independent estimates"].filter(Boolean).join("; ");
    }
  }
  if (winner.food.region === "Pan-India" && loser.food.region !== "Pan-India") winner.food.region = loser.food.region;
  if (better) merged[merged.indexOf(existing)] = cand;
  for (const k of [...keys, `n:${nameKey(existing.food.name)}`, `s:${existing.food.slug}`]) byKey.set(k, winner);
  log.push(`dup "${cand.food.name}" = "${existing.food.name}": kept ${winner.part}, dropped ${loser.part} (${loser.food.kcal} vs ${winner.food.kcal} kcal)`);
}

// ---- collapse "Name" and "Name (qualifier)" -----------------------------------------------------------
// "Dalma" and "Dalma (Odia Dal with Vegetables)" are one dish written twice. Only a bare name with a bracketed twin
// of the same category and region with near-identical numbers is merged, so real variants ("Ice Cream (Vanilla)" and
// "(Chocolate)", "Mango (Kesar)" and "(Dasheri)") stay separate.
const bareByKey = new Map();
for (const c of merged) {
  if (!/[(]/.test(c.food.name)) bareByKey.set(`${nameKey(c.food.name)}|${c.food.cat}`, c);
}
const collapsed = new Set();
for (const c of merged) {
  if (!/[(]/.test(c.food.name) || c.lab) continue;
  const head = nameKey(c.food.name.split("(")[0]);
  const bare = bareByKey.get(`${head}|${c.food.cat}`);
  if (!bare || bare === c || bare.lab || collapsed.has(bare)) continue;
  const a = bare.food;
  const b = c.food;
  const dk = Math.abs(a.kcal - b.kcal) / Math.max(a.kcal, b.kcal, 1);
  const dn = a.na == null || b.na == null ? 0 : Math.abs(a.na - b.na) / Math.max(a.na, b.na, 1);
  // A regional version of a generic dish ("Rasgulla (Bengali)") keeps its own entry so the state still lists it.
  if (dk > 0.08 || dn > 0.3 || a.unit !== b.unit || a.region !== b.region) continue;
  a.alias = [...new Set([...a.alias, ...b.alias, b.name.toLowerCase()])];
  a.core = a.core || b.core;
  if ((CONF_RANK[b.conf] ?? 0) > (CONF_RANK[a.conf] ?? 0)) {
    for (const k of ["kcal", "p", "c", "f", "fib", "na", "portions", "src", "conf", "note"]) a[k] = b[k];
  } else if (b.conf === a.conf) {
    for (const k of ["kcal", "p", "c", "f", "fib"]) a[k] = (a[k] + b[k]) / 2;
    if (a.na != null && b.na != null) a.na = (a.na + b.na) / 2;
  }
  collapsed.add(c);
  log.push(`same dish "${b.name}" -> "${a.name}" (${b.kcal} vs ${a.kcal} kcal)`);
}
for (let i = merged.length - 1; i >= 0; i -= 1) if (collapsed.has(merged[i])) merged.splice(i, 1);

// ---- finalize ----------------------------------------------------------------------------------
const slugOwner = new Map();
const rows = [];
for (const { food } of merged) {
  let slug = food.slug;
  if (slugOwner.has(slug)) {
    // Same slug on two different foods: make the second one unique instead of losing it.
    let n = 2;
    while (slugOwner.has(`${slug}-${n}`)) n += 1;
    log.push(`slug clash "${slug}" (${slugOwner.get(slug)} vs ${food.name}) -> ${slug}-${n}`);
    slug = `${slug}-${n}`;
  }
  slugOwner.set(slug, food.name);

  if (food.emoji === "🍽️") {
    const better = GENERIC_EMOJI.find(([re]) => re.test(`${food.name} ${food.alias.join(" ")}`));
    if (better) food.emoji = better[1];
    else {
      const byRules = foodEmoji(`${food.name} ${food.hi}`, "");
      if (byRules !== "🍽️") food.emoji = byRules;
    }
  }

  // A sabzi named after its vegetable shows that vegetable ("Baingan Bharta" 🍆) instead of a generic stew bowl.
  if (food.cat === "sabzi" && GENERIC_DISH_EMOJI.has(food.emoji)) {
    const byRules = foodEmoji(`${food.name} ${food.hi}`, "");
    if (VEGETABLE_EMOJI.has(byRules)) food.emoji = byRules;
  }

  const ownName = nameKey(food.name);
  const alias = [...new Set(food.alias.map((a) => a.trim()))].filter((a) => a && nameKey(a) !== ownName);
  const row = {
    id: uuidV5(slug),
    slug,
    name: food.name,
    hi: food.hi,
    alias,
    cat: food.cat,
    region: food.region,
    diet: food.diet,
    emoji: food.emoji,
    unit: food.unit,
    kcal: round(food.kcal, food.kcal < 10 ? 1 : 0),
    p: round(food.p),
    c: round(food.c),
    f: round(food.f),
    fib: round(food.fib),
    ...(food.na != null ? { na: Math.round(food.na) } : {}),
    portions: (food.portions ?? []).map((p) => ({ n: p.n, ...(p.hi ? { hi: p.hi } : {}), g: round(p.g) })),
    ...(food.core ? { core: true } : {}),
    src: food.src,
    conf: food.conf,
    ...(food.note ? { note: food.note } : {}),
  };
  rows.push(row);
}

// An alias that is another food's own name belongs to that food ("sev" the snack, not an apple's nickname).
const owners = new Map();
for (const r of rows) {
  const head = nameKey(r.name.split(/[(,]/)[0]);
  if (head && !owners.has(head)) owners.set(head, r.slug);
}
for (const r of rows) {
  const kept = r.alias.filter((a) => {
    const owner = owners.get(nameKey(a));
    return !owner || owner === r.slug;
  });
  if (kept.length !== r.alias.length) log.push(`alias clash on "${r.name}": dropped ${r.alias.filter((a) => !kept.includes(a)).join(", ")}`);
  // Curated nicknames are added last, so they win even over the plain name of a raw ingredient ("Rice, Raw Milled").
  r.alias = [...new Set([...kept, ...(STAPLE_ALIASES[r.slug] ?? [])])];
}

rows.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);

const plain = rows.filter((r) => r.emoji === "🍽️");
if (plain.length) console.log(`${plain.length} foods still have the plain-plate emoji: ${plain.slice(0, 25).map((r) => r.name).join("; ")}${plain.length > 25 ? " ..." : ""}`);

const perCat = {};
for (const r of rows) perCat[r.cat] = (perCat[r.cat] ?? 0) + 1;
console.log(`wrote ${rows.length} foods to ${path.relative(process.cwd(), outPath)}`);
console.log("by category:", JSON.stringify(perCat));
if (log.length) {
  console.log(`\n${log.length} merge notes:`);
  for (const l of log) console.log("  " + l);
}
