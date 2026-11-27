# Known issues

What is still wrong or missing, and what I'd do with another day. Ordered by what I'd
fix first.

## Would fix first

- **Private-note visibility.** `is_private` is stored, shown as a label, and excluded
  from the CSV export — but every logged-in user can still read every note in the UI
  and via `GET /feedback/:id/notes`. Needs a product decision (author-only? managers?),
  then a `WHERE` clause and a test. Half a day including the conversation.
- **No login rate limiting.** bcrypt makes each guess slow and the dummy-hash compare
  hides which emails exist, but nothing stops a sustained credential-stuffing run.
  `express-rate-limit` on `/login`, keyed by IP and email. An hour.
- **Tokens live 7 days in `localStorage`.** Acceptable for an internal tool behind
  HTTPS; not for anything public. The proper fix is short-lived access tokens with a
  refresh token in an httpOnly cookie, or SSO so Pulse never holds passwords (see the
  product note). A day.
- **Must be served over HTTPS.** The API is plain HTTP; the login body carries the
  password. TLS belongs in front of the process — a reverse proxy (Caddy, nginx) or the
  hosting platform terminates it and the app never touches certificates — which is why
  it isn't code here: there is no hostname yet to get a certificate for. The app is
  ready for it (`helmet` already sends `Strict-Transport-Security`; `CORS_ORIGIN` is
  env-driven for the deployed host). The one guard the app itself should add: a
  middleware that rejects plain-HTTP requests when `NODE_ENV=production` (check
  `req.secure` / `x-forwarded-proto`), so a misconfigured deployment fails loudly
  instead of quietly sending passwords in the clear. Five lines; not done only because
  it can't be exercised without a deployment to test against.

## Would fix next

- **No migrations.** The schema is applied with `IF NOT EXISTS` on boot, so an existing
  `pulse.db` never picks up constraint or index changes; the upgrade path is
  `npm run seed`, which drops everything. Fine while the data is seed data; the moment
  real feedback lands, numbered migration files are needed. I built and reverted a
  version check as overkill for now.
- **No request logging or request ids.** Errors log to the console with no correlation.
  `pino` + a request-id middleware; an hour.
- **Metrics window has no UI.** `/metrics` accepts `from`/`to` but the inbox always asks
  for all time. "Overdue" is computed against now, correctly, but there is no date
  picker. Also, overdue counts items with a due date in the past regardless of
  assignee — there is no "my queue" view at all.
- **No frontend tests.** The 61 API tests cover every route; the React side is verified
  by hand in the browser only. Playwright against the dev server, starting with login,
  status change, and the history navigation that hid a state bug.
- **SQLite is single-writer.** Fine for a support team; not for anything with
  concurrent writers at scale. Postgres is a one-file change (`db.ts`) plus the
  `GROUP_CONCAT` in the export.

## Small things

- Dates render in the browser's locale with no timezone shown; due dates are stored as
  end-of-day UTC, which is a day off for some users.
- The search matches message, customer name and email with `LIKE` — no ranking, no
  index use. Fine at 80 rows.
- CSV export buffers the whole file in memory before download. Fine at this size.
- No dark mode, no icons, no keyboard shortcuts.
- The Claude review action: skips silently (job still green) when a PR edits the
  workflow file, so workflow changes need a human review; one run in ~eight ended
  without posting and the action hides the transcript by default.

## Would do with another day

Private-note rules (morning). Rate limiting and request logging (an hour each).
Playwright smoke tests for the four main flows (afternoon). Then the product note.
