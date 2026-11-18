// One pass of the worker against a pretend mail server: jobs are done in
// fair turns, a read is planned again, and a failure never stops the rest.
import { eq } from 'drizzle-orm'
import { ImapSignInRefused, enqueue, job, listMailboxes, openDb, runMigrations, saveImapConnection, workspace, type ImapReader, type WorkerSettings } from '@sunnyday/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keepHouse, workDueJobs } from '../src/run.js'

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://sunnyday_owner:dev@localhost:5432/sunnyday_test'
const { db, close } = openDb(URL, 4)
const KEY = 'w'.repeat(40)
const settings: WorkerSettings = { DATABASE_URL: URL, SENTRY_DSN: '', CONNECTION_KEY: KEY, SIGNIN_GOOGLE_CLIENT_ID: 'id', SIGNIN_GOOGLE_CLIENT_SECRET: 'secret' }
const wayIn = { host: 'imap.example.com', port: 993 as const, user: 'x@example.com', pass: 'good' }

let behave: 'fine' | 'broken' | 'locked_out' = 'fine'
const imap: ImapReader = async (_w, cursor) => {
  if (behave === 'broken') throw new Error('the mail server hung up')
  if (behave === 'locked_out') throw new ImapSignInRefused()
  const next = (cursor.lastUid ?? 0) + 1
  return {
    uidValidity: '1',
    lastUid: next,
    more: false,
    messages: [{ providerId: `1:${next}`, threadId: null, direction: 'in', fromName: null, fromEmail: 'a@example.com', toLine: null, subject: 'Hello', excerpt: null, sentAt: new Date() }],
  }
}
const deps = { db, settings, fetch, imap }
let a = ''
let b = ''

beforeAll(async () => {
  await runMigrations(db)
  await db.delete(job)
  const made = await db.insert(workspace).values([{ name: 'Worker A' }, { name: 'Worker B' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
})
afterAll(close)

describe('the worker', () => {
  it('reads each connected mailbox, then plans the next read a few minutes on', async () => {
    const boxA = await saveImapConnection({ db, connectionKey: KEY, imap }, a, 'a@example.com', wayIn)
    await saveImapConnection({ db, connectionKey: KEY, imap }, b, 'b@example.com', wayIn)
    expect(await workDueJobs(deps)).toEqual({ done: 2, failed: 0 })
    expect((await listMailboxes(db, a))[0]!.lastReadAt).toBeInstanceOf(Date)
    const next = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(next).toHaveLength(2)
    expect(next.every((j) => j.runAt.getTime() > Date.now() + 4 * 60_000)).toBe(true)
    expect(next.find((j) => j.workspaceId === a)!.payload).toEqual({ mailboxId: boxA })
    // Nothing is due yet, so a second pass does nothing.
    expect(await workDueJobs(deps)).toEqual({ done: 0, failed: 0 })
  })

  it('a mailbox that fails is tried again later, and the other workspace is still served', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    behave = 'broken'
    const lines: string[] = []
    expect(await workDueJobs({ ...deps, log: (l) => lines.push(l) })).toEqual({ done: 0, failed: 2 })
    expect(lines.join('\n')).toMatch(/will be tried again/)
    // The log names the kind of failure, never an address or a subject.
    expect(lines.join('\n')).not.toMatch(/@example\.com|Hello/)
    const waiting = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(waiting).toHaveLength(2)
    behave = 'fine'
  })

  it('a mailbox whose password stopped working is marked, and not read again until reconnected', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    behave = 'locked_out'
    expect(await workDueJobs(deps)).toEqual({ done: 2, failed: 0 })
    expect((await listMailboxes(db, a))[0]).toMatchObject({ status: 'needs_reconnect' })
    expect(await db.select().from(job).where(eq(job.status, 'queued'))).toHaveLength(0)
    behave = 'fine'
  })

  it('housekeeping gives a connected mailbox its read back if the job was lost', async () => {
    await saveImapConnection({ db, connectionKey: KEY, imap }, a, 'a@example.com', wayIn)
    await db.delete(job)
    await keepHouse(deps)
    const queued = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(queued.map((j) => j.workspaceId)).toEqual([a])
  })

  it('without the key it refuses to read rather than guess', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    expect(await workDueJobs({ ...deps, settings: { ...settings, CONNECTION_KEY: '' } })).toEqual({ done: 0, failed: 1 })
  })

  it('an unknown kind of job is refused, not ignored', async () => {
    await db.delete(job)
    await enqueue(db, { workspaceId: a, kind: 'no.such.thing' })
    expect(await workDueJobs(deps)).toEqual({ done: 0, failed: 1 })
  })
})
