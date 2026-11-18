import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.js'

/** The folder of table changes beside this package: right for tests, scripts and the worker. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

const holdsChanges = (folder: string) => existsSync(join(folder, 'meta', '_journal.json'))

/**
 * Applies every table change not yet applied. Safe to run on every start.
 * The app is bundled into one file, so it passes the places its copy of the
 * folder may be; the first that holds the table changes is used.
 */
export async function runMigrations(db: Db, folders: string[] = [MIGRATIONS_FOLDER]): Promise<void> {
  const folder = folders.find(holdsChanges)
  if (!folder) throw new Error('The folder of table changes was not found. The build did not copy shared/drizzle beside the server.')
  await migrate(db, { migrationsFolder: folder })
}
