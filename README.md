# SwasthTrack

SwasthTrack is a Hindi-first family health tracker built for one elderly father
who has a stroke history and hypertension. Family caregivers log his blood
pressure, weight, food and calories, sleep, steps and medicines in one place, and
see calm, plain-language summaries instead of raw numbers. The interface is in
Hindi (Devanagari) with short English helper text, and it is a mobile-first
installable web app (PWA).

**SOIE** (SwasthTrack Omni-Intelligence Engine) is the "Ask" assistant. It
answers questions about the patient's own logged data, checks its numbers against
deterministic rules, and says so honestly when there is not enough data.

> **Medical disclaimer.** SwasthTrack is a tracking aid. It is not a diagnosis,
> not a prescription and not a substitute for a doctor. Always follow the doctor's
> advice, and call a doctor or emergency services for urgent symptoms. Read the
> in-app page at `/medical-disclaimer`.

## Features by route

| Route | What it does |
| :--- | :--- |
| `/` | Dashboard: today's status at a glance, wellness ring, quick logging |
| `/health` | Blood pressure and weight logging, trends, charts |
| `/food` | Food and calorie logging with an Indian food database, household portions, favourites |
| `/medicines` | Medicine schedule, mark taken or missed, adherence |
| `/timeline` | Day-by-day health journey ("meri swasthya yatra") |
| `/reports` | Health and adherence reports over a chosen period |
| `/insights/changes` | "What changed?" comparison against the personal baseline |
| `/ask` | SOIE assistant: questions in Hindi or English over the logged data |
| `/caregiver` | Caregiver companion dashboard |
| `/profile` | Patient profile, medical background, prescriptions |
| `/settings` | Targets and preferences, caregiver invite codes, members |
| `/onboarding` | First-run setup: creates the patient and makes you its owner |
| `/login` | Email + password sign-in, signup with email code, password reset, optional email-code sign-in |
| `/simulation-lab` | Developer and acceptance-test tools (admin accounts only) |
| `/about`, `/contact`, `/privacy`, `/terms`, `/medical-disclaimer` | Information and policy pages |

## Stack

- Next.js 16.3.2 (App Router, built with webpack), React 19, TypeScript
- Tailwind CSS v4 with a design-token system in `src/app/globals.css`
- Supabase: Auth, Postgres and Row Level Security (RLS)
- recharts for charts, motion for animation, lucide-react for icons
- Anthropic SDK for the SOIE language model (server side only)

**Heads-up: this is not the Next.js you may know.** `AGENTS.md` warns that this
Next.js version has breaking changes in APIs, conventions and file structure.
For example, what used to be called `middleware` is now called `proxy`. Before
writing Next-specific code, read the relevant guide in
`node_modules/next/dist/docs/` and heed any deprecation notices.

## Quick start

```bash
cp .env.example .env.local        # then fill in the values (never commit this file)
# run the migrations in the Supabase SQL editor, in order (see below)
npm run dev
```

Open <http://localhost:3000>. Scripts in `package.json`:

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Dev server (`next dev --webpack`) |
| `npm run build` | Production build (`next build --webpack`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

Dependencies are installed with `npm install` the first time.

### Environment variables (names only)

| Name | Where | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Public anon key; RLS protects the data |
| `ANTHROPIC_API_KEY` | Server only | SOIE language model |
| `SUPABASE_SERVICE_ROLE_KEY` | Local script only | Food import only; never in the browser, never committed |

`.env.example` lists every variable, including the optional SOIE settings. Full
table: [`docs/deployment.md`](docs/deployment.md).

### Database and sign-in setup

1. In the Supabase SQL editor run, in order:
   `supabase/migrations/20260823000000_phase2_schema.sql`,
   `20260824000000_phase3_food_schema.sql`,
   `20260828000000_ask_mode_schema.sql`,
   `20261004000000_secure_auth_rls_soie.sql`.
   (`supabase/schema.sql` is only a pointer to these; it holds no SQL.)
2. Configure Supabase Auth (email provider, custom SMTP, 6-digit OTP, the three
   email templates in `supabase/email-templates/`, URLs) following
   [`docs/auth-setup.md`](docs/auth-setup.md).
3. Sign up in the app. If you already had patient data, link it to your account
   with `supabase/scripts/link_existing_patient.sql`.
4. Optional: seed the food catalogue with `node scripts/import-food-dataset.js`
   (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; run it on your own
   computer only).

Deploying: see [`docs/deployment.md`](docs/deployment.md).

## Folder map

```
src/app/                 App Router pages (one folder per route) and API routes
  api/soie/              SOIE endpoint (bearer-token authenticated)
  api/ask/               earlier Ask endpoint
  manifest.ts            PWA manifest
src/components/
  ask/ caregiver/ dashboard/ food/ forms/ health/ medicines/ reports/ timeline/
                         feature components, one folder per area
  layout/                app shell, header, sidebar, bottom navigation, auth guard
  motion/                animation helpers
  ui/                    design-system primitives (button, card, modal, toast, ...)
src/context/             auth-context (session, profile, active patient, role)
src/lib/                 health-rules.ts (clinical rules + IST dates), active-patient.ts,
                         health-options.ts, utils.ts
src/lib/supabase/        client.ts (browser), server.ts (API routes, as the user),
                         auth-fetch.ts (bearer token for /api calls), database.types.ts
src/services/            data layer and analytics (patient-service, settings-service,
                         reports, insights, wellness score, ...)
src/services/soie/       SOIE types, normalisation and evaluation
src/types/               shared TypeScript types
supabase/migrations/     the database schema, in order
supabase/email-templates/ bilingual email-code templates to paste into Supabase
supabase/scripts/        one-off SQL (link an existing patient to an account)
supabase/seed_data/      food dataset CSVs used by the import script
scripts/                 import-food-dataset.js
public/                  icons, logo and sw.js (service worker for the PWA shell)
docs/                    auth-setup.md, deployment.md
```

## Security model

- **Real authentication only.** Supabase Auth with email + password. Signup is
  verified by a 6-digit code sent by email; password reset also uses an email
  code; there is an optional passwordless "sign in with email code". There are no
  phone numbers, no SMS, no demo login and no accounts stored in the browser.
- **Row Level Security on every table.** Access to a patient is granted by a
  membership row in `patient_members` with a role: `owner` (manages caregivers,
  full access), `editor` (can log data) or `viewer` (read only). The anon role
  has no table access, so the public anon key alone reads nothing.
- **Caregiver invite codes.** The owner creates an 8-character code in Settings
  (alphabet without look-alike characters, valid 15 minutes, single use). The
  caregiver redeems it through a database function that limits each user to 10
  attempts per 15 minutes.
- **Roles cannot be self-promoted.** Admin status and membership roles change
  only through checked database functions or the SQL editor.
- **API routes use the user's bearer token.** The browser sends
  `Authorization: Bearer <access token>` to `/api/*` (see
  `src/lib/supabase/auth-fetch.ts`); the server queries as that user, so RLS
  applies. No service-role key is used in any request path.
- **Health readings stay out of localStorage.** BP, weight, food, sleep, activity
  and medicine logs are read from Supabase into short-lived in-memory caches only.
  A few per-device UI preferences (last chosen patient, saved-food shortcuts,
  quick-add counters, dismissed alerts, reminder de-dupe) are kept in
  localStorage; they contain no readings and signing out clears them, together
  with the PWA shell cache.
- **Secrets.** The service-role key is for the food import script only. Never
  commit secrets; rotate any key that was ever committed (see
  `docs/deployment.md`).

## Dates and clinical rules

- Every "day" in the app is an **IST (Asia/Kolkata)** day. Day boundaries,
  ranges and "today" come from the helpers in `src/lib/health-rules.ts`
  (`todayIST`, `toISTDate`, `istDayBounds`, `addDaysIST`, ...). Do not derive a
  day with `toISOString().split("T")[0]` or the device's local date.
- Clinical thresholds (BP classification, pulse, BMI, plausibility checks, medicine
  adherence windows) are defined **only** in `src/lib/health-rules.ts`. Do not
  invent a second definition of "high BP" or a "late dose" elsewhere; extend that
  file instead.
- No fabricated data. When something has not been logged, the UI says so
  ("अभी डेटा नहीं है") instead of showing a placeholder.

## Disclaimer

SwasthTrack helps a family keep records and spot patterns. It does not diagnose,
treat or replace professional medical advice. See `/medical-disclaimer` in the app.
