export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

/**
 * Per-device UI preferences (dismissed banners, hidden quick-foods, ...).
 * Not for health data: that lives in the database. Every access is guarded
 * because storage can be blocked (private mode) or full.
 */
export function readLocalPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocalPref<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the preference simply is not remembered.
  }
}

export function removeLocalPref(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Returns the exact, matching emoji for any food name or category
 */
export function getExactFoodEmoji(foodName = "", category = ""): string {
  const lower = `${foodName} ${category}`.toLowerCase();

  // ASCII keywords match whole words ("tea" must not fire on "steak", "dal" not on "dalia").
  // Devanagari keywords match at the start of a word, so "आम" finds "आम रस" but not a word that
  // merely contains those letters; matras/suffixes after the key are fine.
  const has = (...keys: string[]): boolean =>
    keys.some((k) =>
      /^[\x00-\x7f]+$/.test(k)
        ? new RegExp(`(^|[^a-z])${k}s?($|[^a-z])`).test(lower)
        : new RegExp(`(^|[\\s(),/+-])${k}`).test(lower),
    );

  // 1. Specific Fruits
  if (has("apple") || has("सेब")) return "🍎";
  if (has("banana") || has("केला")) return "🍌";
  if (has("mango") || has("आम")) return "🥭";
  if (has("orange") || has("संतरा") || has("नारंगी") || has("मौसमी")) return "🍊";
  if (has("papaya") || has("पपीता")) return "🍈";
  if (has("watermelon") || has("तरबूज")) return "🍉";
  if (has("grape") || has("अंगूर")) return "🍇";
  if (has("guava") || has("अमरूद") || has("pear") || has("नाशपाती")) return "🍐";
  if (has("pomegranate") || has("अनार")) return "🍎";
  if (has("lemon") || has("नींबू")) return "🍋";
  if (has("fruit") || has("फल")) return "🍎";

  // 2. Hot Beverages & Dairy
  if (has("tea") || has("चाय") || has("chai")) return "☕";
  if (has("coffee") || has("कॉफ़ी") || has("कॉफी")) return "☕";
  if (has("milk") || has("दूध") || has("doodh") || has("haldi")) return "🥛";
  if (has("curd") || has("yogurt") || has("dahi") || has("दही") || has("chaas") || has("छाछ") || has("lassi") || has("लस्सी") || has("buttermilk")) return "🥛";
  if (has("paneer") || has("पनीर") || has("cheese")) return "🧀";

  // 3. Indian Breads & Grains
  if (has("roti") || has("रोटी") || has("chapati") || has("चपाती") || has("phulka") || has("फुल्का") || has("paratha") || has("पराठा") || has("naan") || has("नान")) return "🫓";
  if (has("rice") || has("चावल") || has("chawal") || has("pulao") || has("पुलाव") || has("biryani") || has("बिरयानी")) return "🍚";
  if (has("khichdi") || has("खिचड़ी")) return "🍲";
  if (has("dalia") || has("दलिया") || has("oats") || has("ओट्स") || has("porridge")) return "🥣";
  if (has("dal") || has("दाल") || has("moong") || has("मूंग") || has("chana") || has("चना") || has("rajma") || has("राजमा") || has("chole") || has("छोले") || has("lentil") || has("legume")) return "🥣";
  if (has("soup") || has("सूप")) return "🥣";

  // 4. Vegetables & Salads
  if (has("bhindi") || has("भिंडी") || has("okra")) return "🥒";
  if (has("lauki") || has("लौकी") || has("bottle gourd") || has("tori") || has("तरोई") || has("tinda") || has("टिंडा")) return "🥒";
  if (has("cucumber") || has("खीरा") || has("kakdi") || has("ककड़ी")) return "🥒";
  if (has("tomato") || has("टमाटर")) return "🍅";
  if (has("carrot") || has("गाजर")) return "🥕";
  if (has("salad") || has("सलाद")) return "🥗";
  if (has("palak") || has("पालक") || has("spinach") || has("saag") || has("साग") || has("methi") || has("मेथी") || has("gobhi") || has("गोभी") || has("cabbage") || has("cauliflower") || has("broccoli") || has("vegetable") || has("sabzi") || has("सब्जी")) return "🥦";
  if (has("potato") || has("aloo") || has("आलू")) return "🥔";
  if (has("corn") || has("भुट्टा") || has("मक्का")) return "🌽";

  // 5. Snacks, Nuts, Breakfast Items
  if (has("makhana") || has("मखाना") || has("popcorn")) return "🍿";
  if (has("almond") || has("बादाम") || has("kaju") || has("cashew") || has("काजू") || has("walnut") || has("अखरोट") || has("pista") || has("पिस्ता") || has("dry fruit") || has("kishmish") || has("किशमिश") || has("nuts")) return "🥜";
  if (has("peanut") || has("मूंगफली")) return "🥜";
  if (has("poha") || has("पोहा") || has("upma") || has("उपमा") || has("idli") || has("इडली") || has("dosa") || has("डोसा")) return "🥞";
  if (has("bread") || has("ब्रेड") || has("toast") || has("टोस्ट")) return "🍞";
  if (has("biscuit") || has("बिस्कुट") || has("cookie") || has("rusk") || has("रस्क")) return "🍪";
  if (has("cake") || has("केक") || has("pastry")) return "🍰";
  if (has("sweet") || has("mithai") || has("मिठाई") || has("halwa") || has("हलवा") || has("kheer") || has("खीर") || has("jalebi") || has("ladoo") || has("लड्डू")) return "🍨";

  // 6. Protein & Others
  if (has("egg") || has("अंडा")) return "🥚";
  if (has("chicken") || has("meat") || has("fish") || has("मछली")) return "🍗";
  if (has("water") || has("पानी") || has("beverage")) return "💧";

  if (category === "fruit") return "🍎";
  if (category === "dairy") return "🥛";
  if (category === "beverage") return "☕";
  if (category === "salad_vegetable" || category === "vegetable") return "🥗";
  if (category === "snack" || category === "nuts") return "🥜";
  if (category === "indian_preparation") return "🫓";

  return "🍽️";
}
