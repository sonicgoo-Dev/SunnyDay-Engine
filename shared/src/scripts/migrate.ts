// npm run db:migrate — applies table changes to the database in DATABASE_URL.
import { openDb } from '../db/client.js'
import { runMigrations } from '../db/migrate.js'
import { readDatabaseUrl } from '../env.js'

const { db, close } = openDb(readDatabaseUrl(), 1)
try {
  await runMigrations(db)
  console.log('Table changes are up to date.')
} finally {
  await close()
}
