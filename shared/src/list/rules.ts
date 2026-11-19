// The rules for List Builder that hold everywhere: how many years, how
// many cards at a time, what each kind of person goes in as, what a card
// still needs from her, and the checks on her answers. Plain logic with no
// database, so the screens use it too (through "@sunnyday/shared/rules").
import { z } from 'zod'
import { emailValue, phoneValue } from '../contacts/input.js'
import { BUSINESS_ROLE_KEYS, BUYER_STAGES, FOUND_BY_KEYS, SELLER_STAGES, WAY_LABELS, type Side } from '../contacts/rules.js'

/** One year at a time, and never further back than this (decision 1, Eric, Nov 18, 2026). */
export const MAX_YEARS = 5
/** Ten cards at a time, then "Keep going" or "That's enough for today". */
export const PAGE_SIZE = 10
/** The AI reads at most this many messages for one person (decision 3). */
export const MESSAGES_PER_PERSON = 8
/** What the card says the first read usually costs, in dollars a year of mail. An estimate. */
export const COST_PER_YEAR = { low: 1, high: 2 }
/** Roughly how long she spends on one card, for "about 10 minutes". */
const SECONDS_PER_CARD = 10

export const minutesFor = (cards: number) => Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60))

export type Kind = 'past_client' | 'client' | 'lead' | 'business' | 'nobody' | 'unsure'
/** The kinds she can say Yes to. */
export const YES_KINDS = ['past_client', 'client', 'lead', 'business'] as const
export type YesKind = (typeof YES_KINDS)[number]
export const KIND_NAMES: Record<Kind, string> = {
  past_client: 'Past client',
  client: 'Client now',
  lead: 'Lead',
  business: 'Business contact',
  nobody: 'Not a contact',
  unsure: 'Not sure',
}

const LEAD = ['New', 'Written to', 'Talking'] as const
/** The stages a client now may go in at: past Talking, short of Past client. She picks; List Builder never guesses (decision 7). */
export const clientStagesFor = (side: Side): string[] => (side === 'buyer' ? BUYER_STAGES : SELLER_STAGES).filter((s) => !(LEAD as readonly string[]).includes(s) && s !== 'Past client')
export const LEAD_STAGES_IN: readonly string[] = LEAD

/**
 * The stage a side goes in at (decision 7): a past client as "Past
 * client", a lead as "Talking" unless she chose another lead stage, and a
 * client now only at the stage she picked. Null means: not valid.
 */
export function stageIn(kind: YesKind, side: Side, chosen: string | null): string | null {
  if (kind === 'business') return null
  if (kind === 'past_client') return 'Past client'
  if (kind === 'lead') return chosen === null ? 'Talking' : LEAD_STAGES_IN.includes(chosen) ? chosen : null
  return chosen !== null && clientStagesFor(side).includes(chosen) ? chosen : null
}

export type CardNeed = 'name' | 'kind' | 'side' | 'stage'
/** What a card still needs from her before Yes can save it. "Yes to all ten" leaves these cards for her. */
export function cardNeeds(p: { name: string | null; kind: Kind; side: 'buyer' | 'seller' | 'both' | null }): CardNeed[] {
  const needs: CardNeed[] = []
  if (!p.name?.trim()) needs.push('name')
  if (p.kind === 'unsure' || p.kind === 'nobody') return [...needs, 'kind']
  if (p.kind !== 'business' && p.side === null) needs.push('side')
  if (p.kind === 'client') needs.push('stage')
  return needs
}

/**
 * An address that is plainly a machine: no-reply, notifications, a mailing
 * list. Deliberately narrow: "info@" or "office@" may be a title company,
 * so those are left for the AI to look at.
 */
export function looksAutomated(address: string): boolean {
  const local = address.toLowerCase().split('@')[0] ?? ''
  return /(^|[._+-])(no[._-]?reply|do[._-]?not[._-]?reply|donotreply|mailer[._-]?daemon|postmaster|bounces?|notifications?|notify|newsletters?|news|alerts?|digest|receipts?|billing|invoices?|unsubscribe|marketing|promo(tions)?|updates?|automated|system|robot|listserv)($|[._+-]|\d)/.test(local)
}

/** A phone number as its digits alone, without a leading US "1": how two sources' numbers are matched. */
export function phoneKey(value: string): string {
  const d = value.replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

export type DetailKind = 'phone' | 'email' | 'address' | 'partner' | 'company'
export const DETAIL_NAMES: Record<DetailKind, string> = { phone: 'Phone', email: 'Email', address: 'Address', partner: 'Partner', company: 'Company' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "from an email on Mar 3, 2025", "from Google Contacts", "from your phone contacts". */
export function sourceLine(s: { from: 'email' | 'google' | 'phone'; at?: string | undefined }): string {
  if (s.from === 'google') return 'from Google Contacts'
  if (s.from === 'phone') return 'from your phone contacts'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.at ?? '')
  return m ? `from an email on ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : 'from an email'
}

/** A detail's value, checked for its kind. Null when it is not a usable value (so it is never shown or saved). */
export function cleanDetail(kind: DetailKind, value: string): string | null {
  const v = value.replace(/\s+/g, ' ').trim()
  if (!v) return null
  if (kind === 'phone') return phoneValue.safeParse(v).success && v.replace(/\D/g, '').length <= 15 ? v : null
  if (kind === 'email') {
    const e = emailValue.safeParse(v)
    return e.success ? e.data : null
  }
  return v.length <= (kind === 'address' ? 500 : 200) ? v : null
}

// ---- Her answers -----------------------------------------------------------

const id = z.string().uuid()
const words = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'That is longer than SunnyDay can keep. Shorten it a little.')
    .nullish()
    .transform((s) => (s ? s : null))

/** Yes to one card, with whatever she changed. The details listed are the ones she kept, as she left them. */
export const yesInput = z
  .object({
    personId: id,
    fullName: z.string().trim().min(1, 'A name is needed.').max(200, 'That name is too long.'),
    kind: z.enum(YES_KINDS),
    buyer: z.boolean(),
    seller: z.boolean(),
    buyerStage: z.string().max(40).nullish().transform((v) => v ?? null),
    sellerStage: z.string().max(40).nullish().transform((v) => v ?? null),
    businessRole: z.enum(BUSINESS_ROLE_KEYS).nullish().transform((v) => v ?? null),
    company: words(200),
    foundBy: z.enum(FOUND_BY_KEYS),
    foundByOther: words(200),
    details: z.array(z.object({ id: z.string().min(1).max(60), value: z.string().trim().min(1).max(500), label: z.enum(WAY_LABELS).optional() })).max(40),
  })
  .refine((v) => v.kind === 'business' || v.buyer || v.seller, { message: 'Choose buyer, seller or both.', path: ['buyer'] })
  .refine((v) => v.kind !== 'business' || v.businessRole !== null, { message: 'Choose what kind of business contact they are.', path: ['businessRole'] })
  .refine((v) => v.kind === 'business' || ((!v.buyer || stageIn(v.kind, 'buyer', v.buyerStage) !== null) && (!v.seller || stageIn(v.kind, 'seller', v.sellerStage) !== null)), {
    message: 'Choose the stage they are at.',
    path: ['buyerStage'],
  })
  .refine((v) => v.foundBy !== 'other' || v.foundByOther !== null, { message: 'Say how they found you.', path: ['foundByOther'] })
export type YesInput = z.input<typeof yesInput>
export type YesData = z.output<typeof yesInput>

export const personRef = z.object({ personId: id })
export const manyRef = z.object({ personIds: z.array(id).min(1).max(PAGE_SIZE) })
/** "Add this detail?" on someone already in Contacts: the details she kept. */
export const detailsInput = z.object({ personId: id, keep: z.array(z.string().min(1).max(60)).max(40) })

/** The tick list: what each ticked person is added as. */
export const TICK_CHOICES = [
  { key: 'past_buyer', label: 'Past client (bought)' },
  { key: 'past_seller', label: 'Past client (sold)' },
  { key: 'lead_buyer', label: 'Lead (buying)' },
  { key: 'lead_seller', label: 'Lead (selling)' },
  { key: 'business', label: 'Business contact' },
] as const
export type TickChoice = (typeof TICK_CHOICES)[number]['key']
export const ticksInput = z.object({
  picks: z
    .array(z.object({ personId: id, as: z.enum(TICK_CHOICES.map((c) => c.key) as [TickChoice, ...TickChoice[]]) }))
    .min(1)
    .max(200),
})

/** The phone's contact file, as text, with photos already taken out by the browser. */
export const MAX_FILE_CHARS = 4_000_000
export const fileInput = z.object({ text: z.string().min(1).max(MAX_FILE_CHARS, 'That file is too big. Export fewer contacts at a time.') })
export const listPageInput = z.object({ view: z.enum(['cards', 'details', 'ticks', 'not']), q: z.string().trim().max(100).optional() })

// ---- What a card shows, and what Yes sends when she changes nothing -------

export type CardDetail = { id: string; kind: DetailKind; value: string; label: string | null; line: string }
export type CardView = {
  id: string
  name: string | null
  emails: string[]
  kind: Kind
  side: 'buyer' | 'seller' | 'both' | null
  businessRole: string | null
  company: string | null
  why: string
  sure: 'high' | 'medium' | 'low'
  foundBy: string | null
  foundByOther: string | null
  inCount: number
  outCount: number
  firstAt: string | null
  lastAt: string | null
  inMail: boolean
  inGoogle: boolean
  inPhone: boolean
  details: CardDetail[]
}

/** Yes with nothing changed: the proposal as it stands, every detail kept. Only valid when cardNeeds() is empty. */
export function defaultsFor(card: CardView): YesInput {
  const kind = (YES_KINDS as readonly string[]).includes(card.kind) ? (card.kind as YesKind) : 'lead'
  const business = kind === 'business'
  return {
    personId: card.id,
    fullName: card.name ?? '',
    kind,
    buyer: !business && (card.side === 'buyer' || card.side === 'both'),
    seller: !business && (card.side === 'seller' || card.side === 'both'),
    buyerStage: null,
    sellerStage: null,
    businessRole: business ? ((BUSINESS_ROLE_KEYS as readonly string[]).includes(card.businessRole ?? '') ? (card.businessRole as (typeof BUSINESS_ROLE_KEYS)[number]) : 'other') : null,
    company: business ? card.company : null,
    // Rule 6: only what the mail plainly showed; otherwise the honest "Don't remember" (decision 8).
    foundBy: (FOUND_BY_KEYS as readonly string[]).includes(card.foundBy ?? '') ? (card.foundBy as (typeof FOUND_BY_KEYS)[number]) : 'unknown',
    foundByOther: card.foundByOther,
    details: card.details.map((d) => ({ id: d.id, value: d.value, ...((WAY_LABELS as readonly string[]).includes(d.label ?? '') ? { label: d.label as (typeof WAY_LABELS)[number] } : {}) })),
  }
}

// ---- The phone's contact file ------------------------------------------------

/**
 * What the browser does before sending the file: photos are taken out, so
 * a picture of anyone never leaves the phone and the file stays small.
 * Runs in the browser.
 */
export function withoutPhotos(text: string): string {
  const out: string[] = []
  let skipping = false
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]/.test(line)) {
      if (!skipping) out.push(line)
      continue
    }
    skipping = /^([^.:;]*\.)?(PHOTO|LOGO|SOUND|KEY)[;:]/i.test(line)
    if (!skipping) out.push(line)
  }
  return out.join('\n')
}
