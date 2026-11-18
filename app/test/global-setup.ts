// Before the app's tests: an empty test database with every table change applied.
import { sql } from 'drizzle-orm'
import { openDb, runMigrations } from '@sunnyday/shared'

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://sunnyday_owner:dev@localhost:5432/sunnyday_test'

export default async function setup() {
  const { db, close } = openDb(TEST_DATABASE_URL, 2)
  try {
    for (const s of ['ws', 'core', 'auth', 'drizzle']) await db.execute(sql.raw(`drop schema if exists ${s} cascade`))
    await runMigrations(db)
  } finally {
    await close()
  }
}
