/**
 * The Indian food catalogue that ships with the app (src/data/food-catalogue.json,
 * built by scripts/food/build-catalogue.mjs from IFCT 2017 and curated recipes).
 *
 * It is bundled rather than fetched so search works offline, answers instantly and
 * can never serve a stale or wrong calorie from an old database seed. The database
 * copy of the same rows only exists so favourites and food-log links have a row to
 * point at (ids are the same, see the import script); people's own custom foods are
 * the only catalogue rows the app still reads from the database.
 *
 * The JSON is loaded with a dynamic import so it stays out of the main bundle until
 * the first food search.
 */
import type { FoodItem, FoodPortion } from "@/services/patient-service";

export interface CatalogueRow {
  id: string;
  slug: string;
  name: string;
  hi: string;
  alias: string[];
  cat: string;
  region: string;
  diet: "veg" | "egg" | "nonveg";
  emoji: string;
  unit: "g" | "ml";
  kcal: number;
  p: number;
  c: number;
  f: number;
  fib: number;
  na?: number | null;
  portions?: Array<{ n: string; hi?: string; g: number }>;
  core?: boolean;
  src: string;
  conf: "high" | "medium" | "low";
  note?: string;
}

export const CATALOGUE_SOURCE_TYPE = "indian_master";
const BUILT_AT = "2026-10-05T00:00:00.000Z";

export interface Catalogue {
  foods: FoodItem[];
  portions: Map<string, FoodPortion[]>;
}

/** "1 katori (150 g)" -> "katori (150 g)": quick-add screens already prefix the count themselves ("1 katori"). */
function portionUnit(label: string): string {
  return label.replace(/^[\d.½¼¾]+\s*/, "") || label;
}

/** The unit word stored on a food log: "2 x" + "katori", not "2 x 1 katori (150 g)". */
export function loggedUnit(portionName: string): string {
  return portionUnit(portionName).replace(/\s*\([^)]*\)\s*$/, "").trim() || portionName;
}

function toFoodItem(row: CatalogueRow): FoodItem {
  const first = row.portions?.[0];
  return {
    id: row.id,
    name: row.name,
    name_hi: row.hi,
    category: row.cat,
    subcategory: row.region,
    // The "standard" amount is the everyday household portion, so the quick-add list reads "1 katori = 177 kcal".
    reference_weight_g: first?.g ?? 100,
    reference_unit: first ? portionUnit(first.n) : row.unit,
    calories_per_100g: row.kcal,
    protein_g_100g: row.p,
    carbs_g_100g: row.c,
    fat_g_100g: row.f,
    fibre_g_100g: row.fib,
    sodium_mg_100g: row.na ?? null,
    source_type: CATALOGUE_SOURCE_TYPE,
    source_name: row.src,
    source_note: row.note ?? null,
    is_verified: row.conf === "high",
    is_custom: false,
    is_active: true,
    created_by: null,
    created_at: BUILT_AT,
    updated_at: BUILT_AT,
    slug: row.slug,
    aliases: row.alias,
    region: row.region,
    diet: row.diet,
    emoji: row.emoji,
    core: row.core === true,
    amount_unit: row.unit,
    data_confidence: row.conf,
  };
}

function toPortions(row: CatalogueRow): FoodPortion[] {
  return (row.portions ?? []).map((p, i) => ({
    id: `${row.id}:${i}`,
    food_item_id: row.id,
    portion_name: p.n,
    portion_name_hi: p.hi ?? null,
    standardized_grams: p.g,
    notes: null,
    created_at: BUILT_AT,
  }));
}

let pending: Promise<Catalogue> | null = null;

/** Loads (once) and returns the bundled catalogue. */
export function loadCatalogue(): Promise<Catalogue> {
  if (!pending) {
    pending = import("@/data/food-catalogue.json")
      .then((mod) => {
        const rows = (mod.default ?? mod) as unknown as CatalogueRow[];
        const portions = new Map<string, FoodPortion[]>();
        for (const row of rows) portions.set(row.id, toPortions(row));
        return { foods: rows.map(toFoodItem), portions };
      })
      .catch((err) => {
        pending = null; // let the next search try again
        throw err;
      });
  }
  return pending;
}

/** Portions for a catalogue food, or null when the id is not a bundled one. */
export async function getCataloguePortions(foodItemId: string): Promise<FoodPortion[] | null> {
  const { portions } = await loadCatalogue();
  const found = portions.get(foodItemId);
  return found ? found.slice() : null;
}

/** Human labels for the catalogue's categories, shown in search results and the entry panel. */
export const CATEGORY_LABELS: Record<string, { hi: string; en: string }> = {
  fruit: { hi: "फल", en: "Fruit" },
  vegetable: { hi: "सब्ज़ी (कच्ची)", en: "Vegetable" },
  sabzi: { hi: "सब्ज़ी", en: "Cooked sabzi" },
  dal: { hi: "दाल / दलहन", en: "Dal & legumes" },
  pulse: { hi: "दाल (सूखी)", en: "Dry pulses" },
  grain: { hi: "अनाज / आटा", en: "Grains & flours" },
  roti: { hi: "रोटी / पराठा", en: "Breads" },
  rice: { hi: "चावल", en: "Rice dishes" },
  tiffin: { hi: "नाश्ता", en: "Breakfast & tiffin" },
  snack: { hi: "स्नैक / चाट", en: "Snacks & chaat" },
  sweet: { hi: "मिठाई", en: "Sweets" },
  dairy: { hi: "दूध / डेयरी", en: "Dairy" },
  egg: { hi: "अंडा", en: "Egg" },
  nonveg: { hi: "मांसाहार", en: "Non-veg" },
  beverage: { hi: "पेय", en: "Drinks" },
  nuts: { hi: "मेवे / बीज", en: "Nuts & seeds" },
  condiment: { hi: "चटनी / अचार / मसाले", en: "Condiments" },
  salad: { hi: "सलाद / रायता", en: "Salad & raita" },
  soup: { hi: "सूप", en: "Soup" },
  bakery: { hi: "बेकरी / पैकेट", en: "Bakery & packaged" },
  fastfood: { hi: "फास्ट फूड", en: "Fast food" },
  oil_sugar: { hi: "तेल / चीनी", en: "Oil & sugar" },
};

/** "फल" for a catalogue category; other (older or custom) category strings are shown as they are. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category]?.hi ?? category;
}

/** Second line of a search result: "सब्ज़ी · Kerala · 118 kcal/100g". */
export function foodSubtitle(food: FoodItem): string {
  const parts = [categoryLabel(food.category)];
  if (food.region && food.region !== "Pan-India" && food.region !== "International") parts.push(food.region);
  const per = food.amount_unit === "ml" ? "100ml" : "100g";
  parts.push(food.calories_per_100g != null ? `${Math.round(food.calories_per_100g)} kcal/${per}` : "कैलोरी की जानकारी नहीं");
  return parts.join(" · ");
}
