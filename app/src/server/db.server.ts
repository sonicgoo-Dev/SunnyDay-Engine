// The app's one database connection and its checked settings, made on
// first use. Server only: the ".server" in the name keeps it out of the
// browser's bundle. Kept on globalThis because the built server holds this
// file twice (once for startup, once for the pages); both must share one
// connection pool, not open two.
import { openDb, readSettings, type OpenDb, type Settings } from '@sunnyday/shared'

type Server = { settings: Settings; open: OpenDb }
type Shared = { server?: Server; ready: boolean }

const KEY = Symbol.for('sunnyday.server')
const shared = ((globalThis as Record<symbol, unknown>)[KEY] ??= { ready: false }) as Shared

export function getServer(): Server {
  if (shared.server) return shared.server
  const settings = readSettings()
  shared.server = { settings, open: openDb(settings.DATABASE_URL) }
  return shared.server
}

export const getDb = () => getServer().open.db
export const getSettings = () => getServer().settings

/** True once startup has finished. /healthz says "starting" until then, so the host sends no visitors early. */
export const isReady = () => shared.ready
export const setReady = (ready: boolean) => {
  shared.ready = ready
}

export async function closeServer(): Promise<void> {
  const s = shared.server
  shared.server = undefined
  shared.ready = false
  if (s) await s.open.close()
}
