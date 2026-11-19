// The sort: every message read for a year is grouped by the person on the
// other end, with no AI at all. Machines (newsletters, notices, receipts)
// go to "Not contacts". Real people are marked for the AI to look at. This
// is where most of a mailbox is dealt with, for free.
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { listMail, listPerson, listRun } from '../db/schema/index.js'
import { inWorkspace } from '../db/workspace.js'
import { enqueue } from '../jobs/queue.js'
import { PeopleBook } from './people.js'
import { looksAutomated } from './rules.js'
import { LIST_THINK } from './runs.js'

/** Each "Name <address>" (or bare address) in a To line, lowercased addresses. */
export function recipientsIn(line: string | null): Array<{ name: string | null; email: string }> {
  const out: Array<{ name: string | null; email: string }> = []
  const seen = new Set<string>()
  const each = /(?:"([^"]*)"|([^<>,;"]*?))\s*<([^<>\s,;]+@[^<>\s,;]+)>|([^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+)/g
  for (const m of (line ?? '').matchAll(each)) {
    const email = (m[3] ?? m[4] ?? '').toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    const name = (m[1] ?? m[2] ?? '').trim()
    out.push({ name: name && !name.includes('@') ? name.slice(0, 200) : null, email })
  }
  return out
}

type Tally = { names: Map<string, number>; inCount: number; outCount: number; bulkIn: number; first: Date; last: Date }

/**
 * A sender she never wrote to, most of whose mail says it is a mailing, is
 * a machine. So is an address that is plainly one (no-reply and the like).
 * Anyone she wrote to herself is a person, whatever their address looks like.
 */
export function isMachine(address: string, t: { inCount: number; outCount: number; bulkIn: number }): boolean {
  if (t.outCount > 0) return false
  if (looksAutomated(address)) return true
  return t.inCount > 0 && t.bulkIn / t.inCount > 0.5
}

/**
 * Sorts one year's mail into people and "Not contacts", then hands the
 * people to the AI. Returns how many people the AI will look at.
 */
export async function sortRun(db: Db, workspaceId: string, runId: string): Promise<{ outcome: 'sorted'; toLook: number } | { outcome: 'gone' }> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const [run] = await tx.select().from(listRun).where(eq(listRun.id, runId)).for('update')
    if (!run || run.status !== 'sorting') return { outcome: 'gone' } as const
    const book = await PeopleBook.load(tx, workspaceId)
    const mail = await tx
      .select({ id: listMail.id, direction: listMail.direction, fromEmail: listMail.fromEmail, fromName: listMail.fromName, toLine: listMail.toLine, bulk: listMail.bulk, sentAt: listMail.sentAt })
      .from(listMail)
      // Only mail not yet counted: a year whose reading was picked up again is sorted in two goes.
      .where(and(eq(listMail.runId, runId), eq(listMail.sorted, false)))

    // A second go at the same year (its reading was picked up again): mail from the first go is already counted.
    const [counted] = await tx.select({ id: listMail.id }).from(listMail).where(and(eq(listMail.runId, runId), eq(listMail.sorted, true))).limit(1)
    const continued = counted !== undefined

    const tallies = new Map<string, Tally>()
    const tallyFor = (email: string, at: Date) => {
      let t = tallies.get(email)
      if (!t) tallies.set(email, (t = { names: new Map(), inCount: 0, outCount: 0, bulkIn: 0, first: at, last: at }))
      if (at < t.first) t.first = at
      if (at > t.last) t.last = at
      return t
    }
    const vote = (t: Tally, name: string | null) => name && t.names.set(name, (t.names.get(name) ?? 0) + 1)
    /** Who each message is with, so the lines for machines can be dropped afterwards. */
    const withWhom = new Map<string, string[]>()
    for (const m of mail) {
      if (m.direction === 'in') {
        const from = m.fromEmail?.toLowerCase()
        if (!from || book.own.has(from)) continue
        const t = tallyFor(from, m.sentAt)
        t.inCount++
        if (m.bulk) t.bulkIn++
        vote(t, m.fromName)
        withWhom.set(m.id, [from])
      } else {
        const to = recipientsIn(m.toLine).filter((r) => !book.own.has(r.email))
        for (const r of to) {
          const t = tallyFor(r.email, m.sentAt)
          t.outCount++
          vote(t, r.name)
        }
        withWhom.set(m.id, to.map((r) => r.email))
      }
    }

    const people = new Set<string>()
    for (const [email, t] of tallies) {
      const row = book.findOrStart([email])
      const bestName = [...t.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      if (!row.name && bestName) row.name = bestName
      row.inMail = true
      row.inCount += t.inCount
      row.outCount += t.outCount
      row.firstAt = row.firstAt && row.firstAt < t.first ? row.firstAt : t.first
      row.lastAt = row.lastAt && row.lastAt > t.last ? row.lastAt : t.last
      // Her answers stand. Only someone not yet answered is sorted (again): a sender she has now written to is a person after all.
      // In a second go, someone the AI has already given a verdict on (a proposal, or "nobody") keeps it:
      // they are not sorted again and not looked at again, so nobody is ever paid for twice in one year.
      const settledThisYear = continued && row.proposal !== null && row.lookRunId !== runId
      // row.outCount is the whole count (earlier goes included): anyone she has ever written to is a person.
      if (!settledThisYear && row.state === 'new' && row.contactId === null) row.bucket = isMachine(email, { ...t, outCount: row.outCount }) && !row.inGoogle && !row.inPhone ? 'not_contact' : 'person'
      // The AI looks at: new people, and people already answered Yes (for new details only). Never anyone she said No to.
      const look = !settledThisYear && row.bucket === 'person' && (row.state === 'new' || row.state === 'yes')
      if (look) row.lookRunId = runId
      // Someone waiting for a look who turns out to be a machine after all is no longer sent to the AI.
      else if (row.lookRunId === runId && row.bucket !== 'person') row.lookRunId = null
      // The top lines of a person's mail are kept for their story, unless she said No to them.
      if (row.bucket === 'person' && row.state !== 'no') {
        people.add(email)
        // Every address this person is known by counts as theirs when their mail is gathered.
        for (const e of row.emails) people.add(e)
      }
      book.touch(row, [email])
    }
    await book.save(tx)

    // The top lines of mail with machines only are not needed again.
    const drop = mail.filter((m) => !(withWhom.get(m.id) ?? []).some((e) => people.has(e))).map((m) => m.id)
    for (let i = 0; i < drop.length; i += 1000) await tx.delete(listMail).where(inArray(listMail.id, drop.slice(i, i + 1000)))
    await tx.update(listMail).set({ sorted: true }).where(eq(listMail.runId, runId))

    const toLook = (await tx.select({ id: listPerson.id }).from(listPerson).where(eq(listPerson.lookRunId, runId))).length
    await tx.update(listRun).set({ status: 'thinking', toLook, looked: 0 }).where(eq(listRun.id, runId))
    await enqueue(tx, { workspaceId, kind: LIST_THINK, payload: { runId }, dedupe: runId })
    return { outcome: 'sorted', toLook } as const
  })
}
