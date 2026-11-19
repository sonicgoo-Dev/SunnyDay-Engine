// List Builder's years. She asks for one year of mail at a time (the last
// 12 months first); this file starts a year, reads it a page at a time in
// the background, and hands over to the sort. Nothing here uses AI, and
// nothing here can make a contact.
//
// Rule 4: mail and Google Contacts are only read. Jobs hold ids only.
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm'
import { unseal } from '../crypto/seal.js'
import type { Db } from '../db/client.js'
import { listMail, listPerson, listRun, mailbox, type RunPart } from '../db/schema/index.js'
import { inWorkspace, type InWorkspace } from '../db/workspace.js'
import { enqueue } from '../jobs/queue.js'
import { messageIdPage, messageTopLines, type MessageSummary } from '../mail/gmail.js'
import { ContactsNotAllowed, googleContactsPage, type OutsidePerson } from '../mail/google-contacts.js'
import { ReconnectNeeded, accessTokenFrom, type Fetch, type GoogleClient } from '../mail/google-token.js'
import { ImapSignInRefused, imapWayIn, readImapWindow, type ImapTextReader, type ImapWindowReader } from '../mail/imap.js'
import type { Thinker } from '../ai/claude.js'
import { takeInPeople } from './people.js'
import { MAX_YEARS } from './rules.js'

export const LIST_READ = 'list.read'
export const LIST_PEOPLE = 'list.people'
export const LIST_SORT = 'list.sort'
export const LIST_THINK = 'list.think'
export const LIST_JOBS = [LIST_READ, LIST_PEOPLE, LIST_SORT, LIST_THINK] as const

/** The run's part that stands for Google Contacts (the others are keyed by mailbox id). */
export const GOOGLE_PART = 'google'

export type ListDeps = {
  db: Db
  connectionKey: string
  google: GoogleClient
  fetch: Fetch
  imapWindow?: ImapWindowReader
  imapTexts?: ImapTextReader
  /** Null or missing: the AI is not switched on (no key in the host's settings). */
  thinker?: Thinker | null
  now?: () => Date
}

/** Something she asked for that List Builder will not do, with a plain sentence saying why. */
export class ListRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ListRefused'
  }
}

/** Cards waiting for her answer: proposed people who are not yet contacts. */
export const cardsWaiting = (tx: InWorkspace) =>
  tx
    .select({ n: sql<number>`count(*)::int` })
    .from(listPerson)
    .where(and(eq(listPerson.state, 'proposed'), eq(listPerson.bucket, 'person')))
    .then((r) => r[0]?.n ?? 0)

const yearBefore = (d: Date) => {
  const back = new Date(d)
  back.setUTCFullYear(back.getUTCFullYear() - 1)
  return back
}

/**
 * Starts the next year: the last 12 months the first time, then the year
 * before the last one read. Only ever on her own tap (the caller checks
 * she is the agent). Refused while a year is still being worked on, while
 * cards from the last year wait for her, and after five years.
 */
export async function startYear(db: Db, workspaceId: string, byUserId: string | null, now = new Date()): Promise<{ runId: string; year: number }> {
  return inWorkspace(db, workspaceId, async (tx) => {
    // One at a time: a second tap waits here, then sees the year the first one made.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`list:${workspaceId}`}))`)
    const runs = await tx.select().from(listRun).orderBy(asc(listRun.year))
    const last = runs.at(-1)
    if (last && last.status !== 'ready') throw new ListRefused('List Builder is still working on the year you asked for. It will say when it is ready.')
    if (last && (await cardsWaiting(tx)) > 0) throw new ListRefused('There are still people waiting for your answer. Finish those first, then go back another year.')
    if (runs.length >= MAX_YEARS) throw new ListRefused(`List Builder goes back ${MAX_YEARS} years at most, and it has read all ${MAX_YEARS}.`)
    const boxes = await tx.select({ id: mailbox.id, kind: mailbox.kind, role: mailbox.role, canReadContacts: mailbox.canReadContacts }).from(mailbox).where(eq(mailbox.status, 'connected'))
    if (boxes.length === 0) throw new ListRefused('Connect your mail in Settings first. List Builder reads it to find your people.')

    const toAt = last?.fromAt ?? now
    const parts: Record<string, RunPart> = Object.fromEntries(boxes.map((b) => [b.id, { done: false }]))
    const contactsFrom = boxes.find((b) => b.kind === 'gmail' && b.role === 'main' && b.canReadContacts)
    if (contactsFrom) parts[GOOGLE_PART] = { done: false }
    // The year before is finished: the top lines read for it are no longer needed.
    if (runs.length) await tx.delete(listMail).where(inArray(listMail.runId, runs.map((r) => r.id)))
    const [run] = await tx
      .insert(listRun)
      .values({ workspaceId, year: runs.length + 1, fromAt: yearBefore(toAt), toAt, status: 'reading', parts, startedBy: byUserId, startedAt: now })
      .returning({ id: listRun.id, year: listRun.year })
    for (const b of boxes) await enqueue(tx, { workspaceId, kind: LIST_READ, payload: { runId: run!.id, mailboxId: b.id }, dedupe: `${run!.id}:${b.id}` })
    if (contactsFrom) await enqueue(tx, { workspaceId, kind: LIST_PEOPLE, payload: { runId: run!.id, mailboxId: contactsFrom.id }, dedupe: run!.id })
    return { runId: run!.id, year: run!.year }
  })
}

/**
 * Marks one part of a run (a mailbox, or Google Contacts) and, when every
 * part is read, moves the run on to sorting. The run row is locked, so two
 * parts finishing at once cannot lose each other's mark.
 */
async function markPart(tx: InWorkspace, workspaceId: string, runId: string, key: string, change: Partial<RunPart>, alsoRead = 0): Promise<void> {
  const [run] = await tx.select().from(listRun).where(eq(listRun.id, runId)).for('update')
  if (!run || run.status !== 'reading') return
  const parts = { ...run.parts, [key]: { ...(run.parts[key] ?? { done: false }), ...change } }
  const allRead = Object.values(parts).every((p) => p.done)
  await tx
    .update(listRun)
    .set({ parts, messagesRead: run.messagesRead + alsoRead, ...(allRead ? { status: 'sorting' as const } : {}) })
    .where(eq(listRun.id, runId))
  if (allRead) await enqueue(tx, { workspaceId, kind: LIST_SORT, payload: { runId }, dedupe: runId })
}

/** A part that could not be read after every retry is set aside with a plain reason, so the year still finishes with the rest. */
export async function giveUpOnPart(db: Db, workspaceId: string, runId: string, key: string): Promise<void> {
  const problem = key === GOOGLE_PART ? 'SunnyDay could not read your Google Contacts this time.' : 'SunnyDay could not read one of your mailboxes this time.'
  await inWorkspace(db, workspaceId, (tx) => markPart(tx, workspaceId, runId, key, { done: true, problem }))
}

const PAGE_AT_ONCE = 6
/** Runs `work` over every item, a few at a time, keeping the order. */
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(work))))
  return out
}

/** Messages asked for from the second mailbox in one turn. */
const IMAP_PER_TURN = 300

export type ReadOutcome = 'more' | 'done' | 'gone'

/**
 * Reads one page of one mailbox for a run: the top lines of each message
 * in the year's window (who, when, subject, excerpt). Never the text.
 * Network calls happen outside any database transaction.
 */
export async function readRunPage(deps: ListDeps, workspaceId: string, runId: string, mailboxId: string): Promise<ReadOutcome> {
  const { db } = deps
  const found = await inWorkspace(db, workspaceId, async (tx) => {
    const [run] = await tx.select().from(listRun).where(eq(listRun.id, runId))
    const [box] = await tx.select().from(mailbox).where(eq(mailbox.id, mailboxId))
    return { run, box }
  })
  const { run, box } = found
  if (!run || run.status !== 'reading') return 'gone'
  const part = run.parts[mailboxId]
  if (!part || part.done) return 'gone'
  if (!box || box.status !== 'connected') {
    await inWorkspace(db, workspaceId, (tx) => markPart(tx, workspaceId, runId, mailboxId, { done: true, problem: 'A mailbox was disconnected before it could be read.' }))
    return 'done'
  }

  let lines: Array<{ summary: MessageSummary; bulk: boolean }> = []
  let next: Partial<RunPart>
  try {
    if (box.kind === 'gmail') {
      const accessToken = await accessTokenFrom(deps.fetch, deps.google, unseal(deps.connectionKey, workspaceId, box.sealed))
      const page = await messageIdPage(deps.fetch, accessToken, { afterMs: run.fromAt.getTime(), beforeMs: run.toAt.getTime(), pageToken: part.pageToken })
      const known = new Set(
        page.ids.length
          ? (await inWorkspace(db, workspaceId, (tx) => tx.select({ providerId: listMail.providerId }).from(listMail).where(and(eq(listMail.mailboxId, mailboxId), inArray(listMail.providerId, page.ids))))).map((r) => r.providerId)
          : [],
      )
      lines = await inBatches(page.ids.filter((id) => !known.has(id)), PAGE_AT_ONCE, (id) => messageTopLines(deps.fetch, accessToken, id))
      next = page.next ? { pageToken: page.next } : { done: true }
    } else {
      const read = deps.imapWindow ?? readImapWindow
      const wayIn = imapWayIn.parse(JSON.parse(unseal(deps.connectionKey, workspaceId, box.sealed)))
      const got = await read(wayIn, { since: run.fromAt, before: run.toAt, afterUid: part.afterUid ?? 0, cap: IMAP_PER_TURN })
      lines = got.messages
      next = got.more ? { afterUid: got.lastUid } : { afterUid: got.lastUid, done: true }
    }
  } catch (err) {
    if (!(err instanceof ReconnectNeeded) && !(err instanceof ImapSignInRefused)) throw err
    const gmail = err instanceof ReconnectNeeded
    await inWorkspace(db, workspaceId, async (tx) => {
      await tx
        .update(mailbox)
        .set({ status: 'needs_reconnect', lastProblem: gmail ? 'Google no longer accepts this connection.' : 'The mail server no longer accepts the saved password.' })
        .where(eq(mailbox.id, mailboxId))
      await markPart(tx, workspaceId, runId, mailboxId, { done: true, problem: 'A mailbox needs reconnecting in Settings, so it was left out this time.' })
    })
    return 'done'
  }

  // Only what falls inside the year asked for (the mail server's own search is by whole days).
  const inWindow = lines.filter((l) => l.summary.sentAt >= run.fromAt && l.summary.sentAt < run.toAt)
  await inWorkspace(db, workspaceId, async (tx) => {
    for (let i = 0; i < inWindow.length; i += 500) {
      await tx
        .insert(listMail)
        .values(inWindow.slice(i, i + 500).map((l) => ({ ...l.summary, bulk: l.bulk, workspaceId, runId, mailboxId })))
        .onConflictDoNothing()
    }
    await markPart(tx, workspaceId, runId, mailboxId, next, inWindow.length)
  })
  return next.done ? 'done' : 'more'
}

/** At most this many pages of Google Contacts (a thousand people a page). */
const CONTACT_PAGES = 20

/** Reads her Google Contacts for a run. Read only; each person is matched or waits on the tick list. */
export async function readRunPeople(deps: ListDeps, workspaceId: string, runId: string, mailboxId: string): Promise<ReadOutcome> {
  const { db } = deps
  const { run, box } = await inWorkspace(db, workspaceId, async (tx) => ({
    run: (await tx.select().from(listRun).where(eq(listRun.id, runId)))[0],
    box: (await tx.select().from(mailbox).where(eq(mailbox.id, mailboxId)))[0],
  }))
  if (!run || run.status !== 'reading' || run.parts[GOOGLE_PART]?.done !== false) return 'gone'
  const people: OutsidePerson[] = []
  let problem: string | undefined
  if (!box || box.status !== 'connected' || box.kind !== 'gmail') problem = 'Your Google Contacts were left out, because Gmail is not connected.'
  else {
    try {
      const accessToken = await accessTokenFrom(deps.fetch, deps.google, unseal(deps.connectionKey, workspaceId, box.sealed))
      let pageToken: string | undefined
      for (let i = 0; i < CONTACT_PAGES; i++) {
        const page = await googleContactsPage(deps.fetch, accessToken, pageToken)
        people.push(...page.people)
        if (!page.next) break
        pageToken = page.next
      }
    } catch (err) {
      if (!(err instanceof ContactsNotAllowed) && !(err instanceof ReconnectNeeded)) throw err
      problem = 'Google did not let SunnyDay read your contacts. Connect Gmail again in Settings to include them.'
    }
  }
  await inWorkspace(db, workspaceId, async (tx) => {
    if (people.length) await takeInPeople(tx, workspaceId, 'google', people)
    await markPart(tx, workspaceId, runId, GOOGLE_PART, { done: true, ...(problem ? { problem } : {}) })
  })
  return 'done'
}

/** The top lines read for a year are a working copy. Any left 90 days on are removed. */
export async function tidyListMail(db: Db, workspaceId: string): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const old = await tx.select({ id: listRun.id }).from(listRun).where(lt(listRun.startedAt, sql`now() - interval '90 days'`))
    if (old.length) await tx.delete(listMail).where(inArray(listMail.runId, old.map((r) => r.id)))
  })
}

/** A year that keeps failing at one step says so on the card, in plain words; cleared when it moves again. */
export async function noteRunProblem(db: Db, workspaceId: string, runId: string, problem: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, (tx) => tx.update(listRun).set({ lastProblem: problem }).where(eq(listRun.id, runId)))
}

/**
 * Every year still being worked on has its next job waiting. Run by the
 * worker's housekeeping, so a job lost when the worker restarted heals
 * itself. A job already waiting is never doubled.
 */
export async function ensureRunJobs(db: Db, workspaceId: string): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const runs = await tx.select().from(listRun).where(inArray(listRun.status, ['reading', 'sorting', 'thinking']))
    for (const run of runs) {
      if (run.status === 'sorting') await enqueue(tx, { workspaceId, kind: LIST_SORT, payload: { runId: run.id }, dedupe: run.id })
      else if (run.status === 'thinking') await enqueue(tx, { workspaceId, kind: LIST_THINK, payload: { runId: run.id }, dedupe: run.id })
      else {
        for (const [key, part] of Object.entries(run.parts)) {
          if (part.done) continue
          if (key !== GOOGLE_PART) await enqueue(tx, { workspaceId, kind: LIST_READ, payload: { runId: run.id, mailboxId: key }, dedupe: `${run.id}:${key}` })
          else {
            const [main] = await tx.select({ id: mailbox.id }).from(mailbox).where(and(eq(mailbox.kind, 'gmail'), eq(mailbox.role, 'main')))
            if (main) await enqueue(tx, { workspaceId, kind: LIST_PEOPLE, payload: { runId: run.id, mailboxId: main.id }, dedupe: run.id })
            else await markPart(tx, workspaceId, run.id, GOOGLE_PART, { done: true, problem: 'Your Google Contacts were left out, because Gmail is not connected.' })
          }
        }
      }
    }
  })
}
