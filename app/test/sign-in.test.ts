// Who gets in, proven through Better Auth's own create-user and
// create-session steps against a real database (no Google needed).
import { eq } from 'drizzle-orm'
import { addInvite, invite, openDb, type Settings } from '@sunnyday/shared'
import { afterAll, describe, expect, it } from 'vitest'
import { createSignIn } from '@/auth/auth.server'
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
})
