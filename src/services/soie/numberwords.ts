/**
 * Spoken number words -> digits ("एक सौ पचास बाय पचानवे" -> "150 बाय 95"). PURE, no imports.
 *
 * Why: voice dictation (hi-IN) and typing sometimes produce number WORDS, while temporal.ts, safety.ts
 * (readingsInMessage) and normalize.ts understand digits only. Run this on the message first.
 *
 * THE HARD PART IS NOT BREAKING NORMAL TEXT, so every word has a strength:
 *
 *   FREE   converts anywhere. Multi-digit words (Devanagari, Hinglish and English 10-99: पचास, pachaas,
 *          fifty, twenty five), and every compound with a multiplier (एक सौ, do hazaar, one hundred, डेढ़ सौ).
 *   WEAK   0-9 words and bare multipliers: एक दो तीन ... / ek do teen ... / one two three ... / सौ / hazaar,
 *          plus the risky Hinglish tens that are also names or words (das = Dr. Das, bees = the insect, tees, sattar, assi, bais). They convert ONLY in a
 *          NUMERIC CONTEXT:
 *            1. directly before a unit: din, hafte, mahine, ghante, saal, minute, kadam, steps, mg, kg, kcal,
 *               baje, a month name, or a counter (baar, times, reading, goli) -> "do din", "paanch baje";
 *            2. directly after pichle / last / past / next / agle ... -> "pichle saat din", "last two";
 *            3. next to a BP separator (by, over, बाय, बटा, ओवर, "/") whose other side is a number >= 10;
 *            4. a pair of adjacent single digits where the second has a unit ("do teen din" -> "2 3 din").
 *   STRICT "sat" (also an English verb) and Devanagari "वन" (forest): need BOTH a prefix and a unit.
 *
 * Words that are also ordinary words get extra guards:
 *   - "do"/"दो" is also "give": "bata do", "kar do", "de do", "karne do" (verb stem or infinitive just before,
 *     or an English "what/how/you/to ..." just before) never converts, even in front of a unit.
 *   - "ek"/"एक"/"one" are also an article: they convert only in front of a time/measure unit/baje/month
 *     ("ek hafte ka", "ek kilo", "ek baje") and NEVER in front of baar/time/goli ("ek baar", "ek aur goli").
 *     For a time unit the unit must be followed by ka/ki/ke/mein/se/tak/pehle/baad/ago or end the sentence,
 *     or follow pichle/last/..., so "ek din papa gir gaye" (one day Papa fell) is left alone. English "one"
 *     additionally needs last/past/for/in/within/... before it or "ago" after the unit.
 *   - bare "sau/सौ/hazaar/hundred" never convert in "सौ फीसदी", "hazaar baar", "a hundred percent".
 *   - English "one fifty over ninety" (BP idiom, 150/90) is read as 100+50 only next to a BP separator, a
 *     unit, or within three words after bp / pressure / reading.
 *
 * Fractions: डेढ़ / dedh = 1.5, ढाई / dhai = 2.5, सवा = +0.25, साढ़े = +0.5, पौने = -0.25. With sau / hazaar /
 * lakh they are plain integers (डेढ़ सौ = 150, सवा सौ = 125, ढाई सौ = 250, साढ़े तीन सौ = 350) and FREE; alone
 * they convert only before a unit ("डेढ़ घंटे" -> "1.5 घंटे") or baje ("साढ़े तीन बजे" -> "3:30 बजे").
 *
 * Also merges digit x multiplier ("5 हज़ार कदम" -> "5000 कदम", "1.5 hazaar" -> "1500").
 *
 * Contract: only the number words change (digits are always ASCII); spacing and all other text are kept
 * byte for byte; it never throws; running it again changes nothing (it iterates to a fixed point).
 * Runs under Node type stripping and in the browser bundle (no enums, namespaces or imports).
 * Deliberately NOT converted: Hinglish "sath/saath" (60, also "with"), "tera" (13, also "yours"), "chauda",
 * "bis"/"tis" as typed, आधा/half, पौन, ordinals (पहला), words above 99,999, spelled-out decimals.
 */

type Kind = "ones" | "small" | "tens" | "mult" | "frac1" | "frac2";

interface Entry {
  k: Kind;
  v: number;
  /** 0 FREE, 1 WEAK, 2 STRICT (see the header). */
  s: 0 | 1 | 2;
  /** 1 / ek / one: never converted before a counter (baar, goli ...). */
  one?: boolean;
  /** 2 / do / दो: also the verb "give". */
  give?: boolean;
  /** English origin ("one fifty" idiom, extra restrictions on "one"). */
  en?: boolean;
  /** Counts only as the tail of a sau / hazaar compound ("ek sau saath" = 160); "saath" alone means "with". */
  rem?: boolean;
}

// ---------------------------------------------------------------------------
// Spelling keys. Hindi spelling varies wildly, so words are compared by a key that folds the usual variation.
// Both the vocabulary and the user's words go through the same key function, so a variant list can stay short.
// ---------------------------------------------------------------------------

const fc = String.fromCharCode;
const VIRAMA = fc(0x94d);
const NA = fc(0x928);
/** ZWNJ, ZWJ, nukta, chandrabindu, anusvara: dropped before comparing. */
const DEV_DROP_RE = new RegExp("[" + fc(0x200c, 0x200d, 0x93c, 0x901, 0x902) + "]", "g");
/** Long vowels shortened, ण -> न, श / ष -> स. */
const DEV_FOLD: Array<[string, string]> = [
  [fc(0x940), fc(0x93f)],
  [fc(0x942), fc(0x941)],
  [fc(0x908), fc(0x907)],
  [fc(0x90a), fc(0x909)],
  [fc(0x923), fc(0x928)],
  [fc(0x936), fc(0x938)],
  [fc(0x937), fc(0x938)],
];

/** X + virama + X -> X ("इक्कीस" -> "इकीस"). */
function collapseGeminates(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === VIRAMA && out.length > 0 && s[i + 1] === out[out.length - 1]) {
      i++;
      continue;
    }
    out += s[i];
  }
  return out;
}

/** Devanagari key: drops nukta / ZWJ / chandrabindu / anusvara, shortens long vowels, folds ण ष श, collapses geminates and "न्". */
function devKey(w: string): string {
  let s = w.normalize("NFD").replace(DEV_DROP_RE, "");
  for (const [from, to] of DEV_FOLD) s = s.split(from).join(to);
  return collapseGeminates(s).split(NA + VIRAMA).join("");
}

/** Roman key: aa->a, ee->i, oo->u, w->v, z->j, doubled letters collapse, chh / chch / cch -> ch ("pachchis" = "pachis"). */
function romanKey(s: string): string {
  return s
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/ee|ii/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?:ch)+/g, "ch");
}

const DEVANAGARI_RE = new RegExp("[" + fc(0x900) + "-" + fc(0x97f) + "]");

function keyOf(w: string): string {
  return DEVANAGARI_RE.test(w) ? devKey(w) : romanKey(w.toLowerCase());
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Two different numbers sharing one key would be a data bug; collected (never thrown) so the test can assert it is empty. */
export const NUMBER_WORD_CONFLICTS: string[] = [];

const DEV = new Map<string, Entry>();
const EN = new Map<string, Entry>();
const ROM = new Map<string, Entry>();

function put(m: Map<string, Entry>, key: string, e: Entry, label: string): void {
  const old = m.get(key);
  if (!old) {
    m.set(key, e);
    return;
  }
  if (old.v !== e.v || old.k !== e.k) NUMBER_WORD_CONFLICTS.push(`${label} (${e.v}) collides with ${old.v}`);
}

function kindOf(v: number): Kind {
  return v >= 1 && v <= 9 ? "ones" : "small";
}

/** Add Devanagari spellings. */
function dev(v: number, words: string, s: 0 | 1 | 2 = 0, extra: Partial<Entry> = {}): void {
  for (const w of words.split(" ")) put(DEV, devKey(w), { k: v === 0 ? "ones" : kindOf(v), v, s, ...extra }, w);
}
/** Add Roman (Hinglish) spellings, compared through romanKey. */
function rom(v: number, words: string, s: 0 | 1 | 2 = 0, extra: Partial<Entry> = {}): void {
  for (const w of words.split(" ")) put(ROM, romanKey(w), { k: v === 0 ? "ones" : kindOf(v), v, s, ...extra }, w);
}
/** Add English words (exact, lower-case). */
function eng(v: number, words: string, k: Kind, s: 0 | 1 | 2, extra: Partial<Entry> = {}): void {
  for (const w of words.split(" ")) put(EN, w, { k, v, s, en: true, ...extra }, w);
}

// --- Devanagari 0-9 (weak) ---
dev(0, "शून्य सिफर जीरो ज़ीरो", 1);
dev(1, "एक", 1, { one: true });
dev(2, "दो", 1, { give: true });
dev(3, "तीन", 1);
dev(4, "चार", 1);
dev(5, "पांच पाँच पाच", 1);
dev(6, "छह छः छे छै छ", 1);
dev(7, "सात", 1);
dev(8, "आठ", 1);
dev(9, "नौ", 1);

// --- Devanagari 10-99 (free) ---
dev(10, "दस");
dev(11, "ग्यारह ग्यारा");
dev(12, "बारह बारा");
dev(13, "तेरह");
dev(14, "चौदह");
dev(15, "पंद्रह पन्द्रह पंदरह पन्दरह");
dev(16, "सोलह");
dev(17, "सत्रह सतरह सत्रा");
dev(18, "अठारह अट्ठारह अठ्ठारह अठारा");
dev(19, "उन्नीस उन्निस");
dev(20, "बीस");
dev(21, "इक्कीस इक्किस");
dev(22, "बाईस बाइस");
dev(23, "तेईस तेइस");
dev(24, "चौबीस चौबिस");
dev(25, "पच्चीस पच्चिस");
dev(26, "छब्बीस छब्बिस");
dev(27, "सत्ताईस सत्ताइस");
dev(28, "अट्ठाईस अट्ठाइस अठाईस अठाइस");
dev(29, "उनतीस उन्तीस उनत्तीस उनतिस उन्नतीस");
dev(30, "तीस");
dev(31, "इकतीस इकत्तीस इकतिस");
dev(32, "बत्तीस");
dev(33, "तैंतीस तेंतीस");
dev(34, "चौंतीस");
dev(35, "पैंतीस पैंतिस");
dev(36, "छत्तीस");
dev(37, "सैंतीस");
dev(38, "अड़तीस अडतीस अड़तिस");
dev(39, "उनतालीस उन्तालीस उनचालीस");
dev(40, "चालीस");
dev(41, "इकतालीस");
dev(42, "बयालीस");
dev(43, "तैंतालीस तेंतालीस");
dev(44, "चौवालीस चवालीस चौंवालीस");
dev(45, "पैंतालीस");
dev(46, "छियालीस छयालीस");
dev(47, "सैंतालीस");
dev(48, "अड़तालीस अठतालीस");
dev(49, "उनचास उन्चास उनंचास");
dev(50, "पचास");
dev(51, "इक्यावन इकावन");
dev(52, "बावन");
dev(53, "तिरपन तिरेपन");
dev(54, "चौवन चौअन");
dev(55, "पचपन");
dev(56, "छप्पन");
dev(57, "सत्तावन सतावन");
dev(58, "अट्ठावन अठावन");
dev(59, "उनसठ उन्सठ");
dev(60, "साठ");
dev(61, "इकसठ");
dev(62, "बासठ");
dev(63, "तिरसठ तिरेसठ");
dev(64, "चौंसठ");
dev(65, "पैंसठ");
dev(66, "छियासठ छयासठ");
dev(67, "सड़सठ सरसठ");
dev(68, "अड़सठ");
dev(69, "उनहत्तर उन्हत्तर");
dev(70, "सत्तर");
dev(71, "इकहत्तर");
dev(72, "बहत्तर");
dev(73, "तिहत्तर");
dev(74, "चौहत्तर");
dev(75, "पचहत्तर पिचहत्तर");
dev(76, "छिहत्तर छहत्तर");
dev(77, "सतहत्तर सतत्तर");
dev(78, "अठहत्तर अठत्तर");
dev(79, "उन्यासी उनासी");
dev(80, "अस्सी");
dev(81, "इक्यासी");
dev(82, "बयासी");
dev(83, "तिरासी");
dev(84, "चौरासी");
dev(85, "पचासी");
dev(86, "छियासी छयासी");
dev(87, "सत्तासी सतासी");
dev(88, "अट्ठासी अठासी");
dev(89, "नवासी");
dev(90, "नब्बे");
dev(91, "इक्यानवे इक्यानबे इकानवे");
dev(92, "बानवे बानबे बयानवे");
dev(93, "तिरानवे तिरानबे");
dev(94, "चौरानवे चौरानबे");
dev(95, "पचानवे पचानबे पंचानवे");
dev(96, "छियानवे छयानवे छियानबे");
dev(97, "सत्तानवे सतानवे सत्तानबे");
dev(98, "अट्ठानवे अठानवे अट्ठानबे");
dev(99, "निन्यानवे निन्यानबे निनानवे निन्नानवे");

// --- multipliers and fractions (Devanagari) ---
function devMult(v: number, words: string): void {
  for (const w of words.split(" ")) put(DEV, devKey(w), { k: "mult", v, s: 1 }, w);
}
function devFrac(k: "frac1" | "frac2", v: number, words: string): void {
  for (const w of words.split(" ")) put(DEV, devKey(w), { k, v, s: 1 }, w);
}
devMult(100, "सौ");
devMult(1000, "हजार हज़ार");
devMult(100000, "लाख");
devFrac("frac1", 1.5, "डेढ़ डेढ");
devFrac("frac1", 2.5, "ढाई अढ़ाई");
devFrac("frac2", 0.25, "सवा");
devFrac("frac2", 0.5, "साढ़े साढे");
devFrac("frac2", -0.25, "पौने");

// --- English words written in Devanagari by speech recognition ("वन फिफ्टी बाय नाइंटी") ---
dev(1, "वन", 2, { one: true, en: true });
dev(2, "टू", 1, { en: true });
dev(3, "थ्री", 1, { en: true });
dev(4, "फोर", 1, { en: true });
dev(5, "फाइव फाईव", 1, { en: true });
dev(6, "सिक्स", 1, { en: true });
dev(7, "सेवन", 1, { en: true });
dev(8, "एट ऐट", 1, { en: true });
dev(9, "नाइन", 1, { en: true });
dev(10, "टेन", 0, { en: true });
dev(11, "इलेवन", 0, { en: true });
dev(12, "ट्वेल्व", 0, { en: true });
dev(13, "थर्टीन", 0, { en: true });
dev(14, "फोर्टीन", 0, { en: true });
dev(15, "फिफ्टीन", 0, { en: true });
dev(16, "सिक्सटीन", 0, { en: true });
dev(17, "सेवेंटीन", 0, { en: true });
dev(18, "एटीन", 0, { en: true });
dev(19, "नाइनटीन", 0, { en: true });
function devTens(v: number, words: string): void {
  for (const w of words.split(" ")) put(DEV, devKey(w), { k: "tens", v, s: 0, en: true }, w);
}
devTens(20, "ट्वेंटी ट्वेन्टी");
devTens(30, "थर्टी");
devTens(40, "फोर्टी");
devTens(50, "फिफ्टी");
devTens(60, "सिक्सटी सिक्स्टी");
devTens(70, "सेवेंटी सेवन्टी सेवंटी");
devTens(80, "एटी ऐटी");
devTens(90, "नाइंटी नाइनटी");
for (const w of "हंड्रेड हन्ड्रेड".split(" ")) put(DEV, devKey(w), { k: "mult", v: 100, s: 1, en: true }, w);
for (const w of "थाउजेंड थाउज़ेंड थाउजैंड".split(" ")) put(DEV, devKey(w), { k: "mult", v: 1000, s: 1, en: true }, w);

// --- English (exact words; "twenty-five" is two tokens joined by a hyphen) ---
eng(0, "zero", "ones", 1);
eng(1, "one", "ones", 1, { one: true });
eng(2, "two", "ones", 1);
eng(3, "three", "ones", 1);
eng(4, "four", "ones", 1);
eng(5, "five", "ones", 1);
eng(6, "six", "ones", 1);
eng(7, "seven", "ones", 1);
eng(8, "eight", "ones", 1);
eng(9, "nine", "ones", 1);
eng(10, "ten", "small", 0);
eng(11, "eleven", "small", 0);
eng(12, "twelve", "small", 0);
eng(13, "thirteen", "small", 0);
eng(14, "fourteen", "small", 0);
eng(15, "fifteen", "small", 0);
eng(16, "sixteen", "small", 0);
eng(17, "seventeen", "small", 0);
eng(18, "eighteen", "small", 0);
eng(19, "nineteen", "small", 0);
eng(20, "twenty", "tens", 0);
eng(30, "thirty", "tens", 0);
eng(40, "forty fourty", "tens", 0);
eng(50, "fifty", "tens", 0);
eng(60, "sixty", "tens", 0);
eng(70, "seventy", "tens", 0);
eng(80, "eighty", "tens", 0);
eng(90, "ninety", "tens", 0);
eng(100, "hundred", "mult", 1);
eng(1000, "thousand", "mult", 1);

// --- Roman Hindi 0-9 (weak) ---
rom(0, "shunya sifar sifr", 1);
rom(1, "ek", 1, { one: true });
rom(2, "do", 1, { give: true });
rom(3, "teen tin", 1);
rom(4, "char chaar", 1);
rom(5, "paanch panch", 1);
rom(6, "chhe chhah che chah chhey", 1);
rom(7, "saat sat", 1);
rom(8, "aath ath", 1);
rom(9, "nau", 1);

// --- Roman Hindi 10-99 (free unless an ordinary word shares the spelling) ---
rom(10, "das dus", 1);
rom(11, "gyarah gyara giyarah");
rom(12, "barah baarah");
rom(13, "terah terha");
rom(14, "chaudah chaudha chodah chowdah");
rom(15, "pandrah pandra pandarah pandharah panderah");
rom(16, "solah solaah");
rom(17, "satrah satarah");
rom(18, "atharah athara athrah");
rom(19, "unnis unnees unis");
rom(20, "bees", 1);
rom(21, "ikkis ikkees ikis");
rom(22, "baais baees bais", 1); // "Bais" is a surname
rom(23, "teis taees tais tayis");
rom(24, "chaubis chaubees chobis chowbis");
rom(25, "pachchis pachis pachees pacchis pachchees pachhis");
rom(26, "chhabbis chhabis chabbis chhabbees");
rom(27, "sattais sattaees sataees satais");
rom(28, "atthais atthaees athais athaees");
rom(29, "unatis unnatis untis unattis unatees untees");
rom(30, "tees", 1);
rom(31, "ikattis ikatis iktis ikattees ikatees iktees");
rom(32, "battis battees batis batees");
rom(33, "taintis taitis tentis taintees taitees");
rom(34, "chauntis chautis chauntees chautees");
rom(35, "paintis paitis paintees pentis paitees");
rom(36, "chhattis chattis chhatis chattees chhattees");
rom(37, "saintis saitis saintees saitees");
rom(38, "adtis adhtis adatis adtees");
rom(39, "untalis untaalis unchalis unchaalis untalees");
rom(40, "chalis chaalis chalees");
rom(41, "iktalis ikatalis iktaalis iktalees");
rom(42, "bayalis bayaalis byalis bayalees");
rom(43, "tentalis taintalis tirtalis taitalis tirtaalis");
rom(44, "chavalis chauvalis chavaalis chowalis chauvaalis chavalees");
rom(45, "paintalis paitalis paintaalis paintalees pentalis");
rom(46, "chhiyalis chiyalis chhialis chhiyaalis chyalis");
rom(47, "saintalis saitalis saintaalis saintalees");
rom(48, "adtalis adhtalis adtaalis adatalis adtalees");
rom(49, "unchas unchaas unaas unchash");
rom(50, "pachas pachaas pachash");
rom(51, "ikyavan ikyawan ikkyavan ekyavan ikavan");
rom(52, "bavan bawan baavan baawan");
rom(53, "tirpan tirepan tirpaan tirapan");
rom(54, "chauvan chauwan chauvaan chowan"); // not "chavan": a surname
rom(55, "pachpan pachpaan pachapan");
rom(56, "chhappan chappan chhapan chappaan");
rom(57, "sattavan sattawan satavan sattaavan");
rom(58, "atthavan atthawan athavan athaavan");
rom(59, "unsath unsaath unasath");
rom(60, "sath saath", 1, { rem: true }); // "ek sau saath" = 160; never alone ("papa ke saath")
rom(61, "iksath ikasath ikyasath iksaath ikyaasath");
rom(62, "baasath basath baasaath");
rom(63, "tirsath tirsaath tresath tirasath");
rom(64, "chausath chaunsath chausaath");
rom(65, "painsath painsaath paisath paisaath");
rom(66, "chhiyasath chhiyaasath chiyasath chhiyasaath");
rom(67, "sarsath sadsath sadsaath sarsaath");
rom(68, "adsath arsath adsaath arsaath adhsath");
rom(69, "unhattar unhatar unahattar unnhattar");
rom(70, "sattar satar", 1); // "Sattar" is a name
rom(71, "ikhattar ikahattar ikattar ikhatar");
rom(72, "bahattar bahatar bahathar");
rom(73, "tihattar tihatar tehattar tihathar");
rom(74, "chauhattar chauhatar chauhathar");
rom(75, "pachhattar pachattar pachhatar pachhathar pichhattar pachahattar");
rom(76, "chhihattar chhihatar chihattar chhehattar");
rom(77, "sathattar satahattar sathatar satattar");
rom(78, "athattar athatar athahattar athhattar atthattar");
rom(79, "unyasi unaasi unasi unnasi unnyasi");
rom(80, "assi asi assee", 1); // "Assi" is a name / place
rom(81, "ikyasi ikyaasi ikaasi ikyasee ikasi");
rom(82, "bayasi bayaasi bayasee byaasi byasi");
rom(83, "tirasi tiraasi tirasee");
rom(84, "chaurasi chaurasee");
rom(85, "pachasi pachaasi pachasee");
rom(86, "chhiyasi chhiyaasi chiyaasi chiyasi chhiyasee");
rom(87, "sattasi sattaasi satasi sattasee sataasi");
rom(88, "atthasi atthaasi athasi atthasee athaasi");
rom(89, "nawasi navasi nawaasi navaasi nawasee");
rom(90, "nabbe nabbay nabbey nabe");
rom(91, "ikyanve ikyanave ikyanwe ikyaanve ikyanabe ikyanbe");
rom(92, "bayanve baanve bayanwe bayaanve baanwe baanbe");
rom(93, "tirnave tiranve tirannve tiranwe tiraanve tiranbe");
rom(94, "chauranve chauraanve chauranwe chauranave chauranbe");
rom(95, "pachanve pachaanve pachanwe pachanabe pachaanwe pachanbe");
rom(96, "chhiyanve chhiyaanve chiyanve chhiyanwe chhyanve chiyanbe");
rom(97, "sattanve sattaanve sattanwe satanve sattaanwe sattanbe");
rom(98, "atthanve atthaanve atthanwe athanve atthaanwe atthanbe");
rom(99, "ninyanve ninyanwe ninaanve nanyanve ninaanwe nannave ninyaanve ninyanbe ninnanve");

function romMult(v: number, words: string): void {
  for (const w of words.split(" ")) put(ROM, romanKey(w), { k: "mult", v, s: 1 }, w);
}
function romFrac(k: "frac1" | "frac2", v: number, words: string): void {
  for (const w of words.split(" ")) put(ROM, romanKey(w), { k, v, s: 1 }, w);
}
romMult(100, "sau");
romMult(1000, "hazaar hazar hajar");
romMult(100000, "lakh laakh");
romFrac("frac1", 1.5, "dedh derh dedha");
romFrac("frac1", 2.5, "dhai dhaai adhai adhaai");
romFrac("frac2", 0.25, "sava sawa");
romFrac("frac2", 0.5, "sadhe saadhe saade");
romFrac("frac2", -0.25, "paune poune");

// English "sat" is a verb: same key as "saat" (7) but STRICT.
const STRICT_SEVEN: Entry = { k: "ones", v: 7, s: 2 };

// --- units and context words (compared by key) ---
const T = 1; // time window: din, hafte, ghante ...
const M = 2; // measure: mg, kg, kcal, kadam, steps ...
const C = 4; // counter: baar, times, reading, goli ...
const D = 8; // month name ("paanch october")
const B = 16; // baje / o'clock

const UNIT = new Map<string, number>();
function units(bits: number, words: string): void {
  for (const w of words.split(" ")) {
    const k = keyOf(w);
    UNIT.set(k, (UNIT.get(k) ?? 0) | bits);
  }
}
units(
  T,
  "din dino dinon day days hafte hafta haftey haphte hafton haftoon week weeks saptah mahine mahina mahinon mahino month months saal saalon sal varsh year years yr yrs ghante ghanta ghanton ghantey ghnte hour hours hr hrs minute minutes minit mint min mins second seconds sec secs " +
    "दिन दिनों दिनो हफ्ते हफ्ता हफ्तों सप्ताह महीने महीना महीनों साल सालों वर्ष घंटे घंटा घण्टे घंटों मिनट मिनिट सेकंड सेकेंड",
);
units(
  M,
  "mg mcg gm gms gram grams kg kgs kilo kilos kilogram kilograms ml litre litres liter liters ltr kcal calorie calories calory cm mm km meter metre meters metres kadam kadme kadmon step steps mmhg bpm unit units " +
    "मिलीग्राम ग्राम किलो किलोग्राम लीटर कैलोरी कैलोरीज कैलोरीज़ कदम कदमों स्टेप स्टेप्स एमजी मिमी सेंटीमीटर किलोमीटर मीटर यूनिट यूनिट्स",
);
units(
  C,
  "baar bar dafa dafe martaba times time reading readings goli golis goliyan tablet tablets capsule capsules dose doses " +
    "बार दफा दफे मर्तबा टाइम रीडिंग रीडिंग्स गोली गोलियां गोलियाँ गोलियों टैबलेट कैप्सूल डोज़ डोज",
);
// "may" and "mar" are left out on purpose (English words).
units(
  D,
  "january february april june july august september october november december jan feb apr jun jul aug sep sept oct nov dec " +
    "जनवरी फरवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर सितम्बर अक्टूबर अक्तूबर नवंबर नवम्बर दिसंबर दिसम्बर",
);
units(B, "baje bajey oclock बजे");

function keySet(words: string): Set<string> {
  return new Set(words.split(" ").map(keyOf));
}

/** "pichle saat din", "last two", "next three": a number right after these is a count. */
const PREFIX = keySet("pichle pichhle pichli pichla pichhli pichhla last past previous purane next agle agla agli coming upcoming beete beeta पिछले पिछली पिछला अगले अगली अगला बीते बीता पुराने");
/** Before English "one" (with a time unit): "for one week", "in one day", "over one month". */
const ONE_PREP = keySet("for in within over after about around every per during since only just almost nearly");
/** After a time unit: "ek hafte ka", "ek din pehle", "one week ago". */
const AFTER_OK = keySet("ka ki ke mein me tak se pehle pahle baad ago before back later का की के में से तक पहले बाद");
const AGO = keySet("ago before back later pehle pahle पहले");
/** BP separators (as spoken: "150 by 95", "150 बाय 95", "एक सौ बीस बटा अस्सी"). Roman "bata" is NOT one (it means "tell"). */
const SEP = keySet("by over upon बाय बटा बटे ओवर");
/** Words that make a following "one fifty" a BP reading. */
const ANCHOR = keySet("bp pressure reading readings systolic diastolic upper lower बीपी प्रेशर रीडिंग रीडिंग्स");
/** Just before "do"/"दो" these make it the verb "give/let" ("bata do", "kar do", "de do", "karne do", "what do"). */
const GIVE_BEFORE = keySet(
  "bata batao batana dikha dikhao dikhana kar karo karna le lo lena de dena ho hona ja jao jana aa aao aana ruk ruko rakh rakho rakhna laga lagao la lao bhej bhejo hata hatao khol kholo band chhod chhodo dekh dekho sun suno bol bolo kah kaho likh likho mil mila pooch puchh puchho uth utha baith baitho pakad sunao " +
    "karne lene dene jane jaane aane khane peene pine sone rehne rahne chalne bolne dekhne batane bataane likhne padhne hone uthne baithne rukne lagane dikhane bhejne rakhne chhodne kahne milne pakadne sunne sunane bulane nikalne bhoolne bhulne lagne " +
    "let give tell show make please just what how why when where who which you we they i to can will would should shall could did does not dont never always ever also then so if " +
    "बता बताओ दिखा दिखाओ कर करो ले लो दे हो जा जाओ आ आओ रुक रुको रख रखो लगा लगाओ ला लाओ भेज भेजो हटा खोल खोलो बंद छोड़ छोड़ो देख देखो सुन सुनो बोल बोलो कह कहो लिख लिखो मिल मिला पूछ उठ उठा बैठ बैठो पकड़ सुनाओ " +
    "करने लेने देने जाने आने खाने पीने सोने रहने चलने बोलने देखने बताने लिखने पढ़ने होने उठने बैठने रुकने लगाने दिखाने भेजने रखने छोड़ने कहने मिलने पकड़ने सुनने बुलाने निकालने भूलने लगने",
);

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface Tok {
  s: number;
  e: number;
  word: boolean;
  /** Digits as ASCII (digit tokens only). */
  dig: string;
  lc: string;
  key: string;
  ent: Entry | null;
  ub: number;
}

interface Rep {
  s: number;
  e: number;
  t: string;
}

interface Seg {
  /** First and one-past-last token index. */
  a: number;
  next: number;
  val: number;
  kind: "single" | "compound" | "bare" | "idiom" | "frac";
  free: boolean;
  /** Entry of the first token. */
  ent: Entry;
  go?: boolean;
  /** A weak compound / idiom without context: the whole span is left alone (never half-converted). */
  blocked?: boolean;
  /** Decided by a unit after it (used by the "do teen din" pair rule). */
  byUnit?: boolean;
}

/** Tokens are joined (into one number / one context) only across spaces and hyphens, never across punctuation or newlines. */
const JOIN_RE = new RegExp("^[- " + fc(9, 0xa0, 0x2009, 0x202f, 0x2010) + "-" + fc(0x2015) + "]*$");
/** A gap that is just "/" or a backslash (BP "150 / 95"). */
function isSlash(gap: string): boolean {
  const g = gap.trim();
  return g.length === 1 && (g === "/" || g === fc(92));
}
const TAIL_RE = /^[\s?.!।"')\]]*$/;
const TOKEN_RE = /[\p{L}\p{M}\p{Cf}]+|\p{Nd}+/gu;
const DIGIT_START_RE = /^\p{Nd}/u;
const NO_DIGIT_BEFORE_RE = /[\p{Nd}.,:\/\-–—]/u;

/** ASCII / Devanagari / Arabic-Indic digits -> ASCII digits. */
function asciiDigits(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x966 && c <= 0x96f) out += String(c - 0x966);
    else if (c >= 0x660 && c <= 0x669) out += String(c - 0x660);
    else if (c >= 0x6f0 && c <= 0x6f9) out += String(c - 0x6f0);
    else out += s[i];
  }
  return out;
}

function lookup(dv: boolean, lc: string, key: string): Entry | null {
  if (dv) return DEV.get(key) ?? null;
  const en = EN.get(lc);
  if (en) return en;
  const r = ROM.get(key);
  if (!r) return null;
  return lc === "sat" ? STRICT_SEVEN : r;
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** One scan: replaces every number word whose context allows it. Returns the same string when nothing changed. */
function onePass(text: string): string {
  const toks: Tok[] = [];
  const gaps: string[] = [];
  let prevEnd = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const txt = m[0];
    const s = m.index ?? 0;
    if (toks.length > 0) gaps.push(text.slice(prevEnd, s));
    prevEnd = s + txt.length;
    if (DIGIT_START_RE.test(txt)) {
      toks.push({ s, e: prevEnd, word: false, dig: asciiDigits(txt), lc: "", key: "", ent: null, ub: 0 });
    } else {
      const dv = DEVANAGARI_RE.test(txt);
      const lc = dv ? txt : txt.toLowerCase();
      const key = dv ? devKey(txt) : romanKey(lc);
      toks.push({ s, e: prevEnd, word: true, dig: "", lc, key, ent: lookup(dv, lc, key), ub: UNIT.get(key) ?? 0 });
    }
  }
  const n = toks.length;
  if (n === 0) return text;

  const prevIdx = (i: number): number => (i > 0 && JOIN_RE.test(gaps[i - 1]) ? i - 1 : -1);
  const nextIdx = (i: number): number => (i + 1 < n && JOIN_RE.test(gaps[i]) ? i + 1 : -1);
  const prefixAt = (i: number): boolean => i >= 0 && PREFIX.has(toks[i].key);
  const reps: Rep[] = [];

  /** The number a neighbour token stands for (-1: not a number). */
  const numAt = (i: number): number => {
    const t = toks[i];
    if (!t.word) return Number(t.dig);
    return t.ent && !t.ent.rem ? t.ent.v : -1;
  };

  /** Largest number on the other side of a BP separator next to tokens [a, b], or -1. */
  const sepOther = (a: number, b: number): number => {
    let best = -1;
    if (b + 1 < n) {
      if (isSlash(gaps[b])) best = Math.max(best, numAt(b + 1));
      else {
        const r = nextIdx(b);
        if (r >= 0 && SEP.has(toks[r].key)) {
          const r2 = nextIdx(r);
          if (r2 >= 0) best = Math.max(best, numAt(r2));
        }
      }
    }
    if (a > 0) {
      if (isSlash(gaps[a - 1])) best = Math.max(best, numAt(a - 1));
      else {
        const l = prevIdx(a);
        if (l >= 0 && SEP.has(toks[l].key)) {
          const l2 = prevIdx(l);
          if (l2 >= 0) best = Math.max(best, numAt(l2));
        }
      }
    }
    return best;
  };

  const anchorBefore = (a: number): boolean => {
    let t = a;
    for (let step = 0; step < 3; step++) {
      t = prevIdx(t);
      if (t < 0) return false;
      if (ANCHOR.has(toks[t].key)) return true;
    }
    return false;
  };

  /** Is the "do"/"दो" at token a really "give" ("bata do")? */
  const giveBefore = (a: number): boolean => {
    const p = prevIdx(a);
    return p >= 0 && GIVE_BEFORE.has(toks[p].key);
  };

  // --- is a WEAK segment in a numeric context? ---------------------------------------------------
  const weakOK = (p: Seg): boolean => {
    const a = p.a;
    const b = p.next - 1;
    const e = p.ent;
    const single = p.kind === "single";
    if (single && e.give && giveBefore(a)) return false;
    const L = prevIdx(a);
    const R = nextIdx(b);
    const ub = R >= 0 ? toks[R].ub : 0;
    const oneKind = single && !!e.one;
    let mask = T | M | C | D | B;
    if (oneKind) mask = T | M | D | B;
    else if (p.kind === "bare") mask = T | M;
    else if (p.kind === "idiom") mask = M;
    else if (p.kind === "frac") mask = T | M | B;

    // 1. directly before a unit
    if (ub & mask) {
      if (oneKind) {
        const R2 = nextIdx(R);
        if (e.en) return prefixAt(L) || (L >= 0 && ONE_PREP.has(toks[L].key)) || (R2 >= 0 && AGO.has(toks[R2].key));
        if (ub & (M | D | B)) return true;
        return prefixAt(L) || (R2 >= 0 ? AFTER_OK.has(toks[R2].key) : TAIL_RE.test(text.slice(toks[R].e)));
      }
      if (e.s === 2) return prefixAt(L);
      return true;
    }
    if (oneKind || p.kind === "frac" || p.kind === "bare" || p.kind === "idiom") {
      // a bare multiplier / idiom may still sit next to a BP separator, an idiom after "bp"
      if (p.kind === "bare" || p.kind === "idiom") {
        if (sepOther(a, b) >= 0) return true;
        if (p.kind === "idiom" && anchorBefore(a)) return true;
      }
      return false;
    }
    // 2. right after pichle / last / past / next (not for STRICT words)
    if (single && e.s !== 2 && prefixAt(L)) return true;
    // 3. next to a BP separator with a real number (>= 10) on the other side
    if (single && sepOther(a, b) >= 10) return true;
    return false;
  };

  // --- parsing a run of number-word tokens -------------------------------------------------------
  const parseAt = (k0: number, end: number, full: boolean): Seg | null => {
    const e0 = toks[k0].ent as Entry;
    const ent = (k: number): Entry | null => (k < end ? toks[k].ent : null);
    const below100 = (k: number, allowRem = false): { v: number; next: number } | null => {
      const e = ent(k);
      if (!e || (e.rem && !allowRem)) return null;
      if (e.k === "small" || e.k === "ones") return { v: e.v, next: k + 1 };
      if (e.k === "tens") {
        const o = ent(k + 1);
        return o && o.k === "ones" && o.v >= 1 ? { v: e.v + o.v, next: k + 2 } : { v: e.v, next: k + 1 };
      }
      return null;
    };
    /** A multiplicand: 1-99, "डेढ़", "ढाई", "सवा X", "साढ़े X", "पौने X". */
    const group = (k: number): { v: number; next: number } | null => {
      const e = ent(k);
      if (!e) return null;
      if (e.k === "frac1") return { v: e.v, next: k + 1 };
      if (e.k === "frac2") {
        const o = ent(k + 1);
        if (o && (o.k === "ones" || o.k === "small") && o.v >= 1) return { v: o.v + e.v, next: k + 2 };
        if (o && o.k === "mult") return { v: 1 + e.v, next: k + 1 };
        return null;
      }
      const b = below100(k);
      return b && b.v >= 1 ? b : null;
    };

    if (full) {
      // English BP idiom: "one fifty" (150), "one thirty five" (135)
      if (e0.k === "ones" && e0.one && e0.en) {
        const t = ent(k0 + 1);
        if (t && t.k === "tens") {
          let v = 100 + t.v;
          let nx = k0 + 2;
          const o = ent(nx);
          if (o && o.k === "ones" && o.v >= 1) {
            v += o.v;
            nx++;
          }
          return { a: k0, next: nx, val: v, kind: "idiom", free: false, ent: e0 };
        }
      }
      // multiplier compounds: [group mult]* [below100]; multipliers strictly decrease (lakh > hazaar > sau)
      let j = k0;
      let total = 0;
      let last = Infinity;
      let first = true;
      let bare = false;
      for (;;) {
        const g = group(j);
        if (g) {
          const m = ent(g.next);
          if (m && m.k === "mult" && m.v < last) {
            total += g.v * m.v;
            last = m.v;
            j = g.next + 1;
            first = false;
            continue;
          }
        }
        const m0 = ent(j);
        if (first && m0 && m0.k === "mult") {
          total = m0.v;
          last = m0.v;
          j++;
          first = false;
          bare = true;
          continue;
        }
        break;
      }
      if (total > 0) {
        // remainder: "ek sau PACHAAS", "one hundred AND fifty"
        let r = below100(j, true);
        if (!r && j < end && toks[j].lc === "and") r = below100(j + 1, true);
        if (r) {
          total += r.v;
          j = r.next;
        }
        const dangling = ent(j);
        if (dangling && dangling.k === "mult") return null; // "ek sau paanch sau": not a clean number
        return { a: k0, next: j, val: total, kind: bare ? "bare" : "compound", free: !bare, ent: e0 };
      }
    }

    if (e0.k === "mult") return { a: k0, next: k0 + 1, val: e0.v, kind: "bare", free: false, ent: e0 };
    if (e0.k === "frac1") return { a: k0, next: k0 + 1, val: e0.v, kind: "frac", free: false, ent: e0 };
    if (e0.k === "frac2") {
      const g = group(k0);
      return g ? { a: k0, next: g.next, val: g.v, kind: "frac", free: false, ent: e0 } : null;
    }
    const b = below100(k0);
    if (!b) return null;
    return { a: k0, next: b.next, val: b.v, kind: "single", free: e0.s === 0 && (e0.k === "small" || e0.k === "tens"), ent: e0 };
  };

  // --- render ------------------------------------------------------------------------------------
  const render = (p: Seg): string => {
    const v = p.val;
    if (Number.isInteger(v)) return String(v);
    const R = nextIdx(p.next - 1);
    if (R >= 0 && toks[R].ub & B) {
      // "साढ़े तीन बजे" 3:30, "सवा तीन" 3:15, "पौने चार" 3:45, "डेढ़ बजे" 1:30
      const h = Math.floor(v);
      const mins = Math.round((v - h) * 60);
      return `${h === 0 ? 12 : h}:${mins < 10 ? "0" : ""}${mins}`;
    }
    return fmt(v);
  };

  // --- "5 हज़ार", "1.5 hazaar" -------------------------------------------------------------------
  const digitMult = (i: number): number => {
    const t = toks[i];
    let valStr = t.dig;
    let last = i;
    if (i + 2 < n && gaps[i] === "." && !toks[i + 1].word) {
      valStr = `${t.dig}.${toks[i + 1].dig}`;
      last = i + 1;
    }
    if (last + 1 >= n || !JOIN_RE.test(gaps[last])) return -1;
    const m = toks[last + 1];
    if (!m.ent || m.ent.k !== "mult") return -1;
    if (t.s > 0 && NO_DIGIT_BEFORE_RE.test(text[t.s - 1])) return -1;
    const x = Number(valStr);
    if (!(x > 0 && x < 100)) return -1;
    reps.push({ s: t.s, e: m.e, t: fmt(x * m.ent.v) });
    return last + 2;
  };

  // --- main scan ---------------------------------------------------------------------------------
  let i = 0;
  while (i < n) {
    const t = toks[i];
    if (!t.word) {
      const nx = digitMult(i);
      i = nx > 0 ? nx : i + 1;
      continue;
    }
    if (!t.ent) {
      i++;
      continue;
    }
    // the run: consecutive number words joined by spaces / hyphens (and an English "and" after hundred / thousand)
    let end = i + 1;
    while (end < n && JOIN_RE.test(gaps[end - 1])) {
      const u = toks[end];
      if (u.ent) {
        end++;
        continue;
      }
      const prev = toks[end - 1].ent;
      if (u.word && u.lc === "and" && prev && prev.k === "mult" && end + 1 < n && JOIN_RE.test(gaps[end]) && toks[end + 1].ent) {
        const nk = toks[end + 1].ent!.k;
        if (nk === "ones" || nk === "small" || nk === "tens") {
          end += 2;
          continue;
        }
      }
      break;
    }

    const segs: Seg[] = [];
    let k = i;
    while (k < end) {
      if (!toks[k].ent) {
        k++;
        continue;
      }
      let p = parseAt(k, end, true);
      if (p && (p.kind === "idiom" || p.kind === "bare") && !weakOK(p)) p.blocked = true; // "one fifty", "hundred twenty": all or nothing
      if (!p) p = parseAt(k, end, false);
      if (!p) {
        k++;
        continue;
      }
      segs.push(p);
      k = p.next;
    }
    for (const p of segs) {
      if (p.blocked) p.go = false;
      else if (p.free) p.go = true;
      else {
        p.go = weakOK(p);
        const R = nextIdx(p.next - 1);
        p.byUnit = p.go && R >= 0 && (toks[R].ub & (T | M | C | D | B)) !== 0;
      }
    }
    // "do teen din": a single digit directly before a larger single digit that has a unit
    for (let x = 0; x + 1 < segs.length; x++) {
      const p = segs[x];
      const q = segs[x + 1];
      if (p.go || !q.go || !q.byUnit) continue;
      if (p.kind !== "single" || q.kind !== "single" || p.ent.k !== "ones" || q.ent.k !== "ones") continue;
      if (p.next !== q.a || p.val >= q.val || p.ent.s === 2 || (p.ent.en && p.ent.one)) continue;
      if (p.ent.give && giveBefore(p.a)) continue;
      p.go = true;
    }
    for (const p of segs) {
      if (p.go) reps.push({ s: toks[p.a].s, e: toks[p.next - 1].e, t: render(p) });
    }
    i = end;
  }

  if (reps.length === 0) return text;
  reps.sort((x, y) => x.s - y.s);
  let out = "";
  let pos = 0;
  for (const r of reps) {
    if (r.s < pos) continue; // never overlap
    out += text.slice(pos, r.s) + r.t;
    pos = r.e;
  }
  return out + text.slice(pos);
}

/**
 * Replace spoken number words with digits, leaving everything else untouched. Safe on any input:
 * non-strings and empty strings come back as they are, nothing throws, and the result is a fixed point
 * (normalizeNumberWords(normalizeNumberWords(x)) === normalizeNumberWords(x)).
 */
export function normalizeNumberWords(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  let cur = text;
  try {
    for (let pass = 0; pass < 8; pass++) {
      const next = onePass(cur);
      if (next === cur) break;
      cur = next;
    }
  } catch {
    return cur;
  }
  return cur;
}
