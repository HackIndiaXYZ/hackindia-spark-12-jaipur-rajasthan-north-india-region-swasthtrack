/**
 * Copies the bundled Indian food catalogue (src/data/food-catalogue.json) into the shared
 * food_items / food_portions tables of the MySQL database in DATABASE_URL.
 *
 *   node scripts/db/import-food-catalogue.mjs --dry-run    show what would change, write nothing
 *   node scripts/db/import-food-catalogue.mjs              import
 *
 * The app searches the bundled catalogue directly, so this import is not needed for search or
 * calories. It exists so favourites and food-log links have a row to point at: every food keeps
 * the same id (a UUID v5 of its slug) on every run, which makes the script safe to re-run and
 * keeps existing favourites intact.
 *
 * It also retires the rows an older seed left behind (the Kaggle "base_dataset" and
 * "papa_priority" rows with wrong calories): they are switched to is_active = 0, not deleted,
 * so old food logs that link to them stay valid, and favourites that pointed at them are moved
 * to the matching new food. Foods people added themselves (is_custom, or created_by set) are
 * never touched. Everything is applied in ONE transaction: either all of it or none of it.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { connect, connectionOptions, describeTarget, loadEnv, root } from "./_env.mjs";

loadEnv();
const dryRun = process.argv.includes("--dry-run");

const cataloguePath = path.join(root, "src", "data", "food-catalogue.json");
if (!fs.existsSync(cataloguePath)) {
  console.error("src/data/food-catalogue.json not found. Build it with scripts/food/build-catalogue.mjs.");
  process.exit(1);
}
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, "utf8"));
const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();
const clip = (value, max) => (value == null ? value : String(value).slice(0, max));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function toFoodRow(food) {
  const first = food.portions && food.portions[0];
  return {
    id: food.id,
    name: clip(food.name, 255),
    name_hi: clip(food.hi, 255),
    category: clip(food.cat, 120),
    subcategory: clip(food.region, 120),
    reference_weight_g: first ? first.g : 100,
    reference_unit: clip(first ? first.n.replace(/^[\d.½¼¾]+\s*/, "") || food.unit : food.unit, 30),
    calories_per_100g: food.kcal,
    protein_g_100g: food.p ?? 0,
    carbs_g_100g: food.c ?? 0,
    fat_g_100g: food.f ?? 0,
    fibre_g_100g: food.fib ?? 0,
    sodium_mg_100g: food.na == null ? null : food.na,
    source_type: "indian_master",
    source_name: clip(food.src, 255),
    source_note: food.note || null,
    is_verified: food.conf === "high" ? 1 : 0,
    is_custom: 0,
    created_by: null,
    is_active: 1,
  };
}

const newIds = new Set(catalogue.map((f) => f.id));
const portionCount = catalogue.reduce((n, f) => n + (f.portions || []).length, 0);
console.log(`Catalogue: ${catalogue.length} foods, ${portionCount} household portions.`);

const conn = await connect(await connectionOptions());
console.log(`Target: ${describeTarget(process.env.DATABASE_URL)}${dryRun ? "  (dry run, nothing will be written)" : ""}`);

try {
  // ---- 1. Which seeded rows exist, and which are old ones to retire -------------------------------
  const [seeded] = await conn.query("SELECT id, name, source_type, is_active FROM food_items WHERE is_custom = 0 AND created_by IS NULL");
  const alreadyThere = seeded.filter((r) => newIds.has(r.id)).length;
  const toRetire = seeded.filter((r) => !newIds.has(r.id) && r.is_active);
  console.log(`Database has ${seeded.length} seeded foods: ${alreadyThere} already current, ${toRetire.length} old rows to retire.`);

  // ---- 2. Favourites that point at old rows move to the matching new food -------------------------
  const newByName = new Map();
  for (const f of catalogue) for (const key of [f.name, ...(f.alias || [])]) if (!newByName.has(nameKey(key))) newByName.set(nameKey(key), f.id);
  const oldById = new Map(toRetire.map((r) => [r.id, r]));
  const favouritePlan = [];
  if (oldById.size) {
    const [favs] = await conn.query("SELECT id, patient_id, food_item_id FROM patient_food_favorites");
    for (const fav of favs) {
      const old = oldById.get(fav.food_item_id);
      if (old) favouritePlan.push({ fav, target: newByName.get(nameKey(old.name)) });
    }
  }
  const moved = favouritePlan.filter((p) => p.target).length;
  console.log(`Favourites on old foods: ${moved} will move to the new food, ${favouritePlan.length - moved} have no match and will be removed.`);

  if (dryRun) {
    console.log("\nDry run finished. Run again without --dry-run to apply.");
  } else {
    await conn.beginTransaction();
    try {
      // ---- 3. Upsert the catalogue ---------------------------------------------------------------
      const rows = catalogue.map(toFoodRow);
      const cols = Object.keys(rows[0]);
      const sets = cols.filter((c) => c !== "id").map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
      let written = 0;
      for (const chunk of chunks(rows, 200)) {
        await conn.query(`INSERT INTO food_items (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES ? ON DUPLICATE KEY UPDATE ${sets}, updated_at = NOW(3)`, [
          chunk.map((r) => cols.map((c) => r[c])),
        ]);
        written += chunk.length;
        process.stdout.write(`  foods ${written}/${rows.length}\r`);
      }
      console.log(`\nUpserted ${written} foods.`);

      // ---- 4. Portions: replace the catalogue's portions wholesale --------------------------------
      for (const idChunk of chunks([...newIds], 200)) await conn.query("DELETE FROM food_portions WHERE food_item_id IN (?)", [idChunk]);
      const portionRows = catalogue.flatMap((f) =>
        (f.portions || []).map((p) => [randomUUID(), f.id, clip(p.n, 120), clip(p.hi || null, 120), p.g, null]),
      );
      for (const chunk of chunks(portionRows, 500)) {
        await conn.query("INSERT INTO food_portions (id, food_item_id, portion_name, portion_name_hi, standardized_grams, notes) VALUES ?", [chunk]);
      }
      console.log(`Wrote ${portionRows.length} portions.`);

      // ---- 5. Move favourites, then retire the old rows -------------------------------------------
      for (const { fav, target } of favouritePlan) {
        if (target) {
          await conn.query("INSERT INTO patient_food_favorites (id, patient_id, food_item_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id", [randomUUID(), fav.patient_id, target]);
        }
        await conn.query("DELETE FROM patient_food_favorites WHERE id = ?", [fav.id]);
      }
      for (const idChunk of chunks(toRetire.map((r) => r.id), 200)) await conn.query("UPDATE food_items SET is_active = 0 WHERE id IN (?)", [idChunk]);
      console.log(`Retired ${toRetire.length} old rows (is_active = 0; nothing deleted).`);
      await conn.commit();
      console.log("Done. The shared food catalogue in MySQL now matches the app.");
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  }
} catch (err) {
  console.error("Import failed (nothing was changed):", err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
