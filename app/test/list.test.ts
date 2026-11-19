// List Builder at the door: only the agent who owns the workspace can start
// a year, answer a card or add a phone file. A helper can look, never answer.
import { createHmac } from 'node:crypto'
import { addInvite, contact, inWorkspace, listPerson, listRun, membership, saveGmailConnection, takeInPeople } from '@sunnyday/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL } from './global-setup'

const SECRET = 'g'.repeat(40)
const KEY = 'c'.repeat(40)
Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: 'https://app.example.com',
  SIGNIN_SECRET: SECRET,
  SIGNIN_GOOGLE_CLIENT_ID: 'client-id',
  SIGNIN_GOOGLE_CLIENT_SECRET: 'client-secret',
  CONNECTION_KEY: KEY,
  FIRST_INVITES: '',
  SENTRY_DSN: '',
})

const { getSignIn, signedIn } = await import('@/auth/auth.server')
const { closeServer, getDb, setReady } = await import('@/server/db.server')
const list = await import('@/list/list.server')
const { join } = await import('@/contacts/contacts.server')

setReady(true)
const db = getDb()
afterAll(closeServer)

async function person(email: string) {
  await addInvite(db, email)
  const a = (await getSignIn().$context).internalAdapter
  const user = await a.createUser({ email, name: email.split('@')[0]!, emailVerified: true }, { method: 'test' })
  const { token } = await a.createSession(user.id)
  const cookie = `__Secure-sunnyday.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', SECRET).update(token).digest('base64')}`)}`
  return { cookie, me: (await signedIn(new Headers({ cookie })))! }
}

let agent: Awaited<ReturnType<typeof person>>
let helper: Awaited<ReturnType<typeof person>>
let ws = ''
const FILE = 'BEGIN:VCARD\nFN:Paula Phoneonly\nTEL;TYPE=CELL:360-555-0155\nEND:VCARD\nBEGIN:VCARD\nFN:Ravi Phone\nTEL:360-555-0156\nEND:VCARD'

beforeAll(async () => {
  agent = await person('list-agent@example.com')
  helper = await person('list-helper@example.com')
  ws = agent.me.workspaceId
  await db.delete(membership).where(eq(membership.userId, helper.me.userId))
  await db.insert(membership).values({ workspaceId: ws, userId: helper.me.userId, role: 'helper' })
  helper.me = (await signedIn(new Headers({ cookie: helper.cookie })))!
  await saveGmailConnection(db, KEY, ws, { address: 'list-agent@example.com', refreshToken: 'x' })
})

describe('List Builder, who may do what', () => {
  it('a helper can see where it stands, and can start, add or answer nothing', async () => {
    expect(helper.me.role).toBe('helper')
    expect(await list.status(helper.me)).toMatchObject({ canChange: false, run: null, hasMailbox: true })
    const refused = { ok: false, message: 'Only the agent who owns this workspace can build the list.' }
    expect(await list.start(helper.me)).toEqual(refused)
    expect(await list.phoneFile(helper.me, FILE)).toEqual(refused)
    expect(await inWorkspace(db, ws, (tx) => tx.select().from(listRun))).toEqual([])
    expect(await inWorkspace(db, ws, (tx) => tx.select().from(listPerson))).toEqual([])
  })

  it('the agent starts a year with her own tap; a second tap is told plainly, not doubled', async () => {
    expect(await list.start(agent.me)).toEqual({ ok: true, year: 1 })
    expect(await list.start(agent.me)).toEqual({ ok: false, message: 'List Builder is still working on the year you asked for. It will say when it is ready.' })
    expect(await list.status(agent.me)).toMatchObject({ canChange: true, run: { year: 1, status: 'reading' }, contactsMissing: true })
  })

  it('the phone file is read and thrown away; its people wait on the tick list, and only the agent can add them', async () => {
    expect(await list.phoneFile(agent.me, 'not a contact file')).toMatchObject({ ok: false })
    expect(await list.phoneFile(agent.me, FILE)).toEqual({ ok: true, read: 2, fresh: 2, known: 0 })
    const page = await list.page(helper.me, 'ticks')
    if (page.view !== 'ticks') throw new Error('not ticks')
    expect(page.people.map((p) => p.name)).toEqual(['Paula Phoneonly', 'Ravi Phone'])
    const picks = page.people.map((p) => ({ personId: p.id, as: 'lead_buyer' as const }))
    expect(await list.ticks(helper.me, picks)).toMatchObject({ ok: false })
    expect(await list.no(helper.me, picks[0]!.personId)).toMatchObject({ ok: false })
    expect(await inWorkspace(db, ws, (tx) => tx.select().from(contact))).toEqual([])
    expect(await list.ticks(agent.me, picks)).toEqual({ ok: true, added: 2 })
    expect((await inWorkspace(db, ws, (tx) => tx.select().from(contact))).map((c) => [c.fullName, c.buyerStage, c.foundBy]).sort()).toEqual([
      ['Paula Phoneonly', 'Talking', 'unknown'],
      ['Ravi Phone', 'Talking', 'unknown'],
    ])
  })

  it('an answer for someone already answered comes back as a plain sentence', async () => {
    const [p] = await inWorkspace(db, ws, (tx) => tx.select().from(listPerson).limit(1))
    expect(await list.no(agent.me, p!.id)).toEqual({ ok: false, message: 'That person is no longer waiting for an answer.' })
    expect(await list.moveBack(agent.me, p!.id)).toMatchObject({ ok: false })
  })

  it('linking two people who each have a household asks first, in plain words', async () => {
    await inWorkspace(db, ws, (tx) => takeInPeople(tx, ws, 'phone', []))
    const people = await inWorkspace(db, ws, (tx) => tx.select().from(contact))
    const [paula, ravi] = [people.find((c) => c.fullName === 'Paula Phoneonly')!, people.find((c) => c.fullName === 'Ravi Phone')!]
    const { addFamily } = await import('@sunnyday/shared')
    await addFamily(db, ws, paula.id, { name: 'Pip', relation: 'child', birthday: null }, null)
    await addFamily(db, ws, ravi.id, { name: 'Rin', relation: 'child', birthday: null }, null)
    expect(await join(agent.me, paula.id, ravi.id)).toEqual({
      ok: false,
      askMerge: true,
      message: 'Both of them already have a household. Linking them makes the two households one, with everyone and all family in it. That also brings in Pip and Rin.',
    })
    expect(await join(agent.me, paula.id, ravi.id, true)).toEqual({ ok: true })
  })
})
