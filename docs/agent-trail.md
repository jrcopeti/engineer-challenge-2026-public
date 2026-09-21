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

**PR #4 real review (17:17–17:21 UTC):** "Nothing here blocks merge." It independently
verified the `due_at` picker round-trip doesn't drift on re-save (I hadn't tested that)
and raised three nits: the double-click comment claimed an in-flight guard that isn't
there, `errorMessage()` duplicated in two components, `downloadExport` bypasses
`request()` without saying why. I chose to apply all three on the open PR rather than
carry them forward.

**I caught this one:** the double-click guard was only in the table; `ItemDetail` still
used the in-flight flag the agent had itself explained doesn't work on a fast network.
Reproduced with two clicks 120 ms apart in the detail view → `open` then `resolved`.
Fix: one shared `useClickCooldown` hook (`web/src/hooks/`) used by both components,
instead of a second copy of the pattern. Verified: one request, state stays.

---

## 5. XSS + CSV — `fix/xss-csv-injection` (19:40–)

**My prompt:** "PR#4 is merged. Do the small PR for the review and do the next phase."
PR #5 (trigger change, 1 line) opened first; it cannot be bot-reviewed by design.

**Agent did (19:40–19:42):**
- Removed all three `dangerouslySetInnerHTML` in `ItemDetail.tsx`; message, summary and
  note body render as text with `white-space: pre-wrap` so line breaks survive.
- `csvCell` prefixes a tab when a value starts with `=`, `+`, `-`, `@`, tab or CR (the
  OWASP CSV-injection mitigation), on top of the existing quote doubling.
- Private notes excluded from the export (`is_private = 0` in the `GROUP_CONCAT`), column
  renamed `internal_notes` → `shared_notes` so the header is honest about its contents.
- 4 tests (52 total): seeded `=HYPERLINK` row is neutralised; every formula-leading
  character; quotes still doubled; "VIP account" (private) absent, "Reproduced in Chrome"
  (shared) present.

**Verified in the browser:** the seeded `<strong>Heads up:</strong>` message arrives as
`&lt;strong&gt;`, zero elements. Submitted `<img src=x onerror=…><script>…</script>` via
the real notes form: rendered as literal text, `onerror` never fired.

**Left alone on purpose:** private-note *visibility* semantics (who may read them in the
UI) — the product decision I made earlier: document in KNOWN-ISSUES, don't guess.

**PR #6 review: ran, posted nothing.** 2 turns, 145 s, `permission_denials_count: 6`,
no comment — and the action hides the model's output, so the review was lost. Likely
cause: it returned the review as a message instead of calling `gh pr comment`. Fix in
PR #5's prompt (the official example's "only post GitHub comments" line); job re-run on
#6. Third distinct way a green check meant nothing (skip on PR #1, skip on PR #4, silent
no-post here). Lesson: the check mark is not the review — read the log or the comment.

**PR #6 review: silent twice** (rerun too: 14 turns, 3 denials, no comment). I merged on
my own review. Agent's mistake in the middle: it pushed the "post, don't return" prompt
fix to PR #5's branch *after* #5 had merged and told me it was in — it wasn't. I asked
how that could be; it checked, admitted it, cherry-picked onto a fresh branch (PR #7),
deleted the orphan. Lesson: check PR state before pushing to its branch.

I clarified my actual requirement: review on open, not on push — already delivered by
#5. Declined the extra `show_full_output` debug switch; leaving the hidden-output
problem for KNOWN-ISSUES unless it recurs.

---

## 6. Anthropic summarizer — `feat/anthropic-summarizer` (19:57–)

**My prompt:** "I merged PR #6 … I just need the CI to trigger the review when Open the
PR and not rerun when push changes" → confirmed already done; proceed to phase 5.

**Question before commit:** *why is `AnthropicSummarizer` a class — why are you writing
classes?* — Agent's honest answer: habit, not necessity. It holds a client and a model
name and has one method; a closure does the same with less ceremony and matches the rest
of the codebase, which is all functions (the only classes are `Error` subclasses, where
`instanceof` needs one). The test double was already a plain object literal, proving the
class was never required. **Converted both providers to factory functions** returning
`{ summarize }`. CLAUDE.md already says "code that reads like the surrounding code"; the
agent didn't apply its own rule until asked.

**Agent did (19:57–20:05):**
- Loaded the `claude-api` skill first instead of writing SDK code from memory. It flagged
  that its default is `claude-opus-5`; I confirmed **Haiku 4.5** (approved plan; two-
  sentence summaries don't need the large model). Model is an env override.
- `server/src/llm/`: `summarizer.ts` (interface + `SummarizerError`), `fake.ts`,
  `anthropic.ts` (`@anthropic-ai/sdk`, 10 s timeout, 1 retry, `max_tokens` 200, system
  prompt that treats the customer text as untrusted data inside `<customer_message>`
  tags, SDK error classes mapped to user-safe messages), `index.ts` factory that refuses
  `anthropic` without a key. OpenAI removed everywhere.
- `app.ts` exports `createApp({ summarizer })` so failure paths are testable; provider
  failure → 502 with a plain message, anything else stays a 500 that leaks nothing.
- Agent hit a circular import (contract in `index.ts`, providers importing it) and split
  the contract into `summarizer.ts`.
- 5 tests (57 total): fake output contains the real message; 502 on `SummarizerError`;
  500 without leaking on unexpected errors; factory refuses missing key.

**Verified:** boot with `LLM_PROVIDER=anthropic` and no key refuses with the variable
name. **Live summary with my real key (20:05–20:14): works** — I ran that myself; the
agent had no key and did not ask me to paste one.

**Also:** rebased onto `shippable` after PR #7 merged so the workflow file matches and
the review can actually run.

**Correction (20:35).** The "three silent reviews" were one silent review and two bad
checks by the agent: its monitor filtered comments on login `claude`, but the API returns
`claude[bot]`; and once it queried the instant the job finished, before the comment had
landed. #6's rerun and #8's first run both posted. PRs #5, #7 and #9 (trigger change,
prompt line, revert) were therefore churn on bad evidence — I asked for #9 to restore the
original, which is where we ended up anyway. The agent owned this without being asked
once the #8 comment appeared. The lesson it had logged three times applied to itself.

**Also (20:40):** the agent committed the correction above directly onto local
`shippable` by mistake (not pushed), noticed, moved it to the phase-6 branch and reset
local `shippable` to origin. Then hit a rebase conflict in this file when #8 merged and
resolved it by keeping both blocks.

---

## 7. Server structure + ops — `refactor/server-structure` (20:25–)

**My prompt:** "#8 merged, start phase 6." Scope agreed beforehand: route split, helmet,
CORS origin from env, `/health`, production build/start. **ESLint skipped** (my call —
typecheck + 57 tests already gate CI; two-workspace ESLint config is 20+ min).

**Agent did (20:25–20:34):**
- `app.ts` (329 lines) → composition root (50 lines) + `routes/{auth,users,metrics,
  export,customers,feedback}.ts` + `feedback-queries.ts` (the shared JOIN, filter builder
  and `getFeedbackItem`). Handlers lifted verbatim — the 57 existing tests are the proof
  that behaviour didn't change. No services/repositories layer: YAGNI at this size.
- `helmet`, `x-powered-by` off, CORS restricted to `CORS_ORIGIN` (default: the Vite dev
  server), `GET /health` for load balancers.
- Production build: the server's `tsc` was `noEmit` and imports are extension-less ESM,
  so plain `tsc` output wouldn't run under Node. `esbuild` bundles to one
  `dist/server.js` with native modules external; `npm start` runs it. Verified: bundle
  boots, `/health` 200, helmet headers present.
- 3 tests (60 total): health, security headers, CORS allows configured origin only.
- README: build/start section, layout section rewritten to point at the new structure.

**Left alone on purpose:** ESLint (agreed), request logging / request ids (would want
`pino` — KNOWN-ISSUES), graceful shutdown (SQLite is synchronous; closing the process is
safe).

**PR #10 review (posted, 3 min):** the lift was confirmed byte-for-byte for SQL, CSV,
bcrypt and auth. One real finding: my config comment claimed `CORS_ORIGIN=*` opens the
API; the `cors` package ignores `'*'` inside an array, so it fails closed. Reproduced
with curl. Decision: **not** adding wildcard support — customer data, never open CORS —
fixed the comment and pinned the closed behaviour with a test. The reviewer also noted
that a test for this case would have caught the wrong comment; fair.

**Question after review:** *what do these four middleware lines do?* — explained
`x-powered-by`, helmet's headers (nosniff, frame-options, HSTS, CSP), why `cors()` with
no options meant any site could call the API from a logged-in browser, and the JSON body
limit → 413. Also why the order matters: headers first so error responses carry them too.

---

## 8. UI — `feat/ui-redesign` (20:55–)

**My prompt:** "#10 merged, start phase 7 - clean neutral design like Linear/notion."
Design reference given by me, as agreed: clean, neutral, Linear/Notion-like.

**Agent did (20:45–20:50, inside the 45-min box):**
- Loaded the `frontend-design` skill, wrote a 4-line plan (palette, type, layout,
  principles) and checked it against the generic tells before coding. Brief was explicit
  — Linear/Notion — so restraint is the design: white page, hairlines instead of shadows,
  one indigo accent used only for primary/focus/summary, system font stack (no external
  font requests), pale tinted pills for status/priority, sentence case, 14/13 px.
- `styles.css` rewritten from scratch (725 → ~540 lines, tokens at the top). Removed the
  marquee, emoji heading, joke subtitle and placeholders. Copy now says what things are:
  "Unassigned", "No due date", "Search feedback", "Add a note for the team", "Save".
- States that didn't exist: loading and empty in the inbox (different text when a
  filter/search is active), loading + error in the detail view, "No notes yet", login
  shows the server's message and disables while submitting, `autocomplete` on the login
  inputs, visible keyboard focus, reduced-motion respected, table scrolls inside its own
  wrapper on phones so the page never scrolls sideways.

**Mirror check (screenshots at 1280 and 400):** three things fixed after looking:
"Add note" stretched full width; history rows clipped mid-word — turned out to be a
hard `.slice(0, 48)` in the JSX, not CSS, so the ellipsis had nothing to do; then two
levels of `min-width: 0` for grid/flex children so the ellipsis actually applies.
Title-case headings → sentence case.

**Verified in the browser:** inbox, detail, login (wrong password shows the error),
phone width with no horizontal page scroll.

**Left alone:** dark mode, a proper icon set, keyboard shortcuts — KNOWN-ISSUES.

**I overruled the agent (20:55):** it had stripped every trace of personality — marquee,
emojis, the "#1 inbox of ALL TIME" subtitle. I wanted them back: the product is an
internal tool for a support team and a bit of fun is part of its character. Also the
table's Resolve/Reopen were text links that didn't read as buttons. Agent restored the
marquee (right → left, 28 s pass, static under reduced-motion), the 💖 heading and login
subtitle, and gave the row actions a real bordered button style. It verified the
animation direction by measuring the element's x over 1.5 s rather than trusting the CSS.
Its first scripted edit of the button class silently missed again (prettier reflow);
fixed by hand after checking the count came back 0.

**Second round of my feedback (21:00):** low and normal priority were the same grey;
the four metric numbers were all black. Asked for differentiation and for the metrics to
be colour-coded so an agent can read the strip without reading it. Agent reused the pill
colours (open blue, resolved green, urgent red, overdue amber) on the numbers so the
colour language is one system, and gave `normal` a slate tint distinct from `low`'s faint
outline.

**Third round (21:03):** liked the colours, wanted them as the tile background with white
text — a stronger signal than a coloured number. Done; the four tiles are the one loud
element on the page now, which is the "spend your boldness in one place" rule applied
where the user actually looks first.

**Question (21:08):** *is the recent history in the detail real or fake? There's no link
to the item.* — Real: `GET /customers/:id` returns the customer's 8 latest feedback rows
from the DB. Looks fake because the seed hands out messages round-robin, so a customer
repeats the same text with different statuses. Not clickable and includes the item
you're on — a genuine gap, left for KNOWN-ISSUES at my request.

---

## 9. Clickable history — `feat/clickable-history` (21:14–21:18)

**My prompt:** "#11 merged, before starting phase 8 let's make the recent history in the
item detail clickable. it should be simple." — Pulled forward from KNOWN-ISSUES because
it was cheap. `ItemDetail` gets an `onSelect(id)` prop wired to `Inbox`'s `setSelectedId`;
history rows are `<button>`s (keyboard-reachable); the item you're on is filtered out of
its own history, with an empty message when nothing else exists. Verified in the browser:
click swaps the detail in place; back still returns to the table. 4 lines of logic.

**PR #12 review found a real bug I'd missed and the agent's browser check hadn't
covered:** navigating via history changes the `id` prop without unmounting `ItemDetail`,
so `summary`, the note draft and `error` carried over from the previous item — a stale
AI summary under the wrong customer, or a draft note submitted against the wrong item.
The agent's verification had only checked that the title and message changed. Fix:
`key={selectedId}` on `<ItemDetail>` so React remounts per item and *all* local state
resets, rather than listing fields to clear in `load()` and missing one later. Verified
with the reviewer's exact repro using a real Anthropic summary. Also hoisted the
duplicated history filter the reviewer flagged.

**Question (21:25):** *explain the bug fix.* — Same component type at the same tree
position with a changed prop keeps its instance and state; `key` changes identity and
forces a remount. Chose `key` over resetting fields in `load()` because a list of fields
to clear is a checklist the next engineer will forget to extend.

---

## 10. Docs + final review — `docs/handin` (21:30–)

**My prompt:** "#12 merged, start phase 8."
