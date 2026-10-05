/* eslint-disable */
/**
 * Copies the bundled Indian food catalogue (src/data/food-catalogue.json) into the
 * shared food_items / food_portions tables.
 *
 *   node scripts/import-food-dataset.js --dry-run     show what would change, write nothing
 *   node scripts/import-food-dataset.js               import
 *
 * The app searches the bundled catalogue directly, so this import is not needed for
 * search or calories. It exists so favourites and food-log links have a row to point
 * at: every food keeps the same id (a UUID v5 of its slug) on every run, which makes
 * the script safe to re-run and keeps existing favourites intact.
 *
 * It also retires the rows an older seed left behind (the Kaggle "base_dataset" and
 * "papa_priority" rows with wrong calories): they are switched to is_active = false,
 * not deleted, so old food logs that link to them stay valid, and favourites that
 * pointed at them are moved to the matching new food. Foods people added themselves
 * (is_custom or created_by set) are never touched.
 *
 * Needs the service-role key in .env.local (NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY). That key bypasses Row Level Security: keep it on your
 * own computer only, never in a NEXT_PUBLIC_ variable, never in Vercel, never in git.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const dryRun = process.argv.includes("--dry-run");

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

function readEnv(name) {
  const match = envContent.match(new RegExp("^\\s*" + name + "\\s*=\\s*(.*)$", "m"));
  const raw = match ? match[1] : process.env[name] || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

const cataloguePath = path.join(__dirname, "..", "src", "data", "food-catalogue.json");
if (!fs.existsSync(cataloguePath)) {
  console.error("Error: src/data/food-catalogue.json not found. Build it with scripts/food/build-catalogue.mjs.");
  process.exit(1);
}
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, "utf-8"));

const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();

function toFoodRow(food) {
  const first = food.portions && food.portions[0];
  return {
    id: food.id,
    name: food.name,
    name_hi: food.hi,
    category: food.cat,
    subcategory: food.region,
    reference_weight_g: first ? first.g : 100,
    reference_unit: first ? first.n.replace(/^[\d.½¼¾]+\s*/, "") || food.unit : food.unit,
    calories_per_100g: food.kcal,
    protein_g_100g: food.p,
    carbs_g_100g: food.c,
    fat_g_100g: food.f,
    fibre_g_100g: food.fib,
    sodium_mg_100g: food.na == null ? null : food.na,
    source_type: "indian_master",
    source_name: food.src,
    source_note: food.note || null,
    is_verified: food.conf === "high",
    is_custom: false,
    created_by: null,
    is_active: true,
  };
}

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

async function run() {
  const newIds = new Set(catalogue.map((f) => f.id));
  const portionCount = catalogue.reduce((n, f) => n + (f.portions || []).length, 0);
  console.log(`Catalogue: ${catalogue.length} foods, ${portionCount} household portions.`);

  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.\n" +
        "The import needs the service-role key because Row Level Security blocks the anon key.\n" +
        "See docs/auth-setup.md (environment variables). Never expose this key to the browser or commit it.",
    );
    process.exit(1);
  }
  const publicKeys = [readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")].filter(Boolean);
  if (publicKeys.includes(serviceKey)) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY is the same as the public anon key. Use the service_role key from Project Settings > API.");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  console.log(`Target: ${supabaseUrl}${dryRun ? "  (dry run, nothing will be written)" : ""}`);

  // ---- 1. Which seeded rows exist, and which are old ones to retire ---------------------------------
  const seeded = await fetchAll(() =>
    supabase.from("food_items").select("id, name, source_type, is_active").eq("is_custom", false).is("created_by", null).order("id"),
  );
  const alreadyThere = seeded.filter((r) => newIds.has(r.id)).length;
  const toRetire = seeded.filter((r) => !newIds.has(r.id) && r.is_active);
  console.log(`Database has ${seeded.length} seeded foods: ${alreadyThere} already current, ${toRetire.length} old rows to retire.`);

  // ---- 2. Favourites that point at old rows move to the matching new food -------------------------
  const newByName = new Map();
  for (const f of catalogue) {
    for (const key of [f.name, ...(f.alias || [])]) if (!newByName.has(nameKey(key))) newByName.set(nameKey(key), f.id);
  }
  const oldById = new Map(toRetire.map((r) => [r.id, r]));
  let moved = 0;
  let dropped = 0;
  const favourites = oldById.size
    ? await fetchAll(() => supabase.from("patient_food_favorites").select("id, patient_id, food_item_id").order("id"))
    : [];
  const favouritePlan = [];
  for (const fav of favourites) {
    const old = oldById.get(fav.food_item_id);
    if (!old) continue;
    const target = newByName.get(nameKey(old.name));
    favouritePlan.push({ fav, target });
    if (target) moved += 1;
    else dropped += 1;
  }
  console.log(`Favourites on old foods: ${moved} will move to the new food, ${dropped} have no match and will be removed.`);

  if (dryRun) {
    console.log("\nDry run finished. Run again without --dry-run to apply.");
    return;
  }

  // ---- 3. Upsert the catalogue ----------------------------------------------------------------------------
  let written = 0;
  for (const chunk of chunks(catalogue.map(toFoodRow), 200)) {
    const { error } = await supabase.from("food_items").upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error(`Upsert failed after ${written} foods:`, error.message);
      process.exit(1);
    }
    written += chunk.length;
    process.stdout.write(`  foods ${written}/${catalogue.length}\r`);
  }
  console.log(`\nUpserted ${written} foods.`);

  // ---- 4. Portions: replace the catalogue's portions wholesale ----------------------------------------------
  for (const idChunk of chunks([...newIds], 100)) {
    const { error } = await supabase.from("food_portions").delete().in("food_item_id", idChunk);
    if (error) {
      console.error("Clearing old portions failed:", error.message);
      process.exit(1);
    }
  }
  const portionRows = catalogue.flatMap((f) =>
    (f.portions || []).map((p) => ({ food_item_id: f.id, portion_name: p.n, portion_name_hi: p.hi || null, standardized_grams: p.g, notes: null })),
  );
  let portionsWritten = 0;
  for (const chunk of chunks(portionRows, 500)) {
    const { error } = await supabase.from("food_portions").insert(chunk);
    if (error) {
      console.error("Inserting portions failed:", error.message);
      process.exit(1);
    }
    portionsWritten += chunk.length;
  }
  console.log(`Wrote ${portionsWritten} portions.`);

  // ---- 5. Move favourites, then retire the old rows ------------------------------------------------------------
  for (const { fav, target } of favouritePlan) {
    if (target) {
      const { error } = await supabase
        .from("patient_food_favorites")
        .upsert({ patient_id: fav.patient_id, food_item_id: target }, { onConflict: "patient_id,food_item_id", ignoreDuplicates: true });
      if (error) {
        console.error("Moving a favourite failed:", error.message);
        process.exit(1);
      }
    }
    await supabase.from("patient_food_favorites").delete().eq("id", fav.id);
  }
  for (const idChunk of chunks(toRetire.map((r) => r.id), 100)) {
    const { error } = await supabase.from("food_items").update({ is_active: false }).in("id", idChunk);
    if (error) {
      console.error("Retiring old rows failed:", error.message);
      process.exit(1);
    }
  }
  console.log(`Retired ${toRetire.length} old rows (is_active = false; nothing deleted).`);
  console.log("Done. The shared food catalogue in Supabase now matches the app.");
}

run().catch((err) => {
  console.error("Unexpected import failure:", err);
  process.exitCode = 1;
});
