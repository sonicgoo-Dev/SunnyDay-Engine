// Contacts: adding, reading the page, saving each part, stages, household,
// her own fields, search and the story. Everything runs inside
// inWorkspace, so the database itself keeps one workspace from seeing or
// changing another's people. Ids that arrive from a browser (a referrer, a
// partner, a field) are looked up inside the wall before they are used,
// because a link to a row the wall hides must never be made.
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  contact,
  contactWay,
  customField,
  customValue,
  detailSource,
  familyMember,
  household,
  mailMessage,
  mailbox,
  nickname,
  storyEvent,
  type BuyerWants,
  type SellerWants,
  type StoryBody,
  type StoryKind,
} from '../db/schema/index.js'
import { inWorkspace, type InWorkspace } from '../db/workspace.js'
import type { AddData, PartData } from './input.js'
import { sourceLine } from '../list/rules.js'
import { SEARCH_LIMIT, businessRoleLabel, foundByLabel, isBackward, mayMove, tabFor, type Mover, type Side, type Tab } from './rules.js'

export class ContactNotFound extends Error {
  constructor(what = 'contact') {
    super(`That ${what} was not found.`)
    this.name = 'ContactNotFound'
  }
}

/** A change that is not allowed, with a plain sentence saying why. */
export class ContactRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContactRefused'
  }
}

// ---- Reading ---------------------------------------------------------------

export type ContactRow = {
  id: string
  fullName: string
  goesBy: string | null
  business: boolean
  company: string | null
  businessRole: string | null
  buyerStage: string | null
  sellerStage: string | null
  tab: Tab
  active: boolean
  /**
   * Only with withNickname, and only when a search word matched it (the
   * nickname shows on the contact page and in search, nowhere else).
   */
  nickname?: string | null
}

const LEAD_OR_CLOSED = ['New', 'Written to', 'Talking', 'Not now', 'Not a lead', 'Gone quiet', 'Lost']
/** The same choice as tabFor, made by the database so a long list is never cut short. */
function tabWhere(tab: Tab): SQL {
  if (tab === 'business') return sql`${contact.business}`
  const past = (col: typeof contact.buyerStage | typeof contact.sellerStage) => sql`(${col} is not null and ${col} not in ${LEAD_OR_CLOSED})`
  const client = sql`(${past(contact.buyerStage)} or ${past(contact.sellerStage)})`
  return tab === 'clients' ? sql`(not ${contact.business} and ${client})` : sql`(not ${contact.business} and not ${client})`
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/** A search word, as it is matched: phone-like words by their digits alone. */
function searchWord(word: string): string {
  const digits = word.replace(/\D/g, '')
  return /^[\d\s().+-]+$/.test(word) && digits.length >= 3 ? digits : word.toLowerCase()
}

/** Everyone in a tab (or put away), or everyone matching every search word. */
export async function listContacts(db: Db, workspaceId: string, opts: { tab?: Tab; q?: string; putAway?: boolean; withNickname?: boolean }): Promise<ContactRow[]> {
  const words = (opts.q ?? '').split(/\s+/).filter(Boolean).map(searchWord)
  const searching = words.length > 0
  return inWorkspace(db, workspaceId, async (tx) => {
    const where: SQL[] = [opts.putAway ? isNotNull(contact.putAwayAt) : isNull(contact.putAwayAt)]
    if (!searching && !opts.putAway && opts.tab) where.push(tabWhere(opts.tab))
    for (const w of words) where.push(sql`(${contact.searchText} || ' ' || lower(coalesce(${nickname.nickname}, ''))) like ${`%${likeEscape(w)}%`} escape '\\'`)
    const rows = await tx
      .select({
        id: contact.id,
        fullName: contact.fullName,
        goesBy: contact.goesBy,
        business: contact.business,
        company: contact.company,
        businessRole: contact.businessRole,
        buyerStage: contact.buyerStage,
        sellerStage: contact.sellerStage,
        nickname: nickname.nickname,
      })
      .from(contact)
      .leftJoin(nickname, eq(nickname.contactId, contact.id))
      .where(and(...where))
      .orderBy(asc(sql`lower(${contact.fullName})`))
      .limit(searching ? SEARCH_LIMIT : 20_000)
    return rows.map(({ nickname: nick, ...r }) => {
      const row: ContactRow = { ...r, ...tabFor(r) }
      if (opts.withNickname) {
        const n = nick?.toLowerCase() ?? ''
        row.nickname = searching && nick && words.some((w) => n.includes(w)) ? nick : null
      }
      return row
    })
  })
}

export type StoryItem = {
  id: string
  kind: StoryKind | 'email'
  at: string
  body: StoryBody
  direction?: 'in' | 'out'
  mailbox?: string
  excerpt?: string | null
  fromName?: string | null
}

export type ContactPage = {
  id: string
  business: boolean
  fullName: string
  goesBy: string | null
  /** Only with withNickname: for the contact page itself, never for anything that writes to a client. */
  nickname?: string | null
  company: string | null
  businessRole: string | null
  buyerStage: string | null
  sellerStage: string | null
  tab: { tab: Tab; active: boolean }
  putAway: boolean
  ways: Array<{ id: string; kind: 'phone' | 'email'; value: string; label: string }>
  mailingAddress: string | null
  homeAddress: string | null
  reach: { preferredWay: string | null; bestTimes: string | null; noText: boolean; noEmail: boolean }
  dates: { birthday: string | null; weddingAnniversary: string | null; homePurchaseDate: string | null; clientSince: string | null }
  personalNotes: string | null
  buyerWants: BuyerWants
  sellerWants: SellerWants
  found: {
    foundBy: string | null
    foundByOther: string | null
    referredBy: { id: string; fullName: string } | null
    referredByName: string | null
    recordedAt: string | null
  }
  referred: Array<{ id: string; fullName: string }>
  household: { id: string; contacts: Array<{ id: string; fullName: string }>; family: Array<{ id: string; name: string; relation: string; birthday: string | null }> } | null
  fields: Array<{ id: string; name: string; type: string; value: string | null }>
  /** Where a detail came from, for the ones List Builder found (Build 4): "from an email on Mar 3, 2025". */
  sources: Array<{ kind: string; value: string; line: string }>
  story: StoryItem[]
  createdAt: string
}

/** Every whole address in a To line, lowercased: "Bob <bob@example.com>, o'bob@example.com" gives both, separately. */
export const addressesIn = (line: string | null) => (line ?? '').toLowerCase().match(/[^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+/g) ?? []

/** The whole contact page, or null when there is no such person in this workspace. */
export async function getContact(db: Db, workspaceId: string, contactId: string, opts: { withNickname?: boolean } = {}): Promise<ContactPage | null> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const [c] = await tx.select().from(contact).where(eq(contact.id, contactId))
    if (!c) return null
    const nick = opts.withNickname ? (await tx.select({ nickname: nickname.nickname }).from(nickname).where(eq(nickname.contactId, c.id)))[0] : undefined
    const ways = await tx
      .select({ id: contactWay.id, kind: contactWay.kind, value: contactWay.value, label: contactWay.label })
      .from(contactWay)
      .where(eq(contactWay.contactId, c.id))
      .orderBy(asc(contactWay.position))
    const referredBy = c.referredById ? ((await tx.select({ id: contact.id, fullName: contact.fullName }).from(contact).where(eq(contact.id, c.referredById)))[0] ?? null) : null
    const referred = await tx.select({ id: contact.id, fullName: contact.fullName }).from(contact).where(eq(contact.referredById, c.id)).orderBy(asc(contact.fullName))
    let home: ContactPage['household'] = null
    if (c.householdId) {
      const contacts = await tx
        .select({ id: contact.id, fullName: contact.fullName })
        .from(contact)
        .where(and(eq(contact.householdId, c.householdId), ne(contact.id, c.id)))
        .orderBy(asc(contact.fullName))
      const family = await tx
        .select({ id: familyMember.id, name: familyMember.name, relation: familyMember.relation, birthday: familyMember.birthday })
        .from(familyMember)
        .where(eq(familyMember.householdId, c.householdId))
        .orderBy(asc(familyMember.createdAt))
      home = { id: c.householdId, contacts, family }
    }
    const fields = await tx
      .select({ id: customField.id, name: customField.name, type: customField.type, value: customValue.value })
      .from(customField)
      .leftJoin(customValue, and(eq(customValue.fieldId, customField.id), eq(customValue.contactId, c.id)))
      .orderBy(asc(customField.createdAt))

    const found = await tx.select({ kind: detailSource.kind, value: detailSource.value, source: detailSource.source }).from(detailSource).where(eq(detailSource.contactId, c.id)).orderBy(asc(detailSource.createdAt))
    const sources = found.map((f) => ({ kind: f.kind, value: f.value, line: sourceLine(f.source) }))

    const events = await tx.select().from(storyEvent).where(eq(storyEvent.contactId, c.id)).orderBy(desc(storyEvent.at)).limit(200)
    const emails = ways.filter((w) => w.kind === 'email').map((w) => w.value)
    const mail = (emails.length
      ? await tx
          .select({
            id: mailMessage.id,
            direction: mailMessage.direction,
            subject: mailMessage.subject,
            excerpt: mailMessage.excerpt,
            fromName: mailMessage.fromName,
            sentAt: mailMessage.sentAt,
            mailbox: mailbox.address,
            toLine: mailMessage.toLine,
          })
          .from(mailMessage)
          .innerJoin(mailbox, eq(mailbox.id, mailMessage.mailboxId))
          // Mail they sent, or mail she sent to them. Not mail from someone else that only names them.
          .where(
            sql`((${mailMessage.direction} = 'in' and lower(${mailMessage.fromEmail}) in ${emails}) or (${mailMessage.direction} = 'out' and (${sql.join(
              emails.map((e) => sql`${mailMessage.toLine} ilike ${`%${likeEscape(e)}%`} escape '\\'`),
              sql` or `,
            )})))`,
          )
          .orderBy(desc(mailMessage.sentAt))
          .limit(200)
      : []
    ).filter((m) => m.direction === 'in' || addressesIn(m.toLine).some((x) => emails.includes(x))).slice(0, 50)
    const story: StoryItem[] = [
      ...events.map((e) => ({ id: e.id, kind: e.kind, at: e.at.toISOString(), body: e.body })),
      ...mail.map((m) => ({
        id: m.id,
        kind: 'email' as const,
        at: m.sentAt.toISOString(),
        body: { text: m.subject ?? '' },
        direction: m.direction,
        mailbox: m.mailbox,
        excerpt: m.excerpt,
        fromName: m.fromName,
      })),
    ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))

    return {
      id: c.id,
      business: c.business,
      fullName: c.fullName,
      goesBy: c.goesBy,
      ...(opts.withNickname ? { nickname: nick?.nickname ?? null } : {}),
      company: c.company,
      businessRole: c.businessRole,
      buyerStage: c.buyerStage,
      sellerStage: c.sellerStage,
      tab: tabFor(c),
      putAway: c.putAwayAt !== null,
      ways,
      mailingAddress: c.mailingAddress,
      homeAddress: c.homeAddress,
      reach: { preferredWay: c.preferredWay, bestTimes: c.bestTimes, noText: c.noText, noEmail: c.noEmail },
      dates: { birthday: c.birthday, weddingAnniversary: c.weddingAnniversary, homePurchaseDate: c.homePurchaseDate, clientSince: c.clientSince },
      personalNotes: c.personalNotes,
      buyerWants: c.buyerWants,
      sellerWants: c.sellerWants,
      found: { foundBy: c.foundBy, foundByOther: c.foundByOther, referredBy, referredByName: c.referredByName, recordedAt: c.foundRecordedAt?.toISOString() ?? null },
      referred,
      household: home,
      fields,
      sources,
      story,
      createdAt: c.createdAt.toISOString(),
    }
  })
}

// ---- Search text -----------------------------------------------------------

/** Rebuilds the words search looks through for these contacts. Never includes the nickname. */
export async function refreshSearch(tx: InWorkspace, contactIds: string[]): Promise<void> {
  for (const id of new Set(contactIds)) {
    const [c] = await tx.select().from(contact).where(eq(contact.id, id))
    if (!c) continue
    const ways = await tx.select({ kind: contactWay.kind, value: contactWay.value }).from(contactWay).where(eq(contactWay.contactId, id))
    const family = c.householdId ? await tx.select({ name: familyMember.name }).from(familyMember).where(eq(familyMember.householdId, c.householdId)) : []
    // A household is found as one: a dog noted on one partner's page finds them both.
    const housemates = c.householdId
      ? await tx
          .select({ personalNotes: contact.personalNotes })
          .from(contact)
          .where(and(eq(contact.householdId, c.householdId), ne(contact.id, id)))
      : []
    const values = await tx
      .select({ name: customField.name, type: customField.type, value: customValue.value })
      .from(customValue)
      .innerJoin(customField, eq(customField.id, customValue.fieldId))
      .where(eq(customValue.contactId, id))
    const notes = await tx.select({ body: storyEvent.body }).from(storyEvent).where(and(eq(storyEvent.contactId, id), eq(storyEvent.kind, 'note')))
    const parts = [
      c.fullName,
      c.goesBy,
      c.company,
      c.businessRole && businessRoleLabel(c.businessRole),
      c.buyerStage && `buyer ${c.buyerStage}`,
      c.sellerStage && `seller ${c.sellerStage}`,
      ...ways.flatMap((w) => (w.kind === 'phone' ? [w.value, w.value.replace(/\D/g, '')] : [w.value])),
      c.mailingAddress,
      c.homeAddress,
      c.bestTimes,
      c.personalNotes,
      ...Object.values(c.buyerWants).map((v) => (typeof v === 'string' ? v : null)),
      ...Object.values(c.sellerWants),
      c.foundBy && foundByLabel(c.foundBy),
      c.foundByOther,
      c.referredByName,
      ...family.map((f) => f.name),
      ...housemates.map((h) => h.personalNotes),
      ...values.map((v) => (v.type === 'yesno' ? (v.value === 'yes' ? v.name : null) : v.value)),
      ...notes.map((n) => n.body.text),
    ]
    const searchText = parts
      .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
      .join(' • ')
      .toLowerCase()
    await tx.update(contact).set({ searchText }).where(eq(contact.id, id))
  }
}

const householdOf = async (tx: InWorkspace, householdId: string) =>
  (await tx.select({ id: contact.id }).from(contact).where(eq(contact.householdId, householdId))).map((r) => r.id)

// ---- Changing --------------------------------------------------------------

async function mustFind(tx: InWorkspace, contactId: string) {
  const [c] = await tx.select().from(contact).where(eq(contact.id, contactId)).for('update')
  if (!c) throw new ContactNotFound()
  return c
}

/** Checks a referrer exists in this workspace (the wall hides any other). */
async function checkReferrer(tx: InWorkspace, referredById: string | null, self?: string): Promise<string | null> {
  if (!referredById) return null
  if (referredById === self) throw new ContactNotFound('referrer')
  const [r] = await tx.select({ fullName: contact.fullName }).from(contact).where(eq(contact.id, referredById))
  if (!r) throw new ContactNotFound('referrer')
  return r.fullName
}

const story = (tx: InWorkspace, workspaceId: string, contactId: string, kind: StoryKind, body: StoryBody, byUserId: string | null) =>
  tx.insert(storyEvent).values({ workspaceId, contactId, kind, body, byUserId })

const firstWays = (workspaceId: string, contactId: string, p: { phone: string | null; email: string | null }) => [
  ...(p.phone ? [{ workspaceId, contactId, kind: 'phone' as const, value: p.phone, label: 'mobile', position: 0 }] : []),
  ...(p.email ? [{ workspaceId, contactId, kind: 'email' as const, value: p.email.toLowerCase(), label: 'other', position: 1 }] : []),
]

/** Adds someone by hand. A partner joins them in one household, with the same sides and the same answer to how they found her. */
export async function addContact(db: Db, workspaceId: string, input: AddData, byUserId: string | null): Promise<{ ids: string[] }> {
  return inWorkspace(db, workspaceId, (tx) => addContactIn(tx, workspaceId, input, byUserId))
}

/**
 * The one way a contact is made, inside a transaction already in the
 * workspace. Add by hand uses it, and so does a Yes in List Builder
 * (shared/src/list/confirm.ts), so every rule here holds for both.
 */
export async function addContactIn(tx: InWorkspace, workspaceId: string, input: AddData, byUserId: string | null, via?: 'list_builder'): Promise<{ ids: string[] }> {
  {
    if (input.business) {
      const [c] = await tx
        .insert(contact)
        .values({ workspaceId, business: true, fullName: input.fullName, company: input.company, businessRole: input.businessRole })
        .returning({ id: contact.id })
      const ways = firstWays(workspaceId, c!.id, input)
      if (ways.length) await tx.insert(contactWay).values(ways)
      await story(tx, workspaceId, c!.id, 'added', via ? { via } : {}, byUserId)
      await refreshSearch(tx, [c!.id])
      return { ids: [c!.id] }
    }

    // The referrer's name is kept as it was, so the answer still reads right if they are ever removed.
    const referrerName = await checkReferrer(tx, input.referredById)
    const home = input.partner ? (await tx.insert(household).values({ workspaceId }).returning({ id: household.id }))[0]!.id : null
    const people = [{ fullName: input.fullName, phone: input.phone, email: input.email }, ...(input.partner ? [input.partner] : [])]
    const ids: string[] = []
    for (const p of people) {
      const [c] = await tx
        .insert(contact)
        .values({
          workspaceId,
          fullName: p.fullName,
          buyerStage: input.buyer ? (input.buyerStage ?? 'New') : null,
          sellerStage: input.seller ? (input.sellerStage ?? 'New') : null,
          foundBy: input.foundBy,
          foundByOther: input.foundByOther,
          referredById: input.referredById,
          referredByName: referrerName ?? input.referredByName,
          foundRecordedAt: new Date(),
          householdId: home,
        })
        .returning({ id: contact.id })
      const ways = firstWays(workspaceId, c!.id, p)
      if (ways.length) await tx.insert(contactWay).values(ways)
      await story(tx, workspaceId, c!.id, 'added', { text: foundByLabel(input.foundBy), ...(via ? { via } : {}) }, byUserId)
      ids.push(c!.id)
    }
    await refreshSearch(tx, ids)
    return { ids }
  }
}

const describeFound = (c: { foundBy: string | null; foundByOther: string | null; referredByName: string | null }, referrer: string | null) =>
  [c.foundBy ? foundByLabel(c.foundBy) : 'Not recorded', c.foundByOther, referrer ?? c.referredByName].filter(Boolean).join(', ')

/** Saves one part of the contact page. */
export async function saveContactPart(db: Db, workspaceId: string, contactId: string, data: PartData, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    const now = new Date()
    switch (data.part) {
      case 'names': {
        await tx
          .update(contact)
          .set({
            fullName: data.fullName,
            goesBy: data.goesBy,
            ...(c.business ? { company: data.company, businessRole: data.businessRole ?? c.businessRole } : {}),
            updatedAt: now,
          })
          .where(eq(contact.id, c.id))
        if (data.nickname) {
          await tx.insert(nickname).values({ workspaceId, contactId: c.id, nickname: data.nickname }).onConflictDoUpdate({ target: nickname.contactId, set: { nickname: data.nickname } })
        } else {
          await tx.delete(nickname).where(eq(nickname.contactId, c.id))
        }
        break
      }
      case 'ways': {
        await tx.delete(contactWay).where(eq(contactWay.contactId, c.id))
        if (data.ways.length) await tx.insert(contactWay).values(data.ways.map((w, i) => ({ workspaceId, contactId: c.id, kind: w.kind, value: w.value, label: w.label, position: i })))
        await tx.update(contact).set({ mailingAddress: data.mailingAddress, homeAddress: data.homeAddress, updatedAt: now }).where(eq(contact.id, c.id))
        break
      }
      case 'reach':
        await tx.update(contact).set({ preferredWay: data.preferredWay, bestTimes: data.bestTimes, noText: data.noText, noEmail: data.noEmail, updatedAt: now }).where(eq(contact.id, c.id))
        break
      case 'dates':
        await tx
          .update(contact)
          .set({ birthday: data.birthday, weddingAnniversary: data.weddingAnniversary, homePurchaseDate: data.homePurchaseDate, clientSince: data.clientSince, updatedAt: now })
          .where(eq(contact.id, c.id))
        break
      case 'personal':
        await tx.update(contact).set({ personalNotes: data.personalNotes, updatedAt: now }).where(eq(contact.id, c.id))
        break
      case 'wants':
        await tx.update(contact).set({ buyerWants: data.buyerWants, sellerWants: data.sellerWants, updatedAt: now }).where(eq(contact.id, c.id))
        break
      case 'found': {
        await checkReferrer(tx, data.referredById, c.id)
        const changed =
          c.foundBy !== data.foundBy || c.foundByOther !== data.foundByOther || c.referredById !== data.referredById || (!data.referredById && c.referredByName !== data.referredByName)
        if (!changed) break
        const oldReferrer = c.referredById ? ((await tx.select({ fullName: contact.fullName }).from(contact).where(eq(contact.id, c.referredById)))[0]?.fullName ?? null) : null
        // Rule 6: the answer given when they were added is never lost. The story keeps what it was.
        const newReferrer = data.referredById ? ((await tx.select({ fullName: contact.fullName }).from(contact).where(eq(contact.id, data.referredById)))[0]?.fullName ?? null) : null
        const referredByName = newReferrer ?? data.referredByName
        await story(tx, workspaceId, c.id, 'found', { was: describeFound(c, oldReferrer), to: describeFound({ ...data, referredByName }, null) }, byUserId)
        // foundRecordedAt is left alone: it is the moment they were added.
        await tx
          .update(contact)
          .set({ foundBy: data.foundBy, foundByOther: data.foundByOther, referredById: data.referredById, referredByName, updatedAt: now })
          .where(eq(contact.id, c.id))
        break
      }
      case 'sides': {
        if (c.business) break
        const changes: Array<{ side: Side; from: string | null; to: string | null }> = []
        // A side turned back on returns to the stage it had, never silently to New.
        const buyerStage = data.buyer ? (c.buyerStage ?? (await lastStage(tx, c.id, 'buyer'))) : null
        const sellerStage = data.seller ? (c.sellerStage ?? (await lastStage(tx, c.id, 'seller'))) : null
        if (buyerStage !== c.buyerStage) changes.push({ side: 'buyer', from: c.buyerStage, to: buyerStage })
        if (sellerStage !== c.sellerStage) changes.push({ side: 'seller', from: c.sellerStage, to: sellerStage })
        await tx.update(contact).set({ buyerStage, sellerStage, updatedAt: now }).where(eq(contact.id, c.id))
        for (const ch of changes) {
          await story(tx, workspaceId, c.id, 'stage', ch.to ? { side: ch.side, from: null, to: ch.to } : { side: ch.side, from: ch.from, text: `No longer a ${ch.side}` }, byUserId)
        }
        break
      }
    }
    await refreshSearch(tx, c.householdId ? await householdOf(tx, c.householdId) : [c.id])
  })
}

/** The stage a side had when it was last turned off, or New. */
async function lastStage(tx: InWorkspace, contactId: string, side: Side): Promise<string> {
  const [e] = await tx
    .select({ body: storyEvent.body })
    .from(storyEvent)
    .where(and(eq(storyEvent.contactId, contactId), eq(storyEvent.kind, 'stage'), sql`${storyEvent.body}->>'side' = ${side}`, sql`${storyEvent.body} ? 'text'`))
    .orderBy(desc(storyEvent.at))
    .limit(1)
  return e?.body.from ?? 'New'
}

export type MoveResult = { ok: true } | { ok: false; reason: 'gone' | 'refused' | 'confirm' }

/**
 * Moves one side's stage. Something automatic may only move forward. She
 * may move anyone anywhere, but moving back is asked first ("Move back to
 * Talking?") and only goes ahead with confirmBack.
 */
export async function moveStage(
  db: Db,
  workspaceId: string,
  m: { contactId: string; side: Side; to: string; mover: Mover; confirmBack?: boolean; byUserId: string | null },
): Promise<MoveResult> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const [c] = await tx.select().from(contact).where(eq(contact.id, m.contactId)).for('update')
    if (!c) return { ok: false, reason: 'gone' } as const
    if (c.business) return { ok: false, reason: 'refused' } as const
    const from = m.side === 'buyer' ? c.buyerStage : c.sellerStage
    if (from === null || !mayMove(m.mover, m.side, from, m.to)) return { ok: false, reason: 'refused' } as const
    if (isBackward(m.side, from, m.to) && !m.confirmBack) return { ok: false, reason: 'confirm' } as const
    await tx
      .update(contact)
      .set(m.side === 'buyer' ? { buyerStage: m.to, updatedAt: new Date() } : { sellerStage: m.to, updatedAt: new Date() })
      .where(eq(contact.id, c.id))
    await story(tx, workspaceId, c.id, 'stage', { side: m.side, from, to: m.to }, m.byUserId)
    await refreshSearch(tx, [c.id])
    return { ok: true } as const
  })
}

/** A note she types on the page. It goes into the story and into search. */
export async function addNote(db: Db, workspaceId: string, contactId: string, text: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    await story(tx, workspaceId, c.id, 'note', { text }, byUserId)
    await refreshSearch(tx, [c.id])
  })
}

/** Links two contacts as one household. Two households become one, family and all. */
export async function joinHousehold(db: Db, workspaceId: string, contactId: string, otherId: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    if (contactId === otherId) throw new ContactNotFound('partner')
    // Both rows locked in one order, so two links made at once cannot block each other.
    const both = await tx.select().from(contact).where(inArray(contact.id, [contactId, otherId])).orderBy(asc(contact.id)).for('update')
    const c = both.find((x) => x.id === contactId)
    const o = both.find((x) => x.id === otherId)
    if (!c) throw new ContactNotFound()
    if (!o) throw new ContactNotFound('partner')
    if (c.householdId && c.householdId === o.householdId) return
    let home = c.householdId ?? o.householdId
    if (!home) home = (await tx.insert(household).values({ workspaceId }).returning({ id: household.id }))[0]!.id
    const merging = [c.householdId, o.householdId].filter((h): h is string => h !== null && h !== home)
    for (const old of merging) {
      await tx.update(contact).set({ householdId: home }).where(eq(contact.householdId, old))
      await tx.update(familyMember).set({ householdId: home }).where(eq(familyMember.householdId, old))
      await tx.delete(household).where(eq(household.id, old))
    }
    await tx.update(contact).set({ householdId: home }).where(inArray(contact.id, [c.id, o.id]))
    await story(tx, workspaceId, c.id, 'household', { withName: o.fullName }, byUserId)
    await story(tx, workspaceId, o.id, 'household', { withName: c.fullName }, byUserId)
    await refreshSearch(tx, await householdOf(tx, home))
  })
}

/** Takes one contact out of their household. The household and its family stay with the others. */
export async function leaveHousehold(db: Db, workspaceId: string, contactId: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    if (!c.householdId) return
    const others = (await householdOf(tx, c.householdId)).filter((x) => x !== c.id)
    // Leaving would leave the household, and its family, with nobody: refused, so nothing is lost.
    if (others.length === 0) throw new ContactRefused(`${c.fullName} is the only one in this household, so there is nothing to leave.`)
    await tx.update(contact).set({ householdId: null }).where(eq(contact.id, c.id))
    await story(tx, workspaceId, c.id, 'household', { text: 'Left the household' }, byUserId)
    await refreshSearch(tx, [c.id, ...others])
  })
}

/** Adds a child or other family member (not a contact themselves) to this contact's household, making one if needed. */
export async function addFamily(db: Db, workspaceId: string, contactId: string, f: { name: string; relation: string; birthday: string | null }, _byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    let home = c.householdId
    if (!home) {
      home = (await tx.insert(household).values({ workspaceId }).returning({ id: household.id }))[0]!.id
      await tx.update(contact).set({ householdId: home }).where(eq(contact.id, c.id))
    }
    await tx.insert(familyMember).values({ workspaceId, householdId: home, name: f.name, relation: f.relation, birthday: f.birthday })
    await refreshSearch(tx, await householdOf(tx, home))
  })
}

export async function removeFamily(db: Db, workspaceId: string, contactId: string, familyId: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    if (!c.householdId) throw new ContactNotFound('family member')
    const gone = await tx
      .delete(familyMember)
      .where(and(eq(familyMember.id, familyId), eq(familyMember.householdId, c.householdId)))
      .returning({ name: familyMember.name })
    if (gone.length === 0) throw new ContactNotFound('family member')
    await story(tx, workspaceId, c.id, 'household', { text: `Removed ${gone[0]!.name} from the household` }, byUserId)
    await refreshSearch(tx, await householdOf(tx, c.householdId))
  })
}

/** One of her own fields, shown on every contact's page (decision 6). */
export async function addCustomField(db: Db, workspaceId: string, f: { name: string; type: string }): Promise<{ id: string }> {
  return inWorkspace(db, workspaceId, async (tx) => (await tx.insert(customField).values({ workspaceId, name: f.name, type: f.type }).returning({ id: customField.id }))[0]!)
}

/** Sets or clears her own field on one contact. A yes/no field holds "yes" or nothing. */
export async function setCustomValue(db: Db, workspaceId: string, contactId: string, fieldId: string, value: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    const [f] = await tx.select().from(customField).where(eq(customField.id, fieldId))
    if (!f) throw new ContactNotFound('field')
    const v = f.type === 'yesno' ? (value === 'yes' ? 'yes' : null) : value?.trim() || null
    if (v === null) await tx.delete(customValue).where(and(eq(customValue.contactId, c.id), eq(customValue.fieldId, f.id)))
    else await tx.insert(customValue).values({ workspaceId, contactId: c.id, fieldId: f.id, value: v }).onConflictDoUpdate({ target: [customValue.contactId, customValue.fieldId], set: { value: v } })
    await refreshSearch(tx, [c.id])
  })
}

/** Hides someone from lists and search (decision 7). Nothing is deleted; Bring back undoes it. */
export async function putAway(db: Db, workspaceId: string, contactId: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    if (c.putAwayAt) return
    await tx.update(contact).set({ putAwayAt: new Date() }).where(eq(contact.id, c.id))
    await story(tx, workspaceId, c.id, 'put_away', {}, byUserId)
  })
}

export async function bringBack(db: Db, workspaceId: string, contactId: string, byUserId: string | null): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const c = await mustFind(tx, contactId)
    if (!c.putAwayAt) return
    await tx.update(contact).set({ putAwayAt: null }).where(eq(contact.id, c.id))
    await story(tx, workspaceId, c.id, 'brought_back', {}, byUserId)
  })
}
