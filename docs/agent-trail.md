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
