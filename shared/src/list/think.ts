// The AI look. For each likely person from a year's mail, the AI reads a
// few of their messages and proposes what they are to her and which
// contact details the messages show. It only ever proposes: this file
// cannot make a contact.
//
// Rule 8: every call goes through withAiBudget. At the month's limit the
// run pauses; everything proposed so far stays, and nobody is paid for
// twice (a person is marked as looked at in the same step that saves the
// proposal).
// Rule 11: the message text is fetched, sent once, and dropped. Only the
// proposal is kept.
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { AiPausedError, aiBudget, withAiBudget } from '../ai/spend.js'
import { UNSURE, type ThinkInput, type ThinkMessage, type ThinkOutput } from '../ai/claude.js'
import { addressesIn } from '../contacts/store.js'
import { unseal } from '../crypto/seal.js'
import { contact, contactWay, listMail, listPerson, listRun, mailbox, type ListProposal } from '../db/schema/index.js'
import { inWorkspace } from '../db/workspace.js'
import { enqueue } from '../jobs/queue.js'
import { messageText, paceAs } from '../mail/gmail.js'
import { GoogleBusy, accessTokenFrom } from '../mail/google-token.js'
import { imapWayIn, readImapTexts } from '../mail/imap.js'
import { BUSINESS_ROLE_KEYS, FOUND_BY_KEYS } from '../contacts/rules.js'
import { addDetails, type PersonRow } from './people.js'
import { MESSAGES_PER_PERSON, cleanDetail, phoneKey } from './rules.js'
import { LIST_THINK, type ListDeps } from './runs.js'

export const LIST_BUILDER = 'list_builder'
/** People looked at in one turn, so one workspace never holds up the others for long. */
const PER_TURN = 5
/** A turn stops starting new people after this long, so it always ends well inside the worker's time for one job. */
const TURN_MS = 100_000

type Line = { id: string; mailboxId: string; providerId: string; direction: 'in' | 'out'; fromEmail: string | null; toLine: string | null; subject: string | null; excerpt: string | null; sentAt: Date }

/** The newest six and the oldest two of a person's messages: how it stands now, and how it began. */
export function pickMessages<T extends { sentAt: Date }>(lines: T[], max = MESSAGES_PER_PERSON): T[] {
  const byDate = [...lines].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  if (byDate.length <= max) return byDate
  const oldest = byDate.slice(0, 2)
  return [...oldest, ...byDate.slice(-(max - oldest.length))]
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/**
 * What the AI said, held to what the messages actually contain. A phone
 * number or an address that is not in the text it was shown is dropped, so
 * a made-up detail never reaches a card. Every other value is checked for
 * its kind and length.
 */
export function holdToTheMail(out: ThinkOutput, messages: ThinkMessage[]): { proposal: ListProposal; name: string | null; details: Array<{ kind: 'phone' | 'email' | 'address' | 'partner' | 'company'; value: string; label?: string; source: { from: 'email'; at?: string; subject?: string } }> } {
  // Compared word by word, so a signature broken over several lines still matches.
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim()
  const textOf = (ms: ThinkMessage[]) => ms.map((m) => `${m.subject}\n${m.text}`).join('\n')
  // A contact detail must be in what the person wrote, not in her own messages: her signature holds her number, not theirs.
  const theirs = textOf(messages.filter((m) => !m.fromHer))
  const digits = theirs.replace(/\D/g, '')
  const lower = ` ${plain(theirs)} `
  // A name, a company or who referred them may be in either side's words, but must be in the words.
  const anywhere = ` ${plain(textOf(messages))} `
  const said = (v: string | null | undefined, max = 200): string | null => {
    const t = v?.replace(/\s+/g, ' ').trim().slice(0, max)
    return t && plain(t) && anywhere.includes(` ${plain(t)} `) ? t : null
  }
  const details = []
  for (const d of out.details.slice(0, 20)) {
    const value = cleanDetail(d.kind, d.value)
    if (!value) continue
    if (d.kind === 'phone' && !digits.includes(phoneKey(value))) continue
    if (d.kind !== 'phone' && !lower.includes(` ${plain(value)} `)) continue
    const from = messages.find((m) => m.n === d.fromMessage)
    details.push({ kind: d.kind, value, ...(d.label ? { label: d.label } : {}), source: { from: 'email' as const, ...(from ? { at: from.date, subject: from.subject.slice(0, 200) } : {}) } })
  }
  const business = out.kind === 'business'
  const person = out.kind === 'past_client' || out.kind === 'client' || out.kind === 'lead'
  const proposal: ListProposal = {
    kind: out.kind,
    side: person ? out.side : null,
    businessRole: business ? ((BUSINESS_ROLE_KEYS as readonly string[]).includes(out.businessRole ?? '') ? out.businessRole : 'other') : null,
    company: business ? said(out.company) : null,
    // No exclamation marks on any screen, and one line only.
    why: out.why.replace(/\s+/g, ' ').replace(/!+/g, '.').trim().slice(0, 200),
    sure: out.sure,
    foundBy: person && (FOUND_BY_KEYS as readonly string[]).includes(out.foundBy ?? '') ? out.foundBy : null,
    foundByOther: person && out.foundBy === 'referral' ? said(out.foundByOther) : null,
  }
  return { proposal, name: said(out.name), details }
}

export type ThinkOutcome = 'more' | 'ready' | 'paused' | 'gone'

/**
 * Looks at the next few people of a run. Returns "more" while people
 * remain, "ready" when the year is done, "paused" when the month's AI
 * limit is reached or the AI is not switched on.
 */
export async function thinkBatch(deps: ListDeps, workspaceId: string, runId: string, size = PER_TURN, turnMs = TURN_MS): Promise<ThinkOutcome> {
  const { db } = deps
  const began = Date.now()
  const pause = async (why: 'limit' | 'not_ready'): Promise<ThinkOutcome> => {
    await inWorkspace(db, workspaceId, (tx) => tx.update(listRun).set({ status: 'paused', pausedWhy: why }).where(and(eq(listRun.id, runId), inArray(listRun.status, ['thinking', 'paused']))))
    return 'paused'
  }

  const start = await inWorkspace(db, workspaceId, async (tx) => {
    const [run] = await tx.select().from(listRun).where(eq(listRun.id, runId))
    if (!run || (run.status !== 'thinking' && run.status !== 'paused')) return null
    const people = await tx.select().from(listPerson).where(eq(listPerson.lookRunId, runId)).orderBy(desc(listPerson.outCount), desc(listPerson.lastAt), asc(listPerson.id)).limit(size)
    if (people.length === 0) {
      await tx.update(listRun).set({ status: 'ready', pausedWhy: null, lastProblem: null, readyAt: sql`now()` }).where(eq(listRun.id, runId))
      return { run, people, lines: [] as Line[], boxes: [], known: new Map<string, string[]>() }
    }
    // Their mail from this year: what they sent, and what she sent to them.
    const emails = [...new Set(people.flatMap((p) => p.emails))]
    const lines: Line[] = emails.length
      ? await tx
          .select({ id: listMail.id, mailboxId: listMail.mailboxId, providerId: listMail.providerId, direction: listMail.direction, fromEmail: listMail.fromEmail, toLine: listMail.toLine, subject: listMail.subject, excerpt: listMail.excerpt, sentAt: listMail.sentAt })
          .from(listMail)
          .where(
            and(
              eq(listMail.runId, runId),
              sql`((${listMail.direction} = 'in' and lower(${listMail.fromEmail}) in ${emails}) or (${listMail.direction} = 'out' and (${sql.join(
                emails.map((e) => sql`${listMail.toLine} ilike ${`%${e.replace(/[\\%_]/g, (m) => `\\${m}`)}%`} escape '\\'`),
                sql` or `,
              )})))`,
            ),
          )
      : []
    const boxes = await tx.select().from(mailbox).where(eq(mailbox.status, 'connected'))
    // For someone already in Contacts: what their page already holds, so it is not proposed again.
    const known = new Map<string, string[]>()
    for (const p of people.filter((x) => x.contactId)) {
      const ways = await tx.select({ value: contactWay.value }).from(contactWay).where(eq(contactWay.contactId, p.contactId!))
      const [c] = await tx.select({ home: contact.homeAddress, mailing: contact.mailingAddress, company: contact.company }).from(contact).where(eq(contact.id, p.contactId!))
      known.set(p.id, [...ways.map((w) => w.value), c?.home, c?.mailing, c?.company].filter((v): v is string => Boolean(v)))
    }
    return { run, people, lines, boxes, known }
  })
  if (!start) return 'gone'
  if (start.people.length === 0) return 'ready'
  if (!deps.thinker) return pause('not_ready')
  if ((await aiBudget(db, workspaceId)).paused) return pause('limit')
  if (start.run.status === 'paused') await inWorkspace(db, workspaceId, (tx) => tx.update(listRun).set({ status: 'thinking', pausedWhy: null }).where(eq(listRun.id, runId)))

  // Which messages each person's look will use.
  const chosen = new Map<string, Line[]>()
  for (const p of start.people) {
    const theirs = start.lines.filter((l) => (l.direction === 'in' ? p.emails.includes((l.fromEmail ?? '').toLowerCase()) : addressesIn(l.toLine).some((e) => p.emails.includes(e))))
    chosen.set(p.id, pickMessages(theirs))
  }

  // The words of those messages, fetched once and never stored. A message that cannot be fetched is read by its subject and excerpt alone.
  const texts = new Map<string, string>()
  const wanted = [...chosen.values()].flat()
  for (const box of start.boxes) {
    const ofBox = wanted.filter((l) => l.mailboxId === box.id)
    if (ofBox.length === 0) continue
    try {
      if (box.kind === 'gmail') {
        const accessToken = await accessTokenFrom(deps.fetch, deps.google, unseal(deps.connectionKey, workspaceId, box.sealed))
        paceAs(accessToken, box.id)
        for (let i = 0; i < ofBox.length; i += 4) {
          await Promise.all(
            ofBox.slice(i, i + 4).map(async (l) => {
              const text = await messageText(deps.fetch, accessToken, l.providerId).catch((err: unknown) => {
                // Google asking SunnyDay to slow down: the whole turn waits and is tried again, with nobody paid for.
                if (err instanceof GoogleBusy) throw err
                return ''
              })
              if (text) texts.set(l.id, text)
            }),
          )
        }
      } else {
        const read = deps.imapTexts ?? readImapTexts
        const got = await read(imapWayIn.parse(JSON.parse(unseal(deps.connectionKey, workspaceId, box.sealed))), ofBox.map((l) => l.providerId))
        for (const l of ofBox) if (got.get(l.providerId)) texts.set(l.id, got.get(l.providerId)!)
      }
    } catch (err) {
      if (err instanceof GoogleBusy) throw err
      // The mailbox could not be opened just now: those people are looked at by subject and excerpt.
    }
  }

  for (const p of start.people) {
    // Out of time for this turn: the rest wait for the next one.
    if (Date.now() - began > turnMs) return 'more'
    // Answered, or looked at by another turn, meanwhile: not asked about (or paid for) again.
    const still = await inWorkspace(db, workspaceId, (tx) => tx.select({ id: listPerson.id }).from(listPerson).where(and(eq(listPerson.id, p.id), eq(listPerson.lookRunId, runId))))
    if (still.length === 0) continue
    const messages: ThinkMessage[] = (chosen.get(p.id) ?? []).map((l, i) => ({
      n: i + 1,
      date: day(l.sentAt),
      fromHer: l.direction === 'out',
      subject: l.subject ?? '',
      text: texts.get(l.id) ?? l.excerpt ?? '',
    }))
    const input: ThinkInput = {
      name: p.name,
      addresses: p.emails,
      received: p.inCount,
      sent: p.outCount,
      known: [...(start.known.get(p.id) ?? []), ...p.details.map((d) => d.value)],
      alreadyContact: p.contactId !== null,
      messages,
    }
    let out: ThinkOutput
    try {
      // Nothing to read (their mail has gone): no call, no cost, and she gets a card to fill in herself.
      out = messages.length === 0 ? UNSURE : await withAiBudget(db, workspaceId, LIST_BUILDER, () => deps.thinker!(input))
    } catch (err) {
      if (err instanceof AiPausedError) return pause('limit')
      throw err
    }
    await saveLook(deps, workspaceId, runId, p, holdToTheMail(out, messages))
  }
  return 'more'
}

async function saveLook(deps: ListDeps, workspaceId: string, runId: string, p: PersonRow, held: ReturnType<typeof holdToTheMail>): Promise<void> {
  await inWorkspace(deps.db, workspaceId, async (tx) => {
    const [now] = await tx.select().from(listPerson).where(and(eq(listPerson.id, p.id), eq(listPerson.lookRunId, runId))).for('update')
    // Answered or looked at meanwhile: nothing to save, and nothing is counted twice.
    if (!now) return
    const row = { details: now.details }
    // Her own addresses are identity, not a find: an "email" detail that is already theirs is left out.
    addDetails(row, held.details.filter((d) => !(d.kind === 'email' && now.emails.includes(d.value))))
    const settled = now.state === 'yes' || now.state === 'no'
    await tx
      .update(listPerson)
      .set({
        lookRunId: null,
        details: now.state === 'no' ? [] : row.details,
        name: now.name ?? held.name,
        updatedAt: new Date(),
        // Someone she already answered keeps her answer: only new details are added.
        ...(settled ? {} : held.proposal.kind === 'nobody' ? { bucket: 'not_contact' as const, proposal: held.proposal } : { state: 'proposed' as const, proposal: held.proposal }),
      })
      .where(eq(listPerson.id, p.id))
    await tx.update(listRun).set({ looked: sql`${listRun.looked} + 1` }).where(eq(listRun.id, runId))
  })
}

/** A paused run starts again by itself once the limit allows (a raised limit, or the 1st) or the AI is switched on. */
export async function resumePausedRuns(deps: Pick<ListDeps, 'db' | 'thinker'>, workspaceId: string): Promise<number> {
  const paused = await inWorkspace(deps.db, workspaceId, (tx) => tx.select({ id: listRun.id, pausedWhy: listRun.pausedWhy }).from(listRun).where(eq(listRun.status, 'paused')))
  if (paused.length === 0) return 0
  if (!deps.thinker || (await aiBudget(deps.db, workspaceId)).paused) return 0
  for (const r of paused) await enqueue(deps.db, { workspaceId, kind: LIST_THINK, payload: { runId: r.id }, dedupe: r.id })
  return paused.length
}
