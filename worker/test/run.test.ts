// One pass of the worker against a pretend mail server: jobs are done in
// fair turns, a read is planned again, and a failure never stops the rest.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, ne } from 'drizzle-orm'
import {
  GoogleBusy,
  ImapSignInRefused,
  UNSURE,
  contact,
  enqueue,
  inWorkspace,
  job,
  listMailboxes,
  listPerson,
  listStatus,
  openDb,
  runMigrations,
  saveImapConnection,
  startYear,
  workspace,
  type ImapReader,
  type ImapTextReader,
  type ImapWindowReader,
  type Thinker,
  type WorkerSettings,
} from '@sunnyday/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keepHouse, workDueJobs } from '../src/run.js'

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://sunnyday_owner:dev@localhost:5432/sunnyday_test'
const { db, close } = openDb(URL, 4)
const KEY = 'w'.repeat(40)
const settings: WorkerSettings = { DATABASE_URL: URL, SENTRY_DSN: '', CONNECTION_KEY: KEY, SIGNIN_GOOGLE_CLIENT_ID: 'id', SIGNIN_GOOGLE_CLIENT_SECRET: 'secret', ANTHROPIC_API_KEY: '' }
const wayIn = { host: 'imap.example.com', port: 993 as const, user: 'x@example.com', pass: 'good' }

let behave: 'fine' | 'broken' | 'locked_out' | 'busy' = 'fine'
const imap: ImapReader = async (_w, cursor, opts) => {
  // This pretend server keeps no sent folder.
  if (opts.folder === 'sent') return { uidValidity: '', lastUid: 0, more: false, messages: [] }
  if (behave === 'broken') throw new Error('the mail server hung up')
  if (behave === 'busy') throw new GoogleBusy('reading the mailbox', 403, 'userRateLimitExceeded')
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
    expect(await workDueJobs(deps)).toEqual({ done: 2, failed: 0, waited: 0 })
    expect((await listMailboxes(db, a))[0]!.lastReadAt).toBeInstanceOf(Date)
    const next = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(next).toHaveLength(2)
    expect(next.every((j) => j.runAt.getTime() > Date.now() + 4 * 60_000)).toBe(true)
    expect(next.find((j) => j.workspaceId === a)!.payload).toEqual({ mailboxId: boxA })
    // Nothing is due yet, so a second pass does nothing.
    expect(await workDueJobs(deps)).toEqual({ done: 0, failed: 0, waited: 0 })
  })

  it('a mailbox that fails is tried again later, and the other workspace is still served', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    behave = 'broken'
    const lines: string[] = []
    expect(await workDueJobs({ ...deps, log: (l) => lines.push(l) })).toEqual({ done: 0, failed: 2, waited: 0 })
    expect(lines.join('\n')).toMatch(/will be tried again/)
    // The log names the kind of failure, never an address or a subject.
    expect(lines.join('\n')).not.toMatch(/@example\.com|Hello/)
    const waiting = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(waiting).toHaveLength(2)
    behave = 'fine'
  })

  it('a mailbox that keeps failing says so in Settings, keeps being tried, and recovers', async () => {
    behave = 'broken'
    // Five tries in all (one was used by the test above), then it is given up on.
    for (let i = 0; i < 4; i++) {
      await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
      await workDueJobs(deps)
    }
    const [box] = await listMailboxes(db, a)
    expect(box).toMatchObject({ status: 'connected', lastProblem: 'SunnyDay has not been able to read this mailbox lately. It keeps trying every hour.' })
    // Given up on, but a fresh read is waiting an hour on: the mailbox is never dropped for good.
    const waiting = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(waiting).toHaveLength(2)
    expect(waiting.every((j) => j.runAt.getTime() > Date.now() + 50 * 60_000)).toBe(true)
    behave = 'fine'
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    await workDueJobs(deps)
    expect((await listMailboxes(db, a))[0]!.lastProblem).toBeNull()
  })

  it('"slow down" from Google is a wait, never a failure: however often it happens, the mailbox is not given up on', async () => {
    behave = 'busy'
    const lines: string[] = []
    for (let i = 0; i < 8; i++) {
      await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
      expect(await workDueJobs({ ...deps, log: (l) => lines.push(l) })).toEqual({ done: 0, failed: 0, waited: 2 })
    }
    const waiting = await db.select().from(job).where(eq(job.status, 'queued'))
    expect(waiting).toHaveLength(2)
    // Not one try was counted, and each waits about five minutes.
    expect(waiting.every((j) => j.attempts === 0)).toBe(true)
    expect(waiting.every((j) => j.runAt.getTime() > Date.now() + 4 * 60_000 && j.runAt.getTime() < Date.now() + 6 * 60_000)).toBe(true)
    expect((await listMailboxes(db, a))[0]).toMatchObject({ status: 'connected', lastProblem: null })
    expect(lines[0]).toMatch(/Google asked SunnyDay to slow down; waiting 5 minutes.*reason userRateLimitExceeded/)
    behave = 'fine'
  })

  it('a mailbox whose password stopped working is marked, and not read again until reconnected', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    behave = 'locked_out'
    expect(await workDueJobs(deps)).toEqual({ done: 2, failed: 0, waited: 0 })
    expect((await listMailboxes(db, a))[0]).toMatchObject({ status: 'needs_reconnect' })
    expect(await db.select().from(job).where(eq(job.status, 'queued'))).toHaveLength(0)
    behave = 'fine'
  })

  it('housekeeping gives a connected mailbox its read back if the job was lost', async () => {
    await saveImapConnection({ db, connectionKey: KEY, imap }, a, 'a@example.com', wayIn)
    await db.delete(job)
    await keepHouse(deps)
    // The test database also holds workspaces made by other test files; only ours are looked at.
    const queued = (await db.select().from(job).where(eq(job.status, 'queued'))).filter((j) => [a, b].includes(j.workspaceId))
    expect(queued.map((j) => j.workspaceId)).toEqual([a])
    await db.delete(job).where(ne(job.workspaceId, a))
  })

  it('without the key it refuses to read rather than guess', async () => {
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    expect(await workDueJobs({ ...deps, settings: { ...settings, CONNECTION_KEY: '' } })).toEqual({ done: 0, failed: 1, waited: 0 })
  })

  it('an unknown kind of job is refused, not ignored', async () => {
    await db.delete(job)
    await enqueue(db, { workspaceId: a, kind: 'no.such.thing' })
    expect(await workDueJobs(deps)).toEqual({ done: 0, failed: 1, waited: 0 })
  })
})

describe('the worker and List Builder', () => {
  let c = ''
  const SECRET_WORDS = 'We may list the house in spring'
  const imapWindow: ImapWindowReader = async (_w, w) => {
    if (w.folder === 'sent') return { lastUid: w.afterUid, more: false, messages: [] }
    const uids = [1, 2, 3].filter((u) => u > w.afterUid).slice(0, 2)
    return {
      lastUid: uids.at(-1) ?? w.afterUid,
      more: uids.length === 2 && uids.at(-1) !== 3,
      messages: uids.map((uid) => ({
        bulk: uid === 3,
        summary: { providerId: `1:${uid}`, threadId: null, direction: 'in' as const, fromName: uid === 3 ? 'A Newsletter' : 'Quinn Old', fromEmail: uid === 3 ? 'news@example.org' : 'quinn@example.com', toLine: 'c@example.com', subject: 'Hello', excerpt: null, sentAt: new Date(Date.now() - uid * 86_400_000) },
      })),
    }
  }
  const imapTexts: ImapTextReader = async (_w, ids) => new Map(ids.map((id) => [id, SECRET_WORDS]))
  let aiWorks = true
  const asked: string[] = []
  const thinker: Thinker = async (input) => {
    if (!aiWorks) throw Object.assign(new Error(`could not process: ${input.messages[0]?.text}`), { status: 529 })
    asked.push(input.addresses[0] ?? '')
    return { result: { ...UNSURE, kind: 'lead', side: 'seller', sure: 'high', why: 'Thinking of selling.' }, costDollars: 0.001 }
  }
  const untilQuiet = async (d: Parameters<typeof workDueJobs>[0]) => {
    for (let i = 0; i < 20; i++) {
      const r = await workDueJobs(d)
      if (r.done + r.failed === 0) return
    }
  }

  beforeAll(async () => {
    await db.delete(job)
    c = (await db.insert(workspace).values({ name: 'Worker C' }).returning({ id: workspace.id }))[0]!.id
    await saveImapConnection({ db, connectionKey: KEY, imap }, c, 'c@example.com', wayIn)
    await db.delete(job)
  })

  it('with no AI key it reads and sorts a year, then waits and says so; nothing is a contact', async () => {
    await startYear(db, c, null)
    await untilQuiet({ ...deps, imapWindow, imapTexts, thinker: null })
    const status = await listStatus(db, c)
    expect(status.run).toMatchObject({ year: 1, status: 'paused', pausedWhy: 'not_ready', messagesRead: 3, toLook: 1, looked: 0 })
    expect(status.notContacts).toBe(1)
    expect(await db.select().from(job).where(eq(job.status, 'queued'))).toHaveLength(0)
  })

  it('once the AI is switched on, housekeeping carries the year on to ready', async () => {
    await keepHouse({ ...deps, imapWindow, imapTexts, thinker })
    await db.delete(job).where(ne(job.workspaceId, c))
    aiWorks = false
    const lines: string[] = []
    await workDueJobs({ ...deps, imapWindow, imapTexts, thinker, log: (l) => lines.push(l) })
    // The AI failing is logged as a kind of failure only: never a word of anyone's mail.
    expect(lines.join('\n')).toMatch(/the AI did not answer \(status 529\)/)
    expect(lines.join('\n')).not.toContain('list the house')
    expect(JSON.stringify(await db.select().from(job))).not.toContain('list the house')
    aiWorks = true
    await db.update(job).set({ runAt: new Date() }).where(eq(job.status, 'queued'))
    await untilQuiet({ ...deps, imapWindow, imapTexts, thinker })
    expect(asked).toEqual(['quinn@example.com'])
    expect(await listStatus(db, c)).toMatchObject({ cards: 1, run: { status: 'ready', looked: 1 } })
    // The worker can read, sort and propose. It cannot make a contact: only her answer does.
    expect(await inWorkspace(db, c, (tx) => tx.select().from(contact))).toEqual([])
    expect(await inWorkspace(db, c, (tx) => tx.select({ state: listPerson.state }).from(listPerson).where(eq(listPerson.state, 'yes')))).toEqual([])
  })

  it('holds no way to answer for her', () => {
    const run = readFileSync(fileURLToPath(new globalThis.URL('../src/run.ts', import.meta.url)), 'utf8') + readFileSync(fileURLToPath(new globalThis.URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(run).not.toMatch(/sayYes|yesToAll|addTicked|keepDetails|addContact|pullOut|sayNo/)
  })
})
