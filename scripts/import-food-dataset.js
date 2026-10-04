/* eslint-disable */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// 1. Load environment variables from .env.local
//
// This script writes the shared food catalogue, which Row Level Security blocks
// for every signed-in user and for the anon key. It therefore needs the
// service-role key. That key bypasses RLS: keep it in .env.local on your own
// computer only, never in a NEXT_PUBLIC_ variable, never in Vercel, never in git.
const envPath = path.join(__dirname, "..", ".env.local");
let envContent = "";
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, "utf-8");
}

function readEnv(name) {
  const match = envContent.match(new RegExp("^\\s*" + name + "\\s*=\\s*(.*)$", "m"));
  const raw = match ? match[1] : process.env[name] || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.\n" +
      "The food import needs the service-role key because Row Level Security blocks the anon key.\n" +
      "See docs/auth-setup.md (environment variables). Never expose this key to the browser or commit it.",
  );
  process.exit(1);
}

// Guard against pasting the public key by mistake (never printed).
const publicKeys = [readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")].filter(Boolean);
if (publicKeys.includes(serviceKey)) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY is the same as the public anon key. Use the service_role key from Project Settings > API.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// 2. Custom CSV Parser (handles quotes and commas safely)
function parseCSV(content) {
  const lines = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(cell.trim());
      if (row.length > 0 && row.some(c => c !== "")) {
        lines.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    lines.push(row);
  }
  return lines;
}

// Helper to clean calorie strings
function cleanCalorie(val) {
  if (!val) return 0;
  const num = parseInt(val.replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

async function run() {
  console.log("🚀 Starting Food Database Import...");
  console.log(`Connected to: ${supabaseUrl}`);

  // ---- STEP 1: IMPORT RAW CALORIES DATASET ----
  const rawCsvPath = path.join(__dirname, "..", "supabase", "seed_data", "calories_raw.csv");
  if (!fs.existsSync(rawCsvPath)) {
    console.error("❌ Error: calories_raw.csv not found under supabase/seed_data/");
    process.exit(1);
  }

  const rawContent = fs.readFileSync(rawCsvPath, "utf-8");
  const rawRows = parseCSV(rawContent);
  const rawHeader = rawRows[0];
  
  // Header format: FoodCategory,FoodItem,per100grams,Cals_per100grams,KJ_per100grams
  console.log(`📊 Found ${rawRows.length - 1} records in raw calories CSV.`);

  const rawFoodItems = [];
  let duplicatesCount = 0;
  const seenMap = new Map();

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length < 5) continue; // Skip malformed
    
    const category = row[0];
    const foodItem = row[1];
    const per100g = row[2];
    const cals = cleanCalorie(row[3]);
    const kj = row[4];

    if (!foodItem) continue;

    // Check for exact duplicate (same name & same category & same calorie)
    const key = `${foodItem.toLowerCase()}|${category.toLowerCase()}|${cals}`;
    if (seenMap.has(key)) {
      duplicatesCount++;
      continue;
    }
    seenMap.set(key, true);

    // Build the record
    rawFoodItems.push({
      name: foodItem,
      category: category,
      reference_weight_g: 100,
      reference_unit: "g",
      calories_per_100g: cals,
      source_type: "base_dataset",
      source_name: "Kaggle Base Dataset",
      source_note: `Category: ${category}, Per 100g: ${per100g}, Energy: ${kj}`,
      is_verified: true,
      is_custom: false,
      created_by: null,
      is_active: true
    });
  }

  console.log(`🧹 Filtered raw records: ${rawFoodItems.length} unique variations (Skipped ${duplicatesCount} duplicates).`);

  // ---- STEP 2: IMPORT PAPA FOOD MASTER (PRIORITY LAYER) ----
  const papaCsvPath = path.join(__dirname, "..", "supabase", "seed_data", "papa_food_master.csv");
  if (!fs.existsSync(papaCsvPath)) {
    console.error("❌ Error: papa_food_master.csv not found.");
    process.exit(1);
  }

  const papaContent = fs.readFileSync(papaCsvPath, "utf-8");
  const papaRows = parseCSV(papaContent);
  console.log(`⭐ Found ${papaRows.length - 1} records in Papa Food Master.`);

  const papaFoodItems = [];
  for (let i = 1; i < papaRows.length; i++) {
    const row = papaRows[i];
    if (row.length < 10) continue;

    const patientPriority = row[0];
    const foodNameEn = row[1];
    const foodNameHi = row[2];
    const category = row[3];
    const mealSlots = row[4];
    const refPortion = row[5];
    const sourceFoodName = row[6];
    const sourceCategory = row[7];
    const calsStr = row[8];
    const dataStatus = row[9];
    const nutritionSource = row[10];
    const sourceNote = row[11];
    const verifiedProtein = row[12];
    const verifiedCarbs = row[13];
    const verifiedFat = row[14];
    const verifiedFibre = row[15];
    const verifiedSodium = row[16];

    const isVerifiedValue = dataStatus !== "missing_verified_value";
    const cals = isVerifiedValue ? parseFloat(calsStr) : null;

    if (!foodNameEn) continue;

    papaFoodItems.push({
      name: foodNameEn,
      name_hi: foodNameHi || null,
      category: category || "Other",
      subcategory: mealSlots || null,
      reference_weight_g: 100,
      reference_unit: "g",
      calories_per_100g: cals,
      protein_g_100g: verifiedProtein ? parseFloat(verifiedProtein) || 0 : 0,
      carbs_g_100g: verifiedCarbs ? parseFloat(verifiedCarbs) || 0 : 0,
      fat_g_100g: verifiedFat ? parseFloat(verifiedFat) || 0 : 0,
      fibre_g_100g: verifiedFibre ? parseFloat(verifiedFibre) || 0 : 0,
      sodium_mg_100g: verifiedSodium ? parseFloat(verifiedSodium) || null : null,
      source_type: "papa_priority",
      source_name: nutritionSource || "Papa Food Master",
      source_note: `Priority: ${patientPriority}, Status: ${dataStatus}, Note: ${sourceNote || ""}`,
      is_verified: isVerifiedValue,
      is_custom: false,
      created_by: null,
      is_active: true
    });
  }

  // Combine datasets. Papa priority items should take precedence or exist as verified targets.
  // We insert them all.
  const allToInsert = [...papaFoodItems, ...rawFoodItems];

  console.log(`📦 Preparing to seed a total of ${allToInsert.length} food items to Supabase...`);

  // Clear previously seeded catalogue rows so the import is repeatable. Foods that
  // people added themselves (is_custom or created_by set) are never touched.
  console.log("🧹 Clearing old master food items to ensure clean seed...");
  const { error: deleteError } = await supabase.from("food_items").delete().eq("is_custom", false).is("created_by", null);
  if (deleteError) {
    console.error("⚠️ Warning when deleting old records:", deleteError);
  }

  // Insert in chunks of 100
  const chunkSize = 100;
  let insertedCount = 0;
  for (let i = 0; i < allToInsert.length; i += chunkSize) {
    const chunk = allToInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("food_items").insert(chunk);
    if (error) {
      console.error(`❌ Error inserting chunk ${i / chunkSize + 1}:`, error.message);
    } else {
      insertedCount += chunk.length;
      process.stdout.write(`⚡ Seeded ${insertedCount}/${allToInsert.length} food items...\r`);
    }
  }
  console.log(`\n✅ Successfully seeded ${insertedCount} food items.`);

  // ---- STEP 3: SEED PORTION MAPPINGS ----
  const portionCsvPath = path.join(__dirname, "..", "supabase", "seed_data", "papa_household_portions.csv");
  if (fs.existsSync(portionCsvPath)) {
    const portionContent = fs.readFileSync(portionCsvPath, "utf-8");
    const portionRows = parseCSV(portionContent);
    console.log(`⚖️ Found ${portionRows.length - 1} portion definitions.`);

    // Fetch all seeded food items from DB to map name -> id
    // PostgREST returns at most 1000 rows per request, so page through the
    // seeded catalogue (custom foods are excluded on purpose).
    const dbFoods = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: fetchError } = await supabase
        .from("food_items")
        .select("id, name, source_type")
        .eq("is_custom", false)
        .is("created_by", null)
        .order("id")
        .range(from, from + 999);
      if (fetchError || !page) {
        console.error("❌ Failed to fetch seeded foods for portion mapping:", fetchError);
        process.exit(1);
      }
      dbFoods.push(...page);
      if (page.length < 1000) break;
    }

    const foodNameMap = new Map();
    const papaNames = new Set();
    dbFoods.forEach(f => {
      const key = f.name.toLowerCase();
      if (papaNames.has(key)) return; // the priority layer wins on duplicate names
      foodNameMap.set(key, f.id);
      if (f.source_type === "papa_priority") papaNames.add(key);
    });

    const portionsToInsert = [];
    let unmappedPortions = 0;

    for (let i = 1; i < portionRows.length; i++) {
      const row = portionRows[i];
      if (row.length < 4) continue;

      const foodNameEn = row[0];
      const portionName = row[1];
      const quantityStr = row[2];
      const unit = row[3];
      const note = row[4];

      const grams = parseFloat(quantityStr);
      const foodId = foodNameMap.get(foodNameEn.toLowerCase());

      if (!foodId) {
        // Let's also do a fuzzy/partial match if exact match fails
        let foundId = null;
        for (const [key, value] of foodNameMap.entries()) {
          if (key.includes(foodNameEn.toLowerCase()) || foodNameEn.toLowerCase().includes(key)) {
            foundId = value;
            break;
          }
        }
        
        if (foundId) {
          portionsToInsert.push({
            food_item_id: foundId,
            portion_name: portionName,
            standardized_grams: grams,
            notes: `${note || ""} (Mapped from ${foodNameEn})`
          });
        } else {
          console.log(`⚠️ Warning: Could not find matching food item for portion: "${foodNameEn}"`);
          unmappedPortions++;
        }
      } else {
        portionsToInsert.push({
          food_item_id: foodId,
          portion_name: portionName,
          standardized_grams: grams,
          notes: note || null
        });
      }
    }

    if (portionsToInsert.length > 0) {
      const { error: portionError } = await supabase.from("food_portions").insert(portionsToInsert);
      if (portionError) {
        console.error("❌ Error seeding portions:", portionError.message);
      } else {
        console.log(`✅ Successfully seeded ${portionsToInsert.length} household portions.`);
      }
    }
  }

  console.log("🎉 Seed and Import process complete! Your food database is fully loaded.");
}

run().catch(err => {
  console.error("❌ Unexpected Import Failure:", err);
  process.exitCode = 1;
});
