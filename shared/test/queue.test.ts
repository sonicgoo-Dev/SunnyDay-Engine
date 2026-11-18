import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { job, workspace } from '../src/db/schema/index.js'
import { claimNext, enqueue, fail, finish, requeueStale } from '../src/jobs/queue.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
let a = ''
let b = ''
beforeAll(async () => {
  await db.delete(job)
  const made = await db.insert(workspace).values([{ name: 'Busy agent' }, { name: 'Quiet agent' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
})
afterAll(close)

describe('the job list', () => {
  it('gives every workspace a fair turn, however much one of them has queued', async () => {
    for (let i = 0; i < 4; i++) await enqueue(db, { workspaceId: a, kind: 'test.fair', payload: { n: i } })
    await enqueue(db, { workspaceId: b, kind: 'test.fair', payload: { n: 99 } })
    const order: string[] = []
    for (;;) {
      const j = await claimNext(db)
      if (!j) break
      order.push(j.workspaceId === a ? 'busy' : 'quiet')
      await finish(db, j.id)
    }
    // The quiet agent's one job is done second, not fifth.
    expect(order).toEqual(['busy', 'quiet', 'busy', 'busy', 'busy'])
  })

  it('a job is not taken before its time, and never by two workers at once', async () => {
    await enqueue(db, { workspaceId: a, kind: 'test.later', runAt: new Date(Date.now() + 3_600_000) })
    expect(await claimNext(db)).toBeNull()
    await db.delete(job).where(eq(job.kind, 'test.later'))
    await enqueue(db, { workspaceId: a, kind: 'test.once' })
    const taken = await Promise.all([claimNext(db), claimNext(db), claimNext(db)])
    expect(taken.filter(Boolean)).toHaveLength(1)
    await finish(db, taken.find(Boolean)!.id)
  })

  it('two waiting jobs with the same key are one job; a new one is allowed once it is done', async () => {
    await enqueue(db, { workspaceId: a, kind: 'test.dedupe', dedupe: 'box-1' })
    await enqueue(db, { workspaceId: a, kind: 'test.dedupe', dedupe: 'box-1' })
    const waiting = await db.select().from(job).where(eq(job.kind, 'test.dedupe'))
    expect(waiting).toHaveLength(1)
    const j = await claimNext(db)
    await enqueue(db, { workspaceId: a, kind: 'test.dedupe', dedupe: 'box-1' })
    expect(await db.select().from(job).where(eq(job.kind, 'test.dedupe'))).toHaveLength(1)
    await finish(db, j!.id)
    await enqueue(db, { workspaceId: a, kind: 'test.dedupe', dedupe: 'box-1' })
    expect(await db.select().from(job).where(eq(job.kind, 'test.dedupe'))).toHaveLength(2)
    await db.delete(job).where(eq(job.kind, 'test.dedupe'))
  })

  it('a failed job is tried again later, and given up on after five tries', async () => {
    await enqueue(db, { workspaceId: a, kind: 'test.fail' })
    let outcome = ''
    for (let i = 0; i < 5; i++) {
      await db.update(job).set({ runAt: sql`now()` }).where(eq(job.kind, 'test.fail'))
      const j = await claimNext(db)
      outcome = await fail(db, j!, 'it broke')
      if (i === 0) {
        const [row] = await db.select().from(job).where(eq(job.id, j!.id))
        expect(row).toMatchObject({ status: 'queued', lastError: 'it broke' })
        expect(row!.runAt.getTime()).toBeGreaterThan(Date.now() + 60_000)
      }
    }
    expect(outcome).toBe('gave_up')
    const [row] = await db.select().from(job).where(eq(job.kind, 'test.fail'))
    expect(row!.status).toBe('failed')
  })

  it('a job left running by a worker that stopped goes back in the line', async () => {
    await enqueue(db, { workspaceId: b, kind: 'test.stale' })
    const j = await claimNext(db)
    expect(await requeueStale(db)).toBe(0)
    await db.update(job).set({ lockedAt: sql`now() - interval '11 minutes'` }).where(eq(job.id, j!.id))
    expect(await requeueStale(db)).toBe(1)
    expect((await claimNext(db))!.id).toBe(j!.id)
  })
})
