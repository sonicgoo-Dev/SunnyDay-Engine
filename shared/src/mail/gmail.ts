// Reading a Gmail mailbox. Rule 4: a mailbox is read, never changed. Every
// request in this file goes through gmailGet, which can only ask; there is
// no code here that marks, moves, labels, drafts, sends or deletes. A test
// (shared/test/mail.test.ts) fails if that ever stops being true.
// Build 4 adds reading one year's window for List Builder, and the text of
// a single message for its AI to read once; the text is never stored.
import { z } from 'zod'
import { GOOGLE_TIMEOUT_MS, GoogleBusy, GoogleError, ReconnectNeeded, type Fetch } from './google-token.js'
import { htmlToText, tidyMailText } from './text.js'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/**
 * How fast one mailbox is read. Google allows about 50 requests a second
 * for one mailbox and refuses the rest. SunnyDay stays far below that, so
 * a long read (List Builder's year) and the everyday read can both run
 * without ever meeting the limit. Learned on Nov 18, 2026, when the first
 * real List Builder run read at the limit and was refused.
 */
export const GMAIL_PER_SECOND = 15
/** After a "slow down" answer, one request is tried again after each of these waits (seconds), then the job waits instead. */
const SLOW_DOWN_WAITS = [2, 4, 8, 16]

/** Swappable so tests do not really wait. */
export const gmailClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)) }

// The next moment each mailbox may be asked, keyed by its pass. One worker
// process reads all mail, so this one table is the whole pace.
const nextSlot = new Map<string, number>()
async function takeTurn(accessToken: string): Promise<void> {
  const now = gmailClock.now()
  if (nextSlot.size > 500) for (const [k, at] of nextSlot) if (at < now - 60_000) nextSlot.delete(k)
  const at = Math.max(now, nextSlot.get(accessToken) ?? 0)
  nextSlot.set(accessToken, at + 1000 / GMAIL_PER_SECOND)
  if (at > now) await gmailClock.sleep(at - now)
}
/** Everyone reading this mailbox waits at least this long (used after a "slow down" answer). */
function holdEveryone(accessToken: string, ms: number): void {
  nextSlot.set(accessToken, Math.max(nextSlot.get(accessToken) ?? 0, gmailClock.now() + ms))
}

/** Google's own short code for a refusal, e.g. "rateLimitExceeded". Only ever a code word: letters and underscores. */
async function refusalReason(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } }
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.status
    return typeof reason === 'string' && /^[A-Za-z_]{1,40}$/.test(reason) ? reason : null
  } catch {
    return null
  }
}

/** "Slow down" (too many requests) or "try again" (Google's own trouble): worth waiting for, never a broken mailbox. */
const SLOW_DOWN_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'RESOURCE_EXHAUSTED', 'backendError']
const worthWaitingFor = (status: number, reason: string | null) => status === 429 || status >= 500 || (status === 403 && reason !== null && SLOW_DOWN_REASONS.includes(reason))

async function gmailGet(doFetch: Fetch, accessToken: string, path: string, query: Record<string, string | string[]> = {}): Promise<unknown> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) for (const one of Array.isArray(v) ? v : [v]) q.append(k, one)
  for (let tries = 0; ; tries++) {
    await takeTurn(accessToken)
    const res = await doFetch(`${API}${path}${q.size ? `?${q}` : ''}`, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
    if (res.ok) return res.json()
    if (res.status === 401) throw new ReconnectNeeded()
    const reason = await refusalReason(res)
    if (!worthWaitingFor(res.status, reason)) throw new GoogleError('reading the mailbox', res.status, reason)
    const wait = SLOW_DOWN_WAITS[tries]
    if (wait === undefined) throw new GoogleBusy('reading the mailbox', res.status, reason)
    // Google may say how long to wait; never longer than half a minute here (longer is the job's wait, not this request's).
    const asked = Number(res.headers.get('retry-after'))
    const ms = Math.min(30_000, Math.max(wait * 1000, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 0))
    holdEveryone(accessToken, ms)
  }
}

const profile = z.object({ emailAddress: z.string().email() })

/** The address of the mailbox this permission belongs to. */
export async function mailboxAddress(doFetch: Fetch, accessToken: string): Promise<string> {
  return profile.parse(await gmailGet(doFetch, accessToken, '/profile')).emailAddress.toLowerCase()
}

const page = z.object({ messages: z.array(z.object({ id: z.string() })).default([]), nextPageToken: z.string().optional() })

/** A mailbox fuller than this is listed in pieces over several turns; nothing is skipped. */
const LIST_CEILING = 20_000

/**
 * The ids of every message newer than a moment, oldest first. Spam and the
 * bin are left out by Gmail itself; drafts and chats are left out here.
 * Gmail lists newest first, so the whole list is paged through and then
 * turned round: the caller reads the oldest first and can stop and resume
 * without ever stepping over a message.
 */
export async function messageIdsSince(doFetch: Fetch, accessToken: string, afterMs: number): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const got = page.parse(
      await gmailGet(doFetch, accessToken, '/messages', {
        q: `after:${Math.floor(afterMs / 1000)} -in:drafts -in:chats`,
        maxResults: '500',
        ...(pageToken ? { pageToken } : {}),
      }),
    )
    ids.push(...got.messages.map((m) => m.id))
    pageToken = got.nextPageToken
  } while (pageToken)
  // Oldest first. Past the ceiling, the newest wait for a later turn.
  return ids.reverse().slice(0, LIST_CEILING)
}

const message = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).default([]),
  snippet: z.string().default(''),
  internalDate: z.string(),
  payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]) }).default({ headers: [] }),
})

export type MessageSummary = {
  providerId: string
  threadId: string | null
  direction: 'in' | 'out'
  fromName: string | null
  fromEmail: string | null
  toLine: string | null
  subject: string | null
  excerpt: string | null
  sentAt: Date
}

/** "Pat Agent <pat@example.com>" → its two parts. Either may be missing. */
export function parseSender(raw: string | undefined): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null }
  const angled = raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/)
  if (angled) return { name: angled[1]!.replace(/^"(.*)"$/, '$1').trim() || null, email: angled[2]!.toLowerCase() }
  const bare = raw.trim()
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? { name: null, email: bare.toLowerCase() } : { name: bare || null, email: null }
}

const short = (s: string | undefined, max: number) => (s ? s.slice(0, max) : null)

/** Who, when, the subject and Gmail's own short excerpt. Never the message itself. */
export async function messageSummary(doFetch: Fetch, accessToken: string, id: string): Promise<MessageSummary> {
  const m = message.parse(
    await gmailGet(doFetch, accessToken, `/messages/${encodeURIComponent(id)}`, { format: 'metadata', metadataHeaders: ['From', 'To', 'Subject'] }),
  )
  const header = (name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value
  const from = parseSender(header('from'))
  return {
    providerId: m.id,
    threadId: m.threadId ?? null,
    direction: m.labelIds.includes('SENT') ? 'out' : 'in',
    fromName: short(from.name ?? undefined, 200),
    fromEmail: short(from.email ?? undefined, 320),
    toLine: short(header('to'), 500),
    subject: short(header('subject'), 300),
    excerpt: short(m.snippet, 300),
    sentAt: new Date(Number(m.internalDate)),
  }
}

// ---- List Builder (Build 4): one window of time, and one message's text ----

/** One page of message ids between two moments, newest first, with the mark for the next page. */
export async function messageIdPage(doFetch: Fetch, accessToken: string, w: { afterMs: number; beforeMs: number; pageToken?: string | undefined }): Promise<{ ids: string[]; next: string | null }> {
  const got = page.parse(
    await gmailGet(doFetch, accessToken, '/messages', {
      q: `after:${Math.floor(w.afterMs / 1000)} before:${Math.ceil(w.beforeMs / 1000)} -in:drafts -in:chats`,
      maxResults: '500',
      ...(w.pageToken ? { pageToken: w.pageToken } : {}),
    }),
  )
  return { ids: got.messages.map((m) => m.id), next: got.nextPageToken ?? null }
}

/** True when the message's own top lines say it is a mailing: a newsletter, a notice, an automatic reply. */
export function saysItIsAMailing(header: (name: string) => string | undefined): boolean {
  if (header('list-unsubscribe') || header('list-id')) return true
  if (/\b(bulk|list|junk)\b/i.test(header('precedence') ?? '')) return true
  const auto = (header('auto-submitted') ?? '').trim().toLowerCase()
  return auto !== '' && auto !== 'no'
}

/** The same top lines as messageSummary, plus whether the message says it is a mailing. Still never the message itself. */
export async function messageTopLines(doFetch: Fetch, accessToken: string, id: string): Promise<{ summary: MessageSummary; bulk: boolean }> {
  const m = message.parse(
    await gmailGet(doFetch, accessToken, `/messages/${encodeURIComponent(id)}`, {
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Auto-Submitted'],
    }),
  )
  const header = (name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name)?.value
  const from = parseSender(header('from'))
  return {
    summary: {
      providerId: m.id,
      threadId: m.threadId ?? null,
      direction: m.labelIds.includes('SENT') ? 'out' : 'in',
      fromName: short(from.name ?? undefined, 200),
      fromEmail: short(from.email ?? undefined, 320),
      toLine: short(header('to'), 500),
      subject: short(header('subject'), 300),
      excerpt: short(m.snippet, 300),
      sentAt: new Date(Number(m.internalDate)),
    },
    bulk: saysItIsAMailing(header),
  }
}

type Part = { mimeType?: unknown; body?: { data?: unknown }; parts?: unknown }

/** The first part of a kind, wherever it sits in the message. */
function findPart(part: Part | undefined, mime: string, depth = 0): string | null {
  if (!part || depth > 8) return null
  if (part.mimeType === mime && typeof part.body?.data === 'string' && part.body.data) return Buffer.from(part.body.data, 'base64url').toString('utf8')
  for (const child of Array.isArray(part.parts) ? (part.parts as Part[]) : []) {
    const found = findPart(child, mime, depth + 1)
    if (found) return found
  }
  return null
}

/**
 * The words of one message, tidied and cut short, for List Builder's AI to
 * read once. Attachments are never opened. Nothing here is stored.
 */
export async function messageText(doFetch: Fetch, accessToken: string, id: string, max = 2000): Promise<string> {
  const m = (await gmailGet(doFetch, accessToken, `/messages/${encodeURIComponent(id)}`, { format: 'full' })) as { payload?: Part }
  const plain = findPart(m.payload, 'text/plain')
  const text = plain ?? htmlToText(findPart(m.payload, 'text/html') ?? '')
  return tidyMailText(text, max)
}
