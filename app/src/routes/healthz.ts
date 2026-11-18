// The host asks this address whether the app is alive. It answers "ok"
// only when the database answers too. Says nothing else.
import { sql } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'
import { getDb, isReady } from '@/server/db.server'

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: async () => {
        if (!isReady()) return new Response('starting', { status: 503, headers: { 'cache-control': 'no-store' } })
        try {
          await getDb().execute(sql`select 1`)
          return new Response('ok', { headers: { 'cache-control': 'no-store' } })
        } catch {
          return new Response('database not answering', { status: 503, headers: { 'cache-control': 'no-store' } })
        }
      },
    },
  },
})
