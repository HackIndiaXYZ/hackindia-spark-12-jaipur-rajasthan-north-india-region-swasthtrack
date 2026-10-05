/**
 * Regression checks for the bundled food catalogue, search and emoji rules:
 *
 *   node scripts/food/check-catalogue.mjs
 *
 * It encodes the bugs that were reported (tea with the wrong calories, "dal" not
 * finding "daal", a pineapple shown as an apple) plus calorie spot checks for the
 * foods eaten most. Exit code is non-zero when anything fails, so it can gate a release.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foodEmoji } from "../../src/lib/food/emoji.ts";
import { buildIndex, searchIndex } from "../../src/lib/food/search.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const foods = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "src", "data", "food-catalogue.json"), "utf8"));
const searchable = foods.map((f) => ({ ...f, name_hi: f.hi, aliases: f.alias }));
const index = buildIndex(searchable);

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL  ${msg}`);
};
const top = (query, n = 8) => searchIndex(index, query, n).hits.map((h) => h.item);
const names = (list) => list.map((f) => f.name).join(" | ");

// ---- 1. Search ---------------------------------------------------------------------------------------
const search = [
  ["dal", (r) => r.slice(0, 6).every((f) => ["dal", "pulse", "soup", "sabzi", "rice"].includes(f.cat)), "the first 6 results for 'dal' are dals"],
  ["tea", (r) => r.slice(0, 3).some((f) => /chai|tea/i.test(f.name)), "'tea' finds chai or tea in the top 3"],
  ["chai", (r) => r.slice(0, 3).some((f) => /chai|tea/i.test(f.name)), "'chai' finds chai in the top 3"],
  ["pineapple", (r) => /pineapple/i.test(r[0]?.name ?? ""), "'pineapple' first result is a pineapple"],
  ["paneer", (r) => /paneer/i.test(r[0]?.name ?? ""), "'paneer' first result is paneer"],
  ["bhindi", (r) => r.slice(0, 5).some((f) => /bhindi|okra/i.test(f.name)), "'bhindi' finds okra"],
  ["lady finger", (r) => r.slice(0, 5).some((f) => /bhindi|okra/i.test(f.name)), "'lady finger' finds okra"],
  ["baingan", (r) => r.slice(0, 5).some((f) => /brinjal|baingan|eggplant/i.test(f.name)), "'baingan' finds brinjal"],
  ["lauki", (r) => r.slice(0, 5).some((f) => /bottle gourd|lauki/i.test(f.name)), "'lauki' finds bottle gourd"],
  ["karela", (r) => r.slice(0, 5).some((f) => /bitter gourd|karela/i.test(f.name)), "'karela' finds bitter gourd"],
  ["tinda", (r) => r.slice(0, 5).some((f) => /tinda|apple gourd/i.test(f.name)), "'tinda' finds apple gourd"],
  ["parwal", (r) => r.slice(0, 5).some((f) => /parwal|pointed gourd/i.test(f.name)), "'parwal' finds pointed gourd"],
  ["roti", (r) => r.slice(0, 3).some((f) => /roti|chapati/i.test(f.name)), "'roti' finds roti in the top 3"],
  ["चाय", (r) => r.slice(0, 3).some((f) => /chai|tea/i.test(f.name)), "Hindi 'चाय' finds chai"],
  ["दाल", (r) => r.slice(0, 5).every((f) => ["dal", "pulse", "soup", "sabzi", "rice"].includes(f.cat)), "Hindi 'दाल' finds dals"],
  ["सेब", (r) => /apple/i.test(r[0]?.name ?? ""), "Hindi 'सेब' finds apple"],
  ["kerala fish", (r) => r.slice(0, 3).some((f) => f.region === "Kerala"), "'kerala fish' returns Kerala dishes"],
  ["punjab", (r) => r.slice(0, 5).filter((f) => f.region === "Punjab" || /punjabi/i.test(f.name)).length >= 4, "'punjab' lists Punjab dishes"],
  ["west bengal", (r) => r.slice(0, 5).filter((f) => f.region === "West Bengal").length >= 4, "'west bengal' lists West Bengal dishes"],
  ["kolkata", (r) => r.slice(0, 5).some((f) => f.region === "West Bengal"), "'kolkata' finds Bengali street food by name"],
  ["pinapple", (r) => /pineapple/i.test(r[0]?.name ?? ""), "typo 'pinapple' still finds pineapple"],
  ["sarson ka saag", (r) => r.slice(0, 3).some((f) => /sarson|saag/i.test(f.name)), "'sarson ka saag' finds sarson saag"],
  ["2 roti aur dal", (r) => r.length > 0, "a whole meal sentence still returns something"],
];
for (const [q, ok, label] of search) {
  const r = top(q);
  if (!ok(r)) fail(`search: ${label} -> [${names(r.slice(0, 5))}]`);
}

// Spelling variants must give the same leading results.
for (const [a, b] of [["dal", "daal"], ["dal", "dhal"], ["dal", "दाल"], ["paneer", "panir"], ["sabzi", "sabji"], ["aloo", "alu"], ["gobi", "gobhi"], ["vada", "wada"]]) {
  const x = top(a, 15).map((f) => f.slug);
  const y = top(b, 15).map((f) => f.slug);
  const overlap = x.filter((s) => y.includes(s)).length;
  if (x.length === 0 || overlap < Math.min(7, x.length)) fail(`search: "${a}" and "${b}" should agree, ${overlap}/15 shared. [${names(top(a, 4))}] vs [${names(top(b, 4))}]`);
}

// ---- 2. Calorie spot checks (per 100 g / 100 ml, bands that still catch gross errors) ------------------------------
// Each query must put the right food first, and that food must have a believable energy value. Fruit bands are
// wide on purpose: IFCT (the Indian lab table) runs lower than the USDA figures usually quoted (guava 32 vs 68).
const kcal = [
  ["black tea", 0, 4], ["green tea", 0, 4], ["black coffee", 0, 5], ["chai", 55, 70], ["tea", 40, 70], ["coffee", 35, 70],
  ["cow milk", 60, 80], ["buffalo milk", 95, 115], ["toned milk", 50, 65], ["curd", 50, 100], ["paneer", 230, 330], ["ghee", 860, 900], ["butter", 700, 750],
  ["pineapple", 38, 50], ["banana", 90, 118], ["apple", 45, 70], ["mango", 40, 75], ["papaya", 20, 50], ["guava", 28, 75], ["orange", 30, 55],
  ["gulab jamun", 270, 420], ["jalebi", 380, 520], ["rasgulla", 150, 250],
  ["idli", 125, 155], ["dosa", 150, 200], ["masala dosa", 150, 230], ["poha", 100, 170], ["upma", 110, 190],
  ["samosa", 230, 360], ["rice", 115, 145], ["roti", 230, 290], ["paratha", 250, 380], ["puri", 360, 430],
  ["dal tadka", 100, 160], ["dal makhani", 100, 210], ["rajma", 100, 190], ["chole", 110, 190], ["sambar", 40, 90], ["khichdi", 95, 150],
  ["butter chicken", 120, 260], ["chicken biryani", 140, 230], ["boiled egg", 135, 160], ["fish curry", 80, 140],
];
for (const [query, lo, hi] of kcal) {
  const first = top(query, 1)[0];
  if (!first) {
    fail(`kcal: "${query}" finds nothing`);
    continue;
  }
  if (first.kcal < lo || first.kcal > hi) fail(`kcal: "${query}" -> "${first.name}" is ${first.kcal} per 100, expected ${lo}-${hi}`);
}

// Nothing may have a calorie that its own macros cannot produce (the old tea at 1 kcal with 9 g of sugar).
for (const f of foods) {
  const base = 4 * f.p + 4 * f.c + 9 * f.f;
  if (f.kcal + Math.max(12, 0.25 * base) < base) fail(`macros: "${f.name}" is ${f.kcal} kcal but its macros give ~${Math.round(base)}`);
}

// ---- 3. Emoji -------------------------------------------------------------------------------------------------
const emojiCases = [
  ["Pineapple", "🍍"], ["Apple", "🍎"], ["Banana", "🍌"], ["Mango", "🥭"], ["Coconut", "🥥"], ["Chai (milk tea with sugar)", "☕"],
  ["Pineapple Juice", "🧃"], ["Mango Lassi", "🥛"], ["Egg Curry", "🥚"], ["Chicken Biryani", "🍛"], ["Dal Tadka (दाल तड़का)", "🍲"],
  ["Aloo Paratha", "🫓"], ["Masala Dosa", "🥞"], ["Brinjal", "🍆"], ["Tomato", "🍅"], ["Green Peas", "🫛"], ["Butter Chicken", "🍗"],
  ["Paneer Butter Masala", "🧀"], ["Prawn Curry", "🍤"], ["Gulab Jamun", "🍬"], ["Mango Pickle", "🫙"], ["Orange", "🍊"], ["Watermelon", "🍉"],
  ["Pizza Margherita", "🍕"], ["Veg Burger", "🍔"], ["Samosa", "🥟"], ["Cucumber", "🥒"], ["Carrot", "🥕"], ["Potato", "🥔"], ["Onion", "🧅"],
];
for (const [name, want] of emojiCases) {
  const got = foodEmoji(name, "");
  if (got !== want) fail(`emoji: "${name}" is ${got}, expected ${want}`);
}
// The keyword rules only have to be right where the log shows a name and nothing else, so agreement with the
// per-food emoji is a sanity level, not a goal. What must not happen is two *specific* foods being swapped.
const SPECIFIC = new Set(["🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🫐", "🍇", "🍉", "🍈", "🥝", "🥭", "🍍", "🍌", "🍊", "🍋", "🥥", "🥑", "🍅", "🍆", "🥔", "🍠", "🥕", "🌽", "🧅", "🧄", "🫚", "🍄", "🥒", "🎃", "🍗", "🍖", "🐟", "🍤", "🦀", "🦑", "🦪", "🥚", "🧀", "🌶️", "🫑", "🥬", "🥦", "🫛"]);
let agree = 0;
const disagree = [];
const swapped = [];
for (const f of foods) {
  const got = foodEmoji(`${f.name} (${f.hi})`, "");
  if (got === f.emoji) agree += 1;
  else {
    disagree.push(`${f.name}: rules ${got} vs catalogue ${f.emoji}`);
    if (SPECIFIC.has(got) && SPECIFIC.has(f.emoji)) swapped.push(`${f.name}: rules ${got} vs catalogue ${f.emoji}`);
  }
}
const pct = (agree / foods.length) * 100;
console.log(`emoji: rules agree with the catalogue on ${agree}/${foods.length} (${pct.toFixed(1)}%), ${swapped.length} specific-food swaps`);
if (pct < 60) fail(`emoji: only ${pct.toFixed(1)}% agreement, the keyword rules need work`);
if (swapped.length > 25) fail(`emoji: ${swapped.length} foods get a different specific food's emoji from the rules (limit 25)`);
if (process.argv.includes("--emoji-diff")) console.log(swapped.join("\n"));
if (process.argv.includes("--emoji-all")) console.log(disagree.join("\n"));

console.log(failures === 0 ? `\nAll checks passed on ${foods.length} foods.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
