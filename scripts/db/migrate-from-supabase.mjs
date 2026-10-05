/**
 * One-time copy of the health data from the old Supabase (Postgres) project into MySQL.
 *
 *   node scripts/db/migrate-from-supabase.mjs --dry-run      # read + convert only, write nothing
 *   node scripts/db/migrate-from-supabase.mjs                # copy everything into DATABASE_URL
 *   node scripts/db/migrate-from-supabase.mjs --only=patients,bp_logs
 *
 * Source (read-only, via the Supabase REST API):
 *   SUPABASE_URL / SUPABASE_KEY, or the old NEXT_PUBLIC_SUPABASE_URL +
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.local.
 *   A service-role key (SUPABASE_KEY) also works and is REQUIRED once the Supabase RLS
 *   migration has been run: with RLS on, the anon key can no longer read any row.
 * Target: DATABASE_URL (run `node scripts/db/migrate.mjs` first).
 *
 * Safe to run again: rows are matched by id and updated in place. Nothing is ever deleted,
 * on either side. Accounts are NOT copied (Supabase keeps password hashes private); sign
 * up in the new app, then attach a patient with `node scripts/db/link-patient.mjs`.
 */
import { src } from "../soie-node-hooks.mjs";
import { connect, connectionOptions, describeTarget, loadEnv } from "./_env.mjs";

loadEnv();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

const sourceUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const sourceKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
if (!sourceUrl || !sourceKey) {
  console.error("No Supabase source: set SUPABASE_URL and SUPABASE_KEY (or keep the old NEXT_PUBLIC_SUPABASE_* values in .env.local).");
  process.exit(2);
}

const { TABLES } = await import(src("lib/db/server/schema.ts"));
const { toDbValue } = await import(src("lib/db/server/values.ts"));

// Parents before children (foreign keys). Account tables are not copied.
const ORDER = [
  "patients",
  "medical_conditions",
  "medicines",
  "food_items",
  "food_portions",
  "patient_food_favorites",
  "food_logs",
  "bp_logs",
  "weight_logs",
  "activity_logs",
  "sleep_logs",
  "medicine_logs",
  "daily_checklists",
  "patient_settings",
];
// Columns that pointed at a Supabase auth user: those users do not exist in MySQL yet.
const ACCOUNT_COLUMNS = { food_items: ["created_by"] };
const PAGE = 1000;
const BATCH = 200;

async function fetchPage(table, offset) {
  const res = await fetch(`${sourceUrl}/rest/v1/${table}?select=*&order=${TABLES[table].pk}.asc&limit=${PAGE}&offset=${offset}`, {
    headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}`, Prefer: "count=exact" },
  });
  if (res.status === 404) return { missing: true, rows: [], total: 0 };
  if (!res.ok) throw new Error(`Supabase ${table}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const total = Number((res.headers.get("content-range") ?? "").split("/")[1] ?? 0);
  return { missing: false, rows: await res.json(), total };
}

async function readAll(table) {
  const rows = [];
  let total = 0;
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(table, offset);
    if (page.missing) return { missing: true, rows: [], total: 0 };
    total = page.total;
    rows.push(...page.rows);
    if (page.rows.length < PAGE || rows.length >= total) break;
  }
  return { missing: false, rows, total };
}

// Postgres let some "DEFAULT 0" columns hold NULL (e.g. food_items.protein_g_100g); MySQL declares them
// NOT NULL. A NULL there means "not recorded" and the app already reads it as the default, so the column's
// own default is written instead. Filled from the target's information_schema (nothing to do in a dry run).
const notNullDefaults = {};
async function loadDefaults(conn) {
  const [cols] = await conn.query(
    "SELECT table_name AS t, column_name AS c, column_default AS d FROM information_schema.columns WHERE table_schema = DATABASE() AND is_nullable = 'NO' AND column_default IS NOT NULL",
  );
  for (const { t, c, d } of cols) (notNullDefaults[t] ??= {})[c] = d;
}

function convert(table, row, unknown) {
  const def = TABLES[table];
  const out = {};
  for (const [col, value] of Object.entries(row)) {
    if (!(col in def.cols)) {
      unknown.add(col);
      continue;
    }
    if (ACCOUNT_COLUMNS[table]?.includes(col)) {
      out[col] = null;
      continue;
    }
    out[col] = toDbValue(def.cols[col], value, col);
    if (out[col] === null && notNullDefaults[table]?.[col] !== undefined) out[col] = notNullDefaults[table][col];
  }
  return out;
}

const target = dryRun ? null : await connect(await connectionOptions());
if (target) await loadDefaults(target);
console.log(`Source: ${new URL(sourceUrl).hostname}   Target: ${dryRun ? "(dry run: nothing is written)" : describeTarget(process.env.DATABASE_URL)}\n`);

const report = [];
let problems = 0;

try {
  for (const table of ORDER) {
    if (only.length && !only.includes(table)) continue;
    const def = TABLES[table];
    const { missing, rows, total } = await readAll(table);
    if (missing) {
      console.log(`${table.padEnd(24)} not in Supabase (skipped)`);
      continue;
    }
    const unknown = new Set();
    const converted = [];
    const failed = [];
    for (const row of rows) {
      try {
        converted.push(convert(table, row, unknown));
      } catch (err) {
        failed.push({ id: row[def.pk], why: err.message });
      }
    }

    let written = 0;
    let relinked = 0;
    if (target && converted.length) {
      const cols = Array.from(new Set(converted.flatMap((r) => Object.keys(r))));
      const sets = cols.filter((c) => c !== def.pk).map((c) => `\`${c}\` = VALUES(\`${c}\`)`);
      const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES ? ON DUPLICATE KEY UPDATE ${sets.length ? sets.join(", ") : `\`${def.pk}\` = \`${def.pk}\``}`;
      const tuple = (r) => cols.map((c) => (c in r ? r[c] : null));

      for (let i = 0; i < converted.length; i += BATCH) {
        const batch = converted.slice(i, i + BATCH);
        try {
          await target.query(sql, [batch.map(tuple)]);
          written += batch.length;
        } catch {
          // One bad row must not sink the batch: go row by row and report exactly which.
          for (const r of batch) {
            try {
              await target.query(sql, [[tuple(r)]]);
              written++;
            } catch (err) {
              if (err.errno === 1452 && table === "food_logs" && r.food_item_id) {
                try {
                  await target.query(sql, [[tuple({ ...r, food_item_id: null })]]);
                  written++;
                  relinked++;
                  continue;
                } catch {
                  // fall through to the failure report
                }
              }
              failed.push({ id: r[def.pk], why: err.sqlMessage || err.message });
            }
          }
        }
      }
    }

    // Verify: for every numeric column the sum on the source rows must equal the sum in MySQL.
    const mismatches = [];
    let targetCount = null;
    if (target) {
      targetCount = (await target.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0][0].n;
      const sourceIds = converted.map((r) => r[def.pk]);
      for (const [col, type] of Object.entries(def.cols)) {
        if (type !== "int" && type !== "num") continue;
        const want = converted.reduce((s, r) => s + (Number(r[col]) || 0), 0);
        if (!sourceIds.length) continue;
        const got = Number((await target.query(`SELECT COALESCE(SUM(\`${col}\`), 0) AS s FROM \`${table}\` WHERE \`${def.pk}\` IN (?)`, [sourceIds]))[0][0].s);
        if (Math.abs(got - want) > Math.max(0.01, 0.0005 * sourceIds.length)) mismatches.push(`${col}: source ${want} vs MySQL ${got}`);
      }
    }

    problems += failed.length + mismatches.length + (target && rows.length !== total ? 1 : 0);
    report.push({ table, total, read: rows.length, written, failed: failed.length, relinked, targetCount, mismatches, unknown: [...unknown] });
    console.log(
      `${table.padEnd(24)} supabase ${String(total).padStart(5)}  read ${String(rows.length).padStart(5)}  ` +
        (target ? `written ${String(written).padStart(5)}  in MySQL ${String(targetCount).padStart(5)}  ` : "") +
        (failed.length ? `FAILED ${failed.length}  ` : "") +
        (relinked ? `(${relinked} food link(s) cleared)  ` : "") +
        (mismatches.length ? `CHECKSUM MISMATCH` : target ? "checks ok" : ""),
    );
    for (const f of failed.slice(0, 10)) console.log(`    row ${f.id}: ${f.why}`);
    for (const m of mismatches) console.log(`    ${m}`);
    if (unknown.size) console.log(`    note: columns not in the MySQL schema were ignored: ${[...unknown].join(", ")}`);
  }
} finally {
  await target?.end();
}

console.log(problems === 0 ? `\nDone${dryRun ? " (dry run)" : ""}: no problems.` : `\nDone with ${problems} problem(s): see above.`);
if (!dryRun) {
  console.log("\nNext: sign up in the app, then attach a patient to your account:");
  console.log("  node scripts/db/link-patient.mjs --list");
  console.log("  node scripts/db/link-patient.mjs --email you@example.com --patient <patient id>");
}
process.exit(problems === 0 ? 0 : 1);
