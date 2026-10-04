# SwasthTrack: Authentication and Database Setup

This guide takes a fresh (or existing) Supabase project from zero to a working,
secure SwasthTrack: real accounts, email codes, and patient-scoped Row Level
Security (RLS).

It replaces the old `phone-auth-setup.md`. SwasthTrack no longer uses phone
numbers, SMS, demo logins or accounts stored in the browser.

## How sign-in works

| Flow | What the user does | Supabase call |
| :--- | :--- | :--- |
| Sign up | Email + password (min 8 characters), then types the 6-digit code from the email | `signUp`, then `verifyOtp({ email, token, type: 'signup' })` |
| Sign in | Email + password | `signInWithPassword` |
| Forgot password | Asks for a code by email, types it, chooses a new password | `resetPasswordForEmail`, then `verifyOtp({ type: 'recovery' })`, then `updateUser({ password })` |
| Sign in with email code (optional, no password) | Asks for a code by email, types it | `signInWithOtp({ email, options: { shouldCreateUser: false } })`, then `verifyOtp({ type: 'email' })` |

Things to know:

- Email codes are sent by Supabase through **your own SMTP account**. The default
  Supabase templates only contain a link, so you MUST replace them with the
  templates in `supabase/email-templates/` (they show the 6-digit `{{ .Token }}`).
- A database trigger creates a `profiles` row for every new auth user.
- Access to a patient is granted through `patient_members` (`owner`, `editor`,
  `viewer`) and enforced by RLS. The `anon` role has no table access at all.
- Caregivers join a patient with an 8-character invite code. The owner creates it
  in Settings; it is valid for 15 minutes and is redeemed through a database
  function.
- The browser calls our own `/api/*` routes with
  `Authorization: Bearer <access token>`.
- Day boundaries everywhere are IST (Asia/Kolkata).

## Step 1. Create or choose a Supabase project

1. Sign in at <https://supabase.com/dashboard>.
2. Create a new project (or open the existing one). Pick a region close to your
   users (for India, Mumbai or Singapore).
3. Keep the database password somewhere safe. You do not need it for the app.
4. From **Project Settings > API** copy the **Project URL** and the **anon public
   key**. You will put them in `.env.local` (Step 11). The `service_role` key on
   the same page is secret; see Step 11 before you touch it.

Dashboard menus move around between Supabase releases. If a menu below is not
where this guide says, look for the same word elsewhere under **Authentication**
or **Project Settings**.

## Step 2. Turn the Email provider on

1. Open **Authentication > Sign In / Providers** (older dashboards:
   **Authentication > Providers**).
2. **Email**: enabled.
3. **Confirm email**: **ON**. This is what makes Supabase send the 6-digit code at
   signup and block sign-in until the email is verified.
4. Leave **Phone** and **Anonymous sign-ins** off. SwasthTrack does not use them.
5. Leave **Allow new users to sign up** on while your family is creating
   accounts. Once everyone has signed up you may turn it off for extra safety;
   existing users and the email-code sign-in (which never creates users) keep
   working.

## Step 3. Set up custom SMTP (required for production)

The built-in Supabase mailer is meant for a quick trial only. It is heavily rate
limited (only a few emails per hour across the whole project), it only sends to
addresses that belong to your own Supabase team, and its messages often land in
spam. Real family members will not get their codes reliably. Use your own
SMTP provider (Resend, Brevo, Amazon SES, Postmark, Mailgun, Zoho, Gmail
Workspace, and so on).

1. Open **Authentication > Emails > SMTP Settings** (older dashboards:
   **Project Settings > Authentication > SMTP Settings**).
2. Enable **Custom SMTP** and fill in:

   | Field | What to enter |
   | :--- | :--- |
   | Sender email | An address on a domain you control, for example `no-reply@<your-domain>` |
   | Sender name | `SwasthTrack` |
   | Host | Your provider's SMTP host, for example `smtp.<your-provider>.com` |
   | Port | `587` (STARTTLS) or `465` (SSL), as your provider documents |
   | Username | The SMTP username from your provider |
   | Password | The SMTP password or API key from your provider |

3. Save, then send yourself a test signup (Step 9) to confirm the email arrives.
4. On your domain, set up SPF, DKIM and DMARC records as your SMTP provider
   instructs. Without them Gmail and Outlook will junk or reject the codes.

Never commit SMTP credentials. They live only in the Supabase dashboard.

## Step 4. OTP length, OTP expiry, password length

On **Authentication > Sign In / Providers > Email** set:

| Setting | Value | Why |
| :--- | :--- | :--- |
| Email OTP length | `6` | The app and the templates are built for a 6-digit code |
| Email OTP expiration | `3600` (seconds) | One hour is long enough for slow email delivery and still short-lived. The email says "valid for a short time" without naming a number, so changing this later needs no template edit |
| Minimum password length | `8` | Matches the app's own check. A longer minimum is fine. |

## Step 5. Email rate limits

Open **Authentication > Rate Limits**.

- With custom SMTP the default email limit is low (about 30 per hour). Raise
  **Rate limit for sending emails** to a value that fits your family, for example
  60 to 100 per hour. Keep it finite.
- Leave **sign-up and sign-in** and **token verification** limits at their
  defaults unless you see legitimate users blocked.
- Supabase also enforces a short gap (about one minute) between code emails to the
  same address, so a user who taps "resend" immediately may be told to wait.

## Step 6. Paste the three email templates

Open **Authentication > Emails > Templates** (older dashboards:
**Authentication > Email Templates**). For each row below, set the **Subject** to
the line in the first comment of the file, then replace the whole **Message
body** with the file contents.

| Supabase template | File | What it is used for |
| :--- | :--- | :--- |
| Confirm signup | `supabase/email-templates/confirm-signup.html` | Verify the email at signup |
| Reset password | `supabase/email-templates/reset-password.html` | Forgot-password code |
| Magic Link | `supabase/email-templates/magic-link.html` | The "sign in with email code" email |

Rules:

- Keep `{{ .Token }}` in every template. It is the 6-digit code. If a template
  has no `{{ .Token }}`, users receive an email with no code and cannot continue.
- The templates deliberately have no links, so `{{ .ConfirmationURL }}` is not
  used. Do not add it back.
- You may leave the "Invite user", "Change email address" and "Reauthentication"
  templates at their defaults. The app does not use them.
- The subject lines are inside an HTML comment at the top of each file. Do not
  paste that comment's text into the body as visible content (it is harmless
  either way, since it is a comment).

## Step 7. URL configuration

Open **Authentication > URL Configuration**.

- **Site URL**: your production address, for example `https://<your-domain>`.
  Use `http://localhost:3000` only while developing and nothing is deployed.
- **Redirect URLs**: add both
  - `http://localhost:3000/**`
  - `https://<your-domain>/**` (and `https://<your-vercel-project>.vercel.app/**`
    if you use preview or default Vercel URLs)

The email-code flows do not follow links, but Supabase still validates these
values, and a wrong Site URL is a common source of confusing errors.

## Step 8. Run the database migration

Run the migrations in order in **SQL Editor** (see `docs/deployment.md` for the
full list). The one that matters for security is:

`supabase/migrations/20261004000000_secure_auth_rls_soie.sql`

1. Open the file, copy everything, paste it into the SQL editor and run it.
2. It is idempotent. Running it twice is safe.
3. **Warning (also written in the file's header):** it deliberately removes the
   old policies that let anyone with the anon key read and write everything.
   After it runs, only signed-in members of a patient can see that patient's
   data. **Existing patient rows become invisible until you link them to an
   account** (Step 10). If you are starting fresh, there is nothing to link.

It creates `profiles` (with the sign-up trigger), `patient_members`,
`caregiver_invites`, `patient_settings`, the SOIE tables, all RLS policies, and
the functions `create_patient`, `create_caregiver_invite`,
`accept_caregiver_invite`, `list_patient_members` and `set_patient_member`.

Note: the very first migration (`20260823000000_phase2_schema.sql`) seeds one demo
patient ("Mr. Rajiv Sharma"). It has no members after the secure migration, so it
is invisible in the app, but it is sample data and not a real person. When you
list patients in Step 10 you will see it; delete it
(`delete from public.patients where id = '<demo-patient-id>';`) unless you want it
for testing.

## Step 9. Sign up in the app

1. Set up `.env.local` (Step 11) and run `npm run dev`, or open your deployed
   site.
2. Go to `/login`, choose sign up, enter your email and a password of at least 8
   characters.
3. Check your inbox (and spam) for the SwasthTrack email, type the 6-digit code.
4. If this is a brand-new setup, the onboarding screen creates your first
   patient and makes you its owner. Skip Step 10.

## Step 10. Link an existing patient to your account (only if you had data before)

Use this when the database already has a patient (for example Papa's original
record from before the secure migration).

1. Make sure you completed Step 9 with the email you want as the owner.
2. In the SQL editor, list the patients:

   ```sql
   select id, name, created_at from public.patients order by created_at;
   ```

3. Open `supabase/scripts/link_existing_patient.sql` and edit the two lines in the
   `declare` block:
   - `v_email` = the email you signed up with
   - `v_patient` = the patient id from the list above (shown as
     `<your-patient-id>` in this guide)
4. Run the script. It prints `Linked <email> as owner of patient <id>`. It also
   creates the patient's settings row if missing.
5. Reload the app. The patient's history appears. To add family members, open
   **Settings** and create an invite code (Step 12).

### Make yourself an admin (optional)

Admins see the developer tools in the UI. Roles cannot be changed from the app
(a database trigger blocks it), only from the SQL editor:

```sql
update public.profiles set role = 'admin' where lower(email) = lower('you@example.com');
```

This is the commented line at the bottom of the link script.

## Step 11. Environment variables

Copy `.env.example` to `.env.local` and fill in the values. Names only here:

| Name | Runs where | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Project URL from Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | The public anon key. Safe in the browser because RLS protects the data |
| `ANTHROPIC_API_KEY` | Server only | For the "Ask" assistant (SOIE). Never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Local script only | Used only by `scripts/import-food-dataset.js` |

About `SUPABASE_SERVICE_ROLE_KEY`:

- It bypasses RLS completely. Treat it like a master password.
- It is **only** for the food-dataset import script, run on your own computer.
- Never put it in a variable that starts with `NEXT_PUBLIC_`, never add it to
  Vercel for the web app, never commit it, never paste it into chat or a doc.
- If it was ever committed or shared, rotate it in Project Settings > API.

`.env.local` is ignored by git. Keep it that way.

## Step 12. Caregiver invites

1. The owner opens **Settings** and creates an invite, choosing `viewer` (read
   only) or `editor` (can log data).
2. The app shows an 8-character code. The alphabet leaves out look-alike
   characters (no `0`, `O`, `1` or `I`), so codes are easy to read aloud.
3. The code is valid for **15 minutes** and works once.
4. The caregiver signs up in the app with their own email (Step 9), then enters
   the code.

## Troubleshooting

**No email arrives**
- Check spam and the SMTP provider's own sent log.
- Confirm Custom SMTP is saved and the sender address is verified with your
  provider (many providers refuse unverified senders).
- Check Authentication > Logs for SMTP errors (wrong port, bad password).
- Confirm the three templates contain `{{ .Token }}`.
- Wait a minute and ask again; Supabase spaces out code emails per address.

**"Email not confirmed"**
- The user has not yet typed the signup code. Ask the app to send a new code and
  verify it. Confirm "Confirm email" is ON (Step 2) and that the Confirm signup
  template contains `{{ .Token }}` (Step 6).

**Rate-limit errors ("email rate limit exceeded", "too many requests")**
- You are on the built-in Supabase mailer or the hourly limit is too low. Finish
  Step 3 and raise the limit in Step 5. Wait for the limit window to pass.

**"Invalid token" or "Token has expired"**
- The code was mistyped, already used, or older than the OTP expiry. Request a
  new one and use the newest email.
- Make sure the email is typed exactly the same as in the request.
- Confirm Email OTP length is 6.

**Signed in, but all the data is empty after the migration**
- Expected if the data pre-dates the migration: the account is not linked yet.
  Run Step 10 (`supabase/scripts/link_existing_patient.sql`).

**The app says a table or function is missing, or a new column is "not found in the schema cache"**
- The migration did not finish, or PostgREST has not noticed the change. Re-run
  the migration, then reload the API schema cache in the SQL editor:

  ```sql
  notify pgrst, 'reload schema';
  ```

**Invite code says "too many attempts"**
- A user can try 10 codes per 15 minutes. Wait and try again with the correct
  code.

## Security notes

- **RLS is on for every table.** Signed-in users see only patients they are an
  active member of. Writes need the `owner` or `editor` role; `viewer` is read
  only.
- **The anon role has no table access.** Someone holding only the public anon key
  and no signed-in session gets permission denied, not data. `docs/deployment.md`
  has a quick check you can run after each deploy.
- **Roles cannot be self-promoted.** `profiles.role` and membership roles change
  only through database functions that check the caller, or from the SQL editor.
- **Invite codes are guessing-resistant:** 8 characters from a 32-character
  alphabet, valid 15 minutes, single use, and each user is limited to 10
  attempts per 15 minutes.
- **No service-role key in request paths.** API routes act as the signed-in user
  (bearer access token), so RLS applies to everything they read or write.
- **Health readings stay out of localStorage.** Only per-device UI preferences
  (no readings) are stored locally, and signing out clears them and the caches.
- Rotate any key that was ever committed or shared, and always rotate a
  service-role key that has been exposed.
