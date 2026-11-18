// The background worker. From Build 2 this is where the AI agents and
// scheduled jobs run, each in fair turns per workspace. In Build 1 it only
// proves it can start: it checks its settings, reaches the database,
// confirms the wall holds, and waits.
import { assertWallHolds, openDb, readDatabaseUrl } from '@sunnyday/shared'

async function main() {
  const { db, close } = openDb(readDatabaseUrl(), 2)
  await assertWallHolds(db)
  console.log('[worker] SunnyDay worker is ready. No jobs exist yet (Build 2).')

  // Stay alive quietly; stop cleanly when the host says so.
  const idle = setInterval(() => {}, 60_000)
  const stop = async () => {
    clearInterval(idle)
    await close()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main().catch((err) => {
  console.error('[worker] could not start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
