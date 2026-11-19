// Everyone List Builder has found, held in memory while a batch of mail or
// a file of contacts is matched against them. One person is one row,
// however many places they turned up in: they are recognised by any email
// address or phone number they share. Used by the sort, by Google
// Contacts and by the phone file. Always inside inWorkspace.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { contact, contactWay, listPerson, mailbox, type DetailFrom, type FoundDetail } from '../db/schema/index.js'
import type { InWorkspace } from '../db/workspace.js'
import type { OutsidePerson } from '../mail/google-contacts.js'
import { cleanDetail, phoneKey, type DetailKind } from './rules.js'

export type PersonRow = typeof listPerson.$inferSelect
type Draft = PersonRow & { fresh?: boolean; changed?: boolean }

/** Two details are the same when they say the same thing, however it is spaced or punctuated. */
export const detailKey = (kind: string, value: string) => (kind === 'phone' ? `phone:${phoneKey(value)}` : `${kind}:${value.toLowerCase().replace(/[\s,.]+/g, ' ').trim()}`)

/** Adds details not already there. Returns true when any were added. */
export function addDetails(p: { details: FoundDetail[] }, extra: Array<{ kind: DetailKind; value: string; label?: string | undefined; source: DetailFrom }>): boolean {
  const have = new Set(p.details.map((d) => detailKey(d.kind, d.value)))
  let added = false
  for (const e of extra) {
    const value = cleanDetail(e.kind, e.value)
    if (!value || have.has(detailKey(e.kind, value))) continue
    have.add(detailKey(e.kind, value))
    p.details = [...p.details, { id: randomUUID().slice(0, 13), kind: e.kind, value, ...(e.label ? { label: e.label } : {}), source: e.source, status: 'open' }]
    added = true
  }
  return added
}

export class PeopleBook {
  private byEmail = new Map<string, Draft>()
  private byPhone = new Map<string, Draft>()
  private constructor(
    private workspaceId: string,
    readonly rows: Draft[],
    /** Her own addresses: never a person on her list. */
    readonly own: Set<string>,
    private contactByEmail: Map<string, { id: string; fullName: string }>,
    private contactByPhone: Map<string, { id: string; fullName: string }>,
  ) {
    for (const r of rows) this.index(r)
  }

  static async load(tx: InWorkspace, workspaceId: string): Promise<PeopleBook> {
    const rows = await tx.select().from(listPerson)
    const own = new Set((await tx.select({ address: mailbox.address }).from(mailbox)).map((m) => m.address.toLowerCase()))
    const ways = await tx.select({ kind: contactWay.kind, value: contactWay.value, id: contact.id, fullName: contact.fullName }).from(contactWay).innerJoin(contact, eq(contact.id, contactWay.contactId))
    const byEmail = new Map<string, { id: string; fullName: string }>()
    const byPhone = new Map<string, { id: string; fullName: string }>()
    for (const w of ways) (w.kind === 'email' ? byEmail : byPhone).set(w.kind === 'email' ? w.value.toLowerCase() : phoneKey(w.value), { id: w.id, fullName: w.fullName })
    return new PeopleBook(workspaceId, rows, own, byEmail, byPhone)
  }

  private index(r: Draft) {
    for (const e of r.emails) if (!this.byEmail.has(e)) this.byEmail.set(e, r)
    for (const p of r.phoneDigits) if (!this.byPhone.has(p)) this.byPhone.set(p, r)
  }

  /** The person already known by any of these addresses or numbers. */
  find(emails: string[], phones: string[] = []): Draft | undefined {
    for (const e of emails) if (this.byEmail.has(e)) return this.byEmail.get(e)
    for (const p of phones) if (p.length >= 7 && this.byPhone.has(p)) return this.byPhone.get(p)
    return undefined
  }

  /**
   * The person known by these, or a new one. Someone already in Contacts
   * (added by hand) starts out answered Yes and linked to their page, so
   * they are never proposed as new.
   */
  findOrStart(emails: string[], phones: string[] = [], name: string | null = null): Draft {
    const known = this.find(emails, phones)
    if (known) return known
    const inContacts = emails.map((e) => this.contactByEmail.get(e)).find(Boolean) ?? phones.map((p) => this.contactByPhone.get(p)).find(Boolean)
    const now = new Date()
    const fresh: Draft = {
      id: randomUUID(),
      workspaceId: this.workspaceId,
      name: inContacts?.fullName ?? name,
      emails: [],
      phoneDigits: [],
      inMail: false,
      inGoogle: false,
      inPhone: false,
      inCount: 0,
      outCount: 0,
      firstAt: null,
      lastAt: null,
      bucket: 'person',
      state: inContacts ? 'yes' : 'new',
      lookRunId: null,
      proposal: null,
      details: [],
      contactId: inContacts?.id ?? null,
      answeredAt: null,
      createdAt: now,
      updatedAt: now,
      fresh: true,
    }
    this.rows.push(fresh)
    return fresh
  }

  /** Records more addresses and numbers for a person, and marks them to be saved. */
  touch(r: Draft, emails: string[] = [], phones: string[] = []) {
    r.emails = [...new Set([...r.emails, ...emails])]
    r.phoneDigits = [...new Set([...r.phoneDigits, ...phones.filter((p) => p.length >= 7)])]
    r.changed = true
    this.index(r)
  }

  async save(tx: InWorkspace): Promise<void> {
    const strip = ({ fresh: _f, changed: _c, ...row }: Draft) => row
    const fresh = this.rows.filter((r) => r.fresh)
    for (let i = 0; i < fresh.length; i += 500) await tx.insert(listPerson).values(fresh.slice(i, i + 500).map(strip))
    for (const r of this.rows.filter((x) => x.changed && !x.fresh)) {
      const { id, workspaceId: _w, createdAt: _c, ...rest } = strip(r)
      await tx.update(listPerson).set({ ...rest, updatedAt: new Date() }).where(eq(listPerson.id, id))
    }
    for (const r of this.rows) {
      delete r.fresh
      delete r.changed
    }
  }
}

/**
 * Takes in people from Google Contacts or the phone file. Each is matched
 * to someone already found by address or number; otherwise they wait on
 * the tick list. What they bring (numbers, addresses, a company) is kept as
 * details, each marked with where it came from.
 */
export async function takeInPeople(tx: InWorkspace, workspaceId: string, from: 'google' | 'phone', people: OutsidePerson[]): Promise<{ fresh: number; known: number }> {
  const book = await PeopleBook.load(tx, workspaceId)
  let fresh = 0
  let known = 0
  for (const p of people) {
    const emails = [...new Set(p.emails.map((e) => cleanDetail('email', e)).filter((e): e is string => e !== null))].filter((e) => !book.own.has(e))
    const phones = p.phones.map((ph) => ({ ...ph, value: cleanDetail('phone', ph.value) })).filter((ph): ph is { value: string; label: string } => ph.value !== null)
    const keys = phones.map((ph) => phoneKey(ph.value))
    const name = p.name?.trim().slice(0, 200) || null
    // Nothing to recognise them by, or nothing to call them: not usable.
    if (emails.length === 0 && phones.length === 0) continue
    const before = book.find(emails, keys)
    if (!before && !name) continue
    const row = before ?? book.findOrStart(emails, keys, name)
    if (before) known++
    else fresh++
    if (!row.name && name) row.name = name
    if (from === 'google') row.inGoogle = true
    else row.inPhone = true
    // A No is remembered by name and address only: nothing more is kept about them.
    if (row.state !== 'no') {
      addDetails(row, [
        ...phones.map((ph) => ({ kind: 'phone' as const, value: ph.value, label: ph.label, source: { from } })),
        ...emails.map((e) => ({ kind: 'email' as const, value: e, source: { from } })),
        ...p.addresses.map((a) => ({ kind: 'address' as const, value: a, source: { from } })),
        ...(p.company ? [{ kind: 'company' as const, value: p.company, source: { from } }] : []),
      ])
    }
    book.touch(row, emails, keys)
  }
  await book.save(tx)
  return { fresh, known }
}
