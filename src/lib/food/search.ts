/**
 * Food search that copes with how people really type Indian food names: "dal",
 * "daal", "dhal" and "दाल" are one word, "paneer" and "panir" are one word, and a
 * state name ("kerala fish") narrows the list. Pure and dependency free so it can
 * run in the browser, on the server and in node scripts.
 *
 * Every food has several searchable terms (English name, aliases, Hindi name). A
 * query matches a term at one of these strengths, best first:
 *   exact term -> phrase prefix -> whole words -> word prefixes -> substring ->
 *   same sound (phonetic) -> one or two typos (edit distance on the phonetic key)
 */

export interface SearchableFood {
  name: string;
  name_hi?: string | null;
  aliases?: string[];
  /** A state, UT or region. "Pan-India" and "International" are not searchable. */
  region?: string | null;
  /** Everyday staple: wins ties so "dal" shows dal tadka before a raw dal listing. */
  core?: boolean;
  /** Catalogue category; "grain" and "pulse" rows are uncooked ingredients. */
  category?: string;
}

export interface SearchHit<T> {
  item: T;
  score: number;
  /** True when the query equals the name or an alias exactly. */
  exact: boolean;
}

export interface SearchResult<T> {
  hits: SearchHit<T>[];
  /** Set when nothing matched as typed and the best guess came from sound or typo matching. */
  corrected?: string;
}

const SCORE = {
  exact: 1000,
  phrasePrefix: 820,
  wholeWords: 720,
  wordPrefixes: 560,
  substring: 400,
  // Same sound, different spelling ("daal" for "dal") ranks just under the exact spelling: people spell Indian words
  // every way, so a variant must not drop out of the list, but it must not beat the real word either ("kheer" vs "ker").
  phoneticExact: 700,
  phoneticPhrasePrefix: 690,
  phoneticWords: 680,
  phoneticPrefix: 380,
  fuzzy: 300,
} as const;

/** Words that carry no food meaning when someone types a whole sentence of a meal. */
const FILLER = new Set(["ka", "ki", "ke", "ko", "aur", "and", "with", "wala", "wali", "wale", "ek", "do", "the", "of", "a", "in", "ya", "or", "no", "without", "bina", "free"]);

/**
 * Words that describe how a dish was made rather than which dish it is. They help rank ("plain dosa" over
 * "masala dosa") but never decide whether something matches, so "chicken curry (home-style, light oil)"
 * still finds Chicken Curry.
 */
const DESCRIPTORS = new Set([
  "home", "homemade", "house", "style", "light", "lite", "low", "oil", "fat", "restaurant", "dhaba", "regular", "normal", "simple",
  "plain", "spicy", "fresh", "traditional", "classic", "special", "generic", "ghar", "ghar ka",
]);

/** "no sugar", "without milk", "sugar free": the food leaves that ingredient out. */
const NEGATION_BEFORE = /\b(?:no|without|bina|zero)\s+(\p{L}+)/gu;
const NEGATION_AFTER = /(\p{L}+)\s+free\b/gu;
const UNIT_WORDS = new Set([
  "katori", "bowl", "plate", "glass", "cup", "piece", "pieces", "pcs", "slice", "spoon", "tsp", "tbsp", "gram", "grams", "gm", "g", "ml", "kg",
  "कटोरी", "प्लेट", "गिलास", "कप", "टुकड़ा", "चम्मच",
]);

const NON_REGIONS = new Set(["pan-india", "international"]);

/** A query that names an uncooked form ("toor dal dry", "atta", "raw rice") should not be steered away from it. */
const WANTS_RAW = /\b(raw|dry|dried|sookha|sukha|kaccha|kachha|atta|flour|aata|maida|powder|seeds?)\b/;
const RAW_NAME = /\((raw|dry)\)|, (raw|dry)\b|\bdry \(raw\)|\braw$/i;

/** Lower-case, strip Latin accents, unify Devanagari spelling variants, replace punctuation with spaces. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Latin accents only; Devanagari matras live in U+0900-097F
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "") // nukta: ड़ -> ड, क़ -> क
    .replace(/ँ/g, "ं") // chandrabindu -> anusvara
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LATIN_WORD = /^[a-z0-9]+$/;

/**
 * A rough sound key for a Latin word so spelling variants collide:
 * daal / dal / dhal / dahl / dall -> "dal", paneer / panir / paner -> "panir",
 * sabzi / sabji -> "sabji", wada / vada -> "vada". Non-Latin words are returned unchanged.
 */
export function phoneticKey(word: string): string {
  if (!LATIN_WORD.test(word)) return word;
  let s = word;
  s = s.replace(/ph/g, "f").replace(/sh/g, "s");
  s = s.replace(/ch/g, "@").replace(/ck/g, "k").replace(/c/g, "k").replace(/@/g, "c");
  s = s.replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/x/g, "ks");
  s = s.replace(/h/g, ""); // dh, bh, kh, th and a stray h (dahl) all sound like their plain letter
  s = s.replace(/ee|ea|ie|ii|ey|ay|ai|ei/g, "i").replace(/oo|ou|uu/g, "u").replace(/au|aw/g, "o");
  s = s.replace(/e/g, "i").replace(/y/g, "i");
  s = s.replace(/(.)\1+/g, "$1"); // collapse doubled letters: aa, ll, tt
  return s;
}

function tokenize(text: string): string[] {
  return text ? text.split(" ") : [];
}

/** Levenshtein distance with an early exit once it must exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a word of this length: short words must be exact, long ones may be two letters off. */
function allowedTypos(length: number): number {
  return length <= 3 ? 0 : length <= 7 ? 1 : 2;
}

interface Term {
  text: string;
  words: string[];
  keys: string[];
  /** Last word of the name before any bracket or comma: "dosa" for "Masala Dosa (Crisp)". */
  headNoun: string;
  /** Aliases rank below the real name, so a nickname that shares a word with another dish (dosa kaya = cucumber) cannot outrank it. */
  weight: number;
}

interface IndexedFood<T> {
  item: T;
  terms: Term[];
  regionWords: string[];
  regionKeys: string[];
  nameLength: number;
  core: boolean;
  /** Uncooked ingredient (dry dal, raw rice): listed after the dishes people actually eat. */
  raw: boolean;
}

export type FoodIndex<T> = IndexedFood<T>[] & {
  /** How rare each word is across the catalogue: "litti" says more about a dish than "curry" does. */
  idf?: Map<string, number>;
};

function makeTerm(raw: string, weight: number): Term | null {
  const text = normalizeText(raw);
  if (!text) return null;
  const words = tokenize(text);
  const headWords = tokenize(normalizeText(raw.split(/[(,]/)[0]));
  return { text, words, keys: words.map(phoneticKey), headNoun: headWords[headWords.length - 1] ?? "", weight };
}

export function buildIndex<T extends SearchableFood>(items: T[]): FoodIndex<T> {
  const index: FoodIndex<T> = items.map((item) => {
    const terms: Term[] = [];
    const name = makeTerm(item.name, 1);
    if (name) terms.push(name);
    // "Pineapple (Ananas)" and "Banana, Ripe (Robusta)" are the plain food: the part before the bracket or comma
    // counts as an exact name, so "pineapple" lists the fruit before "Pineapple Raita".
    const head = makeTerm(item.name.split(/[(,]/)[0], 0.99);
    if (head && head.text !== name?.text) terms.push(head);
    for (const alias of item.aliases ?? []) {
      const t = makeTerm(alias, 0.9);
      if (t) terms.push(t);
    }
    if (item.name_hi) {
      // "दाल तड़का (Dal Tadka)" style names are indexed whole; the Latin tail is covered by `name`.
      const t = makeTerm(item.name_hi, 1);
      if (t) terms.push(t);
    }
    const region = item.region && !NON_REGIONS.has(item.region.toLowerCase()) ? normalizeText(item.region) : "";
    const regionWords = tokenize(region);
    return {
      item,
      terms,
      regionWords,
      regionKeys: regionWords.map(phoneticKey),
      nameLength: name?.text.length ?? item.name.length,
      core: Boolean(item.core),
      raw: item.category === "grain" || item.category === "pulse" || RAW_NAME.test(item.name),
    };
  });

  const df = new Map<string, number>();
  for (const food of index) {
    const seen = new Set<string>();
    for (const term of food.terms) for (const key of term.keys) seen.add(key);
    for (const key of seen) df.set(key, (df.get(key) ?? 0) + 1);
  }
  index.idf = new Map([...df].map(([key, count]) => [key, Math.log(1 + index.length / count)]));
  return index;
}

interface Query {
  /** The whole query as typed (normalized), fillers and all: "tea with milk and sugar". */
  full: string;
  /** What must match: the meaningful words, without quantities, measures, fillers or descriptors. */
  text: string;
  words: string[];
  keys: string[];
  /** Descriptor words ("home", "plain"): a small bonus when present, never required. */
  descriptors: string[];
  /** The query itself says "no" / "without" / "free", so a food that leaves an ingredient out is wanted. */
  negates: boolean;
}

function makeQuery(words: string[], full: string, descriptors: string[], negates: boolean): Query {
  return { full, text: words.join(" "), words, keys: words.map(phoneticKey), descriptors, negates };
}

function parseQuery(raw: string): Query | null {
  const full = normalizeText(raw);
  if (!full) return null;
  // "Litti Chokha (Bihari, no ghee)": what is in brackets describes the dish; it never decides what the dish is.
  const bracket = raw.search(/[(]/);
  const outside = bracket > 0 ? normalizeText(raw.slice(0, bracket)) : "";
  const inside = bracket > 0 ? tokenize(normalizeText(raw.slice(bracket))) : [];
  const all = outside ? tokenize(outside) : tokenize(full);
  const negates = tokenize(full).some((w) => w === "no" || w === "without" || w === "bina" || w === "free" || w === "zero");
  // "2 roti", "ek katori dal": quantities and measures are not part of the food's name.
  const meaningful = all.filter((w) => !/^\d+$/.test(w) && !UNIT_WORDS.has(w) && !FILLER.has(w));
  const base = meaningful.length > 0 ? meaningful : all;
  const core = base.filter((w) => !DESCRIPTORS.has(w));
  const words = core.length > 0 ? core : base;
  const descriptors = core.length > 0 ? [...base.filter((w) => DESCRIPTORS.has(w)), ...inside.filter((w) => !FILLER.has(w))] : [];
  return makeQuery(words, outside || full, descriptors, negates);
}

interface TermMatch {
  score: number;
  exact: boolean;
  fuzzy: boolean;
}

/** Ingredients a dish is said to leave out: "black tea (no milk, no sugar)" -> milk, sugar. */
function leftOut(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NEGATION_BEFORE)) out.add(m[1]);
  for (const m of text.matchAll(NEGATION_AFTER)) out.add(m[1]);
  return out;
}

function matchTerm(q: Query, term: Term): TermMatch | null {
  const found = (score: number, exact = false, fuzzy = false): TermMatch => ({ score: score * term.weight, exact, fuzzy });

  // The query exactly as typed, fillers included: "tea with milk and sugar" is the alias of milk chai.
  if (q.full !== q.text) {
    if (term.text === q.full) return found(SCORE.exact, true);
    if (term.text.startsWith(q.full + " ")) return found(SCORE.phrasePrefix);
    if (q.full.includes(" ") && ` ${term.text} `.includes(` ${q.full} `)) return found(SCORE.phrasePrefix - 30);
  }
  if (term.text === q.text) return found(SCORE.exact, true);
  // The phrase must end on a word boundary, otherwise "dal" would count "dalia" as a phrase match.
  if (term.text.startsWith(q.text + " ")) return found(SCORE.phrasePrefix);

  let match: TermMatch | null = null;
  const exactWord = (qw: string) => term.words.includes(qw);
  const prefixWord = (qw: string) => term.words.some((w) => w.startsWith(qw));
  const keyExact = (qk: string) => term.keys.includes(qk);
  const termKeys = term.keys.join(" ");
  const queryKeys = q.keys.join(" ");
  // The last word may still be being typed, but a 1-2 letter sound prefix matches far too much.
  const keyPrefix = (qk: string) => qk.length >= 3 && term.keys.some((k) => k.startsWith(qk));

  if (q.words.every(exactWord)) match = found(SCORE.wholeWords);
  else if (q.words.every(prefixWord)) match = found(SCORE.wordPrefixes);
  // Substring only for 4+ letters so "tea" does not match "steak" and "dal" does not match "pandal".
  else if (q.text.length >= 4 && term.text.includes(q.text)) match = found(SCORE.substring);
  else if (termKeys === queryKeys) match = found(SCORE.phoneticExact);
  else if (termKeys.startsWith(queryKeys + " ")) match = found(SCORE.phoneticPhrasePrefix);
  else if (q.keys.every(keyExact)) match = found(SCORE.phoneticWords);
  else if (q.keys.every((qk, i) => keyExact(qk) || (i === q.keys.length - 1 && keyPrefix(qk)))) match = found(SCORE.phoneticPrefix);

  if (match) {
    // "Black Tea (No Milk, No Sugar)" contains the words milk and sugar but is the opposite of what "tea with milk
    // and sugar" asks for. Unless the query itself says no / without, a food that leaves a queried word out drops down.
    if (!q.negates) {
      const out = leftOut(term.text);
      if (out.size > 0 && q.words.some((w) => out.has(w))) match.score -= 420;
    }
    // Descriptor words that the food also carries break ties ("plain dosa" -> Plain Dosa).
    for (const d of q.descriptors) if (term.words.includes(d)) match.score += 12;
    // English names put the kind of dish last: "Masala Dosa" is a dosa, "Idli-Dosa Sambar" is a sambar.
    if (!match.fuzzy && q.words.length > 0 && term.headNoun === q.words[q.words.length - 1]) match.score += 60;
    return match;
  }

  // Typos: every query word must be near some word of the term.
  let penalty = 0;
  for (const qk of q.keys) {
    const max = allowedTypos(qk.length);
    let best = max + 1;
    for (const k of term.keys) {
      best = Math.min(best, editDistance(qk, k, max));
      // a typo in the first letters of a longer word the user is still typing ("papay" -> papaya)
      if (qk.length >= 5 && k.length > qk.length) best = Math.min(best, editDistance(qk, k.slice(0, qk.length), max));
      if (best === 0) break;
    }
    if (best > max) return null;
    penalty += best;
  }
  // A name as short as the query ("Pineapple" for "pinapple") beats one that merely contains it ("Pineapple Gojju").
  return found(SCORE.fuzzy - 45 * penalty + (term.words.length === q.words.length ? 40 : 0), false, true);
}

function matchFood<T>(q: Query, food: IndexedFood<T>): (TermMatch & { viaRegion: boolean }) | null {
  let best: TermMatch | null = null;
  for (const term of food.terms) {
    const m = matchTerm(q, term);
    if (m && (!best || m.score > best.score)) best = m;
  }
  if (best) return { ...best, viaRegion: false };

  // A state name may satisfy part of the query: "kerala fish" = fish dishes of Kerala.
  if (food.regionWords.length > 0 && q.words.length > 1) {
    const rest: string[] = [];
    let usedRegion = false;
    q.words.forEach((w, i) => {
      const k = q.keys[i];
      if (food.regionWords.includes(w) || food.regionKeys.includes(k)) usedRegion = true;
      else rest.push(w);
    });
    if (usedRegion && rest.length > 0) {
      const restQuery = makeQuery(rest, rest.join(" "), [], q.negates);
      for (const term of food.terms) {
        const m = matchTerm(restQuery, term);
        if (m && !m.fuzzy && (!best || m.score > best.score)) best = m;
      }
      if (best) return { ...best, score: best.score - 80, exact: false, viaRegion: true };
    }
  }
  // A state name alone lists that state's dishes.
  if (food.regionWords.length > 0 && q.words.every((w, i) => food.regionWords.includes(w) || food.regionKeys.includes(q.keys[i]))) {
    return { score: 260, exact: false, fuzzy: false, viaRegion: true };
  }
  return null;
}

/** Below this a result is a weak guess (typo or a loose substring); it is hidden when real matches exist. */
const WEAK_BELOW = 380;
const STRONG_FROM = 560;

/** Ranks the foods that match `query`, best first. */
export function searchIndex<T extends SearchableFood>(index: FoodIndex<T>, query: string, limit = 30): SearchResult<T> {
  const q = parseQuery(query);
  if (!q) return { hits: [] };

  const hits: Array<SearchHit<T> & { fuzzy: boolean }> = [];
  const wantsRaw = WANTS_RAW.test(q.full);
  const adjust = (food: IndexedFood<T>) =>
    // Everyday foods first, then shorter (plainer) names: "Dal Tadka" before "Dal Tadka with Spinach and Cream".
    // "poha" means the dish on the plate, not the 354 kcal dry flakes, unless the query asks for the dry form.
    (food.core ? 90 : 0) - (food.raw && !wantsRaw ? 150 : 0) - Math.min(food.nameLength, 80) * 0.35;

  for (const food of index) {
    const m = matchFood(q, food);
    if (m) hits.push({ item: food.item, score: m.score + adjust(food), exact: m.exact, fuzzy: m.fuzzy });
  }

  if (hits.length === 0 && q.words.length > 1) {
    // "2 roti aur dal", "undhiyu gujarati mixed veg": nothing contains every word, so rank foods by how much of the
    // query they cover, counting a rare word (litti) for much more than a common one (curry).
    const idf = index.idf ?? new Map<string, number>();
    const weights = q.words.map((w) => Math.max(idf.get(phoneticKey(w)) ?? 3, 0.5));
    const total = weights.reduce((a, b) => a + b, 0);
    const singles = q.words.map((w) => makeQuery([w], w, [], q.negates));
    for (const food of index) {
      let covered = 0;
      singles.forEach((single, i) => {
        if (single.words[0].length < 3) return;
        const m = matchFood(single, food);
        if (m && !m.fuzzy) covered += weights[i] * Math.min(m.score / SCORE.wholeWords, 1);
      });
      if (covered === 0) continue;
      hits.push({ item: food.item, score: 480 * (covered / total) + adjust(food), exact: false, fuzzy: false });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  // Real matches hide the weak guesses ("litti chokha" should not also offer white chocolate).
  const strong = hits.length > 0 && hits[0].score >= STRONG_FROM;
  const kept = strong ? hits.filter((h) => h.score >= WEAK_BELOW) : hits;

  const top = kept.slice(0, limit);
  const onlyFuzzy = top.length > 0 && top.every((h) => h.fuzzy);
  return {
    hits: top.map(({ item, score, exact }) => ({ item, score, exact })),
    corrected: onlyFuzzy ? top[0].item.name : undefined,
  };
}

/** Convenience for one-off use; prefer `buildIndex` once and `searchIndex` per keystroke. */
export function searchFoods<T extends SearchableFood>(items: T[], query: string, limit = 30): SearchResult<T> {
  return searchIndex(buildIndex(items), query, limit);
}
