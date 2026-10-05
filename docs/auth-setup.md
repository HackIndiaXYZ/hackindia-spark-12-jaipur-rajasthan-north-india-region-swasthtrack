# SwasthTrack: Sign-in and e-mail codes

SwasthTrack has its own accounts, stored in MySQL (`auth_users`, `auth_sessions`,
`auth_otps`). There is no third-party auth service, no phone number, no SMS, no demo
login and nothing about accounts stored in the browser. Code: `src/lib/auth/`, routes:
`/api/auth/*`, browser side: `src/services/auth-service.ts`.

## How sign-in works

| Flow | What the user does | API |
| :--- | :--- | :--- |
| Sign up | Email + password (min 8 characters), then types the 6-digit code from the e-mail | `POST /api/auth/signup`, then `/api/auth/verify-signup` |
| Sign in | Email + password | `POST /api/auth/login` |
| Forgot password | Asks for a code by e-mail, types it, chooses a new password (other devices are signed out) | `/api/auth/reset-code`, then `/api/auth/reset-confirm` |
| Sign in with e-mail code (optional, no password) | Asks for a code by e-mail, types it | `/api/auth/login-code`, then `/api/auth/login-verify` |
| Change password / name | In Settings > Account | `/api/auth/password`, `/api/auth/profile` |
| Sign out | Menu > log out (this device only) | `/api/auth/logout` |

Things to know:

- **Passwords** are stored only as a salted `scrypt` hash. **E-mailed codes** are stored only as an HMAC
  (keyed with `AUTH_SECRET`), are valid for 10 minutes, work once, and are locked after 5 wrong guesses.
- **The session** is a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS),
  valid for 30 days of use. Only its SHA-256 is stored in MySQL, so a database leak does not leak sessions.
  JavaScript in the page cannot read it.
- **Requests from other sites are refused.** Every state-changing request must be same-origin
  (`Origin` / `Sec-Fetch-Site`, or a JSON content type).
- **Rate limits** (counters hold only keyed hashes, never e-mail addresses or IPs): 8 wrong passwords per
  address and 40 per IP per 15 minutes; 5 code e-mails per address per hour, 30 per IP per hour; one code
  per 45 seconds. "No such account" and "wrong password" look the same, and "send me a code" / "reset my
  password" answer the same whether or not the address has an account.
- A new account is a patient-less user until it creates a patient (onboarding) or redeems an invite code.
- Access to a patient is a row in `patient_members` (`owner`, `editor`, `viewer`) and is enforced on the server;
  see [`docs/database.md`](database.md).
- Caregivers join with an 8-character invite code that the owner creates in Settings (valid 15 minutes, single use).
- Day boundaries everywhere are IST (Asia/Kolkata).

## Setup

1. Put `DATABASE_URL` and `AUTH_SECRET` in `.env.local` (see [`docs/deployment.md`](deployment.md)) and run `npm run db:migrate`.
2. Configure the e-mail sender (next section).
3. `npm run dev`, open <http://localhost:3000/login>, sign up.
4. If you already have patient records, attach them to your account: `npm run db:link -- --list`, then
   `npm run db:link -- --email you@example.com --patient <id>` (and optionally `--make-admin` for the
   developer tools in the UI).

### E-mail sender (Resend)

The codes are sent with the same SMTP settings as the report e-mails: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` (or `RESEND_API_KEY`) and `EMAIL_FROM`.

1. Create a Resend account and an API key.
2. **Verify your own domain** in Resend (Domains > Add domain, then add the DNS records it shows).
3. Set `EMAIL_FROM="SwasthTrack <noreply@your-domain>"` on that domain.

> **Important.** Resend's free sandbox sender `onboarding@resend.dev` delivers only to the e-mail address of
> the Resend account owner. With it, sign-ups from any other address fail: the user sees "we could not send the
> e-mail" (`email_failed`) and the real reason (Resend's rejection) is in the server log. Verifying a domain is
> the fix.

**Local development without SMTP:** if `SMTP_PASS` / `RESEND_API_KEY` are empty and `NODE_ENV` is not
`production`, the code is printed in the terminal that runs `npm run dev` (`[auth] SMTP is not configured; DEV ONLY
code for you@example.com (signup): 123456`) and treated as sent. In production a missing SMTP setup is an error,
never a silent success.

## Troubleshooting

| Symptom | Cause and fix |
| :--- | :--- |
| "We could not send the e-mail" on sign-up | SMTP is wrong or the sender is not allowed. Read the `[auth] could not e-mail a signup code:` line in the server log. With Resend: verify your domain and use it in `EMAIL_FROM` (see above) |
| Code e-mail never arrives, no error | Check spam; check the Resend dashboard > Logs; confirm `SMTP_HOST`/`SMTP_PORT` (Resend: `smtp.resend.com`, 465, user `resend`, password = API key) |
| "Too many attempts" | The rate limits above. Wait a few minutes (codes: 45 s between sends) |
| "The code is wrong or has expired" | Codes last 10 minutes, work once and lock after 5 wrong guesses: ask for a new one |
| Sign-in loops back to the login page | The session cookie is not being stored: check the site is opened on the same origin the cookie was set for, and that the browser accepts cookies. Behind a proxy, make sure `x-forwarded-proto` is passed so the `Secure` flag matches HTTPS |
| `Setup required` screen | `DATABASE_URL` is missing on the server, or the database is unreachable |
| Everything returns 401 right after a deploy | `AUTH_SECRET` or the database changed: sessions live in the database, so a new empty database means everyone signs in again |
| "Database schema is not up to date" | Run `npm run db:migrate` against that database |
