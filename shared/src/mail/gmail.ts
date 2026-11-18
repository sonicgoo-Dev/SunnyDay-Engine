// Reading a Gmail mailbox. Rule 4: a mailbox is read, never changed. Every
// request in this file goes through gmailGet, which can only ask; there is
// no code here that marks, moves, labels, drafts, sends or deletes. A test
// (shared/test/gmail.test.ts) fails if that ever stops being true.
import { z } from 'zod'
import { GoogleError, ReconnectNeeded, type Fetch } from './google-token.js'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function gmailGet(doFetch: Fetch, accessToken: string, path: string, query: Record<string, string | string[]> = {}): Promise<unknown> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) for (const one of Array.isArray(v) ? v : [v]) q.append(k, one)
  const res = await doFetch(`${API}${path}${q.size ? `?${q}` : ''}`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (res.status === 401) throw new ReconnectNeeded()
  if (!res.ok) throw new GoogleError('reading the mailbox', res.status)
  return res.json()
}

const profile = z.object({ emailAddress: z.string().email() })

/** The address of the mailbox this permission belongs to. */
export async function mailboxAddress(doFetch: Fetch, accessToken: string): Promise<string> {
  return profile.parse(await gmailGet(doFetch, accessToken, '/profile')).emailAddress.toLowerCase()
}

const page = z.object({ messages: z.array(z.object({ id: z.string() })).default([]), nextPageToken: z.string().optional() })

/**
 * The ids of messages newer than a moment, oldest first, at most `cap`.
 * Spam and the bin are left out by Gmail itself. Drafts are left out here.
 */
export async function messageIdsSince(doFetch: Fetch, accessToken: string, afterMs: number, cap = 2000): Promise<string[]> {
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
  } while (pageToken && ids.length < cap)
  // Gmail lists newest first; reading oldest first lets a long catch-up stop and resume cleanly.
  return ids.slice(0, cap).reverse()
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
