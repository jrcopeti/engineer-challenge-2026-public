import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config'
import { applySchema } from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'pulse.db')

export const db = new Database(config.dbPath || DEFAULT_DB_PATH)
if (config.dbPath !== ':memory:') {
  db.pragma('journal_mode = WAL')
}
applySchema(db)
