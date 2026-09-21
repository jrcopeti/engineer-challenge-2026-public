# Pulse

This repository is a coding challenge for engineering candidates. It is not intended
for production use.

Pulse is a small internal customer-feedback inbox for support teams. Sign in, browse
incoming feedback across email, chat, and app-store channels, open an item to read the
full message and customer details, resolve or reopen it, and generate a quick AI summary
of any message. The app also includes assignment routing, priority and due-date fields,
customer profile history, internal notes, a small metrics panel, search, and CSV export.

## Requirements

- Node 20+
- npm

## Setup

1. Install dependencies (installs both the server and web packages):

   ```bash
   npm install
   ```

2. Create the environment files from the examples:

   ```bash
   cp server/.env.example server/.env
   cp web/.env.example web/.env
   ```

   Then set `JWT_SECRET` in `server/.env` to a random string (the server refuses to start
   with the placeholder):

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

   The defaults run the app fully offline — the Summarize feature uses a built-in fake
   summarizer (`LLM_PROVIDER=fake`), so no API key is required.

3. Seed the database with sample users, customers, and feedback:

   ```bash
   npm run seed
   ```

   Re-run this after pulling changes that touch the schema; it drops and recreates every table.

4. Start the API and the web app together:

   ```bash
   npm run dev
   ```

   - API: http://localhost:4000
   - Web: http://localhost:5173

Open the web app in your browser and sign in.

## Tests

```bash
npm test             # API tests (vitest + supertest against an in-memory SQLite)
npm run typecheck    # both workspaces
```

## Test login

- **Email:** `alice@pulse.test`
- **Password:** `password123`

## Project layout

- `server/` — Node + Express + TypeScript API backed by SQLite (`better-sqlite3`).
- `web/` — React + TypeScript single-page app built with Vite.

## Optional: live summaries

To use a real model for the Summarize feature, set the following in `server/.env`:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-haiku-4-5   # optional override
```

The server refuses to start with `LLM_PROVIDER=anthropic` and no key. Provider failures
(timeout, rate limit, bad key) surface as a 502 with a plain message; they never take the
rest of the app down.
