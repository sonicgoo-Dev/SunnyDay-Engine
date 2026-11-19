// The background worker: one process that works through the job list,
// giving every workspace a fair turn. Its jobs: reading a connected mailbox
// (Build 2), and List Builder's reading, sorting and AI look (Build 4). Exactly one worker runs; the job list is
// built so a second would be safe, but there is no need for one.
import * as Sentry from '@sentry/node'
import { assertWallHolds, claudeThinker, openDb, readWorkerSettings } from '@sunnyday/shared'
import { keepHouse, workDueJobs, type WorkerDeps } from './run.js'

const PAUSE_MS = 5_000
const HOUSEKEEPING_EVERY_MS = 10 * 60_000

async function main() {
  const settings = readWorkerSettings()
  if (settings.SENTRY_DSN) Sentry.init({ dsn: settings.SENTRY_DSN, dataCollection: { httpBodies: [], urlQueryParams: false, cookies: false, stackFrameVariables: false } })
  const { db, close } = openDb(settings.DATABASE_URL, 4)
  await assertWallHolds(db)
  // The Claude key lives only here, in the worker's settings (rule 7). Without it List Builder reads and sorts, then waits.
  const thinker = settings.ANTHROPIC_API_KEY ? claudeThinker(settings.ANTHROPIC_API_KEY) : null
  const deps: WorkerDeps = { db, settings, fetch, thinker, log: (line) => console.log(line) }
  if (!thinker) console.warn('[worker] ANTHROPIC_API_KEY is not set: List Builder reads and sorts mail, but its AI is not switched on.')
  if (!settings.CONNECTION_KEY) console.warn('[worker] CONNECTION_KEY is not set: the worker runs, but no mailbox can be read.')
  console.log('[worker] SunnyDay worker is ready.')

  let stopping = false
  let timer: NodeJS.Timeout | undefined
  let lastHousekeeping = 0

  const pass = async () => {
    try {
      if (Date.now() - lastHousekeeping > HOUSEKEEPING_EVERY_MS) {
        await keepHouse(deps)
        lastHousekeeping = Date.now()
      }
      await workDueJobs(deps)
    } catch (err) {
      // One bad pass (the database restarting, say) never stops the worker.
      console.error('[worker] a pass did not finish:', err instanceof Error ? err.name : 'unknown error')
      Sentry.captureException(err)
    }
    // The next pass is planned only when this one has ended, so two never overlap.
    if (!stopping) timer = setTimeout(pass, PAUSE_MS)
  }

  const stop = async () => {
    stopping = true
    clearTimeout(timer)
    await close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  void pass()
}

main().catch((err) => {
  console.error('[worker] could not start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
