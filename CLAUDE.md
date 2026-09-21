# Pulse — agent rules

Pulse is a small internal customer-feedback inbox. React + TypeScript (Vite) in `web/`,
Express + TypeScript + SQLite (`better-sqlite3`) in `server/`. npm workspaces at the root.

## Commands

```bash
npm install            # both workspaces
npm run seed           # (re)create + seed server/pulse.db — destructive
npm run dev            # API :4000 + web :5173
npm run typecheck      # tsc --noEmit in both workspaces
npm test               # server API tests (vitest + supertest, in-memory SQLite)
npm run lint           # eslint, both workspaces
```

Env: copy `server/.env.example` → `server/.env` and `web/.env.example` → `web/.env`.
The server refuses to boot with a missing or default `JWT_SECRET`.

## Non-negotiable rules

- **SQL**: parameterised queries only (`db.prepare('... WHERE id = ?').get(id)`). Never
  interpolate request data, ids, or filter values into SQL strings. Escape `%` and `_` in
  `LIKE` inputs.
- **Validation**: every request body, query, and path param goes through a `zod` schema in
  `server/src/validation.ts` before it touches the DB. Unknown enum values → 400, not a guess.
- **Auth**: `jwt.verify`, never `jwt.decode`. Tokens travel only in the `Authorization`
  header — never in query strings, never logged.
- **Secrets**: read from env on the server only. Nothing prefixed `VITE_` may be a secret.
- **Rendering**: never `dangerouslySetInnerHTML`. Customer text is untrusted; render as text.
- **CSV**: every cell goes through `csvCell` (quotes doubled, formula prefixes neutralised).
- **Types**: no `any` in new or touched code. Type DB rows explicitly.
- **Errors**: routes throw; the central error middleware maps to status codes. No
  swallowed errors on the client — surface them to the user.
- **Tests**: every route change ships with a test in `server/tests/`. Tests run against an
  in-memory DB; never against `pulse.db`.
- **Dependencies**: add one only when it removes real code. Say why in the commit.
- **Commits**: one logical change, imperative subject, body says *why*. Work on a branch off
  `shippable`; `master` stays untouched.
- **Never merge.** Commit, push, open a PR into `shippable` with `gh pr create`, then stop.
  The owner reviews the PR (and the Claude review comment) and merges it themselves.
- **Ask before** committing anything non-trivial and before touching UI styling.

## Conventions

- Timestamps are ISO-8601 strings in UTC everywhere (DB, API, UI input normalised on write).
- Status is set explicitly (`{ status: 'resolved' }`), never toggled.
- Frontend API calls go through `web/src/api.ts` `request()` — it checks `res.ok`, throws
  `ApiError`, and logs the user out on 401.
- LLM access goes through the `Summarizer` interface in `server/src/llm/`. `fake` is the
  default provider and the one tests use.

## When reviewing a PR

Order of concern: security → data loss / correctness → missing tests → structure → style.
Point at the line. Say what breaks and how you'd verify it. Skip nitpicks that ESLint owns.
