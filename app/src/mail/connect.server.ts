// Connecting Gmail: sending the agent to Google's permission screen and
// handling the answer. Only the agent who owns the workspace can connect a
// mailbox, and the answer is accepted only from the same browser, the same
// signed-in person and within ten minutes of asking.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  GoogleError,
  MissingPermission,
  SecondMainMailbox,
  consentUrl,
  exchangeCode,
  mailboxAddress,
  saveGmailConnection,
  type Fetch,
} from '@sunnyday/shared'
import { signedIn } from '@/auth/auth.server'
import { getDb, getSettings } from '@/server/db.server'

const COOKIE = 'sunnyday.mail_connect'
const TEN_MINUTES = 10 * 60 * 1000

/** What Settings says after the round trip. A word, never a detail. */
export type ConnectOutcome = 'connected' | 'cancelled' | 'permission' | 'second' | 'not_ready' | 'failed'

type State = { ws: string; uid: string; exp: number; n: string }

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(`mail-connect:${body}`).digest('base64url')

export function makeState(secret: string, s: State): string {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url')
  return `${body}.${sign(secret, body)}`
}

export function readState(secret: string, raw: string | null, now = Date.now()): State | null {
  const [body, mac] = (raw ?? '').split('.')
  if (!body || !mac) return null
  const want = Buffer.from(sign(secret, body))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as State
    return typeof s.ws === 'string' && typeof s.uid === 'string' && typeof s.n === 'string' && typeof s.exp === 'number' && s.exp > now ? s : null
  } catch {
    return null
  }
}

const redirectUri = () => `${getSettings().APP_URL}/api/mail/google/callback`
const cookieAttrs = () => `Path=/api/mail; HttpOnly; SameSite=Lax${getSettings().APP_URL.startsWith('https://') ? '; Secure' : ''}`
const back = (outcome: ConnectOutcome, extra: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { location: `${getSettings().APP_URL}/settings?mail=${outcome}`, 'cache-control': 'no-store', ...extra } })
const toSignIn = () => new Response(null, { status: 302, headers: { location: `${getSettings().APP_URL}/sign-in`, 'cache-control': 'no-store' } })

/** Step 1: send the agent to Google. */
export async function startGmailConnect(request: Request): Promise<Response> {
  const me = await signedIn(request.headers)
  if (!me) return toSignIn()
  const s = getSettings()
  if (me.role !== 'agent') return back('failed')
  if (!s.CONNECTION_KEY) return back('not_ready')
  const n = randomBytes(16).toString('base64url')
  const state = makeState(s.SIGNIN_SECRET, { ws: me.workspaceId, uid: me.userId, exp: Date.now() + TEN_MINUTES, n })
  const url = consentUrl({ clientId: s.SIGNIN_GOOGLE_CLIENT_ID, clientSecret: s.SIGNIN_GOOGLE_CLIENT_SECRET }, redirectUri(), state)
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store', 'set-cookie': `${COOKIE}=${n}; Max-Age=600; ${cookieAttrs()}` } })
}

const cookieValue = (request: Request) =>
  (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === COOKIE)?.[1] ?? null

/** Step 2: Google sends the browser back here. */
export async function finishGmailConnect(request: Request, doFetch: Fetch = fetch): Promise<Response> {
  const me = await signedIn(request.headers)
  if (!me) return toSignIn()
  const clear = { 'set-cookie': `${COOKIE}=; Max-Age=0; ${cookieAttrs()}` }
  const s = getSettings()
  const q = new URL(request.url).searchParams
  if (q.get('error')) return back('cancelled', clear)
  const state = readState(s.SIGNIN_SECRET, q.get('state'))
  const code = q.get('code')
  // The answer must belong to this browser, this person and this workspace.
  if (!state || !code || state.n !== cookieValue(request) || state.uid !== me.userId || state.ws !== me.workspaceId || me.role !== 'agent') return back('failed', clear)
  if (!s.CONNECTION_KEY) return back('not_ready', clear)
  try {
    const client = { clientId: s.SIGNIN_GOOGLE_CLIENT_ID, clientSecret: s.SIGNIN_GOOGLE_CLIENT_SECRET }
    const tokens = await exchangeCode(doFetch, client, redirectUri(), code)
    const address = await mailboxAddress(doFetch, tokens.accessToken)
    await saveGmailConnection(getDb(), s.CONNECTION_KEY, me.workspaceId, { address, refreshToken: tokens.refreshToken })
    return back('connected', clear)
  } catch (err) {
    if (err instanceof MissingPermission) return back('permission', clear)
    if (err instanceof SecondMainMailbox) return back('second', clear)
    // Logged as a kind of failure only: never a code, a token or an address.
    console.error('[mail] Gmail connection did not finish:', err instanceof GoogleError ? err.message : (err as Error)?.name)
    return back('failed', clear)
  }
}
