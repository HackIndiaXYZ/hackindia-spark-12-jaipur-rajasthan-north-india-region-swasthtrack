# SwasthTrack: Deployment Guide

How to deploy SwasthTrack to Vercel with a Supabase backend, and how to install
it as a mobile app (PWA).

> No secrets live in this file or anywhere else in the repository. Environment
> variables are listed by **name only**; the values stay in `.env.local` on your
> computer and in the Vercel project settings.

## 1. Architecture

```
Git repository
      |
GitHub
      |
Vercel (Next.js 16 App Router, built with webpack)
      |                         \
Supabase (Auth + Postgres + RLS)  Anthropic API (SOIE "Ask" assistant, server side)
      |
Installable PWA (iOS Safari / Android Chrome)
```

## 2. Environment variables

Copy `.env.example` to `.env.local` for local work. Set the same names in
**Vercel > Project > Settings > Environment Variables** for deployments.

| Name | Where it runs | Required? | Notes |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Yes | Project URL, shaped like `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Yes | Public anon key. Safe to expose because RLS blocks anything outside a signed-in member's patients |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Optional | Newer name for the same public key. The app accepts either; set at least one of the two |
| `NEXT_PUBLIC_APP_URL` | Browser + server | Optional | Public address of the site, for example `https://<your-domain>` |
| `ANTHROPIC_API_KEY` | Server only | Recommended | Powers the LLM answers in Ask (SOIE). Without it the assistant answers from the rule-based engine and says so. Never prefix with `NEXT_PUBLIC_` |
| `SOIE_MODEL` | Server only | Optional | Overrides the model name used by SOIE |
| `SOIE_WEB_SEARCH` | Server only | Optional | `false` switches internet search off; default on |
| `SOIE_RATE_LIMIT_PER_HOUR` | Server only | Optional | Max Ask questions per user per hour (cost and abuse guard) |
| `CRON_SECRET`, `REPORT_PATIENT_ID`, `REPORT_EMAIL_TO`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or `RESEND_API_KEY`) | Server only | Only if scheduled report emails are enabled | Read by `src/lib/email/` and the `/api/cron/*` routes scheduled in `vercel.json` (optional daily, weekly and missed-dose emails). These routes run without a signed-in user, so with RLS on, confirm they can actually read the patient's data before relying on them. This SMTP account is separate from the one configured inside Supabase for sign-in codes. Secrets, never `NEXT_PUBLIC_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your computer only | Only for the food import | Used by `scripts/import-food-dataset.js`. Bypasses RLS. **Do not add it to Vercel, never use a `NEXT_PUBLIC_` name, never commit it** |

Rules of thumb:

- Anything starting with `NEXT_PUBLIC_` is shipped to every visitor's browser.
  Only the Supabase URL and the public anon key belong there.
- Request-handling code never uses the service-role key. API routes act as the
  signed-in user, so RLS always applies.
- `.env*.local` and `.env` are in `.gitignore`. Keep it that way.

## 3. Supabase setup

Do this before the first deploy. The full walk-through is in
[`docs/auth-setup.md`](./auth-setup.md): email provider, "Confirm email", custom
SMTP, OTP length 6 and expiry 3600 seconds, minimum password length 8, the three
email templates in `supabase/email-templates/`, and URL configuration (Site URL
and Redirect URLs for localhost and your production domain).

### Migration order

Run these in the Supabase **SQL Editor**, in this order, each once (they are
written to be safe to re-run):

1. `supabase/migrations/20260823000000_phase2_schema.sql`
2. `supabase/migrations/20260824000000_phase3_food_schema.sql`
3. `supabase/migrations/20260828000000_ask_mode_schema.sql`
4. `supabase/migrations/20261004000000_secure_auth_rls_soie.sql`

The last one adds accounts, patient membership, caregiver invites, the SOIE
tables and Row Level Security, and removes the old open anon policies. Existing
patient rows stay hidden until linked to an account with
`supabase/scripts/link_existing_patient.sql` (see the auth guide).

Heads-up: the first migration (`20260823000000_phase2_schema.sql`) still inserts
one **demo patient** ("Mr. Rajiv Sharma", with sample conditions and medicines).
After the secure migration nobody is a member of that row, so it is invisible in
the app, but it is not real data. On a production database delete it once:
`select id, name from public.patients;` to find it, then
`delete from public.patients where id = '<demo-patient-id>';` (child rows are
removed with it).

`supabase/schema.sql` is **not** a setup script any more. It only documents
that the migrations replaced it.

### Food catalogue (bundled in the app) and the optional database copy

The Indian food catalogue (names in English and Hindi, spelling variants, state of
origin, calories and macros per 100 g, household portions) ships **inside the app**
as `src/data/food-catalogue.json`. Search, calories and emojis work straight after a
deploy; nothing has to be seeded for them. How the data is built and checked is in
[`docs/food-catalogue.md`](food-catalogue.md).

The database copy only exists so a food can be marked as a favourite and linked from
a food log. It is optional and safe to re-run (ids are stable):

1. Put `SUPABASE_SERVICE_ROLE_KEY` (and `NEXT_PUBLIC_SUPABASE_URL`) in
   `.env.local` on your computer.
2. See what would change first, then run it for real:

   ```bash
   node scripts/import-food-dataset.js --dry-run
   node scripts/import-food-dataset.js
   ```

3. Do it from your own machine, not in CI and not on Vercel. The script refuses
   to run without the service key. Remove the key from `.env.local` afterwards if
   you do not need it again.

The import also switches off (`is_active = false`, nothing is deleted) the rows an
older seed left in `food_items`, and moves favourites that pointed at them to the
matching new food. The old CSVs in `supabase/seed_data/` are no longer read.

## 4. GitHub and Vercel

1. Push the repository to GitHub (private is recommended).
2. In Vercel choose **Add New > Project**, select the repository. Framework
   preset: Next.js. Root directory: `./`.
3. Add the environment variables from the table in section 2 (everything except
   `SUPABASE_SERVICE_ROLE_KEY`) for Production, and for Preview if you want
   preview deployments to work.
4. Deploy.
5. Add your Vercel and custom domains to Supabase **Authentication > URL
   Configuration** (Site URL and Redirect URLs) as described in the auth guide.

The build script is `next build --webpack` (see `package.json`); Vercel runs it
via `npm run build`.

### Custom domain (optional)

1. Vercel > Project > **Settings > Domains** > add your domain.
2. Create the DNS records Vercel displays at your registrar.
3. Update Supabase **Site URL** to the new address.
4. Update `NEXT_PUBLIC_APP_URL` if you set it.

## 5. PWA and the service worker

SwasthTrack is an installable PWA (`src/app/manifest.ts`). `public/sw.js` caches
the app shell (main pages, icons) so the app opens quickly and shows something
offline. The service worker cache is cleared on sign-out so that a shared phone
does not keep another person's cached pages. After a deployment, users may need to
close and reopen the app once to pick up the new service worker.

Install:

- **iPhone / iPad (Safari):** open the site, tap Share, then **Add to Home
  Screen**, then **Add**.
- **Android (Chrome):** open the site, accept the install banner or use the
  three-dot menu > **Install app**.

## 6. Post-deploy checklist

- [ ] The site loads over HTTPS and `/login` shows email + password fields (no
      phone number field).
- [ ] **Sign up works:** a new email + password (8+ characters) is accepted.
- [ ] **The OTP email arrives** within a minute, in Hindi and English, with a
      6-digit code and no link. If not, see Troubleshooting in the auth guide.
- [ ] Entering the code signs you in; onboarding creates a patient (or your
      existing patient is linked and visible).
- [ ] **Forgot password** sends a code and lets you set a new password.
- [ ] **RLS check.** Using only the public anon key and no user session, a request
      to the REST API must return nothing or "permission denied":

  ```bash
  curl -s "https://<project-ref>.supabase.co/rest/v1/patients?select=id" \
    -H "apikey: <your-anon-key>" \
    -H "Authorization: Bearer <your-anon-key>"
  ```

  Expected: a permission-denied error or an empty list `[]`. If you see patient
  rows, the secure migration has not run; stop and run it.
- [ ] A second account that is not a member of the patient sees no patient data.
- [ ] Ask (`/ask`) answers. If `ANTHROPIC_API_KEY` is missing the page says the
      rule-based engine is answering.
- [ ] Signing out returns to `/login` and the browser back button does not show
      health data.

## 7. Rotate any key that was ever committed

An earlier version of this document was committed with a real project URL and
API keys in it. Those values are still in git history even though they are gone
from the current file. Because of that:

1. **Always rotate any service-role key that was ever exposed** (Supabase >
   Project Settings > API > reset the `service_role` key). It bypasses RLS, so an
   exposed copy is full database access.
2. Rotating the **anon** key is recommended too, but less urgent: with the secure
   migration in place the anon role has no table access. If you rotate it, update
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and the publishable key variable, if you use
   it) in `.env.local` and in Vercel, then redeploy.
3. Rotate the database password if it was ever shared.
4. Consider rewriting git history (or creating a fresh repository) if you need
   the old values gone from clones and forks.
5. Never paste real keys into docs, issues, chat or screenshots.

## 8. Rollback and backups

**Instant rollback (Vercel):** Vercel Dashboard > **Deployments** > pick the last
good deployment > **Instant Rollback**. Database migrations are not rolled back
by this; test migrations on a copy first.

**Database backups:** Supabase > **Database > Backups** keeps automated backups
(the retention depends on your plan). For a manual copy use `pg_dump` or the
Table Editor export. Take a backup before running a migration on a database that
holds real health data.
