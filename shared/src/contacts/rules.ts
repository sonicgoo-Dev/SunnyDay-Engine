// The rules for contacts that hold everywhere: the stages, which tab a
// person sits in, which moves are allowed, and the name a client may see.
// Plain logic with no database, so the screens can use it too
// (through "@sunnyday/shared/rules").

export const BUYER_STAGES = ['New', 'Written to', 'Talking', 'Pre-approved', 'Touring', 'Offer out', 'Under contract', 'Closed', 'Past client'] as const
export const SELLER_STAGES = ['New', 'Written to', 'Talking', 'Listing appointment', 'Signed', 'Listed', 'Under contract', 'Closed', 'Past client'] as const
/** Closed stages for both sides. Only she puts someone here or takes them out. */
export const CLOSED_STAGES = ['Not now', 'Not a lead', 'Gone quiet', 'Lost'] as const
/** Up to and including Talking a person is a lead; after it, a client (decision 1, Nov 18, 2026). */
const LEAD_STAGES = ['New', 'Written to', 'Talking'] as const

export type Side = 'buyer' | 'seller'
export const SIDES: readonly Side[] = ['buyer', 'seller']
export type BuyerStage = (typeof BUYER_STAGES)[number] | (typeof CLOSED_STAGES)[number]
export type SellerStage = (typeof SELLER_STAGES)[number] | (typeof CLOSED_STAGES)[number]
export type Stage = BuyerStage | SellerStage

const mainStages = (side: Side): readonly string[] => (side === 'buyer' ? BUYER_STAGES : SELLER_STAGES)
export const stagesFor = (side: Side): readonly string[] => [...mainStages(side), ...CLOSED_STAGES]
export const isStageFor = (side: Side, stage: string): boolean => stagesFor(side).includes(stage)
const isClosed = (stage: string) => (CLOSED_STAGES as readonly string[]).includes(stage)

/** An earlier stage on the main path. Closing or reopening someone is not "moving back". */
export function isBackward(side: Side, from: string, to: string): boolean {
  const main = mainStages(side)
  const a = main.indexOf(from)
  const b = main.indexOf(to)
  return a >= 0 && b >= 0 && b < a
}

/** Who is moving a stage: she herself, or something automatic (an AI agent, from Build 4 on). */
export type Mover = 'person' | 'automatic'

/**
 * Rule from the master plan: a stage never moves backward on its own.
 * Agents may move someone forward along the main path; only she moves
 * someone back, closes them or reopens them.
 */
export function mayMove(mover: Mover, side: Side, from: string | null, to: string): boolean {
  if (!isStageFor(side, to) || from === to) return false
  if (mover === 'person') return true
  if (from === null) return false
  const main = mainStages(side)
  const a = main.indexOf(from)
  const b = main.indexOf(to)
  return a >= 0 && b > a
}

export type Tab = 'clients' | 'leads' | 'business'
export const TABS: ReadonlyArray<{ tab: Tab; label: string }> = [
  { tab: 'clients', label: 'Clients' },
  { tab: 'leads', label: 'Leads' },
  { tab: 'business', label: 'Business contacts' },
]

/**
 * Which tab a person is in, set by their stage. A buyer and seller at once
 * goes by the further side. Someone closed on every side is folded away
 * at the bottom of Leads ("not active").
 */
export function tabFor(c: { business: boolean; buyerStage: string | null; sellerStage: string | null }): { tab: Tab; active: boolean } {
  if (c.business) return { tab: 'business', active: true }
  const stages = [c.buyerStage, c.sellerStage].filter((s): s is string => s !== null)
  const open = stages.filter((s) => !isClosed(s))
  if (open.length === 0) return { tab: 'leads', active: false }
  const client = open.some((s) => !(LEAD_STAGES as readonly string[]).includes(s))
  return { tab: client ? 'clients' : 'leads', active: true }
}

/**
 * The only name anything a client could see may use (drafts, texts,
 * notes): the name they go by, else their first name. It takes just these
 * two names, so the private nickname can never come out of it.
 */
export function clientName(c: { fullName: string; goesBy: string | null }): string {
  const goesBy = c.goesBy?.trim()
  if (goesBy) return goesBy
  return c.fullName.trim().split(/\s+/)[0] ?? ''
}

/** How they found her (decision 2, Nov 18, 2026). Asked whenever someone is added. */
export const FOUND_BY = [
  { key: 'referral', label: 'Referral' },
  { key: 'past_client', label: 'Past client' },
  { key: 'friend_family', label: 'Friend or family' },
  { key: 'website', label: 'Your website' },
  { key: 'open_house', label: 'Open house' },
  { key: 'sign_call', label: 'Sign call' },
  { key: 'listing_site', label: 'Online listing site' },
  { key: 'other', label: 'Other' },
  { key: 'unknown', label: "Don't remember" },
] as const
export type FoundBy = (typeof FOUND_BY)[number]['key']
export const FOUND_BY_KEYS = FOUND_BY.map((f) => f.key) as [FoundBy, ...FoundBy[]]
export const foundByLabel = (key: string) => FOUND_BY.find((f) => f.key === key)?.label ?? key

export const BUSINESS_ROLES = [
  { key: 'lender', label: 'Lender' },
  { key: 'title', label: 'Title or escrow' },
  { key: 'inspector', label: 'Inspector' },
  { key: 'agent', label: 'Other agent' },
  { key: 'referral_partner', label: 'Referral partner' },
  { key: 'other', label: 'Other' },
] as const
export type BusinessRole = (typeof BUSINESS_ROLES)[number]['key']
export const BUSINESS_ROLE_KEYS = BUSINESS_ROLES.map((r) => r.key) as [BusinessRole, ...BusinessRole[]]
export const businessRoleLabel = (key: string) => BUSINESS_ROLES.find((r) => r.key === key)?.label ?? key

export const WAY_LABELS = ['mobile', 'home', 'work', 'other'] as const
export type WayLabel = (typeof WAY_LABELS)[number]
export const PREFERRED_WAYS = ['call', 'text', 'email'] as const
export type PreferredWay = (typeof PREFERRED_WAYS)[number]
export const RELATIONS = ['partner', 'child', 'parent', 'other'] as const
export type Relation = (typeof RELATIONS)[number]
export const FIELD_TYPES = ['text', 'yesno'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
