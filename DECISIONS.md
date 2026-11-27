# Decisions

Pulse as handed over ran on the happy path and nowhere else. The full read-through
before writing any code is in `docs/agent-trail.md` (entry 0); the short version is
below. Every change went in as a separate PR into `shippable`, reviewed by me and by an
automated Claude review, with `master` left untouched so the whole delta is one diff.

## What I found

**Ship-blockers.** `jwt.decode()` instead of `jwt.verify()` — any hand-written token was
a login as anyone. SQL built by string interpolation on five routes, including a working
injection into a write path. Plaintext passwords, also returned by `GET /users`. XSS via
`dangerouslySetInnerHTML` on customer text (the seed even plants `<strong>` payloads).
CSV formula injection (`=HYPERLINK` in the seed). The LLM key shipped to the browser; the
JWT put in a query string; the auth header written to logs on errors.

**Quietly wrong.** Pagination skipped the first page. The client never checked `res.ok`,
so a 401 crashed the inbox and an expired token never logged anyone out. The 45 s poll
had a stale closure and overwrote the current view with page 1. Resolve was a toggle, so
two clicks flipped each other. Two date formats in one column. Two extra queries per row.
No tests, no CI, no production build, no error handling, no loading or error states.

## What I changed, in order

1. **Rules and CI first** — `CLAUDE.md`, CI (typecheck, tests, build), a Claude review
   action on every PR. Rules before code so every later PR was checked against them.
2. **Auth** — `jwt.verify`, secret from env with fail-fast boot, bcrypt, no token in
   URLs, LLM key off the client. Made the API testable in the same PR (in-memory DB).
3. **SQL, validation, schema** — every query parameterised, zod on every input, a
   central error handler, schema with FKs/CHECKs/indexes, the N+1 collapsed to a JOIN,
   every `any` removed (my instruction after the first review).
4. **Correctness** — explicit `{ status }` instead of a toggle; dates normalised on
   write; a `request()` helper on the client with logout on 401; debounced search;
   polling that follows the current view; a double-click guard shared by both views.
5. **XSS + CSV** — render customer text as text; neutralise formula prefixes; private
   notes out of the export.
6. **Summarizer** — one-method `Summarizer` interface with a fake (default, tests) and
   an Anthropic provider (Haiku 4.5, timeout, retry, untrusted-text framing, errors
   mapped to 502). OpenAI dropped; the team has no key for it.
7. **Structure and ops** — routes split per resource, helmet, CORS pinned to an origin,
   `/health`, an esbuild bundle so the server can run outside `tsx`.
8. **UI** — neutral, dense design with loading/empty/error states. I kept the marquee
   and the emojis on purpose: it's an internal tool, and a bit of character is part of
   it. Then made customer history clickable because it was cheap.

61 API tests run in CI against an in-memory database. Every route change shipped with
a test; the tests also served as proof that the route split changed nothing.

## What I chose not to touch, and why

- **Private-note visibility.** The flag is stored and shown to everyone. Who may read a
  private note is a product decision, not a guess I wanted to make in four hours. I did
  stop exporting them, because a data leak isn't a product decision.
- **Migrations.** The schema is applied on boot; a change means `npm run seed`. I built
  a schema-version boot check, read the diff, and reverted it as overkill for a tool
  whose data is seed data. Documented instead.
- **ESLint.** Typecheck and tests already gate CI; a two-workspace ESLint setup would
  have cost the UI phase.
- **Login rate limiting, refresh tokens, SSO.** Listed in KNOWN-ISSUES with the reasons.

## Where the agent was wrong, and where I was

The agent (Claude Code) found the issues list, wrote nearly all the code, and was
overruled or corrected at these points, each recorded in the trail: it said it had
tested when it had only curl-tested — I made it run the browser; it wrote classes where
the codebase uses functions; it stripped every trace of personality from the UI; it
left an in-flight guard in one view after explaining why that guard doesn't work; three
times a scripted edit silently didn't land after a formatter reflow and it trusted a
green typecheck — twice caught by me reading the diff, once by the browser. The
automated review caught a real state-leak bug in the last PR that neither of us had.

My own biggest mistake: I spent about 30 minutes across three PRs "fixing" the review
action because the agent reported runs as silent when its check script was filtering on
the wrong bot login. One run had really failed; the rest were my checks. The lesson the
trail records three times — a green check is not a review — applied to me.

## Time

Planning 15:00–15:40. Code and review 15:40–21:45, with a one-hour lunch inside that.
That is over the 3–4 hour brief, and the overrun is deliberate.

The agent's execution per phase was 5–15 minutes. The rest was me reading each PR and
making it justify decisions before I merged: why a 32-character secret, why a dummy
bcrypt hash, why the export moved to a header, why an `Error` subclass, why a class at
all. Every one of those questions is in the trail with the answer. That is where the
time went, and it is the part of the job the brief says it scores — I can defend every
line in the repo because I asked about every line I didn't understand.

Auth got the largest share on purpose. `jwt.decode` meant anyone could log in as anyone,
and passwords were stored in the clear: nothing else in the app matters until that is
closed, and getting it wrong a second time (a weak secret, a timing leak, a token in a
URL) would be worse than the original bug. The SQL and validation phase was the next
largest for the same reason — a working injection into a write path is not a thing to
patch quickly.

The one block of time I would not spend again is the ~30 minutes on the review action,
which was mostly my own broken check script (see above).
