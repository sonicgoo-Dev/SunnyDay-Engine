// Her answers. This is the ONLY place a person List Builder found can
// become a contact, and only by a call that carries her own answer (Yes,
// "Yes to all ten", a tick, "add this detail"). A test reads the code and
// fails if any other file in the List Builder or the worker can do it.
//
// A Yes goes through addContactIn, the same code as Add by hand, so every
// contact rule holds: how they found her is recorded at that moment (rule
// 6), stages are valid, the nickname is untouched.
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { AddData } from '../contacts/input.js'
import { addContactIn, addressesIn, refreshSearch } from '../contacts/store.js'
import type { Db } from '../db/client.js'
import { contact, contactWay, detailSource, familyMember, household, listMail, listPerson, listRun, mailMessage, mailbox, setting, type FoundDetail, type ListProposal } from '../db/schema/index.js'
import { inWorkspace, type InWorkspace } from '../db/workspace.js'
import { detailKey, type PersonRow } from './people.js'
import { MAX_YEARS, PAGE_SIZE, cardNeeds, cleanDetail, defaultsFor, sourceLine, stageIn, yesInput, type CardView, type DetailKind, type TickChoice, type YesData } from './rules.js'
import { ListRefused, cardsWaiting } from './runs.js'

const GONE = 'That person is no longer waiting for an answer.'

// ---- Putting details on a contact -------------------------------------------

type Chosen = { kind: DetailKind; value: string; label?: string | undefined; source: FoundDetail['source'] }

/** What a contact's page already holds, as keys, so nothing is added twice or proposed again. */
async function alreadyOn(tx: InWorkspace, contactId: string): Promise<{ keys: Set<string>; c: typeof contact.$inferSelect }> {
  const [c] = await tx.select().from(contact).where(eq(contact.id, contactId))
  if (!c) throw new ListRefused(GONE)
  const ways = await tx.select({ kind: contactWay.kind, value: contactWay.value }).from(contactWay).where(eq(contactWay.contactId, contactId))
  const family = c.householdId ? await tx.select({ name: familyMember.name }).from(familyMember).where(eq(familyMember.householdId, c.householdId)) : []
  const mates = c.householdId ? await tx.select({ fullName: contact.fullName }).from(contact).where(eq(contact.householdId, c.householdId)) : []
  const keys = new Set<string>([
    ...ways.map((w) => detailKey(w.kind, w.value)),
    ...[c.homeAddress, c.mailingAddress].filter((a): a is string => Boolean(a)).map((a) => detailKey('address', a)),
    ...(c.company ? [detailKey('company', c.company)] : []),
    ...[...family.map((f) => f.name), ...mates.map((m) => m.fullName)].map((n) => detailKey('partner', n)),
  ])
  return { keys, c }
}

/** True when the page has room for this detail (an address needs an empty address line; a company is for a business contact). */
const fits = (c: typeof contact.$inferSelect, d: { kind: string }) => (d.kind === 'address' ? !c.homeAddress || !c.mailingAddress : d.kind === 'company' ? c.business && !c.company : true)

/** Saves the chosen details onto a contact's page, each with where it came from. */
async function putOn(tx: InWorkspace, workspaceId: string, contactId: string, chosen: Chosen[]): Promise<void> {
  for (const d of chosen) {
    const { keys, c } = await alreadyOn(tx, contactId)
    const on = keys.has(detailKey(d.kind, d.value))
    if (!on) {
      if (!fits(c, d)) continue
      if (d.kind === 'phone' || d.kind === 'email') {
        const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(contactWay).where(eq(contactWay.contactId, contactId))
        if (n >= 20) continue
        await tx.insert(contactWay).values({ workspaceId, contactId, kind: d.kind, value: d.value, label: d.label ?? (d.kind === 'phone' ? 'mobile' : 'other'), position: n })
      } else if (d.kind === 'address') {
        await tx.update(contact).set(c.homeAddress ? { mailingAddress: d.value } : { homeAddress: d.value }).where(eq(contact.id, contactId))
      } else if (d.kind === 'company') {
        await tx.update(contact).set({ company: d.value }).where(eq(contact.id, contactId))
      } else {
        // A partner who is not a contact themselves: family on the household, as on the contact page.
        let home = c.householdId
        if (!home) {
          home = (await tx.insert(household).values({ workspaceId }).returning({ id: household.id }))[0]!.id
          await tx.update(contact).set({ householdId: home }).where(eq(contact.id, contactId))
        }
        await tx.insert(familyMember).values({ workspaceId, householdId: home, name: d.value, relation: 'partner', birthday: null })
      }
    }
    await tx.insert(detailSource).values({ workspaceId, contactId, kind: d.kind, value: d.value, source: d.source })
  }
  await tx.update(contact).set({ updatedAt: new Date() }).where(eq(contact.id, contactId))
}

/** Their story should show the history: the top lines read for them are copied to where the story looks. */
async function keepTheirMail(tx: InWorkspace, workspaceId: string, emails: string[]): Promise<void> {
  if (emails.length === 0) return
  const lines = await tx
    .select()
    .from(listMail)
    .where(
      sql`((${listMail.direction} = 'in' and lower(${listMail.fromEmail}) in ${emails}) or (${listMail.direction} = 'out' and (${sql.join(
        emails.map((e) => sql`${listMail.toLine} ilike ${`%${e.replace(/[\\%_]/g, (m) => `\\${m}`)}%`} escape '\\'`),
        sql` or `,
      )})))`,
    )
  const theirs = lines.filter((l) => (l.direction === 'in' ? emails.includes((l.fromEmail ?? '').toLowerCase()) : addressesIn(l.toLine).some((e) => emails.includes(e))))
  for (let i = 0; i < theirs.length; i += 500) {
    await tx
      .insert(mailMessage)
      .values(theirs.slice(i, i + 500).map(({ id: _id, runId: _run, bulk: _bulk, ...m }) => ({ ...m, workspaceId })))
      .onConflictDoNothing()
  }
}

// ---- Yes, No ------------------------------------------------------------------

/** Makes the contact for one person from her answer. The single place this happens. */
async function makeContact(tx: InWorkspace, workspaceId: string, p: PersonRow, data: YesData, byUserId: string | null): Promise<string> {
  const kept: Chosen[] = []
  for (const k of data.details) {
    const found = p.details.find((d) => d.id === k.id)
    if (!found) continue
    const value = cleanDetail(found.kind, k.value)
    if (value) kept.push({ kind: found.kind, value, label: k.label ?? found.label, source: found.source })
  }
  const firstPhone = kept.find((d) => d.kind === 'phone')
  const email = p.emails[0] ?? kept.find((d) => d.kind === 'email')?.value ?? null
  const input: AddData =
    data.kind === 'business'
      ? { business: true, fullName: data.fullName, phone: firstPhone?.value ?? null, email, company: data.company ?? kept.find((d) => d.kind === 'company')?.value ?? null, businessRole: data.businessRole! }
      : {
          business: false,
          fullName: data.fullName,
          phone: firstPhone?.value ?? null,
          email,
          buyer: data.buyer,
          seller: data.seller,
          // Decision 7: a past client as "Past client", a lead as "Talking", a client now only at the stage she picked.
          buyerStage: data.buyer ? stageIn(data.kind, 'buyer', data.buyerStage) : null,
          sellerStage: data.seller ? stageIn(data.kind, 'seller', data.sellerStage) : null,
          foundBy: data.foundBy,
          foundByOther: data.foundByOther,
          referredById: null,
          referredByName: null,
          partner: null,
        }
  const { ids } = await addContactIn(tx, workspaceId, input, byUserId, 'list_builder')
  const contactId = ids[0]!
  // The label she chose for the first phone, and every other address they write from.
  if (firstPhone?.label) await tx.update(contactWay).set({ label: firstPhone.label }).where(and(eq(contactWay.contactId, contactId), eq(contactWay.kind, 'phone')))
  const fromMail = { from: 'email' as const }
  await putOn(tx, workspaceId, contactId, [...(p.inMail ? p.emails.map((e) => ({ kind: 'email' as const, value: e, source: fromMail })) : []), ...kept])
  await keepTheirMail(tx, workspaceId, p.emails)
  await refreshSearch(tx, [contactId])
  const keptIds = new Set(data.details.map((d) => d.id))
  await tx
    .update(listPerson)
    .set({ state: 'yes', contactId, name: data.fullName, lookRunId: null, answeredAt: new Date(), updatedAt: new Date(), details: p.details.map((d) => ({ ...d, status: keptIds.has(d.id) ? ('added' as const) : ('skipped' as const) })) })
    .where(eq(listPerson.id, p.id))
  return contactId
}

const waiting = async (tx: InWorkspace, personId: string): Promise<PersonRow> => {
  const [p] = await tx.select().from(listPerson).where(eq(listPerson.id, personId)).for('update')
  if (!p || p.contactId !== null || p.state === 'yes' || p.state === 'no') throw new ListRefused(GONE)
  return p
}

/** Yes to one card, with whatever she changed. Returns the new contact's id. */
export async function sayYes(db: Db, workspaceId: string, answer: unknown, byUserId: string | null): Promise<{ contactId: string }> {
  const data = yesInput.parse(answer)
  return inWorkspace(db, workspaceId, async (tx) => {
    const p = await waiting(tx, data.personId)
    if (p.state !== 'proposed') throw new ListRefused(GONE)
    return { contactId: await makeContact(tx, workspaceId, p, data, byUserId) }
  })
}

/** No. Remembered by name and address only, so they are never proposed again (decision 10). */
export async function sayNo(db: Db, workspaceId: string, personId: string): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const p = await waiting(tx, personId)
    await tx.update(listPerson).set({ state: 'no', proposal: null, details: [], lookRunId: null, answeredAt: new Date(), updatedAt: new Date() }).where(eq(listPerson.id, p.id))
  })
}

/**
 * "Yes to all ten": each card on the page she has looked through is saved
 * as proposed. A card that still needs something from her (a name, a kind,
 * a side, a client's stage) is left for her, and counted.
 */
export async function yesToAll(db: Db, workspaceId: string, personIds: string[], byUserId: string | null): Promise<{ added: number; left: number; addedIds: string[] }> {
  const addedIds: string[] = []
  let left = 0
  for (const personId of personIds.slice(0, PAGE_SIZE)) {
    await inWorkspace(db, workspaceId, async (tx) => {
      const [p] = await tx.select().from(listPerson).where(eq(listPerson.id, personId)).for('update')
      if (!p || p.state !== 'proposed' || p.contactId !== null || !p.proposal) return
      const card = cardOf(p)
      const answer = yesInput.safeParse(defaultsFor(card))
      if (cardNeeds(card).length > 0 || !answer.success) return void left++
      await makeContact(tx, workspaceId, p, answer.data, byUserId)
      addedIds.push(p.id)
    })
  }
  return { added: addedIds.length, left, addedIds }
}

/** Moves someone out of "Not contacts" (a machine by the sort, a nobody by the AI, or her own No) back to a card she fills in. */
export async function pullOut(db: Db, workspaceId: string, personId: string): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const [p] = await tx.select().from(listPerson).where(eq(listPerson.id, personId)).for('update')
    if (!p || p.contactId !== null || p.state === 'yes' || p.state === 'proposed') throw new ListRefused(GONE)
    if (p.state !== 'no' && p.bucket !== 'not_contact') throw new ListRefused(GONE)
    const proposal: ListProposal = { kind: 'unsure', side: null, businessRole: null, company: null, why: 'You moved them out of Not contacts.', sure: 'low', foundBy: null, foundByOther: null }
    await tx.update(listPerson).set({ state: 'proposed', bucket: 'person', proposal, lookRunId: null, answeredAt: null, updatedAt: new Date() }).where(eq(listPerson.id, p.id))
  })
}

/** "Add this detail?" on someone already in Contacts: the ones she kept go on their page; the rest are not asked again. */
export async function keepDetails(db: Db, workspaceId: string, personId: string, keep: string[]): Promise<void> {
  await inWorkspace(db, workspaceId, async (tx) => {
    const [p] = await tx.select().from(listPerson).where(eq(listPerson.id, personId)).for('update')
    if (!p || p.state !== 'yes' || !p.contactId) throw new ListRefused(GONE)
    const open = p.details.filter((d) => d.status === 'open')
    await putOn(tx, workspaceId, p.contactId, open.filter((d) => keep.includes(d.id)).map((d) => ({ kind: d.kind, value: d.value, label: d.label, source: d.source })))
    await refreshSearch(tx, [p.contactId])
    await tx
      .update(listPerson)
      .set({ details: p.details.map((d) => (d.status === 'open' ? { ...d, status: keep.includes(d.id) ? ('added' as const) : ('skipped' as const) } : d)), updatedAt: new Date() })
      .where(eq(listPerson.id, p.id))
  })
}

const TICKS: Record<TickChoice, Pick<YesData, 'kind' | 'buyer' | 'seller'>> = {
  past_buyer: { kind: 'past_client', buyer: true, seller: false },
  past_seller: { kind: 'past_client', buyer: false, seller: true },
  lead_buyer: { kind: 'lead', buyer: true, seller: false },
  lead_seller: { kind: 'lead', buyer: false, seller: true },
  business: { kind: 'business', buyer: false, seller: false },
}

/** The tick list: people from Google Contacts or the phone file with no mail. Each one she chose is added as what she chose. */
export async function addTicked(db: Db, workspaceId: string, picks: Array<{ personId: string; as: TickChoice }>, byUserId: string | null): Promise<{ added: number }> {
  let added = 0
  for (const pick of picks) {
    await inWorkspace(db, workspaceId, async (tx) => {
      const [p] = await tx.select().from(listPerson).where(eq(listPerson.id, pick.personId)).for('update')
      if (!p || p.state !== 'new' || p.contactId !== null || p.bucket !== 'person' || !p.name?.trim()) return
      const data: YesData = {
        personId: p.id,
        fullName: p.name.trim(),
        ...TICKS[pick.as],
        buyerStage: null,
        sellerStage: null,
        businessRole: pick.as === 'business' ? 'other' : null,
        company: null,
        // Rule 6: nothing shows how they found her, so the honest answer is recorded, and she can change it.
        foundBy: 'unknown',
        foundByOther: null,
        details: p.details.map((d) => ({ id: d.id, value: d.value })),
      }
      await makeContact(tx, workspaceId, p, data, byUserId)
      added++
    })
  }
  return { added }
}

// ---- What the screens show ----------------------------------------------------

const iso = (d: Date | null) => d?.toISOString() ?? null

function cardOf(p: PersonRow, hide: Set<string> = new Set()): CardView {
  const pr = p.proposal
  return {
    id: p.id,
    name: p.name,
    emails: p.emails,
    kind: pr?.kind ?? 'unsure',
    side: pr?.side ?? null,
    businessRole: pr?.businessRole ?? null,
    company: pr?.company ?? null,
    why: pr?.why ?? '',
    sure: pr?.sure ?? 'low',
    foundBy: pr?.foundBy ?? null,
    foundByOther: pr?.foundByOther ?? null,
    inCount: p.inCount,
    outCount: p.outCount,
    firstAt: iso(p.firstAt),
    lastAt: iso(p.lastAt),
    inMail: p.inMail,
    inGoogle: p.inGoogle,
    inPhone: p.inPhone,
    details: p.details
      .filter((d) => d.status === 'open' && !hide.has(detailKey(d.kind, d.value)) && !(d.kind === 'email' && p.emails[0] === d.value))
      .map((d) => ({ id: d.id, kind: d.kind, value: d.value, label: d.label ?? null, line: sourceLine(d.source) })),
  }
}

const isCard = and(eq(listPerson.state, 'proposed'), eq(listPerson.bucket, 'person'))
const isTick = and(eq(listPerson.state, 'new'), eq(listPerson.bucket, 'person'), eq(listPerson.inMail, false), isNull(listPerson.lookRunId), isNull(listPerson.contactId))
const isNot = or(eq(listPerson.state, 'no'), and(eq(listPerson.bucket, 'not_contact'), eq(listPerson.state, 'new')))
const count = (tx: InWorkspace, where: ReturnType<typeof and>) =>
  tx
    .select({ n: sql<number>`count(*)::int` })
    .from(listPerson)
    .where(where)
    .then((r) => r[0]?.n ?? 0)

/** People already in Contacts for whom something new was found that their page does not hold yet. */
async function detailCards(tx: InWorkspace): Promise<Array<{ id: string; contactId: string; name: string; details: CardView['details'] }>> {
  const rows = await tx
    .select()
    .from(listPerson)
    .where(and(eq(listPerson.state, 'yes'), sql`${listPerson.contactId} is not null`, sql`${listPerson.details} @> '[{"status":"open"}]'::jsonb`))
    .orderBy(asc(listPerson.name))
    .limit(200)
  const out = []
  for (const p of rows) {
    const { keys, c } = await alreadyOn(tx, p.contactId!)
    const details = cardOf(p, keys).details.filter((d) => fits(c, d) && !(d.kind === 'email' && p.emails.includes(d.value) && keys.has(detailKey('email', d.value))))
    if (details.length) out.push({ id: p.id, contactId: p.contactId!, name: c.fullName, details })
  }
  return out
}

const HIDDEN = 'list_card_hidden'

export type ListStatus = {
  /** The year being worked on or last finished; null before she has ever started. */
  run: { year: number; status: 'reading' | 'sorting' | 'thinking' | 'paused' | 'ready'; pausedWhy: 'limit' | 'not_ready' | null; messagesRead: number; toLook: number; looked: number; fromAt: string; toAt: string; problems: string[] } | null
  yearsRead: number
  cards: number
  details: number
  ticks: number
  notContacts: number
  hasMailbox: boolean
  /** Gmail is connected but without the contacts permission: Google Contacts are left out until she reconnects. */
  contactsMissing: boolean
  canGoBack: boolean
  hidden: boolean
}

/** Everything the card on Contacts needs to say where List Builder stands. */
export async function listStatus(db: Db, workspaceId: string): Promise<ListStatus> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const runs = await tx.select().from(listRun).orderBy(asc(listRun.year))
    const last = runs.at(-1)
    const boxes = await tx.select({ kind: mailbox.kind, role: mailbox.role, canReadContacts: mailbox.canReadContacts }).from(mailbox).where(eq(mailbox.status, 'connected'))
    const cards = await cardsWaiting(tx)
    const [hidden] = await tx.select({ value: setting.value }).from(setting).where(eq(setting.name, HIDDEN))
    return {
      run: last
        ? {
            year: last.year,
            status: last.status,
            pausedWhy: last.pausedWhy,
            messagesRead: last.messagesRead,
            toLook: last.toLook,
            looked: last.looked,
            fromAt: last.fromAt.toISOString(),
            toAt: last.toAt.toISOString(),
            problems: [...new Set([last.lastProblem, ...Object.values(last.parts).map((p) => p.problem)].filter((x): x is string => Boolean(x)))],
          }
        : null,
      yearsRead: runs.length,
      cards,
      details: (await detailCards(tx)).length,
      ticks: await count(tx, isTick),
      notContacts: await count(tx, isNot),
      hasMailbox: boxes.length > 0,
      contactsMissing: boxes.some((b) => b.kind === 'gmail' && b.role === 'main' && !b.canReadContacts),
      canGoBack: Boolean(last) && last!.status === 'ready' && cards === 0 && runs.length < MAX_YEARS,
      hidden: hidden?.value === 'yes',
    }
  })
}

/** "Finished for now" tucks the card away; a link on Contacts brings it back. */
export async function hideListCard(db: Db, workspaceId: string, hidden: boolean): Promise<void> {
  await inWorkspace(db, workspaceId, (tx) =>
    tx
      .insert(setting)
      .values({ workspaceId, name: HIDDEN, value: hidden ? 'yes' : 'no' })
      .onConflictDoUpdate({ target: [setting.workspaceId, setting.name], set: { value: hidden ? 'yes' : 'no', updatedAt: sql`now()` } }),
  )
}

export type TickRow = { id: string; name: string; line: string; from: string }
export type NotRow = { id: string; name: string | null; email: string | null; saidNo: boolean }
export type ListPage =
  | { view: 'cards'; cards: CardView[]; left: number }
  | { view: 'details'; people: Awaited<ReturnType<typeof detailCards>> }
  | { view: 'ticks'; people: TickRow[]; left: number }
  | { view: 'not'; people: NotRow[]; total: number }

const SURE_ORDER = sql`case ${listPerson.proposal}->>'sure' when 'high' then 0 when 'medium' then 1 else 2 end`

/** One page of what waits for her: ten cards, the "add this detail?" cards, the tick list, or "Not contacts". */
export async function listPage(db: Db, workspaceId: string, view: 'cards' | 'details' | 'ticks' | 'not', q?: string): Promise<ListPage> {
  return inWorkspace(db, workspaceId, async (tx) => {
    if (view === 'cards') {
      // The surest first; then those she has written to most; then the most recent.
      const rows = await tx.select().from(listPerson).where(isCard).orderBy(SURE_ORDER, desc(listPerson.outCount), desc(listPerson.lastAt), asc(listPerson.id)).limit(PAGE_SIZE)
      return { view, cards: rows.map((p) => cardOf(p)), left: await cardsWaiting(tx) }
    }
    if (view === 'details') return { view, people: await detailCards(tx) }
    if (view === 'ticks') {
      const rows = await tx.select().from(listPerson).where(and(isTick, sql`coalesce(${listPerson.name}, '') <> ''`)).orderBy(asc(sql`lower(${listPerson.name})`)).limit(200)
      const people = rows.map((p) => ({
        id: p.id,
        name: p.name!,
        line: [p.emails[0], p.details.find((d) => d.kind === 'phone')?.value].filter(Boolean).join(' · '),
        from: p.inGoogle && p.inPhone ? 'Google Contacts and your phone' : p.inGoogle ? 'Google Contacts' : 'your phone',
      }))
      return { view, people, left: await count(tx, isTick) }
    }
    const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null
    const where = like ? and(isNot, or(ilike(listPerson.name, like), sql`${listPerson.emails}::text ilike ${like}`)) : isNot
    const rows = await tx.select().from(listPerson).where(where).orderBy(sql`${listPerson.answeredAt} desc nulls last`, desc(listPerson.inCount), asc(listPerson.id)).limit(100)
    return { view, people: rows.map((p) => ({ id: p.id, name: p.name, email: p.emails[0] ?? null, saidNo: p.state === 'no' })), total: await count(tx, isNot) }
  })
}
