// What the contact screens send, checked with Zod. The server checks it
// again whatever the browser did. Plain logic, safe in the browser
// (through "@sunnyday/shared/rules").
import { z } from 'zod'
import { BUSINESS_ROLE_KEYS, FIELD_TYPES, FOUND_BY_KEYS, PREFERRED_WAYS, RELATIONS, WAY_LABELS, isStageFor, type Side } from './rules.js'

const id = z.string().uuid()
/** Optional text: trimmed, and empty becomes null. */
const words = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null))
const name = z.string().trim().min(1, 'A name is needed.').max(200)
/** A calendar date, YYYY-MM-DD, or nothing. */
const day = z
  .string()
  .trim()
  .nullish()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))), 'That date does not look right.')

export const phoneValue = z
  .string()
  .trim()
  .max(40)
  .refine((s) => s.replace(/\D/g, '').length >= 7, 'That phone number looks too short.')
export const emailValue = z.string().trim().toLowerCase().email('That email address does not look right.').max(320)

const optionalPhone = z
  .string()
  .trim()
  .nullish()
  .transform((s) => (s ? s : null))
  .pipe(phoneValue.nullable())
const optionalEmail = z
  .string()
  .trim()
  .nullish()
  .transform((s) => (s ? s : null))
  .pipe(emailValue.nullable())

const foundFields = {
  foundBy: z.enum(FOUND_BY_KEYS),
  foundByOther: words(200),
  referredById: id.nullish().transform((v) => v ?? null),
  referredByName: words(200),
}

const sidesFields = {
  buyer: z.boolean(),
  seller: z.boolean(),
  buyerStage: z.string().nullish().transform((v) => v ?? null),
  sellerStage: z.string().nullish().transform((v) => v ?? null),
}

const stageFits = (side: Side, stage: string | null) => stage === null || isStageFor(side, stage)

/** Adding someone by hand: a person (with a side and how they found her), optionally with a partner, or a business contact. */
export const addInput = z.discriminatedUnion('business', [
  z
    .object({
      business: z.literal(false),
      fullName: name,
      phone: optionalPhone,
      email: optionalEmail,
      ...sidesFields,
      ...foundFields,
      partner: z
        .object({ fullName: name, phone: optionalPhone, email: optionalEmail })
        .nullish()
        .transform((v) => v ?? null),
    })
    .refine((v) => v.buyer || v.seller, { message: 'Choose buyer, seller or both.', path: ['buyer'] })
    .refine((v) => stageFits('buyer', v.buyerStage) && stageFits('seller', v.sellerStage), { message: 'That stage does not exist.', path: ['buyerStage'] })
    .refine((v) => v.foundBy !== 'other' || v.foundByOther !== null, { message: 'Say how they found you.', path: ['foundByOther'] }),
  z.object({
    business: z.literal(true),
    fullName: name,
    phone: optionalPhone,
    email: optionalEmail,
    company: words(200),
    businessRole: z.enum(BUSINESS_ROLE_KEYS),
  }),
])
export type AddInput = z.input<typeof addInput>
export type AddData = z.output<typeof addInput>

const way = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('phone'), value: phoneValue, label: z.enum(WAY_LABELS) }),
  z.object({ kind: z.literal('email'), value: emailValue, label: z.enum(WAY_LABELS) }),
])

const buyerWants = z.object({
  priceMin: z.number().int().min(0).max(1_000_000_000).nullish(),
  priceMax: z.number().int().min(0).max(1_000_000_000).nullish(),
  towns: z.string().trim().max(1000).optional(),
  mustHaves: z.string().trim().max(2000).optional(),
  dealBreakers: z.string().trim().max(2000).optional(),
  preApproved: z.boolean().nullish(),
  lender: z.string().trim().max(200).optional(),
  timeframe: z.string().trim().max(200).optional(),
  relocatingFrom: z.string().trim().max(200).optional(),
})
const sellerWants = z.object({
  property: z.string().trim().max(500).optional(),
  why: z.string().trim().max(2000).optional(),
  when: z.string().trim().max(200).optional(),
  whatMatters: z.string().trim().max(2000).optional(),
})

/** Saving one part of the contact page. */
export const partInput = z.discriminatedUnion('part', [
  z.object({ part: z.literal('names'), fullName: name, goesBy: words(100), nickname: words(100), company: words(200), businessRole: z.enum(BUSINESS_ROLE_KEYS).nullish() }),
  z.object({ part: z.literal('ways'), ways: z.array(way).max(20), mailingAddress: words(500), homeAddress: words(500) }),
  z.object({ part: z.literal('reach'), preferredWay: z.enum(PREFERRED_WAYS).nullish().transform((v) => v ?? null), bestTimes: words(300), noText: z.boolean(), noEmail: z.boolean() }),
  z.object({ part: z.literal('dates'), birthday: day, weddingAnniversary: day, homePurchaseDate: day, clientSince: day }),
  z.object({ part: z.literal('personal'), personalNotes: words(10_000) }),
  z.object({ part: z.literal('wants'), buyerWants, sellerWants }),
  z
    .object({ part: z.literal('found'), ...foundFields })
    .refine((v) => v.foundBy !== 'other' || v.foundByOther !== null, { message: 'Say how they found you.', path: ['foundByOther'] }),
  z.object({ part: z.literal('sides'), buyer: z.boolean(), seller: z.boolean() }).refine((v) => v.buyer || v.seller, { message: 'Keep at least one: buyer or seller.', path: ['buyer'] }),
])
export type PartInput = z.input<typeof partInput>
export type PartData = z.output<typeof partInput>

export const contactRef = z.object({ contactId: id })
export const stageInput = z.object({ contactId: id, side: z.enum(['buyer', 'seller']), to: z.string().min(1).max(40), confirmBack: z.boolean().optional() })
export const noteInput = z.object({ contactId: id, text: z.string().trim().min(1, 'Write a few words first.').max(5000) })
export const householdInput = z.object({ contactId: id, otherId: id })
export const familyInput = z.object({ contactId: id, name, relation: z.enum(RELATIONS), birthday: day })
export const familyRef = z.object({ contactId: id, familyId: id })
export const fieldInput = z.object({ name: z.string().trim().min(1, 'Give the field a name.').max(60), type: z.enum(FIELD_TYPES) })
export const valueInput = z.object({ contactId: id, fieldId: id, value: z.string().trim().max(1000).nullable() })
export const listInput = z.object({
  tab: z.enum(['clients', 'leads', 'business']).optional(),
  q: z.string().trim().max(200).optional(),
  putAway: z.boolean().optional(),
})
