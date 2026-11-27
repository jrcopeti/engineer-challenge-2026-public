import type { Database } from 'better-sqlite3'

// Kept as a TS string (not a .sql file) so it survives `tsc` without a copy step.
// No migration tooling yet: the schema is applied with IF NOT EXISTS on boot and the
// seed drops everything first. See KNOWN-ISSUES for the migration story.
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    health_score INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assignee_id INTEGER REFERENCES users(id),
    due_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_customer ON feedback(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_assignee ON feedback(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_notes_feedback ON feedback_notes(feedback_id, created_at DESC);
`

export function applySchema(db: Database) {
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
}

export function dropAllTables(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS feedback_notes;
    DROP TABLE IF EXISTS feedback;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS users;
  `)
}
