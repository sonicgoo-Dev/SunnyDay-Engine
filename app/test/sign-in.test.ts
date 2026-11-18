// Who gets in, proven through Better Auth's own create-user and
// create-session steps against a real database (no Google needed).
import { eq } from 'drizzle-orm'
import { addInvite, invite, openDb, type Settings } from '@sunnyday/shared'
import { afterAll, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { authUser } from '@sunnyday/shared'
import { createSignIn, whoIs } from '@/auth/auth.server'
import { NOT_INVITED, maySignIn } from '@/auth/may-sign-in'
import { TEST_DATABASE_URL } from './global-setup'

const { db, close } = openDb(TEST_DATABASE_URL, 4)
afterAll(close)

const settings: Settings = {
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: 'http://localhost:3300',
  SIGNIN_SECRET: 's'.repeat(40),
  SIGNIN_GOOGLE_CLIENT_ID: 'id',
  SIGNIN_GOOGLE_CLIENT_SECRET: 'secret',
  FIRST_INVITES: '',
  SENTRY_DSN: '',
  CONNECTION_KEY: '',
}
const auth = createSignIn(db, settings)
const adapter = async () => (await auth.$context).internalAdapter

describe('maySignIn', () => {
  it('needs both a Google-verified address and an invitation', () => {
    expect(maySignIn({ emailVerified: true }, true)).toBe(true)
    expect(maySignIn({ emailVerified: true }, false)).toBe(false)
    expect(maySignIn({ emailVerified: false }, true)).toBe(false)
    expect(maySignIn({ emailVerified: null }, true)).toBe(false)
    expect(maySignIn(null, true)).toBe(false)
  })
})

describe('sign-in', () => {
  it('turns away someone who is not on the invited list', async () => {
    const a = await adapter()
    await expect(a.createUser({ email: 'stranger@example.com', name: 'Stranger', emailVerified: true }, { method: 'test' })).rejects.toMatchObject({
      body: { code: NOT_INVITED },
    })
  })

  it('turns away an invited address Google has not verified', async () => {
    await addInvite(db, 'unverified@example.com')
    const a = await adapter()
    await expect(a.createUser({ email: 'unverified@example.com', name: 'U', emailVerified: false }, { method: 'test' })).rejects.toMatchObject({
      body: { code: NOT_INVITED },
    })
  })

  it('lets an invited, verified person in, whatever the capitals in their address', async () => {
    await addInvite(db, 'tester@example.com')
    const a = await adapter()
    const user = await a.createUser({ email: 'Tester@Example.com', name: 'Tester', emailVerified: true }, { method: 'test' })
    expect(user.id).toBeTruthy()
    const session = await a.createSession(user.id)
    expect(session.token).toBeTruthy()
  })

  it('locks someone out as soon as their invitation is removed', async () => {
    await addInvite(db, 'leaver@example.com')
    const a = await adapter()
    const user = await a.createUser({ email: 'leaver@example.com', name: 'Leaver', emailVerified: true }, { method: 'test' })
    await db.delete(invite).where(eq(invite.email, 'leaver@example.com'))
    await expect(a.createSession(user.id)).rejects.toMatchObject({ body: { code: NOT_INVITED } })
  })

  // The cookie a browser would hold for this session, signed as Better Auth signs it.
  const browserOf = (token: string) => {
    const signature = createHmac('sha256', settings.SIGNIN_SECRET).update(token).digest('base64')
    return new Headers({ cookie: `sunnyday.session_token=${encodeURIComponent(`${token}.${signature}`)}` })
  }

  it('someone already signed in is locked out the moment their invitation is removed', async () => {
    await addInvite(db, 'midway@example.com')
    const a = await adapter()
    const user = await a.createUser({ email: 'midway@example.com', name: 'Midway', emailVerified: true }, { method: 'test' })
    const browser = browserOf((await a.createSession(user.id)).token)
    // Signed in, with a workspace of their own.
    expect(await whoIs(auth, db, browser)).toMatchObject({ email: 'midway@example.com', role: 'agent', workspaceName: 'Midway' })
    await db.delete(invite).where(eq(invite.email, 'midway@example.com'))
    expect(await whoIs(auth, db, browser)).toBeNull()
  })

  it('someone already signed in is locked out if their address stops being verified', async () => {
    await addInvite(db, 'slipped@example.com')
    const a = await adapter()
    const user = await a.createUser({ email: 'slipped@example.com', name: 'Slipped', emailVerified: true }, { method: 'test' })
    const browser = browserOf((await a.createSession(user.id)).token)
    expect(await whoIs(auth, db, browser)).not.toBeNull()
    await db.update(authUser).set({ emailVerified: false }).where(eq(authUser.id, user.id))
    expect(await whoIs(auth, db, browser)).toBeNull()
  })

  it('a made-up or unsigned cookie is nobody', async () => {
    expect(await whoIs(auth, db, new Headers({ cookie: 'sunnyday.session_token=made-up' }))).toBeNull()
    expect(await whoIs(auth, db, new Headers())).toBeNull()
  })
})
