// The only way to touch a customer's data (rule 1). Everything inside the
// callback runs in one transaction that carries the workspace number; the
// database's own policy then shows and accepts rows for that workspace
// only. Outside this function the "ws" tables look empty and refuse writes.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from './client.js'

const uuid = z.string().uuid()

export type InWorkspace = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function inWorkspace<T>(db: Db, workspaceId: string, work: (tx: InWorkspace) => Promise<T>): Promise<T> {
  const id = uuid.parse(workspaceId)
  return db.transaction(async (tx) => {
    // "true" = for this transaction only; a pooled connection never keeps it.
    await tx.execute(sql`select set_config('app.workspace_id', ${id}, true)`)
    return work(tx)
  })
}
