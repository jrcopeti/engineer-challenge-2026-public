# Agent trail

How the agent (Claude Code, Opus 5) was driven during this challenge. Each entry: what I
asked, what it proposed, what I kept, what I overruled. Times are wall-clock; the honest
time accounting in `DECISIONS.md` is derived from this log.

Session start: **2026-09-21 ~15:00** (planning), coding from **15:39**.

---

## 0. Planning (15:00–15:39) — plan mode, no code written

**My prompt (summary):** pasted the challenge brief; said I'd already run the app, spotted
the 00s-era UI, and that I have an Anthropic key but no OpenAI key; asked the agent to read
the code and ask me questions before planning.

**Agent did:** read every file directly (no sub-agents; ~1.2k lines), produced the findings
table below, then asked two rounds of questions.

**Findings the agent surfaced on first read**

| # | Where | Problem |
|---|-------|---------|
| S1 | `server/src/auth.ts:15`, `index.ts:47` | `jwt.decode()` not `jwt.verify()` — signature never checked. `JWT_SECRET` hardcoded, `.env` ignored. |
| S2 | `index.ts` `/feedback`, `/metrics`, `/export.csv`, `/feedback/:id/assignment`, `GET /feedback/:id/notes` | SQL injection via string interpolation. |
| S3 | `seed.ts`, `index.ts:64` | Plaintext passwords; `GET /users` returns the password column; frontend `User` type has `password?`. |
| S4 | `ItemDetail.tsx:127,167,219` | XSS via `dangerouslySetInnerHTML` (seed plants `<strong>` payloads). |
| S5 | `index.ts:56` | CSV formula injection (seed plants `=HYPERLINK`); export dumps private notes. |
| S6 | `web/src/config.ts`, `api.ts:116` | LLM key shipped to the browser; JWT in `?token=`; auth header logged. |
| S7 | `index.ts` | No input validation; `/summarize` crashes on unknown id. |
| C1 | `index.ts:82` | Pagination off-by-one (`page * PAGE_SIZE`); `total` ignores filters. |
| C2 | `web/src/api.ts` | `res.ok` never checked → 401/500 parsed as data → crash; expired token never logs out. |
| C3 | `Inbox.tsx:31-41` | Poll has a stale closure; overwrites current page with page 1. |
| C4 | `Inbox.tsx:23-25` | Search per keystroke, no debounce/abort. |
| C5 | `index.ts:292` | `/resolve` toggles → concurrent clicks flip-flop; no rollback on client. |
| C6 | `index.ts:15` | N+1 queries; no indexes/FKs; schema only in `seed.ts`. |
| C7 | `index.ts:236` | `due_at` mixes `YYYY-MM-DD` and ISO → overdue comparison unreliable. |
| C8 | `llm.ts` | No timeout, crashes on API error, OpenAI-only. |
| C9 | `index.ts:116` | Metrics ranges wrong; never refresh. |
| C10 | repo | No tests/lint/CI/error middleware/health/prod start; no loading/error UI states. |

**Questions the agent asked and my answers**

1. Priorities → security → correctness → structure/tests → UI (time-boxed last).
2. LLM → Anthropic + fake provider, drop OpenAI.
3. Verification → API integration tests + GitHub Actions.
4. Trail → `CLAUDE.md` first commit + this running log.
5. Private notes → leave semantics, document; still stop exporting them.
6. Branching → **I overruled the default**: `shippable` off `master`, then one branch per
   fix off `shippable`, so each change is reviewable on its own.
7. UI → plain CSS, **but the agent must ask me first; I'll give it a design reference.**

**What I overruled / added at plan approval**

- Added: CI must include a Claude Code review action from the very first PR, not just
  typecheck/lint/test.
- Added to the plan text: "ask the user before committing any non-trivial change".

---

## 1. Setup — `chore/agent-rules` (15:39–)

**My prompt:** proceed with phase 0.

**Agent did:** created `shippable` + `chore/agent-rules`; wrote `CLAUDE.md`, this file,
`ci.yml` (typecheck + build), `claude-review.yml`. Looked up the action's current inputs
via the docs MCP before writing the YAML instead of guessing.

**I overruled:** the agent wired the review action to `ANTHROPIC_API_KEY`. I asked whether
I could use my Claude subscription instead (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`
+ installing the Claude GitHub App). Agent checked the action docs, confirmed
`claude_code_oauth_token` is a supported input, and switched the workflow. No API key
needed for CI; the Anthropic key is only used by the app's own summarizer.

**Caught on PR #1:** the Claude review job reported *pass* in 10 s. Too fast. The log
showed `Skipping action due to workflow validation: the workflow file must exist ... on the
repository's default branch`. The action never ran; the green check was meaningless.
Fix: make `shippable` the fork's default branch (keeps `master` untouched) so the workflow
is live from PR #2. CI (typecheck + build) genuinely passed.

---

## 2. Auth hardening — `fix/auth-verify-and-hashing` (16:06–16:20)

**My prompt:** "PR #1 merged, start phase 1."

**Agent did:**
- `jwt.decode` → `jwt.verify` with a typed payload guard; secret from env, boot fails fast
  on the placeholder or anything under 32 chars (`server/src/config.ts`).
- Passwords: bcryptjs, column renamed to `password_hash`; login compares against a dummy
  hash for unknown emails so timing doesn't leak whether an account exists.
- `GET /users` selects explicit columns; `password?` removed from the web `User` type.
- `/export.csv` uses the same `authenticate` middleware; `?token=` no longer accepted.
  Frontend downloads via `fetch` + blob with the `Authorization` header.
- Removed `VITE_OPENAI_API_KEY` / `x-llm-key` (LLM key was being shipped to the browser).
- Stopped logging the `Authorization` header and request bodies on errors.
- Pulled the test harness forward from phase 2 because CLAUDE.md says routes ship with
  tests: `app.ts` exported without `listen`, `DB_PATH=:memory:` for tests, seed turned into
  `seedDatabase(db)`. 14 tests: forged/unsigned/tampered tokens, wrong password, `/users`
  shape, export auth.
- Added `.prettierrc` after prettier 3's default trailing commas polluted the diff.

**Verified by hand:** curl login OK / wrong password 401 / forged token 401 / `?token=`
export 401 / header export 200; boot with placeholder secret throws.

**Left for later phases (on purpose):** SQL interpolation in the same file (phase 2),
login rate limiting (KNOWN-ISSUES).

**My questions before commit, and the answers I got:**
1. *Why 32 chars for `JWT_SECRET`?* HS256 is only as strong as the secret's entropy; one
   valid token lets an attacker brute-force a short secret offline and mint tokens for
   anyone. RFC 7518 recommends ≥ 256 bits. The check is a floor to reject `secret`-style
   values, not a guarantee.
2. *Why `.prettierrc`?* Prettier 3 defaults added trailing commas to untouched lines; the
   file pins the repo's existing style so diffs stay clean. Optional; prettier itself
   still needs adding as a devDependency with ESLint.
3. *Did you test it?* Agent admitted it had only curl-tested the API, not the browser. I
   made it run the real UI via Playwright: login form → inbox, Export CSV → header-auth
   download of 80 rows. It passed, but the honest answer was "partly" until I asked.

**At commit time:** the agent's first cut of commit 1 wasn't self-contained (`index.ts`
imported an `app.ts` that only existed in commit 2). It caught this itself after staging,
rebuilt commit 1 with an intermediate `app.ts` (original routes minus `listen`) and
verified each commit typechecks alone. It also noticed an unrelated `App.tsx` reflow from
my editor's format-on-save picking up the new `.prettierrc` and kept it out of the PR.

**PR #2 automated review (first real run of the action, ~5 min):** posted a summary plus
4 inline comments: SQLi in the assignment `UPDATE` (rated most severe — "a working
injection into a write path"), pagination off-by-one, `csvCell` formula prefixes, and
`any` on every DB row in `app.ts`. All four were already on the plan. One gap in the
reviewer: git didn't detect the `index.ts → app.ts` rename, so it treated 300 lines of
pre-existing `any` as new code.

**What I told the agent to do (my decisions, not its suggestions):**
1. Don't patch the assignment route inside PR #2 — merge as-is, but **explicitly state in
   the PR** that each finding will be corrected in a named later phase. Agent posted a
   triage table as a PR comment.
2. **Remove every `any`, in new *and* existing code** — not now, but as part of phase 2.
   Agent added it to the plan.
3. Record in this trail that these were my explicit instructions.

**Review gap (16:25–17:05) — reading the PR and questioning the agent, no code written.**
The timestamps between PR #2 opening and phase 2 starting are me reviewing the diff line
by line and asking the agent to justify decisions before I merge. That is deliberate: I
merge nothing I can't explain in the interview. Questions asked in this window:

- *When do `DECISIONS`, `KNOWN-ISSUES` and the product note get written?* — Phase 8, at
  the end, because they summarise what was and wasn't done; the trail collects the raw
  material per phase so they aren't written from memory.
- *Why `const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)`?* — Timing-based
  user enumeration: without it, unknown-email logins return in ~1 ms while known-email /
  wrong-password logins take a full bcrypt compare (~50–100 ms), so an attacker can tell
  which emails have accounts. The dummy makes both paths do one compare. Computed once at
  boot (not per request); cost 10 to match production hashes. Agent volunteered a caveat
  I hadn't spotted: the seed uses cost 4, so with seeded data the timing still differs
  until real users exist at cost 10 — optional phase-2 tweak.
- *Why was the CSV export changed from `window.location.href = …?token=` to `fetch` + blob?*
  — A navigation can't send headers, and a JWT in the URL lands in browser history, server
  and proxy logs, and pasted links. Server now only accepts the `Authorization` header, so
  the client fetches the body and triggers the download from an object URL. Also: `res.ok`
  is checked (a 401 no longer replaces the app with a JSON page) and `URLSearchParams`
  encodes the search term. Trade-off noted for KNOWN-ISSUES: the file is buffered in
  memory; very large exports would want a single-use download token instead.
- *I ran the app and checked DevTools: the password is visible in the `POST /login`
  payload — is that OK?* — Yes and unavoidable: the server needs the password to compare
  against the hash; DevTools shows your own browser's traffic pre-encryption. What
  changed is everywhere *else*: no token in URLs, no `req.body` in error logs, no
  plaintext in the DB or in `/users`. On the wire the body is protected by TLS, which is a
  deployment requirement → KNOWN-ISSUES ("must be served over HTTPS"). Client-side hashing
  wouldn't help (the hash becomes the password). Longer-term: SSO so Pulse never handles
  passwords — candidate for the product note.
- Side effect caught while testing: login failed on my machine because the agent had
  switched the working tree back to `shippable` (old login code) after opening the PR,
  while the local DB had already been reseeded with the new `password_hash` column.
  Checkout and DB from different commits — not an app bug. Fix: check out the PR branch.

---

## 3. SQL injection + validation + schema — `fix/sql-injection-validation` (17:40–)

**My prompt:** "it's all good. I merged PR#2 let's keep going."

**Agent did (17:43–17:48, wall-clock; the review of this PR is where the time goes):**
- Every query parameterised; shared `feedbackFilters()` builds the WHERE for list + export
  from bound params. `LIKE` input escaped (`%`, `_`, `\`) with `ESCAPE '\'`.
- `server/src/validation.ts` — zod 4 schemas for every body/query/param. Unknown enum
  values, non-numeric ids, non-ISO dates → 400 with field-level details.
- `server/src/schema.ts` — tables with FKs, CHECK constraints on status/priority, four
  indexes; `PRAGMA foreign_keys = ON`; applied on boot with IF NOT EXISTS. Seed drops and
  re-applies through the same module. **Deviation from plan:** a `.ts` string instead of
  `schema.sql` so a future `tsc` build needs no copy step.
- `serializeFeedback` N+1 (2 queries per row, 21 per page) → one JOIN, reused by list,
  detail, customer history.
- **Every `any` removed** from server code as instructed — `types.ts` holds the row types;
  the one remaining `any` is in `llm.ts`, which phase 5 replaces.
- Pulled forward from phase 6 because zod needs it: `errors.ts` with `HttpError`,
  `asyncHandler` (Express 4 drops rejected promises), a central error handler (zod → 400,
  malformed JSON → 400, unknown → 500 without leaking internals) and a JSON 404.
- Fixed C1 (pagination `(page-1)*PAGE_SIZE` and filtered `COUNT`) here rather than phase 3
  because the exact lines were being rewritten — splitting it would have been theatre.
- Assignment now rejects unknown assignees (400) and unknown feedback (404) instead of
  silently updating zero rows; notes refuse to attach to missing feedback.
- 24 new tests (38 total): three injection payloads against status/search/assignment/
  notes/metrics/export with row-count and per-row checks that nothing changed; `%` no
  longer a wildcard; page 1 = newest; filtered totals; malformed JSON; JSON 404.

**Verified by hand:** the reviewer's exact payload from PR #2
(`priority: "x' WHERE 1=1 --"`) → 400, priorities still 20/20/20/20. Browser: login →
detail → save routing (200) → add note (201) → summarize (200), DB matches.

**Left for later:** `/resolve` still toggles (phase 3, commented in code); `due_at`
normalisation to ISO (phase 3); `csvCell` formulas + private notes in export (phase 4);
route split (phase 6).

**PR #3 automated review (17:55):** confirmed no interpolated SQL remains. Four findings:
private notes + formulas in export (phase 4, planned), `due_at` mixed formats (phase 3,
planned), **`CREATE TABLE IF NOT EXISTS` never upgrades an existing `pulse.db`** (valid —
the README said "reseed" but nothing enforced it), and **no tests for `/customers/:id`
and `/resolve`** even though both were touched (valid — our own rule).

*I asked what a `user_version` boot check means* (SQLite header integer used as a schema
version; detect a stale DB and refuse to boot with a "run `npm run seed`" message) and
told the agent to implement it. It did (~60 lines: version stamp, boot check, a separate
`open-database.ts` because the seed was blocked by the check it was meant to fix, 4 tests,
README). Then I read the diff and **overruled it: overkill for something a reseed solves.**
The stale-DB case goes in KNOWN-ISSUES as "no migrations; reseed after schema changes"
instead. Kept only the two missing route tests (`/customers/:id`, `/resolve`) the
reviewer flagged — 42 tests total.

Lesson for the trail: an agent will happily build what you ask for; reading the diff
before committing is where the scope call actually gets made.

**PR #3, second automated review (after the follow-up push):** a repeat of round one
except one new item — `express.json` size limit throws `PayloadTooLargeError`, which the
error handler maps to 500 instead of 413. Pulled into phase 3.

**Workflow decision (mine):** every push was re-running a full review of the whole PR
(~5 min, same findings again). Chose to drop `synchronize` from the trigger: one review
per PR at open; re-review on demand by toggling draft → ready. Lands in this PR.

**Gap 18:20–~19:20: lunch break.** Not review time; not agent time.

---

## 4. Correctness — `fix/correctness` (18:22–)

**My prompt:** "go with option 1, I merged PR#3, start phase 3 first."

**Agent did (18:22–18:28, backend + frontend + browser verification):**
- `POST /feedback/:id/status` with an explicit `{ status }` replaces the `/resolve`
  toggle; idempotent, so two agents clicking at once converge instead of flipping.
  `POST /summarize` → `POST /feedback/:id/summary` (id in the path like every other route).
- `due_at` normalised on write: a picker date becomes `T23:59:59.999Z` ("due by end of
  that day"); full ISO kept as given; `''` → NULL. Closes the mixed-format finding from #3.
- `express.json` size limit now maps to 413 (from the #3 review).
- `web/src/api.ts` rewritten around one `request()` helper: checks `res.ok`, throws
  `ApiError` with the server's message, calls a logout handler on 401 for authenticated
  requests (App registers it). Every component shows errors instead of swallowing them;
  Summarize shows a loading state and disables while in flight.
- `Inbox.tsx`: search debounced 300 ms with `AbortController`; the poll runs on the
  *current* page/filter/search (was pinned to the initial state by a stale closure) and
  no longer overwrites server truth with local state; optimistic status update with
  rollback; metrics refresh after a status change and on return from detail.
- Tests: status set idempotent / rejects unknown values / old route gone; `due_at`
  normalisation both shapes; metrics window + overdue; 413. 48 total.

**Caught in the browser, twice:** a double-click on "Resolve" resolved then reopened.
Explicit-set on the server is correct (each request said what it wanted); the UI was
the problem. First fix — ignore clicks while a request is in flight — looked like it
didn't work. Second fix — a 500 ms per-item cooldown — also "didn't work". The real
cause: my scripted edit of the handler silently failed to match after prettier reflowed
the lines, so the browser was running code with *no guard at all*, and I'd trusted the
typecheck instead of reading the served module. Applied the edit by hand; one POST,
row stays resolved. Lesson recorded: after an automated edit, verify the edit landed
before verifying the behaviour.

**Also verified by hand:** 13 keystrokes → one `/feedback` request; metrics 56/24 →
55/25 without reload; corrupted token → back to the login screen, no crash.

**Question before commit:** *why are `HttpError` / `ApiError` classes?* — `instanceof` is
what lets the catch site separate "expected failure with a status and a human message"
(show it) from "a bug" (500 / generic text, never leak the message). A plain thrown object
loses the stack and still needs a discriminator; a bare `Error` can't be told apart from a
`TypeError`. One class with `status` as data; `notFound()` is a factory, not a subclass.

**PR #4 review job: skipped, not passed.** The PR edits `claude-review.yml`, and the
action refuses to run unless the workflow file matches the default branch — same silent
green as PR #1. Caught by checking the run log rather than trusting the check mark. CI
itself is real. I told the agent to fix it: the trigger change is pulled out of this PR
into its own (which by the same rule can't be reviewed either), so #4 gets a real review.
