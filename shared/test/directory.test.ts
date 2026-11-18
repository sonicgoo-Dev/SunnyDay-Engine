import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { addInvite, ensureWorkspace, isInvited, membershipsOf, normalizeEmail, seedFirstInvites } from '../src/db/directory.js'
import { authUser, membership } from '../src/db/schema/index.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
afterAll(close)

const person = async (id: string, name: string) => {
  await db.insert(authUser).values({ id, name, email: `${id}@example.com`, emailVerified: true }).onConflictDoNothing()
  return { id, name }
}

describe('the invited list', () => {
  it('spells an address one way', () => {
    expect(normalizeEmail('  Amy@Example.COM ')).toBe('amy@example.com')
    expect(normalizeEmail('not an email')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('nobody is invited until added, and case or spaces do not matter', async () => {
    expect(await isInvited(db, 'stranger@example.com')).toBe(false)
    expect(await addInvite(db, ' First.Tester@Example.com ')).toBe(true)
    expect(await isInvited(db, 'first.tester@example.com')).toBe(true)
    expect(await isInvited(db, 'FIRST.TESTER@EXAMPLE.COM')).toBe(true)
  })

  it('adding twice is harmless, and a non-address is refused', async () => {
    expect(await addInvite(db, 'first.tester@example.com')).toBe(true)
    expect(await addInvite(db, 'nonsense')).toBe(false)
    expect(await isInvited(db, 'nonsense')).toBe(false)
    expect(await isInvited(db, '')).toBe(false)
  })

  it('FIRST_INVITES adds each address and reports the bad ones', async () => {
    const bad = await seedFirstInvites(db, 'one@example.com, TWO@example.com ,,oops')
    expect(bad).toEqual(['oops'])
    expect(await isInvited(db, 'one@example.com')).toBe(true)
    expect(await isInvited(db, 'two@example.com')).toBe(true)
    expect(await seedFirstInvites(db, '')).toEqual([])
  })
})

describe('a workspace for each agent', () => {
  it('the first sign-in makes one workspace with that person as its agent', async () => {
    const u = await person('u-first', 'Pat Agent')
    const m = await ensureWorkspace(db, u)
    expect(m).toMatchObject({ workspaceName: 'Pat Agent', role: 'agent' })
    expect(await membershipsOf(db, u.id)).toEqual([m])
  })

  it('asking again returns the same workspace', async () => {
    const u = await person('u-again', 'Sam Agent')
    const first = await ensureWorkspace(db, u)
    const second = await ensureWorkspace(db, u)
    expect(second).toEqual(first)
    expect(await db.select().from(membership).where(eq(membership.userId, u.id))).toHaveLength(1)
  })

  it('ten sign-ins at the same moment still make exactly one workspace', async () => {
    const u = await person('u-rush', 'Rush Agent')
    const all = await Promise.all(Array.from({ length: 10 }, () => ensureWorkspace(db, u)))
    expect(new Set(all.map((m) => m.workspaceId)).size).toBe(1)
    expect(await membershipsOf(db, u.id)).toHaveLength(1)
  })

  it('two people get two different workspaces', async () => {
    const a = await ensureWorkspace(db, await person('u-a', 'A'))
    const b = await ensureWorkspace(db, await person('u-b', 'B'))
    expect(a.workspaceId).not.toBe(b.workspaceId)
  })

  it('a blank name still gets a named workspace', async () => {
    const m = await ensureWorkspace(db, await person('u-blank', '   '))
    expect(m.workspaceName).toBe('My workspace')
  })
})
