// The pace of reading Gmail, and what happens when Google says "slow
// down". Written after the first real List Builder run (Nov 18, 2026)
// read at Google's limit, was refused, lost each page it had fetched, and
// gave up on the mailbox with the year half read.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { job, listMail, listPerson, listRun, workspace } from '../src/db/schema/index.js'
import { inWorkspace } from '../src/db/workspace.js'
import { sayNo } from '../src/list/confirm.js'
import { PICK_UPS, giveUpOnPart, pickUpLeftOutMail, readRunPage, startYear, type ListDeps } from '../src/list/runs.js'
import { sortRun } from '../src/list/sort.js'
import { thinkBatch } from '../src/list/think.js'
import { UNSURE, type Thinker } from '../src/ai/claude.js'
import { GMAIL_PER_SECOND, gmailClock, messageTopLines } from '../src/mail/gmail.js'
import { GoogleBusy, GoogleError, type Fetch } from '../src/mail/google-token.js'
import { saveGmailConnection } from '../src/mail/mailboxes.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
const KEY = 'p'.repeat(40)
const google = { clientId: 'id', clientSecret: 'secret' }
const NOW = Date.UTC(2026, 10, 18, 12)
const daysAgo = (d: number) => NOW - d * 86_400_000
afterAll(close)

type Msg = { id: string; ms: number; from: string; to?: string; sent?: boolean; bulk?: boolean }
type Refusal = { status: number; reason?: string; retryAfter?: string }
/** A pretend Gmail. `refuse` decides, per request for one message, whether Google refuses it and how. */
function pretendGmail(box: Msg[], opts: { pageSize?: number; refuse?: (id: string, nth: number) => Refusal | null; forgetPlace?: boolean } = {}) {
  const asked: string[] = []
  const lists: string[] = []
  let nth = 0
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  const doFetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.host === 'oauth2.googleapis.com') return json({ access_token: `pass-${box.length}` })
    if (url.pathname.endsWith('/messages')) {
      const q = url.searchParams.get('q') ?? ''
      lists.push(`${q}|${url.searchParams.get('pageToken') ?? ''}`)
      if (opts.forgetPlace && url.searchParams.get('pageToken')) return json({ error: { code: 400, errors: [{ reason: 'invalidArgument' }] } }, 400)
      const after = Number(/after:(\d+)/.exec(q)?.[1] ?? 0) * 1000
      const before = Number(/before:(\d+)/.exec(q)?.[1] ?? 9e12) * 1000
      const all = box.filter((m) => m.ms >= after && m.ms < before).sort((x, y) => y.ms - x.ms)
      const size = opts.pageSize ?? 500
      const from = Number(url.searchParams.get('pageToken') ?? 0)
      return json({ messages: all.slice(from, from + size).map((m) => ({ id: m.id })), ...(from + size < all.length ? { nextPageToken: String(from + size) } : {}) })
    }
    const m = box.find((x) => url.pathname.endsWith(`/messages/${x.id}`))
    if (!m) return json({}, 404)
    const no = opts.refuse?.(m.id, nth++)
    if (no) return json({ error: { code: no.status, message: 'private words that must never be logged', errors: no.reason ? [{ reason: no.reason }] : [] } }, no.status, no.retryAfter ? { 'retry-after': no.retryAfter } : {})
    asked.push(m.id)
    const headers = [{ name: 'From', value: m.from }, { name: 'To', value: m.to ?? 'amy@example.com' }, { name: 'Subject', value: `About ${m.id}` }, ...(m.bulk ? [{ name: 'List-Id', value: 'news' }] : [])]
    return json({ id: m.id, threadId: `t-${m.id}`, labelIds: m.sent ? ['SENT'] : ['INBOX'], snippet: '', internalDate: String(m.ms), payload: { headers } })
  }) as Fetch
  return { doFetch, asked, lists }
}

describe('the pace of reading Gmail', () => {
  it('stays far below what Google allows for one mailbox', async () => {
    expect(GMAIL_PER_SECOND).toBeLessThanOrEqual(20)
    const g = pretendGmail(Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, ms: NOW - i, from: 'a@example.com' })))
    const began = gmailClock.now()
    // Asked for side by side, as List Builder does: they still go out one at a time, spaced.
    await Promise.all(Array.from({ length: 60 }, (_, i) => messageTopLines(g.doFetch, 'pace-token', `p${i}`)))
    const seconds = (gmailClock.now() - began) / 1000
    expect(seconds).toBeGreaterThanOrEqual(59 / GMAIL_PER_SECOND - 0.01)
  })

  it('one mailbox never slows another', async () => {
    const g = pretendGmail([{ id: 'solo', ms: NOW, from: 'a@example.com' }])
    const began = gmailClock.now()
    await messageTopLines(g.doFetch, 'another-mailbox-token', 'solo')
    expect(gmailClock.now() - began).toBeLessThan(1000)
  })
})

describe('when Google says "slow down"', () => {
  const one = [{ id: 'm', ms: NOW, from: 'a@example.com' }]

  it('the one request waits and is tried again; nothing fails', async () => {
    for (const refusal of [{ status: 403, reason: 'userRateLimitExceeded' }, { status: 403, reason: 'rateLimitExceeded' }, { status: 429 }, { status: 503 }]) {
      const g = pretendGmail(one, { refuse: (_id, nth) => (nth < 2 ? refusal : null) })
      const began = gmailClock.now()
      const got = await messageTopLines(g.doFetch, `t-${refusal.status}-${refusal.reason}`, 'm')
      expect(got.summary.providerId).toBe('m')
      // It waited: two seconds, then four.
      expect(gmailClock.now() - began).toBeGreaterThanOrEqual(6000)
    }
  })

  it('waits as long as Google asks, up to half a minute', async () => {
    const g = pretendGmail(one, { refuse: (_id, nth) => (nth < 1 ? { status: 429, retryAfter: '20' } : null) })
    const began = gmailClock.now()
    await messageTopLines(g.doFetch, 't-retry-after', 'm')
    expect(gmailClock.now() - began).toBeGreaterThanOrEqual(20_000)
    expect(gmailClock.now() - began).toBeLessThan(31_000)
  })

  it('if Google goes on saying it, that is "busy", not broken, and names Google’s reason and nothing else', async () => {
    const g = pretendGmail(one, { refuse: () => ({ status: 403, reason: 'userRateLimitExceeded' }) })
    const err = await messageTopLines(g.doFetch, 't-busy', 'm').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GoogleBusy)
    expect((err as GoogleBusy).reason).toBe('userRateLimitExceeded')
    expect(String(err)).toContain('reason userRateLimitExceeded')
    expect(String(err)).not.toContain('private words')
  })

  it('a refusal that is not about speed fails at once, with its reason', async () => {
    const g = pretendGmail(one, { refuse: () => ({ status: 403, reason: 'insufficientPermissions' }) })
    const began = gmailClock.now()
    const err = await messageTopLines(g.doFetch, 't-forbidden', 'm').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GoogleError)
    expect(err).not.toBeInstanceOf(GoogleBusy)
    expect((err as GoogleError).reason).toBe('insufficientPermissions')
    expect(gmailClock.now() - began).toBeLessThan(1000)
  })

  it('a reason that is not a plain code word is never kept', async () => {
    const g = pretendGmail(one, { refuse: () => ({ status: 403, reason: 'pat@example.com wrote: hello' }) })
    const err = (await messageTopLines(g.doFetch, 't-odd', 'm').catch((e: unknown) => e)) as GoogleError
    expect(err.reason).toBeNull()
    expect(String(err)).not.toContain('pat@example.com')
  })
})

// ---- A whole year, interrupted ------------------------------------------------

const AMY = 'amy@example.com'
/** 30 messages over the last year, newest first by number: n0 is yesterday, n29 is months ago. Three people and a newsletter. */
const year: Msg[] = Array.from({ length: 30 }, (_, i) => {
  const ms = daysAgo(1 + i * 10)
  if (i % 5 === 4) return { id: `n${i}`, ms, from: 'News <news@lists.example>', bulk: true }
  const who = i < 12 ? 'recent@example.com' : i < 22 ? 'middle@example.com' : 'early@example.com'
  return i % 2 ? { id: `n${i}`, ms, from: AMY, to: who, sent: true } : { id: `n${i}`, ms, from: `${who.split('@')[0]} Person <${who}>` }
})
const looked: string[] = []
const thinker: Thinker = async (input) => {
  looked.push(input.addresses[0] ?? '')
  return { result: { ...UNSURE, kind: 'client', side: 'buyer', sure: 'high', why: 'Working with you.' }, costDollars: 0.001 }
}

describe('a year whose reading is interrupted', () => {
  let ws = ''
  let boxId = ''
  let runId = ''
  const run = async () => (await inWorkspace(db, ws, (tx) => tx.select().from(listRun).where(eq(listRun.id, runId))))[0]!
  const kept = async () => (await inWorkspace(db, ws, (tx) => tx.select({ id: listMail.providerId }).from(listMail))).map((r) => r.id)
  const person = async (email: string) => (await inWorkspace(db, ws, (tx) => tx.select().from(listPerson))).find((p) => p.emails.includes(email))
  const depsWith = (fetch: Fetch): ListDeps => ({ db, connectionKey: KEY, google, fetch, thinker, now: () => new Date(NOW) })

  beforeAll(async () => {
    const [w] = await db.insert(workspace).values({ name: 'Pace' }).returning({ id: workspace.id })
    ws = w!.id
    boxId = await saveGmailConnection(db, KEY, ws, { address: AMY, refreshToken: 'x' })
    runId = (await startYear(db, ws, null, new Date(NOW))).runId
  })

  it('what was read before Google said "slow down" is kept, and the next turn reads only the rest', async () => {
    // Pages of 10. On the second page, the fourth message onward is refused for good.
    let refusing = true
    const g = pretendGmail(year, { pageSize: 10, refuse: (id) => (refusing && Number(id.slice(1)) >= 13 ? { status: 403, reason: 'userRateLimitExceeded' } : null) })
    const d = depsWith(g.doFetch)
    expect(await readRunPage(d, ws, runId, boxId)).toBe('more')
    await expect(readRunPage(d, ws, runId, boxId)).rejects.toBeInstanceOf(GoogleBusy)
    // The first page, and whatever of the second was saved before the refusal, are safe.
    expect((await run()).messagesRead).toBeGreaterThanOrEqual(10)
    const before = [...g.asked]
    refusing = false
    for (let i = 0; i < 10 && (await readRunPage(d, ws, runId, boxId)) === 'more'; i++);
    expect((await kept()).sort()).toEqual(year.map((m) => m.id).sort())
    expect((await run()).messagesRead).toBe(30)
    // Nothing kept the first time was asked for again.
    const again = g.asked.slice(before.length)
    const keptFirst = before.filter((id) => Number(id.slice(1)) < 10)
    expect(again.filter((id) => keptFirst.includes(id))).toEqual([])
  })
})

describe('a mailbox set aside part-way through a year', () => {
  let ws = ''
  let boxId = ''
  let runId = ''
  const run = async () => (await inWorkspace(db, ws, (tx) => tx.select().from(listRun).where(eq(listRun.id, runId))))[0]!
  const person = async (email: string) => (await inWorkspace(db, ws, (tx) => tx.select().from(listPerson))).find((p) => p.emails.includes(email))
  const depsWith = (fetch: Fetch): ListDeps => ({ db, connectionKey: KEY, google, fetch, thinker, now: () => new Date(NOW) })
  const think = async (d: ListDeps) => {
    let out = await thinkBatch(d, ws, runId, 2)
    for (let i = 0; i < 20 && out === 'more'; i++) out = await thinkBatch(d, ws, runId, 2)
    return out
  }

  beforeAll(async () => {
    const [w] = await db.insert(workspace).values({ name: 'Set aside' }).returning({ id: workspace.id })
    ws = w!.id
    boxId = await saveGmailConnection(db, KEY, ws, { address: AMY, refreshToken: 'x' })
    runId = (await startYear(db, ws, null, new Date(NOW))).runId
    looked.length = 0
  })

  it('exactly what happened on Nov 18: given up on after the newest part, the year went on with only that', async () => {
    const g = pretendGmail(year, { pageSize: 10 })
    const d = depsWith(g.doFetch)
    expect(await readRunPage(d, ws, runId, boxId)).toBe('more')
    await giveUpOnPart(db, ws, runId, boxId)
    expect((await run()).status).toBe('sorting')
    await sortRun(db, ws, runId)
    expect(await think(d)).toBe('ready')
    // Only the most recent person was found; the two from earlier in the year are missing.
    expect(looked).toEqual(['recent@example.com'])
    expect(await person('middle@example.com')).toBeUndefined()
    expect(await person('recent@example.com')).toMatchObject({ state: 'proposed', inCount: 4, outCount: 4 })
  })

  it('is picked up again from where it stopped; what was sorted and proposed stays, and her answers stand', async () => {
    const [newsBefore] = [(await person('news@lists.example'))!]
    expect(newsBefore).toMatchObject({ bucket: 'not_contact', inCount: 2 })
    await sayNo(db, ws, (await person('recent@example.com'))!.id)

    expect(await pickUpLeftOutMail(db, ws)).toBe(1)
    const r = await run()
    expect(r.status).toBe('reading')
    expect(r.parts[boxId]).toMatchObject({ done: false, gaveUp: 1, pageToken: '10' })
    expect(r.parts[boxId]!.problem).toBeUndefined()
    const queued = await db.select().from(job).where(eq(job.workspaceId, ws))
    expect(queued.filter((j) => j.kind === 'list.read' && j.status === 'queued')).toHaveLength(1)
    // Asking again changes nothing: it is already being read.
    expect(await pickUpLeftOutMail(db, ws)).toBe(0)

    const g = pretendGmail(year, { pageSize: 10 })
    const d = depsWith(g.doFetch)
    for (let i = 0; i < 10 && (await readRunPage(d, ws, runId, boxId)) === 'more'; i++);
    // Only the older two pages were asked for; the first page was not read twice.
    expect(g.asked.every((id) => Number(id.slice(1)) >= 10)).toBe(true)
    expect((await run()).status).toBe('sorting')
    expect((await run()).messagesRead).toBe(30)

    await sortRun(db, ws, runId)
    looked.length = 0
    expect(await think(d)).toBe('ready')
    // The people from earlier in the year are now found. The one she said No to is not looked at again.
    expect(looked.sort()).toEqual(['early@example.com', 'middle@example.com'])
    expect(await person('recent@example.com')).toMatchObject({ state: 'no' })
    // Nothing was counted twice: recent has 4 in and 4 out from the first page, plus one more of each from the second.
    expect(await person('recent@example.com')).toMatchObject({ inCount: 5, outCount: 5 })
    expect(await person('middle@example.com')).toMatchObject({ state: 'proposed', inCount: 4, outCount: 4 })
    expect(await person('news@lists.example')).toMatchObject({ bucket: 'not_contact', inCount: 6 })
  })

  it('a year that finished properly is left alone', async () => {
    expect(await pickUpLeftOutMail(db, ws)).toBe(0)
    expect((await run()).status).toBe('ready')
  })

  it(`is picked up ${PICK_UPS} times at most; after that it stays set aside and says so`, async () => {
    // Put the year back to reading, as if its mailbox were being read again and kept failing for a real reason.
    const r = await run()
    await inWorkspace(db, ws, (tx) => tx.update(listRun).set({ status: 'reading', parts: { ...r.parts, [boxId]: { ...r.parts[boxId]!, done: false } } }).where(eq(listRun.id, runId)))
    for (let i = 0; i < PICK_UPS; i++) {
      await giveUpOnPart(db, ws, runId, boxId)
      expect(await pickUpLeftOutMail(db, ws), `time ${i + 1}`).toBe(i < PICK_UPS - 1 ? 1 : 0)
    }
    expect((await run()).parts[boxId]).toMatchObject({ done: true, gaveUp: PICK_UPS + 1, problem: 'SunnyDay could not read one of your mailboxes this time.' })
  })
})

describe('when Google has forgotten the place in its list', () => {
  it('reading starts again just above the oldest message kept: nothing is skipped', async () => {
    const [w] = await db.insert(workspace).values({ name: 'Lost place' }).returning({ id: workspace.id })
    const ws = w!.id
    const boxId = await saveGmailConnection(db, KEY, ws, { address: AMY, refreshToken: 'x' })
    const { runId } = await startYear(db, ws, null, new Date(NOW))
    const first = pretendGmail(year, { pageSize: 10 })
    const d1: ListDeps = { db, connectionKey: KEY, google, fetch: first.doFetch, thinker, now: () => new Date(NOW) }
    expect(await readRunPage(d1, ws, runId, boxId)).toBe('more')

    const later = pretendGmail(year, { pageSize: 10, forgetPlace: true })
    const d2: ListDeps = { ...d1, fetch: later.doFetch }
    // The first turn finds the place is lost and re-aims; the following turns read on.
    for (let i = 0; i < 10 && (await readRunPage(d2, ws, runId, boxId)) === 'more'; i++);
    const kept = (await inWorkspace(db, ws, (tx) => tx.select({ id: listMail.providerId }).from(listMail))).map((r) => r.id)
    expect(kept.sort()).toEqual(year.map((m) => m.id).sort())
    // It did not start over from the newest: at most one already-kept message was fetched again.
    expect(later.asked.filter((id) => Number(id.slice(1)) < 9)).toEqual([])
  })
})
