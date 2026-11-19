// Google's permission flow for a Gmail connection: the address the browser
// is sent to, swapping the returned code for a lasting token, and getting a
// short-lived pass from that token each time mail is read. This is the only
// file that POSTs to Google, and only to Google's sign-in service, never to
// a mailbox.
import { z } from 'zod'

export type Fetch = typeof fetch
export type GoogleClient = { clientId: string; clientSecret: string }

/**
 * What SunnyDay asks Google for (Eric's decision, Nov 17, 2026): read the
 * mailbox, and write a draft and send it. Asked for once so an agent is not
 * sent back to reconnect later. Only reading is used until Build 8.
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
] as const

/**
 * Asked for from Build 4 on, so List Builder can read (never change) her
 * Google Contacts. Not required: a connection without it still reads mail.
 */
export const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly'

/** No request to Google may hang: one stuck call would hold up every workspace's turn. */
export const GOOGLE_TIMEOUT_MS = 15_000

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export function consentUrl(client: GoogleClient, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [...GMAIL_SCOPES, CONTACTS_SCOPE].join(' '),
    // "offline" + "consent" is what makes Google hand over a lasting token.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  })
  return `${AUTH_URL}?${q}`
}

/** The agent must reconnect: Google no longer honours the stored token. */
export class ReconnectNeeded extends Error {
  constructor() {
    super('Google no longer accepts this connection. Connect the mailbox again in Settings.')
    this.name = 'ReconnectNeeded'
  }
}

export class GoogleError extends Error {
  /** `reason` is Google's own short code for the refusal (never a message's words). */
  constructor(what: string, readonly status: number, readonly reason: string | null = null) {
    super(`Google did not answer as expected while ${what} (status ${status}${reason ? `, reason ${reason}` : ''}).`)
    this.name = 'GoogleError'
  }
}

/**
 * Google asked SunnyDay to slow down, and went on asking after several
 * waits. Not a failure: the mailbox is fine. The worker puts the job back
 * to wait a few minutes and does not count it toward giving up.
 */
export class GoogleBusy extends GoogleError {
  constructor(what: string, status: number, reason: string | null) {
    super(what, status, reason)
    this.name = 'GoogleBusy'
  }
}

const exchanged = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), scope: z.string().default('') })
const refreshed = z.object({ access_token: z.string().min(1) })

async function post(doFetch: Fetch, url: string, form: Record<string, string>): Promise<Response> {
  return doFetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
}

/** Swaps the code Google sent back for tokens. Fails if Google gave no lasting token or not every mail permission. Contacts may be left unticked. */
export async function exchangeCode(doFetch: Fetch, client: GoogleClient, redirectUri: string, code: string): Promise<{ accessToken: string; refreshToken: string; canReadContacts: boolean }> {
  const res = await post(doFetch, TOKEN_URL, {
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  if (!res.ok) throw new GoogleError('finishing the connection', res.status)
  const body = exchanged.parse(await res.json())
  if (!body.refresh_token) throw new GoogleError('finishing the connection (no lasting permission was given)', res.status)
  const granted = body.scope.split(' ')
  if (!GMAIL_SCOPES.every((s) => granted.includes(s))) throw new MissingPermission()
  return { accessToken: body.access_token, refreshToken: body.refresh_token, canReadContacts: granted.includes(CONTACTS_SCOPE) }
}

/** The person unticked a box on Google's screen. SunnyDay needs all of them. */
export class MissingPermission extends Error {
  constructor() {
    super('Not every permission was ticked on Google\'s screen.')
    this.name = 'MissingPermission'
  }
}

/** A pass good for about an hour. Throws ReconnectNeeded when the lasting token has been withdrawn. */
export async function accessTokenFrom(doFetch: Fetch, client: GoogleClient, refreshToken: string): Promise<string> {
  const res = await post(doFetch, TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: 'refresh_token',
  })
  if (res.status === 400 || res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (body.error === 'invalid_grant') throw new ReconnectNeeded()
  }
  if (!res.ok) throw new GoogleError('renewing the connection', res.status)
  return refreshed.parse(await res.json()).access_token
}

/** Tells Google to forget the permission. Best effort: a failure here never blocks disconnecting. */
export async function revoke(doFetch: Fetch, refreshToken: string): Promise<boolean> {
  try {
    return (await post(doFetch, REVOKE_URL, { token: refreshToken })).ok
  } catch {
    return false
  }
}
