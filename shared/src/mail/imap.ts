// Reading a second mailbox that is not Gmail (Amy's olypen address) by
// signing in to its mail server. Rule 3: such a mailbox is only ever read,
// and nothing is ever sent from it. Rule 4: it is never changed. The inbox
// is opened in the server's own read-only mode in ONE place (openInbox), so
// not even "read" marks can change whatever is asked for. This file holds
// no call that marks, moves, copies, adds or deletes; a test fails if one
// appears. Build 4 adds reading a window of time for List Builder, and the
// text of chosen messages for its AI to read once; the text is never stored.
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { z } from 'zod'
import type { MessageSummary } from './gmail.js'
import { htmlToText, tidyMailText } from './text.js'

export const imapWayIn = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    // A named mail server only: never an address on SunnyDay's own network.
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'must be a mail server name such as imap.example.com')
    .refine((h) => !/(^|\.)(localhost|local|internal|lan)$/.test(h), 'must be a public mail server'),
  // 993 is the encrypted port every modern mail server offers. No other is allowed.
  port: z.literal(993),
  user: z.string().trim().min(1).max(320),
  pass: z.string().min(1).max(500),
})
export type ImapWayIn = z.infer<typeof imapWayIn>

export class ImapSignInRefused extends Error {
  constructor() {
    super('The mail server did not accept that address and password.')
    this.name = 'ImapSignInRefused'
  }
}
export class ImapUnreachable extends Error {
  constructor() {
    super('SunnyDay could not reach that mail server. Check the server name.')
    this.name = 'ImapUnreachable'
  }
}

export type ImapCursor = { uidValidity?: string | undefined; lastUid?: number | undefined }
export type ImapRead = { uidValidity: string; lastUid: number; messages: MessageSummary[]; more: boolean }
/** Reads what is new in a mailbox's inbox. Swappable, so tests never touch a real server. */
export type ImapReader = (wayIn: ImapWayIn, cursor: ImapCursor, opts: { firstReadSince: Date; cap: number }) => Promise<ImapRead>

const short = (s: string | undefined | null, max: number) => (s ? s.slice(0, max) : null)

/** Signs in and opens the inbox read only. The only place a mailbox is opened. */
async function openInbox(wayIn: ImapWayIn) {
  const client = new ImapFlow({
    host: wayIn.host,
    port: wayIn.port,
    secure: true,
    auth: { user: wayIn.user, pass: wayIn.pass },
    logger: false,
    socketTimeout: 60_000,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  })
  // A dropped connection must never take the whole worker down.
  client.on('error', () => {})
  try {
    await client.connect()
  } catch (err) {
    const e = err as { authenticationFailed?: boolean; serverResponseCode?: string }
    // "Try later" answers (too many connections, server busy) are not a wrong password.
    const tryLater = ['UNAVAILABLE', 'LIMIT', 'INUSE', 'SERVERBUG', 'CONTACTADMIN', 'OVERQUOTA'].includes((e.serverResponseCode ?? '').toUpperCase())
    if (e.authenticationFailed && !tryLater) throw new ImapSignInRefused()
    throw new ImapUnreachable()
  }
  try {
    const box = await client.mailboxOpen('INBOX', { readOnly: true })
    return { client, box, uidValidity: String(box.uidValidity) }
  } catch (err) {
    await client.logout().catch(() => {})
    throw err
  }
}

function summaryOf(uidValidity: string, m: FetchMessageObject): MessageSummary {
  const from = m.envelope?.from?.[0]
  const when = m.internalDate ?? m.envelope?.date
  return {
    providerId: `${uidValidity}:${m.uid}`,
    threadId: null,
    direction: 'in',
    fromName: short(from?.name, 200),
    fromEmail: short(from?.address?.toLowerCase(), 320),
    toLine: short((m.envelope?.to ?? []).map((t) => t.address).filter(Boolean).join(', '), 500),
    subject: short(m.envelope?.subject, 300),
    // Envelopes only: the message text is never kept.
    excerpt: null,
    sentAt: when ? new Date(when) : new Date(),
  }
}

export const readImapInbox: ImapReader = async (wayIn, cursor, opts) => {
  const { client, box, uidValidity } = await openInbox(wayIn)
  try {
    // The server renumbered the inbox (rare): start again from the look-back date.
    const sameNumbering = cursor.uidValidity === uidValidity && cursor.lastUid !== undefined
    const found = sameNumbering
      ? await client.search({ uid: `${cursor.lastUid! + 1}:*` }, { uid: true })
      : await client.search({ since: opts.firstReadSince }, { uid: true })
    const uids = (found || []).filter((u) => !sameNumbering || u > cursor.lastUid!).sort((a, b) => a - b)
    const batch = uids.slice(0, opts.cap)
    const messages: MessageSummary[] = []
    if (batch.length) {
      for await (const m of client.fetch(batch, { uid: true, envelope: true, internalDate: true }, { uid: true })) messages.push(summaryOf(uidValidity, m))
    }
    const lastUid = batch.length ? batch[batch.length - 1]! : sameNumbering ? cursor.lastUid! : Math.max(0, Number(box.uidNext ?? 1) - 1)
    return { uidValidity, lastUid, messages, more: uids.length > batch.length }
  } finally {
    await client.logout().catch(() => {})
  }
}

// ---- List Builder (Build 4) -------------------------------------------------

export type ImapWindowRead = { messages: Array<{ summary: MessageSummary; bulk: boolean }>; lastUid: number; more: boolean }
/** Reads the envelopes of a window of time, a batch at a time, oldest number first. Swappable for tests. */
export type ImapWindowReader = (wayIn: ImapWayIn, w: { since: Date; before: Date; afterUid: number; cap: number }) => Promise<ImapWindowRead>

const DAY = 86_400_000

export const readImapWindow: ImapWindowReader = async (wayIn, w) => {
  const { client, uidValidity } = await openInbox(wayIn)
  try {
    // Mail servers search by whole days; the exact moments are checked below.
    const found = await client.search({ since: new Date(w.since.getTime() - DAY), before: new Date(w.before.getTime() + DAY) }, { uid: true })
    const uids = (found || []).filter((u) => u > w.afterUid).sort((a, b) => a - b)
    const batch = uids.slice(0, w.cap)
    const messages: ImapWindowRead['messages'] = []
    if (batch.length) {
      const asked = { uid: true, envelope: true, internalDate: true, headers: ['list-unsubscribe', 'list-id', 'precedence', 'auto-submitted'] }
      for await (const m of client.fetch(batch, asked, { uid: true })) {
        const summary = summaryOf(uidValidity, m)
        if (summary.sentAt < w.since || summary.sentAt >= w.before) continue
        const top = m.headers ? m.headers.toString('utf8') : ''
        const bulk = /^(list-unsubscribe|list-id):/im.test(top) || /^precedence:\s*(bulk|list|junk)/im.test(top) || /^auto-submitted:\s*(?!no\b)\S/im.test(top)
        messages.push({ summary, bulk })
      }
    }
    return { messages, lastUid: batch.length ? batch[batch.length - 1]! : w.afterUid, more: uids.length > batch.length }
  } finally {
    await client.logout().catch(() => {})
  }
}

/** The words of chosen messages, by the id SunnyDay kept for each. Swappable for tests. */
export type ImapTextReader = (wayIn: ImapWayIn, providerIds: string[], max?: number) => Promise<Map<string, string>>

type Shape = { part?: string; type?: string; childNodes?: Shape[]; disposition?: string }
/** The first part of a kind that is not an attachment. */
function findText(node: Shape | undefined, type: string, depth = 0): string | null {
  if (!node || depth > 8) return null
  if (node.type?.toLowerCase() === type && node.disposition?.toLowerCase() !== 'attachment') return node.part ?? '1'
  for (const child of node.childNodes ?? []) {
    const found = findText(child, type, depth + 1)
    if (found) return found
  }
  return null
}

/** At most this much of one message is ever pulled down. */
const TEXT_CEILING = 60_000

/**
 * Reads the words of the given messages for List Builder's AI. The inbox is
 * open read only, so reading marks nothing as read. Attachments are never
 * asked for. Messages the server has since renumbered are quietly left out.
 */
export const readImapTexts: ImapTextReader = async (wayIn, providerIds, max = 2000) => {
  const out = new Map<string, string>()
  if (providerIds.length === 0) return out
  const { client, uidValidity } = await openInbox(wayIn)
  try {
    for (const providerId of providerIds) {
      const [validity, uidText] = providerId.split(':')
      const uid = Number(uidText)
      if (validity !== uidValidity || !Number.isInteger(uid)) continue
      const m = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true })
      const shape = (m ? m.bodyStructure : undefined) as Shape | undefined
      const plain = findText(shape, 'text/plain')
      const part = plain ?? findText(shape, 'text/html')
      if (!part) continue
      const got = await client.download(String(uid), part, { uid: true, maxBytes: TEXT_CEILING })
      const chunks: Buffer[] = []
      if (!got.content) continue
      for await (const chunk of got.content) chunks.push(Buffer.from(chunk as Buffer))
      const text = Buffer.concat(chunks).toString('utf8')
      out.set(providerId, tidyMailText(plain ? text : htmlToText(text), max))
    }
    return out
  } finally {
    await client.logout().catch(() => {})
  }
}
