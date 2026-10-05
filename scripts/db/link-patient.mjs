/**
 * Attach an existing patient (for example Papa's records copied from Supabase) to an account.
 * The MySQL equivalent of the old supabase/scripts/link_existing_patient.sql.
 *
 *   node scripts/db/link-patient.mjs --list
 *   node scripts/db/link-patient.mjs --email you@example.com --patient <patient id> [--role owner|editor|viewer]
 *   node scripts/db/link-patient.mjs --email you@example.com --make-admin     # show the developer tools in the UI
 *
 * The account must already exist (sign up in the app first). Re-running is harmless.
 */
import { connect, connectionOptions, describeTarget, loadEnv } from "./_env.mjs";

loadEnv();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : undefined;
};

const conn = await connect(await connectionOptions());
console.log(`Database: ${describeTarget(process.env.DATABASE_URL)}\n`);
try {
  if (flag("list")) {
    const [patients] = await conn.query(
      `SELECT p.id, p.name, p.age, p.created_at,
              (SELECT COUNT(*) FROM bp_logs b WHERE b.patient_id = p.id) AS bp,
              (SELECT COUNT(*) FROM food_logs f WHERE f.patient_id = p.id) AS food,
              (SELECT COUNT(*) FROM patient_members m WHERE m.patient_id = p.id AND m.status = 'active') AS members
         FROM patients p ORDER BY p.created_at`,
    );
    console.table(patients.map((p) => ({ id: p.id, name: p.name, age: p.age, bp_logs: p.bp, food_logs: p.food, members: p.members })));
    const [users] = await conn.query("SELECT email, email_verified_at IS NOT NULL AS verified FROM auth_users ORDER BY created_at");
    console.log("Accounts:", users.length ? users.map((u) => `${u.email}${u.verified ? "" : " (not verified)"}`).join(", ") : "(none yet: sign up in the app first)");
  } else {
    const email = String(flag("email") ?? "").trim().toLowerCase();
    if (!email) throw new Error("Give --email (or use --list).");
    const [[user]] = await conn.query("SELECT id, email_verified_at FROM auth_users WHERE email = ?", [email]);
    if (!user) throw new Error(`No account for ${email} yet. Sign up in the app first.`);

    if (flag("make-admin")) {
      await conn.query("UPDATE profiles SET role = 'admin' WHERE id = ?", [user.id]);
      console.log(`${email} is now an admin.`);
    }
    const patientId = flag("patient");
    if (patientId) {
      const role = String(flag("role") ?? "owner");
      if (!["owner", "editor", "viewer"].includes(role)) throw new Error("--role must be owner, editor or viewer.");
      const [[patient]] = await conn.query("SELECT id, name FROM patients WHERE id = ?", [patientId]);
      if (!patient) throw new Error(`No patient with id ${patientId}. Use --list.`);
      const { randomUUID } = await import("node:crypto");
      await conn.query(
        "INSERT INTO patient_members (id, patient_id, user_id, role, status) VALUES (?, ?, ?, ?, 'active') ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'active'",
        [randomUUID(), patient.id, user.id, role],
      );
      await conn.query("INSERT INTO patient_settings (patient_id, alerts_enabled, bp_targets) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE patient_id = patient_id", [
        patient.id,
        JSON.stringify({ bp: true, medicine: true, activity: true, sleep: true, missingData: true }),
        JSON.stringify({ target_systolic: 130, target_diastolic: 80, alert_systolic: 160, alert_diastolic: 100, crisis_systolic: 180, crisis_diastolic: 120, low_systolic: 90, low_diastolic: 60 }),
      ]);
      console.log(`Linked ${email} as ${role} of "${patient.name}" (${patient.id}).`);
    } else if (!flag("make-admin")) {
      throw new Error("Nothing to do: give --patient <id> and/or --make-admin.");
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
