# E-mail alerts, reports and account mail

Everything SwasthTrack e-mails, how it is triggered, and how to preview it. Login codes
(confirm sign-up, sign-in code, password reset) are separate: they are sent by Supabase Auth
using `supabase/email-templates/*` — see `docs/auth-setup.md`.

## The 11 templates

| Key | What | Sent when | To |
|---|---|---|---|
| `alert.bp` | BP above the alert line / crisis / low | Right after a BP reading is saved | `REPORT_EMAIL_TO` |
| `alert.reminders` | Missed medicine, meals/BP/sleep not logged, no data for days | Cron 2 PM IST (only if something is missing) | `REPORT_EMAIL_TO` |
| `alert.weight` | ≥ 2 kg in 7 days or ≥ 5% in 30 days | Right after a weigh-in is saved | `REPORT_EMAIL_TO` |
| `report.daily` | Today's BP, medicines, calories, steps, sleep, gaps | Cron 9 PM IST | `REPORT_EMAIL_TO` |
| `report.weekly` | Score, BP, habits, insights | Cron Sunday 8 PM IST | `REPORT_EMAIL_TO` |
| `report.monthly` | Rolling last 30 days | Cron 9 AM IST on the 1st | `REPORT_EMAIL_TO` |
| `account.welcome` | Welcome + what to expect | After a user creates their first patient | the user |
| `account.test` | "Email works" check | Settings → *Send test email* | the user |
| `caregiver.invite` | Invite code + how to join | Caregiver dialog → *Send by email* | address the owner types |
| `caregiver.access-changed` | Access removed / role changed | Owner removes a caregiver or changes their role | that caregiver |
| `caregiver.joined` | "X joined your care team" | Right after a caregiver redeems an invite (needs migration `20261004010000_email_owner_contact.sql`) | the owner |

Thresholds are never hard-coded here: BP lines come from the patient's `bp_targets`
(defaults 160/100 alert, 180/120 crisis, 90/60 low), weight rules, the 4-hour missed-dose rule,
"due at" times and the logging-gap days all come from `src/lib/health-rules.ts`. Alert toggles
from Settings (BP, medicine, sleep, steps, missing data) are respected.

## Code map

- `src/lib/email/layout.ts` — shared look (green header, gold rule, Hindi first, English under it, compact).
- `src/lib/email/templates/{alerts,reports,account}.ts` — one `render…` function per template.
- `src/lib/email/registry.ts` — the list above, with sample data. Add a template here and it appears in the preview.
- `src/lib/email/mailer.ts` — SMTP (nodemailer → Resend) and `REPORT_*` config.
- `src/services/email-notification-service.ts` — builds the alert/report content from patient data (IST-aware).
- `src/app/api/notify/alert` — BP / weight alerts (called by `logBloodPressure` / `logWeight`). Needs the user's token; reads run as that user.
- `src/lib/supabase/{als-scope,request-scope,notifier}.ts` — run the data services as a specific RLS-scoped client (see "Running under RLS").
- `src/app/api/cron/*` — the four scheduled mails; schedules in `vercel.json` (UTC).
- `src/app/api/email/send` — mail the signed-in user triggers (test, welcome, invite, access changed).
- `src/app/api/email/preview` — gallery + preview + "send me the samples".

## Environment

See `.env.example`: `SMTP_*` / `RESEND_API_KEY`, `EMAIL_FROM`, `REPORT_EMAIL_TO` (comma-separated),
`REPORT_PATIENT_ID`, `CRON_SECRET`, `NOTIFY_USER_EMAIL` / `NOTIFY_USER_PASSWORD` (see below), and
`NEXT_PUBLIC_APP_URL` (without it the mails have no "open app" links).
On Vercel set the same variables; the cron jobs send `Authorization: Bearer $CRON_SECRET` automatically.

## Preview

```bash
# gallery of all templates, zoomed out (dev only; in production it needs the bearer token)
open http://localhost:3000/api/email/preview
# one template at full size / as plain text
open "http://localhost:3000/api/email/preview?type=report.daily"
open "http://localhost:3000/api/email/preview?type=report.daily&format=text"
# e-mail the samples to REPORT_EMAIL_TO ("all" or one key)
curl -X POST localhost:3000/api/email/preview -H "Authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' -d '{"type":"all"}'
# real data, no sending: renders what the cron would send now
curl -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/daily-report?dryRun=1"
```

## Running under RLS (no service-role key)

`SUPABASE_SERVICE_ROLE_KEY` is deliberately not used anywhere in the app (docs/deployment.md), so e-mail jobs
read data as a real user and Row Level Security still applies:

- **BP / weight alerts** run as the **signed-in person who saved the reading**. The route needs their token
  (`authFetch`), checks they belong to the patient, and reads the rows with their own session.
- **Cron mails** (reminders, daily, weekly, monthly) have no signed-in person, so they sign in as a **notifier
  account**: an ordinary account added to the patient as a **Viewer** caregiver. It can read only that patient
  and cannot change anything.
  1. Create an account for the robot (a real inbox you control, e.g. `you+swasthtrack-bot@gmail.com`) and confirm its e-mail.
  2. As the patient's owner, create a *Viewer* invite and redeem it from the bot account.
  3. Set `NOTIFY_USER_EMAIL` and `NOTIFY_USER_PASSWORD` (server env only, never `NEXT_PUBLIC_`).
  Until both are set the cron jobs use the anonymous client, which only sees data while the database still has the
  old open policies — i.e. **before** the RLS migration. After it, set them or the jobs will find no data.
- The data services keep a short per-patient cache; every e-mail job clears it before and after running.
- **`caregiver.joined`** uses the database function `get_patient_owner_contacts` (migration
  `20261004010000_email_owner_contact.sql`), which answers only a caregiver whose membership is less than 10
  minutes old. The owner's address is used to send the mail and is never returned to the browser.

## Known limits

- **Alerts and reports go to one patient and a fixed address list** (`REPORT_PATIENT_ID`, `REPORT_EMAIL_TO`).
  Per-person addresses and per-person preferences need a table in the database.
- Vercel Hobby runs each cron once a day at an unspecified minute within the scheduled hour.
- While Resend has no verified domain, mail from `onboarding@resend.dev` is only delivered to the Resend account's own address.
- Not exercised against a live signed-in session yet (the live database has not had the auth/RLS migrations run):
  `/api/email/send`, `/api/notify/alert`, the notifier sign-in and `get_patient_owner_contacts`. Everything else
  (all 11 renders, escaping, the four cron mails on real data, scoped-client isolation) was run.
