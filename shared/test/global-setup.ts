// Before the tests: empty the test database and apply every table change,
// exactly as a new hosted database would get them.
import { sql } from 'drizzle-orm'
import { runMigrations } from '../src/db/migrate.js'
import { openTestDb } from './db.js'

export default async function setup() {
  const { db, close } = openTestDb()
  try {
    await db.execute(sql`drop schema if exists ws cascade`)
    await db.execute(sql`drop schema if exists core cascade`)
    await db.execute(sql`drop schema if exists auth cascade`)
    await db.execute(sql`drop schema if exists drizzle cascade`)
    await runMigrations(db)
  } finally {
    await close()
  }
}
