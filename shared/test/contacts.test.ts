// Contacts against a real database: adding, the page, stages, search, the
// story, and the wall between workspaces.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inWorkspace } from '../src/db/workspace.js'
import { mailMessage, mailbox, workspace } from '../src/db/schema/index.js'
import {
  addContact,
  addCustomField,
  addFamily,
  addNote,
  bringBack,
  getContact,
  joinHousehold,
  leaveHousehold,
  listContacts,
  moveStage,
  putAway,
  saveContactPart,
  setCustomValue,
} from '../src/contacts/store.js'
import { addInput, partInput } from '../src/contacts/input.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
let a = ''
let b = ''
const by = 'user-a'

const add = (ws: string, input: unknown) => addContact(db, ws, addInput.parse(input), by)
const save = (ws: string, contactId: string, input: unknown) => saveContactPart(db, ws, contactId, partInput.parse(input), by)
const couple = {
  business: false,
  fullName: 'Robert Parker',
  phone: '(360) 555-0101',
  email: 'Bob.Parker@Example.com',
  buyer: true,
  seller: false,
  foundBy: 'referral',
  referredByName: 'Jan at church',
  partner: { fullName: 'Linda Parker', email: 'linda@example.com' },
}

beforeAll(async () => {
  const made = await db.insert(workspace).values([{ name: 'Contacts A' }, { name: 'Contacts B' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
})
afterAll(close)

describe('adding someone by hand', () => {
  it('adds a couple in one step, as one household, both as leads at New', async () => {
    const { ids } = await add(a, couple)
    expect(ids).toHaveLength(2)
    const bob = await getContact(db, a, ids[0]!)
    const linda = await getContact(db, a, ids[1]!)
    expect(bob?.buyerStage).toBe('New')
    expect(bob?.sellerStage).toBeNull()
    expect(bob?.tab).toEqual({ tab: 'leads', active: true })
    expect(bob?.household?.contacts.map((c) => c.fullName)).toEqual(['Linda Parker'])
    expect(linda?.household?.id).toBe(bob?.household?.id)
    expect(bob?.ways).toEqual([
      expect.objectContaining({ kind: 'phone', value: '(360) 555-0101', label: 'mobile' }),
      expect.objectContaining({ kind: 'email', value: 'bob.parker@example.com' }),
    ])
  })

  it('records how they found her at that moment, for both partners (rule 6)', async () => {
    const { ids } = await add(a, { ...couple, fullName: 'Ann Lee', partner: { fullName: 'Sam Lee' } })
    for (const id of ids) {
      const c = await getContact(db, a, id)
      expect(c?.found).toMatchObject({ foundBy: 'referral', referredByName: 'Jan at church' })
      expect(c?.found.recordedAt).toBeTruthy()
      expect(c?.story.at(-1)).toMatchObject({ kind: 'added' })
    }
  })

  it('needs a side and a way they found her; "Other" needs a few words', () => {
    expect(addInput.safeParse({ ...couple, buyer: false }).success).toBe(false)
    expect(addInput.safeParse({ ...couple, foundBy: undefined }).success).toBe(false)
    expect(addInput.safeParse({ ...couple, foundBy: 'other' }).success).toBe(false)
    expect(addInput.safeParse({ ...couple, foundBy: 'unknown' }).success).toBe(true)
  })

  it('refuses a referrer from another workspace, quietly keeping no link', async () => {
    const other = (await add(b, { ...couple, fullName: 'B person', partner: null })).ids[0]!
    await expect(add(a, { ...couple, fullName: 'Probe', partner: null, referredById: other })).rejects.toThrow(/not found/)
  })

  it('adds a business contact with a company and a role, and no stage', async () => {
    const { ids } = await add(a, { business: true, fullName: 'Pat Lender', company: 'Peninsula Home Loans', businessRole: 'lender', phone: '360-555-0199' })
    const pat = await getContact(db, a, ids[0]!)
    expect(pat?.tab).toEqual({ tab: 'business', active: true })
    expect(pat?.buyerStage).toBeNull()
    expect(pat?.company).toBe('Peninsula Home Loans')
  })
})

describe('the workspace wall', () => {
  it('another workspace cannot list, open, change or move anyone', async () => {
    const id = (await add(a, { ...couple, fullName: 'Wall Test', partner: null })).ids[0]!
    expect((await listContacts(db, b, { q: 'Wall Test' })).map((r) => r.id)).not.toContain(id)
    expect(await getContact(db, b, id)).toBeNull()
    await expect(save(b, id, { part: 'personal', personalNotes: 'hijacked' })).rejects.toThrow(/not found/)
    expect(await moveStage(db, b, { contactId: id, side: 'buyer', to: 'Talking', mover: 'person', byUserId: by })).toEqual({ ok: false, reason: 'gone' })
    expect((await getContact(db, a, id))?.personalNotes).toBeNull()
  })

  it('cannot join a household in another workspace', async () => {
    const mine = (await add(a, { ...couple, fullName: 'Mine', partner: null })).ids[0]!
    const theirs = (await add(b, { ...couple, fullName: 'Theirs', partner: null })).ids[0]!
    await expect(joinHousehold(db, a, mine, theirs, by)).rejects.toThrow(/not found/)
  })
})

describe('stages', () => {
  it('she moves forward freely; moving back asks first, then is recorded', async () => {
    const id = (await add(a, { ...couple, fullName: 'Stage Person', partner: null })).ids[0]!
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Touring', mover: 'person', byUserId: by })).toEqual({ ok: true })
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Talking', mover: 'person', byUserId: by })).toEqual({ ok: false, reason: 'confirm' })
    expect((await getContact(db, a, id))?.buyerStage).toBe('Touring')
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Talking', mover: 'person', confirmBack: true, byUserId: by })).toEqual({ ok: true })
    const c = await getContact(db, a, id)
    expect(c?.buyerStage).toBe('Talking')
    expect(c?.story[0]).toMatchObject({ kind: 'stage', body: { side: 'buyer', from: 'Touring', to: 'Talking' } })
  })

  it('an automatic move never goes backward, even when told it is confirmed', async () => {
    const id = (await add(a, { ...couple, fullName: 'Auto Person', partner: null, buyerStage: 'Touring' })).ids[0]!
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Talking', mover: 'automatic', confirmBack: true, byUserId: null })).toEqual({ ok: false, reason: 'refused' })
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Offer out', mover: 'automatic', byUserId: null })).toEqual({ ok: true })
  })

  it('moving past Talking makes a lead a client; closing them folds them away', async () => {
    const id = (await add(a, { ...couple, fullName: 'Tab Person', partner: null })).ids[0]!
    await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Pre-approved', mover: 'person', byUserId: by })
    expect((await listContacts(db, a, { tab: 'clients' })).map((r) => r.id)).toContain(id)
    await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Gone quiet', mover: 'person', byUserId: by })
    const leads = await listContacts(db, a, { tab: 'leads' })
    expect(leads.find((r) => r.id === id)?.active).toBe(false)
  })

  it('refuses a seller stage on the buyer side, and a side they are not', async () => {
    const id = (await add(a, { ...couple, fullName: 'Side Person', partner: null })).ids[0]!
    expect(await moveStage(db, a, { contactId: id, side: 'buyer', to: 'Listed', mover: 'person', byUserId: by })).toEqual({ ok: false, reason: 'refused' })
    expect(await moveStage(db, a, { contactId: id, side: 'seller', to: 'Talking', mover: 'person', byUserId: by })).toEqual({ ok: false, reason: 'refused' })
  })

  it('becoming a seller too starts that side at New', async () => {
    const id = (await add(a, { ...couple, fullName: 'Both Person', partner: null })).ids[0]!
    await save(a, id, { part: 'sides', buyer: true, seller: true })
    expect((await getContact(db, a, id))?.sellerStage).toBe('New')
  })
})

describe('search by any detail', () => {
  it('finds the couple by their dog\'s name in a personal note, whatever the capitals', async () => {
    const { ids } = await add(a, { ...couple, fullName: 'Robert Okafor', partner: { fullName: 'Grace Okafor' } })
    await save(a, ids[0]!, { part: 'personal', personalNotes: 'Golden retriever named Biscuit. Moved from Sacramento.' })
    const found = await listContacts(db, a, { q: 'biscuit' })
    expect(found.map((r) => r.fullName)).toContain('Robert Okafor')
    expect((await listContacts(db, a, { q: 'sacramento okafor' })).map((r) => r.fullName)).toEqual(['Robert Okafor'])
  })

  it('finds by phone digits, email, family names and her own fields', async () => {
    const id = (await add(a, { ...couple, fullName: 'Field Person', phone: '360.555.0177', email: 'field@example.com', partner: null })).ids[0]!
    await addFamily(db, a, id, { name: 'Junie', relation: 'child', birthday: '2015-04-02' }, by)
    const field = await addCustomField(db, a, { name: 'Holiday card list', type: 'yesno' })
    await setCustomValue(db, a, id, field.id, 'yes')
    const ids = async (q: string) => (await listContacts(db, a, { q })).map((r) => r.id)
    expect(await ids('3605550177')).toContain(id)
    expect(await ids('555-0177')).toContain(id)
    expect(await ids('field@example')).toContain(id)
    expect(await ids('junie')).toContain(id)
    expect(await ids('holiday card')).toContain(id)
  })

  it('finds by the private nickname, and says which name matched', async () => {
    const id = (await add(a, { ...couple, fullName: 'Nick Person', partner: null })).ids[0]!
    await save(a, id, { part: 'names', fullName: 'Nick Person', goesBy: 'Nicky', nickname: 'The Fern Lady' })
    const found = await listContacts(db, a, { q: 'fern lady' })
    expect(found.map((r) => r.id)).toEqual([id])
    expect(found[0]?.nickname).toBe('The Fern Lady')
  })

  it('never shows the nickname in a plain list (no search)', async () => {
    const rows = await listContacts(db, a, { tab: 'leads' })
    expect(rows.every((r) => r.nickname === null)).toBe(true)
  })

  it('treats search words literally (no wildcards)', async () => {
    expect(await listContacts(db, a, { q: '%' })).toEqual([])
    expect(await listContacts(db, a, { q: '_' })).toEqual([])
  })
})

describe('the contact page', () => {
  it('saves each part, and every part is optional', async () => {
    const id = (await add(a, { ...couple, fullName: 'Page Person', partner: null, phone: null, email: null })).ids[0]!
    await save(a, id, { part: 'ways', ways: [{ kind: 'phone', value: '360 555 0123', label: 'work' }], mailingAddress: 'PO Box 1, Sequim WA', homeAddress: '' })
    await save(a, id, { part: 'reach', preferredWay: 'text', bestTimes: 'Evenings', noText: false, noEmail: true })
    await save(a, id, { part: 'dates', birthday: '1970-06-01', weddingAnniversary: null, homePurchaseDate: '', clientSince: null })
    await save(a, id, { part: 'wants', buyerWants: { priceMin: 400000, priceMax: 550000, towns: 'Sequim, Carlsborg', preApproved: true, lender: 'Pat' }, sellerWants: {} })
    const c = await getContact(db, a, id)
    expect(c?.ways).toEqual([expect.objectContaining({ value: '360 555 0123', label: 'work' })])
    expect(c?.mailingAddress).toBe('PO Box 1, Sequim WA')
    expect(c?.homeAddress).toBeNull()
    expect(c?.reach).toEqual({ preferredWay: 'text', bestTimes: 'Evenings', noText: false, noEmail: true })
    expect(c?.dates.birthday).toBe('1970-06-01')
    expect(c?.buyerWants).toMatchObject({ priceMax: 550000, towns: 'Sequim, Carlsborg' })
  })

  it('changing how they found her keeps the original in the story', async () => {
    const id = (await add(a, { ...couple, fullName: 'Found Person', partner: null, foundBy: 'open_house', referredByName: null })).ids[0]!
    await save(a, id, { part: 'found', foundBy: 'website' })
    const c = await getContact(db, a, id)
    expect(c?.found.foundBy).toBe('website')
    expect(c?.story.find((e) => e.kind === 'found')).toMatchObject({ body: { was: 'Open house' } })
  })

  it('a referral links both ways: who referred them, and who they have referred', async () => {
    const referrer = (await add(a, { ...couple, fullName: 'Big Referrer', partner: null })).ids[0]!
    const referred = (await add(a, { ...couple, fullName: 'New Friend', partner: null, referredById: referrer, referredByName: null })).ids[0]!
    expect((await getContact(db, a, referred))?.found.referredBy).toMatchObject({ id: referrer, fullName: 'Big Referrer' })
    expect((await getContact(db, a, referrer))?.referred.map((r) => r.id)).toEqual([referred])
  })

  it('links and unlinks a household, with family who are not contacts', async () => {
    const one = (await add(a, { ...couple, fullName: 'Pat One', partner: null })).ids[0]!
    const two = (await add(a, { ...couple, fullName: 'Chris Two', partner: null })).ids[0]!
    await joinHousehold(db, a, one, two, by)
    await addFamily(db, a, one, { name: 'Milo', relation: 'child', birthday: null }, by)
    expect((await getContact(db, a, two))?.household?.family.map((f) => f.name)).toEqual(['Milo'])
    await leaveHousehold(db, a, two, by)
    expect((await getContact(db, a, two))?.household).toBeNull()
    expect((await getContact(db, a, one))?.household?.contacts).toEqual([])
  })

  it('a note goes into the story, newest first', async () => {
    const id = (await add(a, { ...couple, fullName: 'Note Person', partner: null })).ids[0]!
    await addNote(db, a, id, 'Wants a shop for the boat.', by)
    const c = await getContact(db, a, id)
    expect(c?.story[0]).toMatchObject({ kind: 'note', body: { text: 'Wants a shop for the boat.' } })
  })

  it('put away hides someone from lists and search, and can be undone', async () => {
    const id = (await add(a, { ...couple, fullName: 'Hidden Person', partner: null })).ids[0]!
    await putAway(db, a, id, by)
    expect((await listContacts(db, a, { q: 'hidden person' })).map((r) => r.id)).toEqual([])
    expect((await listContacts(db, a, { putAway: true })).map((r) => r.id)).toContain(id)
    await bringBack(db, a, id, by)
    expect((await listContacts(db, a, { q: 'hidden person' })).map((r) => r.id)).toEqual([id])
  })
})

describe('emails in the story (decision 5)', () => {
  it('shows mail from and to their address, and not a lookalike address', async () => {
    const id = (await add(a, { ...couple, fullName: 'Mail Person', email: 'bob@example.com', partner: null })).ids[0]!
    await inWorkspace(db, a, async (tx) => {
      const [box] = await tx.insert(mailbox).values({ workspaceId: a, kind: 'gmail', role: 'main', address: 'agent@example.com', sealed: 'x' }).returning()
      await tx.insert(mailMessage).values([
        { workspaceId: a, mailboxId: box!.id, providerId: '1', direction: 'in', fromEmail: 'Bob@Example.com', subject: 'Hello', excerpt: 'About the house', sentAt: new Date('2026-11-01') },
        { workspaceId: a, mailboxId: box!.id, providerId: '2', direction: 'out', fromEmail: 'agent@example.com', toLine: 'Bob Parker <bob@example.com>', subject: 'Re: Hello', sentAt: new Date('2026-11-02') },
        { workspaceId: a, mailboxId: box!.id, providerId: '3', direction: 'out', fromEmail: 'agent@example.com', toLine: 'jimbob@example.com', subject: 'Not him', sentAt: new Date('2026-11-03') },
        { workspaceId: a, mailboxId: box!.id, providerId: '4', direction: 'in', fromEmail: 'bob@example.com.evil.test', subject: 'Not him either', sentAt: new Date('2026-11-04') },
      ])
    })
    const story = (await getContact(db, a, id))?.story ?? []
    const mails = story.filter((e) => e.kind === 'email')
    expect(mails.map((m) => m.body.text)).toEqual(['Re: Hello', 'Hello'])
    expect(mails[1]).toMatchObject({ mailbox: 'agent@example.com', direction: 'in' })
  })
})
