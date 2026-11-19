// The mail connections, tested against a pretend Google and a pretend mail
// server. No real mailbox is ever touched by a test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { job, mailMessage, mailbox, workspace } from '../src/db/schema/index.js'
import { inWorkspace } from '../src/db/workspace.js'
import { parseSender } from '../src/mail/gmail.js'
import { CONTACTS_SCOPE, GMAIL_SCOPES, MissingPermission, consentUrl, exchangeCode, type Fetch } from '../src/mail/google-token.js'
import { ImapSignInRefused, imapWayIn, type ImapReader } from '../src/mail/imap.js'
import { SecondMainMailbox, disconnectMailbox, ensureReadsQueued, listMailboxes, readMailbox, saveGmailConnection, saveImapConnection } from '../src/mail/mailboxes.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
const KEY = 'c'.repeat(40)
const google = { clientId: 'client-id', clientSecret: 'client-secret' }
let a = ''
let b = ''
beforeAll(async () => {
  const made = await db.insert(workspace).values([{ name: 'Mail A' }, { name: 'Mail B' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
})
afterAll(close)

type Call = { method: string; url: string }
/** A pretend Google. `inbox` is what the mailbox holds; `revoked` makes the lasting token stop working. */
function pretendGoogle(inbox: Array<{ id: string; ms: number; from: string; subject: string; sent?: boolean }>, opts: { revoked?: boolean } = {}) {
  const calls: Call[] = []
  const signals: boolean[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ method: init?.method ?? 'GET', url: url.toString() })
    signals.push(init?.signal instanceof AbortSignal)
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') return opts.revoked ? json({ error: 'invalid_grant' }, 400) : json({ access_token: 'short-pass' })
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') return json({})
    if (url.pathname.endsWith('/messages')) {
      const after = Number(/after:(\d+)/.exec(url.searchParams.get('q') ?? '')?.[1] ?? 0) * 1000
      const newestFirst = inbox.filter((m) => m.ms >= after).sort((x, y) => y.ms - x.ms)
      return json({ messages: newestFirst.map((m) => ({ id: m.id })) })
    }
    const m = inbox.find((x) => url.pathname.endsWith(`/messages/${x.id}`))
    if (!m) return json({}, 404)
    return json({
      id: m.id,
      threadId: `t-${m.id}`,
      labelIds: m.sent ? ['SENT'] : ['INBOX', 'UNREAD'],
      snippet: `Excerpt of ${m.id}`,
      internalDate: String(m.ms),
      payload: { headers: [{ name: 'From', value: m.from }, { name: 'To', value: 'amy@example.com' }, { name: 'Subject', value: m.subject }] },
    })
  }) as Fetch
  return { doFetch, calls, signals }
}

const NOW = Date.UTC(2026, 10, 17, 12)
const hoursAgo = (h: number) => NOW - h * 3_600_000

describe('asking Google for permission', () => {
  it('asks to read, draft and send, to see her contacts, and for a lasting permission', () => {
    const url = new URL(consentUrl(google, 'https://app.example.com/api/mail/google/callback', 'state-123'))
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([...GMAIL_SCOPES, CONTACTS_SCOPE])
    // Seeing contacts only: never a permission that could change them.
    expect(CONTACTS_SCOPE).toBe('https://www.googleapis.com/auth/contacts.readonly')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('state-123')
  })

  it('refuses a connection where a permission box was left unticked', async () => {
    const partial = (async () => new Response(JSON.stringify({ access_token: 'x', refresh_token: 'y', scope: GMAIL_SCOPES[0] }))) as Fetch
    await expect(exchangeCode(partial, google, 'https://x/cb', 'code')).rejects.toBeInstanceOf(MissingPermission)
  })

  it('the contacts box may be left unticked: mail still connects, and SunnyDay knows contacts are off', async () => {
    const answering = (scope: string) => (async () => new Response(JSON.stringify({ access_token: 'x', refresh_token: 'y', scope }))) as Fetch
    expect(await exchangeCode(answering(GMAIL_SCOPES.join(' ')), google, 'https://x/cb', 'code')).toMatchObject({ canReadContacts: false })
    expect(await exchangeCode(answering([...GMAIL_SCOPES, CONTACTS_SCOPE].join(' ')), google, 'https://x/cb', 'code')).toMatchObject({ canReadContacts: true })
  })
})

describe('reading a sender', () => {
  it('splits a name and an address however it is written', () => {
    expect(parseSender('"Pat Buyer" <Pat@Example.com>')).toEqual({ name: 'Pat Buyer', email: 'pat@example.com' })
    expect(parseSender('pat@example.com')).toEqual({ name: null, email: 'pat@example.com' })
    expect(parseSender('<pat@example.com>')).toEqual({ name: null, email: 'pat@example.com' })
    expect(parseSender(undefined)).toEqual({ name: null, email: null })
  })
})

describe('a Gmail connection', () => {
  let boxId = ''
  const inbox = [
    { id: 'm1', ms: hoursAgo(30), from: 'Pat Buyer <pat@example.com>', subject: 'Looking at homes in Sequim' },
    { id: 'm2', ms: hoursAgo(5), from: 'amy@example.com', subject: 'Re: Looking at homes in Sequim', sent: true },
    { id: 'old', ms: hoursAgo(24 * 40), from: 'ancient@example.com', subject: 'From long ago' },
  ]

  it('is stored sealed, never readable, and its first read is queued', async () => {
    boxId = await saveGmailConnection(db, KEY, a, { address: 'amy@example.com', refreshToken: 'LASTING-TOKEN-VALUE' })
    const [row] = await inWorkspace(db, a, (tx) => tx.select().from(mailbox))
    expect(row).toMatchObject({ kind: 'gmail', role: 'main', status: 'connected', address: 'amy@example.com' })
    expect(JSON.stringify(row)).not.toContain('LASTING-TOKEN-VALUE')
    const queued = await db.select().from(job).where(eq(job.workspaceId, a))
    expect(queued).toMatchObject([{ kind: 'mail.read', payload: { mailboxId: boxId }, status: 'queued' }])
    // A job holds ids only, never an address or a token.
    expect(JSON.stringify(queued)).not.toMatch(/amy@example|LASTING/)
  })

  it('what Settings is given never includes the stored way in', async () => {
    const [seen] = await listMailboxes(db, a)
    expect(Object.keys(seen!).sort()).toEqual(['address', 'canReadContacts', 'id', 'kind', 'lastProblem', 'lastReadAt', 'role', 'status'])
  })

  it('a first read keeps a short summary of the last two weeks, and changes nothing in the mailbox', async () => {
    const g = pretendGoogle(inbox)
    const result = await readMailbox({ db, connectionKey: KEY, google, fetch: g.doFetch, now: () => new Date(NOW) }, a, boxId)
    expect(result).toEqual({ outcome: 'read', added: 2, more: false })
    const kept = await inWorkspace(db, a, (tx) => tx.select().from(mailMessage).orderBy(mailMessage.sentAt))
    expect(kept.map((m) => [m.providerId, m.direction, m.fromEmail, m.subject])).toEqual([
      ['m1', 'in', 'pat@example.com', 'Looking at homes in Sequim'],
      ['m2', 'out', 'amy@example.com', 'Re: Looking at homes in Sequim'],
    ])
    expect(kept[0]).toMatchObject({ fromName: 'Pat Buyer', excerpt: 'Excerpt of m1' })
    // Rule 4: every request to the mailbox only asks. The one POST is to Google's sign-in service.
    const toMailbox = g.calls.filter((c) => c.url.includes('gmail.googleapis.com'))
    expect(toMailbox.length).toBeGreaterThan(0)
    expect(toMailbox.every((c) => c.method === 'GET')).toBe(true)
    expect(g.calls.filter((c) => c.method !== 'GET').map((c) => new URL(c.url).host)).toEqual(['oauth2.googleapis.com'])
    const [box] = await listMailboxes(db, a)
    expect(box!.lastReadAt).toBeInstanceOf(Date)
  })

  it('the next read adds only what is new', async () => {
    const g = pretendGoogle([...inbox, { id: 'm3', ms: NOW + 60_000, from: 'new@example.com', subject: 'New inquiry' }])
    const result = await readMailbox({ db, connectionKey: KEY, google, fetch: g.doFetch, now: () => new Date(NOW + 120_000) }, a, boxId)
    expect(result).toEqual({ outcome: 'read', added: 1, more: false })
    // Every request to Google carries a time limit, so none can hang.
    expect(g.signals.every(Boolean)).toBe(true)
    expect(g.calls.filter((c) => /\/messages\/m[12]$/.test(new URL(c.url).pathname))).toEqual([])
  })

  it('another workspace sees none of it and cannot read it', async () => {
    expect(await listMailboxes(db, b)).toEqual([])
    expect(await inWorkspace(db, b, (tx) => tx.select().from(mailMessage))).toEqual([])
    const g = pretendGoogle(inbox)
    expect(await readMailbox({ db, connectionKey: KEY, google, fetch: g.doFetch }, b, boxId)).toEqual({ outcome: 'gone' })
    expect(g.calls).toEqual([])
  })

  it('only one mailbox mail goes out from: a second Gmail account is refused', async () => {
    await expect(saveGmailConnection(db, KEY, a, { address: 'other@example.com', refreshToken: 'x' })).rejects.toBeInstanceOf(SecondMainMailbox)
    // Connecting the same address again is fine; it replaces the stored way in.
    expect(await saveGmailConnection(db, KEY, a, { address: 'amy@example.com', refreshToken: 'NEWER' })).toBe(boxId)
  })

  it('a very busy mailbox is caught up over several turns, oldest first, with nothing skipped', async () => {
    const busy = Array.from({ length: 400 }, (_, i) => ({ id: `b${i}`, ms: hoursAgo(20) + i * 1000, from: 'list@example.com', subject: `Busy ${i}` }))
    await inWorkspace(db, a, (tx) => tx.update(mailbox).set({ cursor: { afterMs: hoursAgo(21) } }).where(eq(mailbox.id, boxId)))
    const g = pretendGoogle([...inbox, ...busy])
    const deps = { db, connectionKey: KEY, google, fetch: g.doFetch, now: () => new Date(NOW + 300_000) }
    const turns = []
    for (let i = 0; i < 4; i++) turns.push(await readMailbox(deps, a, boxId))
    expect(turns.map((t) => (t.outcome === 'read' ? [t.added, t.more] : t.outcome))).toEqual([[150, true], [150, true], [100, false], [0, false]])
    const kept = await inWorkspace(db, a, (tx) => tx.select({ id: mailMessage.providerId }).from(mailMessage))
    for (const m of busy) expect(kept.some((k) => k.id === m.id), m.id).toBe(true)
  })

  it('connecting Gmail at an address that was the second mailbox turns it into the main one', async () => {
    const reader: ImapReader = async () => ({ uidValidity: '1', lastUid: 9, messages: [], more: false })
    const id = await saveImapConnection({ db, connectionKey: KEY, imap: reader }, b, 'both@example.com', { host: 'imap.example.com', port: 993, user: 'both@example.com', pass: 'p' })
    await readMailbox({ db, connectionKey: KEY, google, fetch: pretendGoogle([]).doFetch, imap: reader }, b, id)
    expect(await saveGmailConnection(db, KEY, b, { address: 'both@example.com', refreshToken: 'x' })).toBe(id)
    const [row] = await inWorkspace(db, b, (tx) => tx.select().from(mailbox))
    expect(row).toMatchObject({ kind: 'gmail', role: 'main', cursor: {} })
    expect(await readMailbox({ db, connectionKey: KEY, google, fetch: pretendGoogle(inbox).doFetch, now: () => new Date(NOW) }, b, id)).toMatchObject({ outcome: 'read', added: 2 })
    await disconnectMailbox({ db, connectionKey: KEY, fetch: pretendGoogle([]).doFetch }, b, id)
  })

  it('when Google withdraws the permission, the mailbox says "reconnect" and is not read again', async () => {
    const g = pretendGoogle(inbox, { revoked: true })
    expect(await readMailbox({ db, connectionKey: KEY, google, fetch: g.doFetch }, a, boxId)).toEqual({ outcome: 'needs_reconnect' })
    expect((await listMailboxes(db, a))[0]).toMatchObject({ status: 'needs_reconnect' })
    expect(await readMailbox({ db, connectionKey: KEY, google, fetch: g.doFetch }, a, boxId)).toEqual({ outcome: 'gone' })
    expect(await ensureReadsQueued(db, a)).toBe(0)
  })

  it('disconnecting tells Google to forget, and removes the stored way in and the summaries', async () => {
    const g = pretendGoogle(inbox)
    expect(await disconnectMailbox({ db, connectionKey: KEY, fetch: g.doFetch }, b, boxId)).toBe(false)
    expect(await disconnectMailbox({ db, connectionKey: KEY, fetch: g.doFetch }, a, boxId)).toBe(true)
    expect(g.calls.map((c) => new URL(c.url).pathname)).toEqual(['/revoke'])
    expect(await listMailboxes(db, a)).toEqual([])
    expect(await inWorkspace(db, a, (tx) => tx.select().from(mailMessage))).toEqual([])
  })
})

describe('a second mailbox, read only (olypen)', () => {
  const wayIn = { host: 'imap.olypen.com', port: 993 as const, user: 'amy@olypen.com', pass: 'MAILBOX-PASSWORD' }
  const seen: Array<{ cursor: unknown; cap: number }> = []
  const server =
    (messages: number): ImapReader =>
    async (given, cursor, opts) => {
      seen.push({ cursor, cap: opts.cap })
      if (given.pass !== 'MAILBOX-PASSWORD') throw new ImapSignInRefused()
      const from = cursor.lastUid ?? 0
      const fresh = Array.from({ length: messages }, (_, i) => i + 1).filter((uid) => uid > from).slice(0, opts.cap)
      return {
        uidValidity: '7',
        lastUid: fresh.length ? fresh[fresh.length - 1]! : Math.max(from, opts.cap === 0 ? 0 : from),
        more: false,
        messages: fresh.map((uid) => ({
          providerId: `7:${uid}`,
          threadId: null,
          direction: 'in' as const,
          fromName: 'Old Client',
          fromEmail: 'client@example.com',
          toLine: 'amy@olypen.com',
          subject: `Message ${uid}`,
          excerpt: null,
          sentAt: new Date(NOW - uid * 1000),
        })),
      }
    }

  it('only accepts a named mail server on the encrypted port', () => {
    expect(imapWayIn.safeParse(wayIn).success).toBe(true)
    for (const bad of [{ host: '10.0.0.5' }, { host: 'localhost' }, { host: 'db.internal' }, { port: 143 }, { host: 'imap.olypen.com/x' }]) {
      expect(imapWayIn.safeParse({ ...wayIn, ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('a wrong password is refused and nothing is stored', async () => {
    await expect(saveImapConnection({ db, connectionKey: KEY, imap: server(3) }, a, 'amy@olypen.com', { ...wayIn, pass: 'wrong' })).rejects.toBeInstanceOf(ImapSignInRefused)
    expect(await listMailboxes(db, a)).toEqual([])
  })

  it('is stored sealed as read only, then read without sending or changing anything', async () => {
    const id = await saveImapConnection({ db, connectionKey: KEY, imap: server(3) }, a, 'Amy@Olypen.com', wayIn)
    const [row] = await inWorkspace(db, a, (tx) => tx.select().from(mailbox))
    expect(row).toMatchObject({ kind: 'imap', role: 'read_only', address: 'amy@olypen.com' })
    expect(JSON.stringify(row)).not.toContain('MAILBOX-PASSWORD')
    const result = await readMailbox({ db, connectionKey: KEY, google, fetch: pretendGoogle([]).doFetch, imap: server(3), now: () => new Date(NOW) }, a, id)
    expect(result).toEqual({ outcome: 'read', added: 3, more: false })
    expect(await readMailbox({ db, connectionKey: KEY, google, fetch: pretendGoogle([]).doFetch, imap: server(4), now: () => new Date(NOW) }, a, id)).toEqual({ outcome: 'read', added: 1, more: false })
    expect(seen.at(-1)!.cursor).toEqual({ uidValidity: '7', lastUid: 3 })
  })

  it('a Gmail account can be the main mailbox beside it', async () => {
    await saveGmailConnection(db, KEY, a, { address: 'amy@example.com', refreshToken: 'x' })
    expect((await listMailboxes(db, a)).map((m) => [m.address, m.role])).toEqual([
      ['amy@olypen.com', 'read_only'],
      ['amy@example.com', 'main'],
    ])
  })
})

describe('rule 4, held by reading the code itself', () => {
  const code = (file: string) => readFileSync(fileURLToPath(new URL(`../src/mail/${file}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('the Gmail reader can only ask: no method, no body, no drafting or sending', () => {
    const gmail = code('gmail.ts')
    expect(gmail).not.toMatch(/method\s*:|body\s*:|\/send|\/drafts|\/modify|\/trash|batchModify|batchDelete|\/labels/)
    // Every request goes through the one asking function.
    expect(gmail.match(/doFetch\(/g)).toHaveLength(1)
  })

  it('the second-mailbox reader opens a folder read only, in one place, and holds no call that changes it', () => {
    const imap = code('imap.ts')
    // Every reader goes through the one opening, and that opening is read only: the server itself then refuses any change, "read" marks included.
    expect(imap.match(/mailboxOpen\(/g)).toHaveLength(1)
    expect(imap).toContain('mailboxOpen(path, { readOnly: true })')
    // Only two folders are ever opened: the inbox, and the sent folder (for List Builder, Eric, Nov 18, 2026).
    expect(imap).toContain("const path = folder === 'inbox' ? 'INBOX' : await sentPathOf(client)")
    expect(imap).toContain("export type ImapFolder = 'inbox' | 'sent'")
    expect(imap.match(/new ImapFlow\(/g)).toHaveLength(1)
    expect(imap).not.toMatch(/messageFlags|messageDelete|messageMove|messageCopy|\.append\(|mailboxCreate|mailboxDelete|mailboxRename|setFlagColor|\.idle\(|mailboxSubscribe/)
    // Build 4: the text of a message may be read for List Builder's AI, but never a whole raw message, and never an attachment.
    expect(imap).not.toMatch(/source\s*:/)
    expect(imap).toContain("disposition?.toLowerCase() !== 'attachment'")
  })

  it('the Gmail reader never asks for an attachment', () => {
    expect(code('gmail.ts')).not.toMatch(/attachments/)
  })

  it('nothing in the mail code sends mail', () => {
    for (const f of ['gmail.ts', 'imap.ts', 'mailboxes.ts', 'google-token.ts', 'google-contacts.ts', 'text.ts']) expect(code(f), f).not.toMatch(/smtp|nodemailer|sendMail|messages\/send/i)
  })
})
