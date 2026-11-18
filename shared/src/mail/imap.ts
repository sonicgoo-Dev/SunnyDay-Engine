// Reading a second mailbox that is not Gmail (Amy's olypen address) by
// signing in to its mail server. Rule 3: such a mailbox is only ever read,
// and nothing is ever sent from it. Rule 4: it is never changed. The inbox
// is opened in the server's own read-only mode and only envelopes are
// asked for, so not even "read" marks change. This file holds no call that
// marks, moves, copies, adds or deletes; a test fails if one appears.
import { ImapFlow } from 'imapflow'
import { z } from 'zod'
import type { MessageSummary } from './gmail.js'

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

export const readImapInbox: ImapReader = async (wayIn, cursor, opts) => {
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
    const uidValidity = String(box.uidValidity)
    // The server renumbered the inbox (rare): start again from the look-back date.
    const sameNumbering = cursor.uidValidity === uidValidity && cursor.lastUid !== undefined
    const found = sameNumbering
      ? await client.search({ uid: `${cursor.lastUid! + 1}:*` }, { uid: true })
      : await client.search({ since: opts.firstReadSince }, { uid: true })
    const uids = (found || []).filter((u) => !sameNumbering || u > cursor.lastUid!).sort((a, b) => a - b)
    const batch = uids.slice(0, opts.cap)
    const messages: MessageSummary[] = []
    if (batch.length) {
      for await (const m of client.fetch(batch, { uid: true, envelope: true, internalDate: true }, { uid: true })) {
        const from = m.envelope?.from?.[0]
        const when = m.internalDate ?? m.envelope?.date
        messages.push({
          providerId: `${uidValidity}:${m.uid}`,
          threadId: null,
          direction: 'in',
          fromName: short(from?.name, 200),
          fromEmail: short(from?.address?.toLowerCase(), 320),
          toLine: short((m.envelope?.to ?? []).map((t) => t.address).filter(Boolean).join(', '), 500),
          subject: short(m.envelope?.subject, 300),
          // Envelopes only: the message text is not fetched in this build.
          excerpt: null,
          sentAt: when ? new Date(when) : new Date(),
        })
      }
    }
    const lastUid = batch.length ? batch[batch.length - 1]! : sameNumbering ? cursor.lastUid! : Math.max(0, Number(box.uidNext ?? 1) - 1)
    return { uidValidity, lastUid, messages, more: uids.length > batch.length }
  } finally {
    await client.logout().catch(() => {})
  }
}
