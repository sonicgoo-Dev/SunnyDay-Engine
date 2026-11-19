// What the contact screens read and change. Every function takes the
// workspace from the session (handed in by the caller), never from the
// browser; the database's wall does the rest.
import {
  ContactNotFound,
  ContactRefused,
  HouseholdsWouldMerge,
  addContact,
  addCustomField,
  addFamily,
  addNote,
  bringBack,
  getContact,
  joinHousehold,
  leaveHousehold,
  listContacts,
  listMailboxes,
  moveStage,
  putAway,
  removeFamily,
  saveContactPart,
  setCustomValue,
  type AddData,
  type ContactPage,
  type ContactRow,
  type MoveResult,
  type PartData,
  type Tab,
} from '@sunnyday/shared'
import type { Me } from '@/auth/auth.server'
import { getDb } from '@/server/db.server'
import type { Added, Done } from './contacts.schema'

const GONE = 'That person is no longer in your contacts. Go back to Contacts and try again.'

/** Turns "not found" into a plain sentence; anything else is a real fault and goes to Sentry. */
async function done(work: () => Promise<unknown>): Promise<Done> {
  try {
    await work()
    return { ok: true }
  } catch (err) {
    if (err instanceof ContactNotFound) return { ok: false, message: GONE }
    if (err instanceof ContactRefused) return { ok: false, message: err.message }
    throw err
  }
}

/** The Contacts screen. The nickname comes along only for a search that matched it. */
export const contactsList = (me: Me, opts: { tab?: Tab; q?: string; putAway?: boolean }): Promise<ContactRow[]> => listContacts(getDb(), me.workspaceId, { ...opts, withNickname: true })

/** People to pick from: names only. A referrer may be a business contact (a referral partner); a partner may not. */
export async function findPeople(me: Me, q: string, except?: string, forReferral = false): Promise<Array<{ id: string; fullName: string }>> {
  const rows = await listContacts(getDb(), me.workspaceId, { q })
  return rows
    .filter((r) => r.id !== except && (forReferral || !r.business))
    .slice(0, 8)
    .map((r) => ({ id: r.id, fullName: r.fullName }))
}

export type PageView = { page: ContactPage; emailFrom: string | null }

export async function contactPage(me: Me, contactId: string): Promise<PageView | null> {
  const db = getDb()
  const [page, boxes] = await Promise.all([getContact(db, me.workspaceId, contactId, { withNickname: true }), listMailboxes(db, me.workspaceId)])
  if (!page) return null
  // Rule 3: email goes out only from the main mailbox, so the Email button opens Gmail as that address.
  const main = boxes.find((b) => b.role === 'main')
  return { page, emailFrom: main?.address ?? null }
}

export async function addPerson(me: Me, input: AddData): Promise<Added> {
  try {
    const { ids } = await addContact(getDb(), me.workspaceId, input, me.userId)
    return { ok: true, id: ids[0]! }
  } catch (err) {
    if (err instanceof ContactNotFound) return { ok: false, message: 'The person who referred them is no longer in your contacts. Choose again.' }
    throw err
  }
}

export const savePart = (me: Me, contactId: string, part: PartData) => done(() => saveContactPart(getDb(), me.workspaceId, contactId, part, me.userId))

export async function stage(me: Me, m: { contactId: string; side: 'buyer' | 'seller'; to: string; confirmBack?: boolean }): Promise<MoveResult> {
  return moveStage(getDb(), me.workspaceId, { ...m, mover: 'person', byUserId: me.userId })
}

export const note = (me: Me, contactId: string, text: string) => done(() => addNote(getDb(), me.workspaceId, contactId, text, me.userId))
const namesOf = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** Linking two people who each already have a household asks first: the two households would become one. */
export async function join(me: Me, contactId: string, otherId: string, confirmMerge = false): Promise<Done | { ok: false; message: string; askMerge: true }> {
  try {
    await joinHousehold(getDb(), me.workspaceId, contactId, otherId, me.userId, confirmMerge)
    return { ok: true }
  } catch (err) {
    if (err instanceof HouseholdsWouldMerge) {
      const others = err.others.length ? ` That also brings in ${namesOf(err.others)}.` : ''
      return { ok: false, askMerge: true, message: `Both of them already have a household. Linking them makes the two households one, with everyone and all family in it.${others}` }
    }
    if (err instanceof ContactNotFound) return { ok: false, message: GONE }
    if (err instanceof ContactRefused) return { ok: false, message: err.message }
    throw err
  }
}
export const leave = (me: Me, contactId: string) => done(() => leaveHousehold(getDb(), me.workspaceId, contactId, me.userId))
export const family = (me: Me, contactId: string, f: { name: string; relation: string; birthday: string | null }) =>
  done(() => addFamily(getDb(), me.workspaceId, contactId, f, me.userId))
export const unfamily = (me: Me, contactId: string, familyId: string) => done(() => removeFamily(getDb(), me.workspaceId, contactId, familyId, me.userId))
export const field = (me: Me, f: { name: string; type: string }) => done(() => addCustomField(getDb(), me.workspaceId, f))
export const fieldValue = (me: Me, contactId: string, fieldId: string, value: string | null) => done(() => setCustomValue(getDb(), me.workspaceId, contactId, fieldId, value))
export const away = (me: Me, contactId: string) => done(() => putAway(getDb(), me.workspaceId, contactId, me.userId))
export const back = (me: Me, contactId: string) => done(() => bringBack(getDb(), me.workspaceId, contactId, me.userId))
