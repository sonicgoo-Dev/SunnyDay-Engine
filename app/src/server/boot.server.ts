// What happens at startup, in order. If any step fails the process stops
// with a plain message that names what to fix (and never prints a secret),
// so the host shows the reason and tries again.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Sentry from '@sentry/node'
import { MIGRATIONS_FOLDER, assertWallHolds, runMigrations, seedFirstInvites } from '@sunnyday/shared'
import { closeServer, getServer, setReady } from './db.server'

// The build copies shared/drizzle beside the bundled server (scripts/copy-migrations.mjs).
const migrationFolders = () => [
  fileURLToPath(new URL('./drizzle', import.meta.url)),
  join(process.cwd(), 'app', '.output', 'server', 'drizzle'),
  join(process.cwd(), 'shared', 'drizzle'),
  MIGRATIONS_FOLDER,
]

export async function boot(): Promise<() => Promise<void>> {
  try {
    const { settings, open } = getServer()
    if (settings.SENTRY_DSN) Sentry.init({ dsn: settings.SENTRY_DSN })
    // Rule 1: never run as a database user the wall does not apply to.
    await assertWallHolds(open.db)
    await runMigrations(open.db, migrationFolders())
    const bad = await seedFirstInvites(open.db, settings.FIRST_INVITES)
    if (bad.length) console.warn(`[boot] FIRST_INVITES holds ${bad.length} entr${bad.length === 1 ? 'y that is' : 'ies that are'} not an email address; skipped.`)
    setReady(true)
    console.log('[boot] SunnyDay is ready.')
  } catch (err) {
    console.error('[boot] SunnyDay could not start:', err instanceof Error ? err.message : err)
    Sentry.captureException(err)
    await Sentry.flush(2000).catch(() => {})
    process.exit(1)
  }
  return async () => {
    await closeServer()
  }
}
