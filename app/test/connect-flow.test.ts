// The whole trip to Google and back, run against a pretend Google: who may
// start it, who may finish it, and what gets saved.
import { createHmac } from 'node:crypto'
import { addInvite, authUser, inWorkspace, listMailboxes, mailbox, membership, membershipsOf } from '@sunnyday/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL } from './global-setup'

const SECRET = 'f'.repeat(40)
Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: 'https://app.example.com',
  SIGNIN_SECRET: SECRET,
  SIGNIN_GOOGLE_CLIENT_ID: 'client-id',
  SIGNIN_GOOGLE_CLIENT_SECRET: 'client-secret',
  CONNECTION_KEY: 'c'.repeat(40),
  FIRST_INVITES: '',
  SENTRY_DSN: '',
})

const { getSignIn, signedIn } = await import('@/auth/auth.server')
const { finishGmailConnect, makeState, startGmailConnect } = await import('@/mail/connect.server')
const { closeServer, getDb, setReady } = await import('@/server/db.server')
const { connectSecondMailbox, changeAiLimit, disconnect } = await import('@/settings/settings.server')

setReady(true)
const db = getDb()
afterAll(closeServer)

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'
const pretendGoogle = (scope = GMAIL_SCOPE) =>
  (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/token') return json({ access_token: 'short-pass', refresh_token: 'LASTING-TOKEN', scope })
    if (url.pathname.endsWith('/profile')) return json({ emailAddress: 'Agent@Example.com' })
    return new Response('{}', { status: 404 })
  }) as typeof fetch

async function person(email: string) {
  await addInvite(db, email)
  const a = (await getSignIn().$context).internalAdapter
  const user = await a.createUser({ email, name: email.split('@')[0]!, emailVerified: true }, { method: 'test' })
  const { token } = await a.createSession(user.id)
  const cookie = `__Secure-sunnyday.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', SECRET).update(token).digest('base64')}`)}`
  const me = (await signedIn(new Headers({ cookie })))!
  return { cookie, me }
}

let agent: Awaited<ReturnType<typeof person>>
let other: Awaited<ReturnType<typeof person>>
let helper: Awaited<ReturnType<typeof person>>

beforeAll(async () => {
  agent = await person('flow-agent@example.com')
  other = await person('flow-other@example.com')
  helper = await person('flow-helper@example.com')
  // Make the third person a helper in the agent's workspace, and nothing else.
  await db.delete(membership).where(eq(membership.userId, helper.me.userId))
  await db.insert(membership).values({ workspaceId: agent.me.workspaceId, userId: helper.me.userId, role: 'helper' })
  helper.me = (await signedIn(new Headers({ cookie: helper.cookie })))!
})

const where = (res: Response) => res.headers.get('location') ?? ''
/** Starts the trip as someone, and returns what their browser would carry to the callback. */
async function begin(who: { cookie: string }) {
  const res = await startGmailConnect(new Request('https://app.example.com/api/mail/google/start', { headers: { cookie: who.cookie } }))
  const state = new URL(where(res)).searchParams.get('state')!
  const nonceCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!
  return { res, state, nonceCookie }
}
const finish = (cookie: string, query: string, doFetch = pretendGoogle()) =>
  finishGmailConnect(new Request(`https://app.example.com/api/mail/google/callback?${query}`, { headers: { cookie } }), doFetch)

describe('connecting Gmail, start to finish', () => {
  it('someone not signed in is sent to sign in, at both ends', async () => {
    expect(where(await startGmailConnect(new Request('https://app.example.com/api/mail/google/start')))).toBe('https://app.example.com/sign-in')
    expect(where(await finish('', 'code=x&state=y'))).toBe('https://app.example.com/sign-in')
  })

  it('the agent is sent to Google, with a note only their own browser can bring back', async () => {
    const { res, state, nonceCookie } = await begin(agent)
    expect(res.status).toBe(302)
    expect(new URL(where(res)).host).toBe('accounts.google.com')
    expect(new URL(where(res)).searchParams.get('redirect_uri')).toBe('https://app.example.com/api/mail/google/callback')
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Secure/)
    expect(state.length).toBeGreaterThan(40)
    expect(nonceCookie).toMatch(/^sunnyday\.mail_connect=.+/)
  })

  it('a helper cannot start it, and cannot finish one the agent started', async () => {
    expect(helper.me).toMatchObject({ role: 'helper', workspaceId: agent.me.workspaceId })
    expect(where(await startGmailConnect(new Request('https://app.example.com/api/mail/google/start', { headers: { cookie: helper.cookie } })))).toBe('https://app.example.com/settings?mail=failed')
    const { state, nonceCookie } = await begin(agent)
    expect(where(await finish(`${helper.cookie}; ${nonceCookie}`, `code=x&state=${state}`))).toBe('https://app.example.com/settings?mail=failed')
    expect(await listMailboxes(db, agent.me.workspaceId)).toEqual([])
  })

  it('is refused without the browser’s own cookie, with a made-up note, or when finished by someone else', async () => {
    const { state, nonceCookie } = await begin(agent)
    const failed = 'https://app.example.com/settings?mail=failed'
    expect(where(await finish(agent.cookie, `code=x&state=${state}`))).toBe(failed)
    expect(where(await finish(`${agent.cookie}; sunnyday.mail_connect=guess`, `code=x&state=${state}`))).toBe(failed)
    expect(where(await finish(`${agent.cookie}; ${nonceCookie}`, 'code=x&state=made.up'))).toBe(failed)
    expect(where(await finish(`${other.cookie}; ${nonceCookie}`, `code=x&state=${state}`))).toBe(failed)
    // A note made for another workspace, even correctly signed, is refused for this person.
    const foreign = makeState(SECRET, { ws: other.me.workspaceId, uid: agent.me.userId, exp: Date.now() + 60_000, n: nonceCookie.split('=')[1]! })
    expect(where(await finish(`${agent.cookie}; ${nonceCookie}`, `code=x&state=${foreign}`))).toBe(failed)
    expect(await listMailboxes(db, agent.me.workspaceId)).toEqual([])
    expect(await listMailboxes(db, other.me.workspaceId)).toEqual([])
  })

  it('backing out at Google, or leaving a box unticked, changes nothing and says so', async () => {
    const { state, nonceCookie } = await begin(agent)
    expect(where(await finish(`${agent.cookie}; ${nonceCookie}`, `error=access_denied&state=${state}`))).toBe('https://app.example.com/settings?mail=cancelled')
    const again = await begin(agent)
    const readOnly = pretendGoogle('https://www.googleapis.com/auth/gmail.readonly')
    expect(where(await finish(`${agent.cookie}; ${again.nonceCookie}`, `code=x&state=${again.state}`, readOnly))).toBe('https://app.example.com/settings?mail=permission')
    expect(await listMailboxes(db, agent.me.workspaceId)).toEqual([])
  })

  it('done properly, the mailbox is saved sealed in the agent’s own workspace and the cookie is cleared', async () => {
    const { state, nonceCookie } = await begin(agent)
    const res = await finish(`${agent.cookie}; ${nonceCookie}`, `code=real-code&state=${state}`)
    expect(where(res)).toBe('https://app.example.com/settings?mail=connected')
    expect(res.headers.get('set-cookie')).toMatch(/sunnyday\.mail_connect=; Max-Age=0/)
    expect(await listMailboxes(db, agent.me.workspaceId)).toMatchObject([{ address: 'agent@example.com', kind: 'gmail', role: 'main', status: 'connected' }])
    const [row] = await inWorkspace(db, agent.me.workspaceId, (tx) => tx.select().from(mailbox))
    expect(row!.sealed).not.toContain('LASTING-TOKEN')
    expect(await listMailboxes(db, other.me.workspaceId)).toEqual([])
  })
})

describe('Settings changes are the agent’s alone', () => {
  it('a helper cannot change the limit, connect a mailbox or disconnect one', async () => {
    const refused = { ok: false, message: 'Only the agent who owns this workspace can change this.' }
    expect(await changeAiLimit(helper.me, 50)).toEqual(refused)
    expect(await connectSecondMailbox(helper.me, { address: 'x@example.com', password: 'p', server: 'imap.example.com' })).toEqual(refused)
    const [box] = await listMailboxes(db, agent.me.workspaceId)
    expect(await disconnect(helper.me, box!.id)).toEqual(refused)
    expect(await listMailboxes(db, agent.me.workspaceId)).toHaveLength(1)
  })

  it('the agent can; another agent cannot disconnect a mailbox that is not theirs', async () => {
    expect(await changeAiLimit(agent.me, 50)).toEqual({ ok: true })
    const [box] = await listMailboxes(db, agent.me.workspaceId)
    expect(await disconnect(other.me, box!.id)).toEqual({ ok: false, message: 'That mailbox is no longer connected.' })
    expect(await connectSecondMailbox(agent.me, { address: 'x@example.com', password: 'p', server: '10.0.0.1' })).toMatchObject({ ok: false })
    expect(await connectSecondMailbox(agent.me, { address: 'agent@example.com', password: 'p', server: 'imap.example.com' })).toEqual({ ok: false, message: 'That address is already connected as your main mailbox.' })
    expect((await membershipsOf(db, agent.me.userId))[0]!.role).toBe('agent')
    void authUser
  })
})
