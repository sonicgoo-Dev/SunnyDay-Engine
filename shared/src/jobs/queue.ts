// The worker's to-do list. Jobs wait in core.job; the worker takes one at
// a time, always from the workspace that has waited longest, so every
// agent gets a fair turn however much one of them has queued.
import { and, eq, lt, sql } from 'drizzle-orm'
import type { Db, Query } from '../db/client.js'
import { job, workspace } from '../db/schema/index.js'

export type JobPayload = Record<string, string | number | boolean | null>
export type Job = typeof job.$inferSelect
export type NewJob = { workspaceId: string; kind: string; payload?: JobPayload; dedupe?: string; runAt?: Date }

/** Adds a job. With a dedupe key, a second one while the first still waits or runs is quietly not added. */
export async function enqueue(db: Query, j: NewJob): Promise<void> {
  await db
    .insert(job)
    .values({ workspaceId: j.workspaceId, kind: j.kind, payload: j.payload ?? {}, dedupe: j.dedupe ?? null, runAt: j.runAt ?? new Date() })
    .onConflictDoNothing()
}

/** Takes the next due job, from the workspace that has waited longest. Null when nothing is due. */
export async function claimNext(db: Db): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute<{ id: number }>(sql`
      select j.id from core.job j join core.workspace w on w.id = j.workspace_id
      where j.status = 'queued' and j.run_at <= now()
      order by w.last_turn_at asc nulls first, j.run_at asc, j.id asc
      limit 1 for update of j skip locked`)
    const id = picked.rows[0]?.id
    if (id === undefined) return null
    const [taken] = await tx
      .update(job)
      .set({ status: 'running', lockedAt: sql`now()`, attempts: sql`${job.attempts} + 1` })
      .where(eq(job.id, Number(id)))
      .returning()
    if (!taken) return null
    await tx.update(workspace).set({ lastTurnAt: sql`clock_timestamp()` }).where(eq(workspace.id, taken.workspaceId))
    return taken
  })
}

export async function finish(db: Query, id: number): Promise<void> {
  await db.update(job).set({ status: 'done', finishedAt: sql`now()`, lockedAt: null, lastError: null }).where(eq(job.id, id))
}

const MAX_ATTEMPTS = 5

/**
 * Records a failure. The job is tried again later, waiting longer each
 * time, and given up on after five tries. The message kept is a short
 * plain reason, never a customer's words.
 */
export async function fail(db: Query, j: Pick<Job, 'id' | 'attempts'>, reason: string): Promise<'retry' | 'gave_up'> {
  const giveUp = j.attempts >= MAX_ATTEMPTS
  const waitMinutes = Math.min(60, 2 ** j.attempts)
  await db
    .update(job)
    .set(
      giveUp
        ? { status: 'failed', finishedAt: sql`now()`, lockedAt: null, lastError: reason.slice(0, 300) }
        : { status: 'queued', lockedAt: null, lastError: reason.slice(0, 300), runAt: sql`now() + make_interval(mins => ${waitMinutes})` },
    )
    .where(eq(job.id, j.id))
  return giveUp ? 'gave_up' : 'retry'
}

/** A job left "running" by a worker that stopped mid-way goes back in the line. Returns how many. */
export async function requeueStale(db: Query, olderThanMinutes = 10): Promise<number> {
  const back = await db
    .update(job)
    .set({ status: 'queued', lockedAt: null })
    .where(and(eq(job.status, 'running'), lt(job.lockedAt, sql`now() - make_interval(mins => ${olderThanMinutes})`)))
    .returning({ id: job.id })
  return back.length
}

/** Finished jobs are only a record; a week of them is plenty. */
export async function tidyFinished(db: Query): Promise<void> {
  await db.delete(job).where(and(eq(job.status, 'done'), lt(job.finishedAt, sql`now() - interval '7 days'`)))
}
