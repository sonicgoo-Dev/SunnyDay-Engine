// Everything that belongs to one customer lives in the "ws" schema.
// Rule 1: every table here has workspace_id, and the database itself
// refuses to show a row to any other workspace (the policy is added in the
// migration, and shared/test/wall.test.ts fails if a table lacks it).
import { bigint, boolean, date, foreignKey, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { workspace } from './core.js'

export const wsSchema = pgSchema('ws')

/** The column every "ws" table starts with. */
export const workspaceId = () => uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' })

/** A workspace's own settings, one row per name. The first table behind the wall. */
export const setting = wsSchema.table(
  'setting',
  {
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.name] })],
)

export const MAILBOX_KINDS = ['gmail', 'imap'] as const
export type MailboxKind = (typeof MAILBOX_KINDS)[number]
/** main = the one mailbox mail goes out from (rule 3). read_only = only ever read. */
export const MAILBOX_ROLES = ['main', 'read_only'] as const
export type MailboxRole = (typeof MAILBOX_ROLES)[number]
export const MAILBOX_STATUSES = ['connected', 'needs_reconnect'] as const
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number]

/** A mailbox an agent has connected. The way in (sealed) is unreadable without the key in the host's settings. */
export const mailbox = wsSchema.table(
  'mailbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    kind: text('kind', { enum: MAILBOX_KINDS }).notNull(),
    role: text('role', { enum: MAILBOX_ROLES }).notNull(),
    address: text('address').notNull(),
    sealed: text('sealed').notNull(),
    status: text('status', { enum: MAILBOX_STATUSES }).notNull().default('connected'),
    // Where reading got to, so the next read starts there.
    cursor: jsonb('cursor').$type<{ afterMs?: number; uidValidity?: string; lastUid?: number }>().notNull().default({}),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    lastProblem: text('last_problem'),
    // Whether Google's "see your contacts" permission was given (Build 4). Mail reading never depends on it.
    canReadContacts: boolean('can_read_contacts').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mailbox_one_per_address').on(t.workspaceId, t.address)],
)

export const MAIL_DIRECTIONS = ['in', 'out'] as const
export type MailDirection = (typeof MAIL_DIRECTIONS)[number]

/** What SunnyDay keeps of one message for now: who, when, the subject and a short excerpt. Never the whole message. */
export const mailMessage = wsSchema.table(
  'mail_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    mailboxId: uuid('mailbox_id').notNull().references(() => mailbox.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    threadId: text('thread_id'),
    direction: text('direction', { enum: MAIL_DIRECTIONS }).notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    toLine: text('to_line'),
    subject: text('subject'),
    excerpt: text('excerpt'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mail_message_once').on(t.mailboxId, t.providerId), index('mail_message_recent').on(t.workspaceId, t.sentAt)],
)

/** One row each time an AI agent is paid for. Millionths of a dollar, so small calls add up exactly. */
export const aiSpend = wsSchema.table(
  'ai_spend',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    agent: text('agent').notNull(),
    micros: bigint('micros', { mode: 'number' }).notNull(),
    spentAt: timestamp('spent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_spend_month').on(t.workspaceId, t.spentAt)],
)

// ---- Contacts (Build 3) ----------------------------------------------------

/** A household: the contacts linked into it share it, and family who are not contacts hang off it. */
export const household = wsSchema.table('household', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BuyerWants = {
  priceMin?: number | null | undefined
  priceMax?: number | null | undefined
  towns?: string | undefined
  mustHaves?: string | undefined
  dealBreakers?: string | undefined
  preApproved?: boolean | null | undefined
  lender?: string | undefined
  timeframe?: string | undefined
  relocatingFrom?: string | undefined
}
export type SellerWants = {
  property?: string | undefined
  why?: string | undefined
  when?: string | undefined
  whatMatters?: string | undefined
}

/**
 * One person: a client, a lead or a business contact. The private
 * nickname is NOT here; it lives in ws.nickname so that only the few
 * files allowed to read it can (a test holds that).
 */
export const contact = wsSchema.table(
  'contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    business: boolean('business').notNull().default(false),
    fullName: text('full_name').notNull(),
    goesBy: text('goes_by'),
    company: text('company'),
    businessRole: text('business_role'),
    buyerStage: text('buyer_stage'),
    sellerStage: text('seller_stage'),
    preferredWay: text('preferred_way'),
    bestTimes: text('best_times'),
    noText: boolean('no_text').notNull().default(false),
    noEmail: boolean('no_email').notNull().default(false),
    mailingAddress: text('mailing_address'),
    homeAddress: text('home_address'),
    birthday: date('birthday'),
    weddingAnniversary: date('wedding_anniversary'),
    homePurchaseDate: date('home_purchase_date'),
    clientSince: date('client_since'),
    personalNotes: text('personal_notes'),
    buyerWants: jsonb('buyer_wants').$type<BuyerWants>().notNull().default({}),
    sellerWants: jsonb('seller_wants').$type<SellerWants>().notNull().default({}),
    // Rule 6: how they found her, recorded at the moment they were added.
    foundBy: text('found_by'),
    foundByOther: text('found_by_other'),
    referredById: uuid('referred_by_id'),
    referredByName: text('referred_by_name'),
    foundRecordedAt: timestamp('found_recorded_at', { withTimezone: true }),
    householdId: uuid('household_id').references(() => household.id, { onDelete: 'set null' }),
    putAwayAt: timestamp('put_away_at', { withTimezone: true }),
    // Every word on the page except the nickname, rebuilt on each change, for search.
    searchText: text('search_text').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_by_name').on(t.workspaceId, t.fullName),
    index('contact_by_household').on(t.householdId),
    foreignKey({ columns: [t.referredById], foreignColumns: [t.id], name: 'contact_referred_by_fk' }).onDelete('set null'),
  ],
)

/** The private nickname: for her memory only, never in anything a client could see. */
export const nickname = wsSchema.table('nickname', {
  contactId: uuid('contact_id')
    .primaryKey()
    .references(() => contact.id, { onDelete: 'cascade' }),
  workspaceId: workspaceId(),
  nickname: text('nickname').notNull(),
})

export const WAY_KINDS = ['phone', 'email'] as const
/** Each phone number and email address, with its label. Emails stored lowercased. */
export const contactWay = wsSchema.table(
  'contact_way',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: WAY_KINDS }).notNull(),
    value: text('value').notNull(),
    label: text('label').notNull().default('mobile'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('contact_way_by_contact').on(t.contactId), index('contact_way_by_value').on(t.workspaceId, t.kind, t.value)],
)

/** Children and family who are not contacts themselves. */
export const familyMember = wsSchema.table(
  'family_member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relation: text('relation').notNull(),
    birthday: date('birthday'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('family_by_household').on(t.householdId)],
)

/** Her own fields, shared across all her contacts (decision 6). */
export const customField = wsSchema.table('custom_field', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspaceId(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customValue = wsSchema.table(
  'custom_value',
  {
    workspaceId: workspaceId(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => customField.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.fieldId] })],
)

export const STORY_KINDS = ['added', 'stage', 'note', 'found', 'household', 'put_away', 'brought_back'] as const
export type StoryKind = (typeof STORY_KINDS)[number]
export type StoryBody = { text?: string; side?: 'buyer' | 'seller'; from?: string | null; to?: string; was?: string; withName?: string; via?: 'list_builder' }

/** The story: each thing that happened to this person, newest first. Emails are read from mail_message, not copied here. */
export const storyEvent = wsSchema.table(
  'story_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: STORY_KINDS }).notNull(),
    body: jsonb('body').$type<StoryBody>().notNull().default({}),
    byUserId: text('by_user_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('story_by_contact').on(t.contactId, t.at)],
)

// ---- List Builder (Build 4) ------------------------------------------------

export const LIST_RUN_STATUSES = ['reading', 'sorting', 'thinking', 'paused', 'ready'] as const
export type ListRunStatus = (typeof LIST_RUN_STATUSES)[number]
/** Where one mailbox's (or Google Contacts') reading has got to within a run. */
export type RunPart = { done: boolean; pageToken?: string; afterUid?: number; /** The second mailbox: its inbox is read, and its sent folder is next. */ inboxDone?: boolean; sentAfterUid?: number; problem?: string }

/**
 * One year of mail she asked List Builder to read. Year 1 is the last 12
 * months; each later year is read only when she asks, and there is never a
 * sixth (decision 1, Eric, Nov 18, 2026).
 */
export const listRun = wsSchema.table(
  'list_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    year: integer('year').notNull(),
    fromAt: timestamp('from_at', { withTimezone: true }).notNull(),
    toAt: timestamp('to_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: LIST_RUN_STATUSES }).notNull().default('reading'),
    // Why it is paused: the month's AI limit was reached, or the AI is not switched on yet.
    pausedWhy: text('paused_why', { enum: ['limit', 'not_ready'] }),
    // Keyed by mailbox id, plus "google" for Google Contacts.
    parts: jsonb('parts').$type<Record<string, RunPart>>().notNull().default({}),
    messagesRead: integer('messages_read').notNull().default(0),
    toLook: integer('to_look').notNull().default(0),
    looked: integer('looked').notNull().default(0),
    lastProblem: text('last_problem'),
    startedBy: text('started_by'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('list_run_one_per_year').on(t.workspaceId, t.year)],
)

/**
 * The top lines of one message read for a run: who, when, the subject and a
 * short excerpt. Never the message text. A working table: rows for
 * automated senders go when sorting ends, the rest when the year is
 * finished. On Yes, that person's rows are copied to mail_message.
 */
export const listMail = wsSchema.table(
  'list_mail',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => listRun.id, { onDelete: 'cascade' }),
    mailboxId: uuid('mailbox_id')
      .notNull()
      .references(() => mailbox.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    threadId: text('thread_id'),
    direction: text('direction', { enum: MAIL_DIRECTIONS }).notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    toLine: text('to_line'),
    subject: text('subject'),
    excerpt: text('excerpt'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    // The message itself says it is a mailing (a newsletter, a notice).
    bulk: boolean('bulk').notNull().default(false),
  },
  (t) => [uniqueIndex('list_mail_once').on(t.mailboxId, t.providerId), index('list_mail_by_run').on(t.runId)],
)

export const LIST_KINDS = ['past_client', 'client', 'lead', 'business', 'nobody', 'unsure'] as const
export type ListKind = (typeof LIST_KINDS)[number]
/** What List Builder proposes for one person. Only ever a proposal: her answer decides. */
export type ListProposal = {
  kind: ListKind
  side: 'buyer' | 'seller' | 'both' | null
  businessRole: string | null
  company: string | null
  /** One plain line saying why. */
  why: string
  sure: 'high' | 'medium' | 'low'
  foundBy: string | null
  foundByOther: string | null
}
/** Where a detail came from: a dated email, Google Contacts or the phone file. */
export type DetailFrom = { from: 'email' | 'google' | 'phone'; at?: string; subject?: string }
export type FoundDetail = {
  id: string
  kind: 'phone' | 'email' | 'address' | 'partner' | 'company'
  value: string
  label?: string
  source: DetailFrom
  status: 'open' | 'added' | 'skipped'
}

export const LIST_BUCKETS = ['person', 'not_contact'] as const
export const LIST_STATES = ['new', 'proposed', 'yes', 'no'] as const
export type ListState = (typeof LIST_STATES)[number]

/**
 * One person or sender List Builder found, in mail, Google Contacts or the
 * phone file. Never a contact by itself: only her answer makes one
 * (shared/src/list/confirm.ts, and a test holds that to be the only way).
 */
export const listPerson = wsSchema.table(
  'list_person',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    name: text('name'),
    // Every address and phone number known for them: how the same person is recognised across sources.
    emails: jsonb('emails').$type<string[]>().notNull().default([]),
    phoneDigits: jsonb('phone_digits').$type<string[]>().notNull().default([]),
    inMail: boolean('in_mail').notNull().default(false),
    inGoogle: boolean('in_google').notNull().default(false),
    inPhone: boolean('in_phone').notNull().default(false),
    inCount: integer('in_count').notNull().default(0),
    outCount: integer('out_count').notNull().default(0),
    firstAt: timestamp('first_at', { withTimezone: true }),
    lastAt: timestamp('last_at', { withTimezone: true }),
    bucket: text('bucket', { enum: LIST_BUCKETS }).notNull().default('person'),
    state: text('state', { enum: LIST_STATES }).notNull().default('new'),
    // The AI has yet to look at this person's mail from this run.
    lookRunId: uuid('look_run_id').references(() => listRun.id, { onDelete: 'set null' }),
    proposal: jsonb('proposal').$type<ListProposal>(),
    details: jsonb('details').$type<FoundDetail[]>().notNull().default([]),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('list_person_by_state').on(t.workspaceId, t.state, t.bucket), index('list_person_to_look').on(t.lookRunId)],
)

/** For a saved contact: where one detail came from, shown beside it on the contact page. */
export const detailSource = wsSchema.table(
  'detail_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    source: jsonb('source').$type<DetailFrom>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('detail_source_by_contact').on(t.contactId)],
)
