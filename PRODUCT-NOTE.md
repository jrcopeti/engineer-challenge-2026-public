# Product note

If Pulse were a real client and I had two weeks, this is what I'd build and what I'd
cut. Product call, not an engineering one.

## Who this is for

A support team of three to ten people who get customer feedback from email, chat and
app-store reviews and need to know: what's new, what's mine, what's overdue, and what
did this customer say last time. Everything below is judged against those four
questions.

## Build next

1. **"My queue" as the default view.** Today the inbox is everyone's, sorted by date.
   The first thing an agent wants is their own open items, overdue first. One filter,
   one sort, and it becomes the home screen. Two days including the metrics following
   the same filter.
2. **Notify on assignment and on overdue.** Routing exists but nobody finds out they
   were routed to. An email or Slack message when an item is assigned to you, and a
   daily digest of overdue items per owner. This is the feature that makes the
   assignment field mean something. Three days.
3. **Customer thread view.** The detail page already shows a customer's history and
   now links between items; make it a proper thread — every message from that
   customer in one scroll, with the notes inline — so an agent reads the relationship,
   not one ticket. Two days.
4. **Summary on open, cached.** The AI summary is a button nobody will press twice. Run
   it when an item is first opened, store it on the row, show it above the message.
   Costs fractions of a cent per item on the small model. One day.
5. **Real inbound sources.** The channels are labels on seed data. Email forwarding to
   an inbox address is the first real one and the one every support team already
   has. Three days for email; app store and chat are integrations for later.
6. **Make the CSV export worth keeping.** It exists, people will use it, and it was the
   riskiest feature in the app (it's how private notes leaked) — so improve it rather
   than cut it. Export what's on screen (current filter, search and sort, not always
   everything), let the user pick columns, add the notes as separate rows instead of a
   `|`-joined blob, and put a date range on it. Then it becomes the manager's weekly
   report instead of a data dump. One day.

## Cut

- **Health score.** A number with no source and no definition. Either it comes from a
  real system (billing, product usage) or it's decoration. Remove until it has one.
- **The metrics strip as it stands.** Four global counts are a manager's view, not an
  agent's. Fold into "my queue" (my open, my overdue) and give managers their own page
  later if they ask.
- **Priority as four free levels.** Low/normal/high/urgent with no rules is a field
  people set once and never revisit. Keep urgent as a flag; drop the rest until there's
  an SLA to attach them to.

## What I'd want to know before committing

Whether the team works from a shared queue or owns customers; whether managers need
their own view or just the digest; and whether there is an existing identity provider,
because SSO changes the auth roadmap entirely and removes the password handling I'd
otherwise have to keep hardening.
