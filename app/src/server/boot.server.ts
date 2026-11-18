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

/** What went wrong, without the query's values: a failed query's own message can carry email addresses. */
function plainReason(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error'
  if (err.message.startsWith('Failed query')) return err.cause instanceof Error ? err.cause.message : 'the database refused a query'
  return err.message
}

export async function boot(): Promise<() => Promise<void>> {
  let step = 'reading the settings'
  try {
    const { settings, open } = getServer()
    // Error reports never carry what a person typed (a mailbox password), an address's
    // query (Google's one-time code) or cookies.
    if (settings.SENTRY_DSN) Sentry.init({ dsn: settings.SENTRY_DSN, dataCollection: { httpBodies: [], urlQueryParams: false, cookies: false, stackFrameVariables: false } })
    // Rule 1: never run as a database user the wall does not apply to.
    step = 'checking the wall between workspaces'
    await assertWallHolds(open.db)
    step = 'applying table changes'
    await runMigrations(open.db, migrationFolders())
    step = 'adding the first invitations'
    const bad = await seedFirstInvites(open.db, settings.FIRST_INVITES)
    if (bad.length) console.warn(`[boot] FIRST_INVITES holds ${bad.length} entr${bad.length === 1 ? 'y that is' : 'ies that are'} not an email address; skipped.`)
    setReady(true)
    console.log('[boot] SunnyDay is ready.')
  } catch (err) {
    const message = `SunnyDay could not start while ${step}: ${plainReason(err)}`
    console.error(`[boot] ${message}`)
    Sentry.captureException(new Error(message))
    await Sentry.flush(2000).catch(() => {})
    process.exit(1)
  }
  return async () => {
    await closeServer()
  }
}
